/**
 * Singleton Socket.IO client for real-time updates.
 * Replaces polling for DMs + new post events.
 *
 * Backend gateway is at /v1/social (NestJS SocialGateway).
 *
 * If NEXT_PUBLIC_API_BASE is relative (e.g. "/v1"), sockets are skipped
 * because Vercel rewrites don't proxy WebSocket upgrades. Polling fallback
 * handles real-time updates in that case.
 */

type Listener = (payload: any) => void;
const listeners = new Map<string, Set<Listener>>();
let socket: any = null;
let connecting = false;

function getApiBase(): string | null {
  // Next.js inlines process.env.NEXT_PUBLIC_* at build time; reference it directly.
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE;
  // Only use an absolute URL — relative paths (e.g. "/v1") can't carry WebSockets
  // through Vercel rewrites.
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) return fromEnv;
  return null;
}

/** Connect once, reuse forever. Safe to call repeatedly. Returns null if no absolute API base. */
export async function connectSocket(token?: string): Promise<any> {
  if (socket?.connected) return socket;
  if (connecting) return socket;

  const apiBase = getApiBase();
  if (!apiBase) {
    // Silently skip — polling fallback handles real-time updates in this mode.
    return null;
  }

  connecting = true;
  try {
    const { io } = await import('socket.io-client');
    const auth = token || (typeof window !== 'undefined' ? localStorage.getItem('rg_access') : null);
    // Backend SocialGateway uses /social namespace
    const base = apiBase.replace(/\/v1\/?$/, '');
    socket = io(`${base}/social`, {
      auth: { token: auth ? `Bearer ${auth}` : auth },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1500,
    });

    socket.on('connect', () => {
      // eslint-disable-next-line no-console
      console.info('[socket] connected', socket.id);
    });
    socket.on('disconnect', (reason: string) => {
      // eslint-disable-next-line no-console
      console.info('[socket] disconnected', reason);
    });

    // Forward known events to local listeners
    const forward = (eventName: string) => {
      socket.on(eventName, (payload: any) => {
        const set = listeners.get(eventName);
        if (set) for (const fn of set) try { fn(payload); } catch { /* ignore */ }
      });
    };
    ['dm.message', 'post.new', 'post.liked', 'notification', 'friend.request', 'friend.accepted'].forEach(forward);
  } finally {
    connecting = false;
  }
  return socket;
}

export function onSocketEvent(event: string, fn: Listener): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function disconnectSocket() {
  try { socket?.disconnect(); } catch { /* ignore */ }
  socket = null;
}
