/**
 * Production Socket.IO client wrapper for the consultation service.
 *
 * Behaviour:
 *   - Auth via JWT (sent as `auth: { token }` on every (re)connect).
 *   - Prefers WebSocket; falls back to long-polling automatically if
 *     corporate proxies / mobile carriers drop WS upgrades.
 *   - Reconnects with exponential backoff capped at 30s, jittered ±20%.
 *   - On reconnect, re-emits `session.resume` with the lastEventSeq the
 *     client has seen — the server replays any missed messages.
 *   - Surfaces connection state via `onStatusChange(status)` so the UI
 *     can show a "Reconnecting…" banner.
 *
 * Why not trust the default `io()` reconnection: the defaults use 1000ms
 * initial delay, cap at 5000ms, no jitter. At launch with 10k concurrent
 * sockets, a transient Redis blip creates a thundering herd that takes
 * down the consultation pods. Jittered backoff with a longer cap spreads
 * the reconnect storm over ~60s.
 */

import { io, Socket } from 'socket.io-client';

export type SocketStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'auth_failed';

export interface ConsultationSocketOpts {
  /** Base URL, e.g. https://api.religiogram.com */
  baseUrl: string;
  /** JWT access token fetched from tokenStore.access */
  getToken: () => string | null;
  /** Called on every status transition. */
  onStatusChange?: (s: SocketStatus) => void;
  /** Called if the server reports auth failure — UI should re-login. */
  onAuthError?: () => void;
  /** Last event sequence the client has already applied. */
  getLastEventSeq?: () => number;
}

export class ConsultationSocket {
  private socket: Socket | null = null;
  private readonly opts: ConsultationSocketOpts;
  private status: SocketStatus = 'disconnected';
  private manualDisconnect = false;

  constructor(opts: ConsultationSocketOpts) {
    this.opts = opts;
  }

  connect(): void {
    if (this.socket) return;
    this.manualDisconnect = false;

    const s = io(`${this.opts.baseUrl}/consultation`, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      // Initial retry 1s, ramp to 30s cap, with 20% jitter so 10k clients
      // don't hammer the server in lockstep.
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.2,
      // Unlimited retries — the UI banner lets the user know.
      reconnection: true,
      reconnectionAttempts: Infinity,
      timeout: 15_000,
      // Sticky routing: browser preserves sid cookie so ALB affinity
      // lands us back on the same pod (cheaper — no full session.resume).
      withCredentials: true,
      auth: (cb: any) => {
        cb({ token: this.opts.getToken() ?? '' });
      },
    });

    s.on('connect', () => {
      this.setStatus('connected');
      const lastSeq = this.opts.getLastEventSeq?.();
      if (lastSeq !== undefined && lastSeq > 0) {
        s.emit('session.resume', { lastEventSeq: lastSeq });
      }
    });

    s.on('connect_error', (err: any) => {
      // Socket.IO's generic connect_error covers transport errors AND
      // server-side auth rejections. Disambiguate on error message.
      const msg = err?.message ?? '';
      if (/auth|unauthori[sz]ed|forbidden/i.test(msg)) {
        this.setStatus('auth_failed');
        this.opts.onAuthError?.();
        s.close();
        this.socket = null;
      } else {
        this.setStatus('reconnecting');
      }
    });

    s.io.on('reconnect_attempt', () => this.setStatus('reconnecting'));
    s.io.on('reconnect', () => this.setStatus('connected'));
    s.on('disconnect', (reason: any) => {
      // 'io server disconnect' means the server intentionally kicked us
      // — usually because the token expired mid-session. Re-auth path.
      if (reason === 'io server disconnect') {
        this.setStatus('auth_failed');
        this.opts.onAuthError?.();
      } else if (!this.manualDisconnect) {
        this.setStatus('reconnecting');
      }
    });

    this.socket = s;
    this.setStatus('connecting');
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.socket?.close();
    this.socket = null;
    this.setStatus('disconnected');
  }

  /** Access the raw socket for emit/on — guard for null at call site. */
  get raw(): Socket | null {
    return this.socket;
  }

  getStatus(): SocketStatus {
    return this.status;
  }

  private setStatus(s: SocketStatus): void {
    if (s === this.status) return;
    this.status = s;
    this.opts.onStatusChange?.(s);
  }
}
