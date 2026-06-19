/**
 * Singleton Socket.IO client for real-time updates.
 * Replaces polling for DMs + new post events.
 *
 * Backend gateway is at /v1/social (NestJS SocialGateway).
 */

type Listener = (payload: any) => void;
const listeners = new Map<string, Set<Listener>>();
let socket: any = null;
let connecting = false;

function getApiBase(): string {
  // Next.js inlines process.env.NEXT_PUBLIC_* at build time; reference it directly.
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE;
  if (fromEnv) return fromEnv;
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/** Connect once, reuse forever. Safe to call repeatedly. */
export async function connectSocket(token?: string): Promise<any> {
  if (socket?.connected) return socket;
  if (connecting) return socket;
  connecting = true;
  try {
    const { io } = await import('socket.io-client');
    const auth = token || (typeof window !== 'undefined' ? localStorage.getItem('rg_access') : null);
    // Backend SocialGateway uses /social namespace
    const base = getApiBase().replace(/\/v1\/?$/, '');
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

/** Subscribe to a server event. Returns an unsubscribe function. */
export function onSocketEvent(event: string, fn: Listener): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function disconnectSocket() {
  try { socket?.disconnect(); } catch { /* ignore */ }
  socket = null;
}
