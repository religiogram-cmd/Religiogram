'use client';

import { useState, useEffect, useRef } from 'react';
import { ConsultationSocket } from '@/lib/consultation-socket';
import { tokenStore } from '@/lib/api';
import { formatRupees, formatPerMinute } from '@/lib/format-currency';
import { startCall, type CallHandle } from '@/lib/webrtc-call';

/* Fallback includes `/api/v1` to match every other file in the repo — the
 * TURN endpoint is at `${API_BASE}/consultation/turn-credentials`, and
 * without the prefix that becomes `http://localhost:3001/consultation/…`
 * which 404s in local dev. Prod uses NEXT_PUBLIC_API_BASE from env. */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

const NAVY = '#1B2A5C';
const GOLD = '#C8920A';
const PARCHMENT = '#FFFBF0';

export interface SessionSummary {
  sessionId: string;
  consultantName: string;
  durationSeconds: number;
  amountCharged: number;
  ratePerMin: number;
  cashbackEarned?: boolean;
  /** ISO religion slug from provider profile — used for themed completion screen */
  religion?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'consultant' | 'system';
  text: string;
}

interface SocketMessage {
  id?: string;
  senderId?: string;
  senderRole?: string;   // 'user' | 'provider' | 'system'
  sender_role?: string;  // snake_case legacy alias
  text?: string;
  content?: string;   // dual-key compat: backend may emit `content` instead of `text`
  message?: string;
  from?: string;
}

interface BillingTick {
  secondsElapsed?: number;
  chargedPaise?: number;
  remainingPaise?: number;
}

interface SessionEndedPayload {
  sessionId?: string;
  chargedPaise?: number;
  durationSeconds?: number;
  cashbackEarned?: boolean;
}

/** At 4:30 (270s) we show the Extend / Upgrade / End modal */
const POPUP_TRIGGER_SECS = 270;

interface Props {
  sessionId: string;
  consultantName: string;
  consultantRole: string;
  ratePerMin: number;
  walletBalance: number;
  mode: 'chat' | 'call';
  planType?: 'intro_5' | 'pack_20' | 'pack_30' | 'per_minute';
  onSessionEnd: (summary: SessionSummary) => void;
}


/**
 * Gold circular SVG arc timer (PDF §9.4)
 * For intro_5: shows countdown arc (fills as time runs out)
 * For other plans: shows elapsed arc that grows slowly over 30 min
 */
function GoldCircularTimer({
  seconds,
  planType,
  color,
}: {
  seconds: number;
  planType?: string;
  color: string;
}) {
  const R = 20;
  const STROKE = 3.5;
  const SIZE = (R + STROKE) * 2;
  const C = 2 * Math.PI * R; // circumference ≈ 125.7

  let progress: number; // 0 = empty, 1 = full arc
  if (planType === 'intro_5') {
    // 5-min intro = 300 s total; arc fills as time counts DOWN (urgency)
    const total = 300;
    progress = Math.min(1, seconds / total);
  } else if (planType === 'pack_20') {
    progress = Math.min(1, seconds / (20 * 60));
  } else if (planType === 'pack_30') {
    progress = Math.min(1, seconds / (30 * 60));
  } else {
    // per-minute / unknown — cycle over 30-min window
    progress = Math.min(1, seconds / (30 * 60));
  }

  const dashOffset = C * (1 - progress);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const label = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="rgba(200,146,10,0.18)"
          strokeWidth={STROKE}
        />
        {/* Arc — countdown / progress marker */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeDasharray={C}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.4s' }}
        />
      </svg>
      {/* Time label centred over the arc */}
      <span style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        fontWeight: 800,
        color: color,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.5px',
      }}>
        {label}
      </span>
    </div>
  );
}

export default function ActiveSessionScreen({
  sessionId,
  consultantName,
  consultantRole,
  ratePerMin,
  walletBalance,
  mode,
  planType = 'intro_5',
  onSessionEnd,
}: Props) {
  const [seconds, setSeconds] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showLowBalance, setShowLowBalance] = useState(false);
  const [show430Popup, setShow430Popup] = useState(false);
  const [popupDismissed, setPopupDismissed] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [callConnected, setCallConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lowBalanceShownRef = useRef(false);
  const socketRef = useRef<ConsultationSocket | null>(null);
  const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const callHandleRef = useRef<CallHandle | null>(null);

  const ratePerSec = ratePerMin / 60;
  const charged = seconds * ratePerSec;
  const remaining = walletBalance - charged;
  const remainingMins = remaining / ratePerMin;

  /* ── Clock ── */
  useEffect(() => {
    const interval = setInterval(() => {
      if (!sessionEnded) setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionEnded]);

  /* ── 4:30 popup trigger ── */
  useEffect(() => {
    if (!popupDismissed && seconds === POPUP_TRIGGER_SECS && planType === 'intro_5') {
      setShow430Popup(true);
      // Auto-dismiss after 30 s if user takes no action
      popupTimerRef.current = setTimeout(() => setShow430Popup(false), 30_000);
    }
    return () => {
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    };
  }, [seconds, popupDismissed, planType]);

  /* ── Socket ── */
  useEffect(() => {
    const socket = new ConsultationSocket({
      baseUrl: API_BASE,
      getToken: () => tokenStore.access,
      onStatusChange: (status) => console.debug('[CS] status:', status),
    });
    socket.connect();
    socketRef.current = socket;

    const raw = socket.raw;
    if (raw) {
      raw.on('connect', () => {
        raw.emit('session.join', { sessionId });
        // Pull any transcript that already exists (system welcome + birth
        // details messages are posted before the user's socket joins).
        raw.emit('message.history', { sessionId, limit: 100 });
      });

      /* Backend gateway event contract (kept in sync via a single names-
       * map here). The backend emits:
       *   - message.new        chat message delivered
       *   - billing.tick       per-minute billing update
       *   - session.ended      session closed by either side
       *   - billing.low_balance user balance about to run out
       *   - session.joined     acknowledgement of session.join emit
       * Legacy names (message / billing_tick / session_ended / balance_low)
       * are ALSO subscribed for backward compat with older builds — Socket.IO
       * lets us attach multiple listeners without cost. */
      const onMessage = (payload: SocketMessage) => {
        // Dual-key compat: newer backend builds emit `content` alongside
        // `text`; older builds emit only `text`; oldest emit only `message`.
        // Prefer `content` first so we survive a future backend that drops
        // `text` entirely.
        const text = payload.content ?? payload.text ?? payload.message ?? '';
        const senderId = payload.senderId ?? payload.from ?? '';
        const senderRole = payload.senderRole ?? payload.sender_role ?? '';
        if (!text) return;
        // Backend now posts sender_role='system' lifecycle messages
        // (welcome, birth-details brief, provider-joined). Render them as a
        // centered info pill rather than a chat bubble.
        const sender: ChatMessage['sender'] =
          senderRole === 'system' ? 'system'
          : senderId === 'user'    ? 'user'
          : 'consultant';
        setMessages((prev) => {
          const id = payload.id ?? `sock-${Date.now()}`;
          // Guard against dupes when both `message.new` and `message` fire.
          if (prev.some((m) => m.id === id)) return prev;
          return [...prev, { id, sender, text }];
        });
      };
      raw.on('message.new', onMessage);
      raw.on('message',     onMessage);   // legacy

      // Server response to the message.history emit (fired on connect).
      raw.on('message.history', (payload: { sessionId?: string; messages?: SocketMessage[] }) => {
        if (!payload?.messages) return;
        for (const m of payload.messages) onMessage(m);
      });

      const onBillingTick = (payload: BillingTick) => {
        if (payload.secondsElapsed !== undefined) setSeconds(payload.secondsElapsed);
      };
      raw.on('billing.tick',  onBillingTick);
      raw.on('billing_tick',  onBillingTick); // legacy

      const onSessionEnded = (payload: SessionEndedPayload) => {
        setSessionEnded(true);
        const durationSecs = payload.durationSeconds ?? seconds;
        const chargedAmount =
          payload.chargedPaise != null ? payload.chargedPaise / 100 : durationSecs * ratePerSec;
        onSessionEnd({
          sessionId: payload.sessionId ?? sessionId,
          consultantName,
          durationSeconds: durationSecs,
          amountCharged: chargedAmount,
          ratePerMin,
          cashbackEarned: payload.cashbackEarned,
        });
      };
      raw.on('session.ended',  onSessionEnded);
      raw.on('session_ended',  onSessionEnded); // legacy

      const onBalanceLow = () => {
        if (!lowBalanceShownRef.current) {
          setShowLowBalance(true);
          lowBalanceShownRef.current = true;
        }
      };
      raw.on('billing.low_balance', onBalanceLow);
      raw.on('balance_low',         onBalanceLow); // legacy
    }

    return () => { socket.disconnect(); socketRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  /* low-balance client-side guard */
  useEffect(() => {
    if (remainingMins < 2 && !lowBalanceShownRef.current && seconds > 5) {
      setShowLowBalance(true);
      lowBalanceShownRef.current = true;
    }
  }, [remainingMins, seconds]);

  /* ── WebRTC call setup (mode=call) ── */
  useEffect(() => {
    if (mode !== 'call') return;
    const raw = socketRef.current?.raw;
    if (!raw) return; // socket not yet ready — retried when socket connects

    let cancelled = false;

    async function initCall() {
      try {
        // Fetch TURN credentials from backend
        const tok = tokenStore.access ?? '';
        /* Backend route is `/consultation/turn-credentials` (singular).
         * Old code hit `/consultations/…` and 404'd → WebRTC fell back
         * to STUN-only, which fails behind most mobile carrier NATs. */
        const res = await fetch(`${API_BASE}/consultation/turn-credentials`, {
          headers: tok ? { Authorization: `Bearer ${tok}` } : {},
        });
        if (!res.ok) throw new Error(`TURN creds ${res.status}`);
        const { iceServers } = await res.json() as { iceServers: RTCIceServer[] };

        if (cancelled) return;

        // Caller = user who initiated (mode=call); callee = provider side
        const handle = await startCall({
          socket: raw!,
          sessionId,
          iceServers,
          isCaller: true,
          audio: true,
          video: true,
          onRemoteStream: (stream) => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = stream;
            }
          },
          onConnectionStateChange: (state) => {
            if (state === 'connected') setCallConnected(true);
            if (state === 'disconnected' || state === 'failed') setCallConnected(false);
          },
          onError: (err) => setCallError(err.message),
        });

        if (cancelled) { handle.hangup(); return; }

        callHandleRef.current = handle;

        // Attach local stream to PiP video
        if (localVideoRef.current && handle.localStream) {
          localVideoRef.current.srcObject = handle.localStream;
        }
      } catch (err) {
        if (!cancelled) setCallError((err as Error).message ?? 'Call setup failed');
      }
    }

    // Wait until socket is connected before starting
    if (raw.connected) {
      initCall();
    } else {
      raw.once('connect', initCall);
    }

    return () => {
      cancelled = true;
      callHandleRef.current?.hangup();
      callHandleRef.current = null;
      raw.off('connect', initCall);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const billingColor = remainingMins > 5 ? '#16a34a' : remainingMins > 2 ? '#d97706' : '#dc2626';
  const getBillingBg = () => {
    if (remainingMins > 5) return '#fef9c3';
    if (remainingMins > 2) return '#fff7ed';
    return '#fef2f2';
  };

  const calculateSummary = (): SessionSummary => {
    const mins = seconds / 60;
    const wholeMins = Math.floor(mins);
    const partialSecs = seconds % 60;
    const billableMins = partialSecs > 30 ? wholeMins + 1 : wholeMins;
    return {
      sessionId,
      consultantName,
      durationSeconds: seconds,
      amountCharged: Math.min(billableMins * ratePerMin, walletBalance),
      ratePerMin,
    };
  };

  const handleEndConfirmed = async () => {
    setShowEndConfirm(false);
    setProcessing(true);
    // Tell the server to stop billing + close the session. Failure is
    // non-fatal: if the network drops, the server's grace timeout will
    // close the session on its own.
    try {
      const tok = tokenStore.access ?? '';
      await fetch(`${API_BASE}/consultation/${sessionId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        },
        body: JSON.stringify({}),
      });
    } catch {
      // eslint-disable-next-line no-console
      console.warn('[consultation] /end call failed; relying on server grace timeout.');
    } finally {
      // Give the socket a beat to deliver any final `session_ended` event,
      // then surface the summary screen.
      setTimeout(() => onSessionEnd(calculateSummary()), 1200);
    }
  };

  /* ── Upgrade to a longer pack ── */
  const handleUpgrade = async (newPlan: 'pack_20' | 'pack_30') => {
    setUpgrading(true);
    try {
      const tok = tokenStore.access ?? '';
      await fetch(`${API_BASE}/consultation/${sessionId}/upgrade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        },
        body: JSON.stringify({ planType: newPlan }),
      });
    } catch {
      /* silent — session continues regardless */
    } finally {
      setUpgrading(false);
      setShow430Popup(false);
      setPopupDismissed(true);
    }
  };

  const dismiss430 = () => {
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    setShow430Popup(false);
    setPopupDismissed(true);
  };

  const sendMessage = () => {
    const text = inputText.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { id: `m${Date.now()}`, sender: 'user', text }]);
    setInputText('');
    const raw = socketRef.current?.raw;
    /* Backend handler at consultation.gateway.ts registers `message.send`;
     * the older `message` name is emitted too for backward compat with
     * builds that predate the rename. Server ignores whichever it doesn't
     * handle.
     *
     * Dual-key compat: we send BOTH `text` and `content` in the payload.
     * The current gateway accepts `content|text|message`; a future build
     * that only reads `content` will still work without a coordinated
     * frontend deploy. Emitting both is essentially free. */
    if (raw?.connected) {
      raw.emit('message.send', { sessionId, text, content: text });
      raw.emit('message',      { sessionId, text, content: text }); // legacy
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const toggleMute = () => {
    const next = !isMuted;
    callHandleRef.current?.setMuted(next);
    setIsMuted(next);
  };

  const toggleCamera = () => {
    const next = !cameraOff;
    callHandleRef.current?.setVideoEnabled(!next);
    setCameraOff(next);
  };

  const initials = consultantName.split(' ').slice(0, 2).map((w) => w[0]).join('');

  if (processing) {
    return (
      <div style={{
        minHeight: '100vh', backgroundColor: PARCHMENT,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          border: `4px solid ${GOLD}`, borderTopColor: 'transparent',
          animation: 'spin 0.8s linear infinite', marginBottom: 20,
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ color: NAVY, fontWeight: 600, fontSize: 18 }}>Processing charges…</div>
        <div style={{ color: '#6b7280', fontSize: 13, marginTop: 8 }}>Please wait a moment</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#f9f9f9',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui, sans-serif',
      position: 'relative',
    }}>
      {/* ── Top bar ── */}
      <div style={{
        backgroundColor: NAVY,
        padding: '48px 16px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        flexShrink: 0,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          backgroundColor: 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{consultantName}</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{consultantRole}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            backgroundColor: '#22c55e', boxShadow: '0 0 0 2px rgba(34,197,94,0.3)',
          }} />
          <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>Active</span>
          <span style={{ marginLeft: 6, fontSize: 18 }}>{mode === 'chat' ? '💬' : '📞'}</span>
        </div>
      </div>

      {/* ── Intro plan banner ── */}
      {planType === 'intro_5' && seconds < POPUP_TRIGGER_SECS && (
        <div style={{
          backgroundColor: '#fef3c7', borderBottom: '2px solid #f59e0b',
          padding: '6px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 12, color: '#92400e', flexShrink: 0,
        }}>
          <span>⏱ 5-min intro session · {formatRupees(29)}</span>
          <span style={{ fontWeight: 700, color: '#b45309' }}>
            {Math.max(0, POPUP_TRIGGER_SECS - seconds)}s left
          </span>
        </div>
      )}

      {/* ── Messages ── */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '16px 16px 8px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {messages.map((msg) => {
          if (msg.sender === 'system') {
            // Centered pill — gold border on cream so it reads as
            // "session info" rather than a message from either party.
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{
                  maxWidth: '90%',
                  background: `${PARCHMENT}`,
                  color: '#4A3010',
                  border: `1px solid ${GOLD}55`,
                  borderRadius: 10,
                  padding: '8px 12px',
                  fontSize: 12,
                  lineHeight: 1.45,
                  whiteSpace: 'pre-line',
                  textAlign: 'center',
                }}>
                  {msg.text}
                </div>
              </div>
            );
          }
          return (
            <div key={msg.id} style={{ display: 'flex', justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '75%',
                backgroundColor: msg.sender === 'user' ? GOLD : '#fff',
                color: msg.sender === 'user' ? '#fff' : '#1f2937',
                borderRadius: msg.sender === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                padding: '10px 14px',
                fontSize: 14, lineHeight: 1.5,
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                border: msg.sender === 'consultant' ? '1px solid #e5e7eb' : 'none',
              }}>
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Live billing bar ── */}
      <div style={{
        backgroundColor: getBillingBg(),
        borderTop: `2px solid ${billingColor}`,
        padding: '8px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Gold circular SVG arc timer — PDF §9.4 */}
          <GoldCircularTimer seconds={seconds} planType={planType} color={billingColor} />
          <span style={{ color: '#6b7280', fontSize: 11 }}>· {formatPerMinute(ratePerMin * 100)}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>
            Charged: {formatRupees(charged)}
          </div>
          <div style={{ fontSize: 11, color: billingColor, fontWeight: 600 }}>
            Remaining: {formatRupees(Math.max(0, remaining))}
          </div>
        </div>
      </div>

      {/* ── Text input ── */}
      {mode === 'chat' && (
        <div style={{
          backgroundColor: '#fff',
          borderTop: '1px solid #e5e7eb',
          padding: '10px 14px 24px',
          display: 'flex', gap: 10, alignItems: 'center',
          flexShrink: 0,
        }}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            style={{
              flex: 1, padding: '10px 14px',
              border: '1.5px solid #e5e7eb', borderRadius: 24,
              fontSize: 14, outline: 'none', backgroundColor: '#f9fafb',
            }}
          />
          <button
            onClick={sendMessage}
            style={{
              width: 40, height: 40, borderRadius: '50%',
              backgroundColor: inputText.trim() ? GOLD : '#e5e7eb',
              border: 'none', cursor: inputText.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
              <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Video call UI (mode=call) ── */}
      {mode === 'call' && (
        <div style={{
          flex: 1, position: 'relative',
          backgroundColor: '#0f1117',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 300,
        }}>
          {/* Remote video — full area */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />

          {/* Connecting overlay */}
          {!callConnected && !callError && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(15,17,23,0.8)',
              color: '#fff', gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                border: `3px solid ${GOLD}`, borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite',
              }} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Connecting call…</span>
            </div>
          )}

          {/* Error overlay */}
          {callError && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(15,17,23,0.9)',
              color: '#fff', gap: 8, padding: 24,
            }}>
              <span style={{ fontSize: 28 }}>📵</span>
              <span style={{ fontSize: 14, fontWeight: 600, textAlign: 'center' }}>
                {callError}
              </span>
              <span style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
                Chat mode still active below
              </span>
            </div>
          )}

          {/* Local PiP */}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              position: 'absolute', bottom: 16, right: 16,
              width: 90, height: 120, objectFit: 'cover',
              borderRadius: 10, border: '2px solid rgba(255,255,255,0.3)',
              backgroundColor: '#1f2937',
            }}
          />

          {/* Call controls */}
          <div style={{
            position: 'absolute', bottom: 16, left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex', gap: 16, alignItems: 'center',
          }}>
            {/* Mute */}
            <button
              onClick={toggleMute}
              style={{
                width: 48, height: 48, borderRadius: '50%',
                backgroundColor: isMuted ? '#dc2626' : 'rgba(255,255,255,0.15)',
                border: '1.5px solid rgba(255,255,255,0.3)',
                color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
              }}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '🔇' : '🎙️'}
            </button>
            {/* Camera */}
            <button
              onClick={toggleCamera}
              style={{
                width: 48, height: 48, borderRadius: '50%',
                backgroundColor: cameraOff ? '#dc2626' : 'rgba(255,255,255,0.15)',
                border: '1.5px solid rgba(255,255,255,0.3)',
                color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
              }}
              title={cameraOff ? 'Turn camera on' : 'Turn camera off'}
            >
              {cameraOff ? '📷' : '🎥'}
            </button>
          </div>
        </div>
      )}

      {/* ── End session floating button ── */}
      <button
        onClick={() => setShowEndConfirm(true)}
        style={{
          position: 'fixed', bottom: mode === 'chat' ? 110 : 60, right: 20,
          backgroundColor: '#dc2626', color: '#fff',
          border: 'none', borderRadius: 24,
          padding: '10px 18px',
          fontWeight: 700, fontSize: 13, cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(220,38,38,0.4)',
          zIndex: 200,
        }}
      >
        End Session
      </button>

      {/* ═══════════════════════════════════════════════════════════
          4:30 POPUP — Extend / Upgrade / End
      ═══════════════════════════════════════════════════════════ */}
      {show430Popup && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 700,
          backgroundColor: 'rgba(15, 36, 82, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          padding: '0 0 env(safe-area-inset-bottom, 0)',
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '24px 24px 0 0',
            padding: '28px 24px 36px',
            width: '100%',
            maxWidth: 480,
            boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
          }}>
            {/* Handle */}
            <div style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', margin: '0 auto 20px' }} />

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: `linear-gradient(135deg, ${GOLD}, #f59e0b)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
                fontSize: 24,
              }}>⏰</div>
              <h2 style={{ color: NAVY, fontWeight: 800, fontSize: 20, margin: 0 }}>
                4:30 — Intro Almost Over
              </h2>
              <p style={{ color: '#6b7280', fontSize: 14, margin: '6px 0 0', lineHeight: 1.4 }}>
                Your 5-min intro session ends soon. What would you like to do?
              </p>
            </div>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Upgrade 20-min */}
              <button
                disabled={upgrading}
                onClick={() => handleUpgrade('pack_20')}
                style={{
                  padding: '16px 20px',
                  background: `linear-gradient(135deg, ${NAVY}, #2d4a9e)`,
                  color: '#fff',
                  border: 'none', borderRadius: 14,
                  cursor: upgrading ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  opacity: upgrading ? 0.7 : 1,
                }}
              >
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Continue — 20 Min Pack</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                    Uninterrupted guidance for 20 more minutes
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: GOLD }}>{formatRupees(299)}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{formatPerMinute(1495)}</div>
                </div>
              </button>

              {/* Upgrade 30-min */}
              <button
                disabled={upgrading}
                onClick={() => handleUpgrade('pack_30')}
                style={{
                  padding: '16px 20px',
                  background: `linear-gradient(135deg, #7c3aed, #9f5cf7)`,
                  color: '#fff',
                  border: 'none', borderRadius: 14,
                  cursor: upgrading ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  opacity: upgrading ? 0.7 : 1,
                }}
              >
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    Best Value — 30 Min Pack
                    <span style={{
                      marginLeft: 8, backgroundColor: GOLD,
                      color: '#fff', fontSize: 10, fontWeight: 700,
                      padding: '1px 6px', borderRadius: 99,
                    }}>SAVE 17%</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                    Deep dive — get all your questions answered
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: '#fde68a' }}>{formatRupees(499)}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{formatPerMinute(1663)}</div>
                </div>
              </button>

              {/* Continue per-minute */}
              <button
                disabled={upgrading}
                onClick={dismiss430}
                style={{
                  padding: '14px 20px',
                  background: '#f9fafb',
                  color: '#374151',
                  border: '1.5px solid #e5e7eb', borderRadius: 14,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  opacity: upgrading ? 0.5 : 1,
                }}
              >
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Continue Per-Minute</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>
                    Keep going at {formatPerMinute(ratePerMin * 100)}
                  </div>
                </div>
                <div style={{ color: '#9ca3af', fontSize: 13 }}>→</div>
              </button>

              {/* End */}
              <button
                disabled={upgrading}
                onClick={() => { dismiss430(); setShowEndConfirm(true); }}
                style={{
                  padding: '12px 20px',
                  background: '#fff',
                  color: '#dc2626',
                  border: '1.5px solid #fecaca', borderRadius: 14,
                  cursor: 'pointer',
                  fontWeight: 600, fontSize: 14,
                  opacity: upgrading ? 0.5 : 1,
                }}
              >
                End Session
              </button>
            </div>

            <p style={{ textAlign: 'center', fontSize: 11, color: '#d1d5db', marginTop: 14 }}>
              Auto-continues per-minute in 30 s if you take no action
            </p>
          </div>
        </div>
      )}

      {/* ── End confirm dialog ── */}
      {showEndConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 500,
          backgroundColor: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 24px',
        }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '24px 20px', width: '100%', maxWidth: 340 }}>
            <h3 style={{ color: NAVY, fontWeight: 700, fontSize: 18, margin: '0 0 10px' }}>End this session?</h3>
            <p style={{ color: '#4b5563', fontSize: 14, margin: '0 0 20px', lineHeight: 1.5 }}>
              You will be charged {formatRupees(charged)} for {Math.ceil(seconds / 60)} minute
              {Math.ceil(seconds / 60) !== 1 ? 's' : ''}.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowEndConfirm(false)} style={{
                flex: 1, padding: '12px 0',
                backgroundColor: '#f3f4f6', color: '#374151',
                border: 'none', borderRadius: 10,
                fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={handleEndConfirmed} style={{
                flex: 1, padding: '12px 0',
                backgroundColor: '#dc2626', color: '#fff',
                border: 'none', borderRadius: 10,
                fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>End &amp; Pay</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Low balance overlay ── */}
      {showLowBalance && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 600,
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 24px',
        }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 16, padding: '28px 20px', width: '100%', maxWidth: 340, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ color: '#dc2626', fontWeight: 700, fontSize: 20, margin: '0 0 8px' }}>Low Balance</h3>
            <p style={{ color: '#4b5563', fontSize: 14, margin: '0 0 20px', lineHeight: 1.5 }}>
              Your session will end in approximately{' '}
              {Math.max(0, Math.floor(remainingMins * 60))} seconds at the current rate.
            </p>
            <button onClick={() => setShowLowBalance(false)} style={{
              width: '100%', padding: '13px 0',
              backgroundColor: GOLD, color: '#fff',
              border: 'none', borderRadius: 10,
              fontWeight: 700, fontSize: 15, cursor: 'pointer',
              marginBottom: 10,
            }}>Add {formatRupees(200)}</button>
            <button onClick={() => { setShowLowBalance(false); setShowEndConfirm(true); }} style={{
              width: '100%', padding: '12px 0',
              backgroundColor: '#fff', color: '#dc2626',
              border: '2px solid #dc2626', borderRadius: 10,
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}>End Session</button>
          </div>
        </div>
      )}
    </div>
  );
}
