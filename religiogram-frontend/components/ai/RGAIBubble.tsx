'use client';
/**
 * RGAIBubble — floating AI assistant button + chat sheet
 * PDF spec §3.1–§3.4, §7.1–§7.4, Phase 7 (voice + image)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { tokenStore } from '@/lib/api';

const GOLD  = '#C8920A';
const NAVY  = '#0A1628';
const PARCH = '#FFFBF0';

const QUICK_CHIPS = [
  { label: '🔮 My Kundli',        prompt: 'Show me my kundli chart' },
  { label: "📅 Today's Panchang", prompt: "What is today's panchang?" },
  { label: '💫 Rashifal',         prompt: 'What is my rashifal today?' },
  { label: '🤝 Compatibility',    prompt: 'Check my compatibility with my partner' },
  { label: '🛕 Find Priest',      prompt: 'Find a priest near me' },
  { label: '📖 Ask Scripture',    prompt: 'What does the Bhagavad Gita say about karma?' },
];

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  toolResult?: any;       // structured result for inline card rendering (§6.2)
  streaming?: boolean;
  imagePreview?: string;  // data-URL for user image messages
  isVoice?: boolean;      // indicator for voice messages
}

interface PendingMedia {
  base64: string;
  mimeType: string;
  preview: string; // data-URL for display
}

// ── Lightweight markdown renderer ────────────────────────────────────────────
function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  lines.forEach((line, li) => {
    const h3 = line.match(/^###\s+(.+)/);
    if (h3) { nodes.push(<div key={li} style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{renderInline(h3[1])}</div>); return; }
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) { nodes.push(<div key={li} style={{ fontWeight: 800, fontSize: 16, marginBottom: 2 }}>{renderInline(h2[1])}</div>); return; }
    const bullet = line.match(/^[-*]\s+(.+)/);
    if (bullet) { nodes.push(<div key={li} style={{ display: 'flex', gap: 6, marginBottom: 2 }}><span style={{ color: GOLD, flexShrink: 0 }}>•</span><span>{renderInline(bullet[1])}</span></div>); return; }
    if (line.trim() === '') { nodes.push(<div key={li} style={{ height: 6 }} />); return; }
    nodes.push(<span key={li}>{renderInline(line)}<br /></span>);
  });
  return <>{nodes}</>;
}
function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*'))   return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`'))   return <code key={i} style={{ background: 'rgba(200,146,10,0.12)', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 }}>{part.slice(1, -1)}</code>;
    return <span key={i}>{part}</span>;
  });
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function SparkleIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="white" />
      <path d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z" fill="white" opacity="0.7"/>
      <path d="M5 3L5.5 4.5L7 5L5.5 5.5L5 7L4.5 5.5L3 5L4.5 4.5L5 3Z" fill="white" opacity="0.7"/>
    </svg>
  );
}
function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '8px 12px' }}>
      {[0,1,2].map(i => (
        <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: GOLD, animation: `rgai-bounce 1.2s ${i * 0.2}s infinite ease-in-out` }} />
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

// ── Main component ─────────────────────────────────────────────────────────────
// ── §6.3 IndexedDB — persist conversation so reopen is instant ───────────────
const IDB_DB   = 'rg-ai-chat';
const IDB_STORE = 'conversation';
const IDB_KEY   = 'current';

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await idbOpen();
    return new Promise((res, rej) => {
      const tx  = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => res(req.result as T);
      req.onerror   = () => rej(req.error);
    });
  } catch { return undefined; }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await idbOpen();
    return new Promise((res, rej) => {
      const tx  = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).put(value, key);
      req.onsuccess = () => res();
      req.onerror   = () => rej(req.error);
    });
  } catch { /* non-fatal */ }
}


// ── §6.2 Tool result inline card ─────────────────────────────────────────────
function ToolResultCard({ toolName, result, onSendMessage }: {
  toolName: string;
  result: any;
  onSendMessage: (text: string) => void;
}) {
  const items: any[] = Array.isArray(result) ? result : (result?.priests ?? result?.temples ?? result?.results ?? []);

  // Priest / provider results
  if ((toolName === 'search_priests' || toolName === 'find_priest_nearby') && items.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.slice(0, 3).map((p: any, i: number) => (
          <div key={i} style={{ background: '#fffbf0', border: `1px solid ${GOLD}50`, borderRadius: 10, padding: '8px 12px', fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: NAVY }}>{p.name ?? p.displayName ?? 'Priest'}</div>
            {p.religion && <div style={{ color: '#6b7280', fontSize: 11 }}>{p.religion} • {p.city ?? ''}</div>}
            {(p.pricePerHour ?? p.price) && <div style={{ color: GOLD, fontWeight: 600, fontSize: 12 }}>From INR {p.pricePerHour ?? p.price}</div>}
            <button
              onClick={() => onSendMessage(`Book ${p.name ?? p.displayName} for a session`)}
              style={{ marginTop: 6, padding: '4px 12px', background: `linear-gradient(135deg,${GOLD},#f59e0b)`, border: 'none', borderRadius: 20, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >Book</button>
          </div>
        ))}
      </div>
    );
  }

  // Temple / place results
  if ((toolName === 'search_temples' || toolName === 'find_nearby_temple') && items.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.slice(0, 3).map((t: any, i: number) => (
          <div key={i} style={{ background: '#fffbf0', border: `1px solid ${GOLD}50`, borderRadius: 10, padding: '8px 12px', fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: NAVY }}>{t.name ?? t.displayName ?? 'Place'}</div>
            {t.address && <div style={{ color: '#6b7280', fontSize: 11 }}>{t.address}</div>}
            {t.distance && <div style={{ color: GOLD, fontSize: 11 }}>{t.distance} km away</div>}
          </div>
        ))}
      </div>
    );
  }

  // Wallet balance
  if (toolName === 'get_wallet_balance' && result?.balance !== undefined) {
    return (
      <div style={{ background: '#fffbf0', border: `1px solid ${GOLD}50`, borderRadius: 10, padding: '8px 12px', fontSize: 13 }}>
        <div style={{ fontWeight: 700, color: NAVY }}>Wallet Balance</div>
        <div style={{ color: GOLD, fontWeight: 700, fontSize: 18 }}>INR {(result.balance / 100).toFixed(2)}</div>
        <button
          onClick={() => onSendMessage('Recharge my wallet')}
          style={{ marginTop: 6, padding: '4px 12px', background: `linear-gradient(135deg,${GOLD},#f59e0b)`, border: 'none', borderRadius: 20, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >Recharge</button>
      </div>
    );
  }

  // Booking history
  if (toolName === 'get_booking_history' && items.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.slice(0, 3).map((b: any, i: number) => (
          <div key={i} style={{ background: '#fffbf0', border: `1px solid ${GOLD}50`, borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: NAVY }}>{b.service ?? b.serviceTitle ?? 'Booking'}</div>
            <div style={{ color: '#6b7280' }}>{b.status} • {b.scheduledAt ? new Date(b.scheduledAt).toLocaleDateString('en-IN') : ''}</div>
          </div>
        ))}
      </div>
    );
  }

  // Generic: show nothing extra (AI will describe it in the response stream)
  return null;
}

export default function RGAIBubble({ religion }: { religion?: string; userId?: string }) {
  const [open, setOpen]                 = useState(false);
  const [msgs, setMsgs]                 = useState<Message[]>([]);
  const [input, setInput]               = useState('');
  const [streaming, setStreaming]       = useState(false);
  const [convId, setConvId]             = useState<string | null>(null);

  // §6.3 — hydrate from IndexedDB on mount so reopen is instant
  useEffect(() => {
    idbGet<{ msgs: Message[]; convId: string | null }>(IDB_KEY).then(saved => {
      if (saved?.msgs?.length) { setMsgs(saved.msgs); setConvId(saved.convId ?? null); }
    });
  }, []);

  // §6.3 — persist to IndexedDB on every message update
  useEffect(() => {
    if (msgs.length > 0) {
      idbSet(IDB_KEY, { msgs: msgs.filter(m => !m.streaming), convId });
    }
  }, [msgs, convId]);

  const [quota, setQuota]               = useState<{ used: number; limit: number } | null>(null);
  const [unread, setUnread]             = useState(false);
  const [recording, setRecording]       = useState(false);
  const [pendingImage, setPendingImage] = useState<PendingMedia | null>(null);
  // §11.3 — per-action cooldown timers (chat 5s, voice 10s, image 30s)
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [footerShown, setFooterShown]     = useState(false); // §6.2 once per session

  const bottomRef        = useRef<HTMLDivElement>(null);
  const abortRef         = useRef<AbortController | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const imageInputRef    = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);
  useEffect(() => { if (open) setUnread(false); }, [open]);
  useEffect(() => {
    if (open && msgs.length === 0) {
      setMsgs([{ id: 'welcome', role: 'assistant', content: "Namaste 🙏 I'm **RG AI**, your personal spiritual guide. I can help with *kundli*, rashifal, finding priests, and spiritual wisdom. Try sending a **voice message** 🎤 or **image** 📷 too!" }]);
    }
  }, [open, msgs.length]);

  // ── Voice recording ──────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: mimeType });
        const base64 = await blobToBase64(blob);
        sendMessage('', { audioBase64: base64, audioMimeType: mimeType });
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      // Microphone permission denied or unavailable — silently ignore
    }
  }, []);  // sendMessage added in deps below after declaration

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }, []);

  // ── Image pick ────────────────────────────────────────────────────────────
  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setPendingImage({ base64: dataUrl.split(',')[1], mimeType: file.type, preview: dataUrl });
    };
    reader.readAsDataURL(file);
    // Reset so same file can be picked again
    e.target.value = '';
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (
    text: string,
    extra?: { audioBase64?: string; audioMimeType?: string },
  ) => {
    if (!text.trim() && !extra?.audioBase64 && !pendingImage) return;
    if (streaming) return;
    // §11.3 — cooldown enforcement
    if (Date.now() < cooldownUntil) return;

    const capturedImage = pendingImage;
    setPendingImage(null);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text || (extra?.audioBase64 ? '🎤 Voice message' : ''),
      imagePreview: capturedImage?.preview,
      isVoice: !!extra?.audioBase64,
    };
    setMsgs(prev => [...prev, userMsg]);
    setInput('');
    setStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMsgs(prev => [...prev, { id: assistantId, role: 'assistant', content: '', streaming: true }]);

    const API = process.env.NEXT_PUBLIC_API_BASE ?? '';
    const tok = tokenStore.access ?? '';

    try {
      abortRef.current = new AbortController();
      const res = await fetch(`${API}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        },
        body: JSON.stringify({
          message: text,
          conversationId: convId,
          religion,
          language: 'en',
          ...(extra?.audioBase64  ? { audioBase64: extra.audioBase64, audioMimeType: extra.audioMimeType } : {}),
          ...(capturedImage       ? { imageBase64: capturedImage.base64, imageMimeType: capturedImage.mimeType } : {}),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        if (res.status === 429) {
          setMsgs(prev => prev.map(m => m.id === assistantId
            ? { ...m, content: '⚠️ Daily limit reached. **Upgrade to RG AI Premium** for unlimited access — only ₹49/month.', streaming: false }
            : m));
          if (!open) setUnread(true);
          return;
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? 'AI error');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim() || line.startsWith('event: ')) continue;
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.event === 'token') {
                fullContent += parsed.token ?? '';
                setMsgs(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m));
              } else if (parsed.event === 'tool_call') {
                setMsgs(prev => [...prev, { id: `tool-${parsed.tool ?? parsed.toolName}-${Date.now()}`, role: 'tool', content: `Calling ${parsed.tool ?? parsed.toolName}…`, toolName: parsed.tool ?? parsed.toolName }]);
              } else if (parsed.event === 'tool_result') {
                // §6.2 — update matching tool message with structured result for inline card
                const tn = parsed.tool ?? parsed.toolName;
                setMsgs(prev => prev.map(m =>
                  m.role === 'tool' && m.toolName === tn && !m.toolResult
                    ? { ...m, content: `${tn}`, toolResult: parsed.result }
                    : m
                ));
              } else if (parsed.event === 'conversation_id') {
                setConvId(parsed.conversationId);
              } else if (parsed.event === 'quota') {
                setQuota({ used: parsed.used, limit: parsed.limit });
              }
            } catch { /* ignore */ }
          }
        }
      }

      setMsgs(prev => prev.map(m => m.id === assistantId ? { ...m, streaming: false } : m));
      if (!open) setUnread(true);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setMsgs(prev => prev.map(m => m.id === assistantId
        ? { ...m, content: '⚠️ Something went wrong. Please try again.', streaming: false }
        : m));
    } finally {
      setStreaming(false);
      // §11.3 cooldown: chat=5s, voice=10s, image=30s
      const cdMs = extra?.audioBase64 ? 10_000 : capturedImage ? 30_000 : 5_000;
      setCooldownUntil(Date.now() + cdMs);
      setFooterShown(true); // §6.2
    }
  }, [streaming, convId, religion, open, pendingImage]);

  // Re-declare startRecording with sendMessage in deps
  const handleMicPress = useCallback(() => {
    if (recording) { stopRecording(); } else { startRecording(); }
  }, [recording, startRecording, stopRecording]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <>
      <style>{`
        @keyframes rgai-pulse   { 0%,100%{box-shadow:0 0 0 0 rgba(200,146,10,.5),0 4px 20px rgba(200,146,10,.4)}50%{box-shadow:0 0 0 12px rgba(200,146,10,0),0 4px 20px rgba(200,146,10,.4)}}
        @keyframes rgai-bounce  { 0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}
        @keyframes rgai-slide-up{ from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes rgai-fade-in { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes rgai-dot-pop { 0%{transform:scale(0)}60%{transform:scale(1.3)}100%{transform:scale(1)}}
        @keyframes rgai-record  { 0%,100%{opacity:1}50%{opacity:.4}}
      `}</style>

      {/* Hidden image input */}
      <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImagePick} />

      {/* Floating bubble — uses the RG AI brand badge from /public/rg-ai-button.png.
          Falls back to a navy-and-gold gradient with a sparkle if the image is missing. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open RG AI assistant"
          style={{
            position: 'fixed', bottom: 88, right: 20,
            width: 64, height: 64, borderRadius: '50%',
            background: '#0F2452',            // navy fallback under the PNG
            backgroundImage: "url('/rg-ai-button.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: 'none', cursor: 'pointer',
            padding: 0,
            boxShadow: '0 6px 20px rgba(15,36,82,0.45), 0 2px 6px rgba(200,146,10,0.35)',
            zIndex: 1000,
            animation: 'rgai-pulse 2.5s infinite',
            overflow: 'visible',
          }}
        >
          {unread && (
            <span
              style={{
                position: 'absolute',
                top: -2, right: -2,
                width: 16, height: 16, borderRadius: '50%',
                background: '#ef4444',
                border: '2px solid #fff',
                animation: 'rgai-dot-pop .3s ease',
              }}
            />
          )}
        </button>
      )}

      {/* Full-screen chat sheet */}
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', flexDirection: 'column', background: PARCH, animation: 'rgai-slide-up .3s ease' }}>

          {/* Header */}
          <div style={{ background: `linear-gradient(135deg,${NAVY} 0%,#1e3a6e 100%)`, padding: '52px 20px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.25)', backgroundImage: `url('/rg-ai-button.png')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#0F2452', border: '2px solid rgba(255,255,255,0.15)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 17 }}>RG AI</div>
              <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 12 }}>Your Personal Spiritual Guide</div>
            </div>
            {quota && <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11, textAlign: 'right' }}>{quota.used}/{quota.limit} msgs today</div>}
            <button onClick={() => { setOpen(false); abortRef.current?.abort(); }} style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>✕</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {msgs.map(msg => (
              <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', animation: 'rgai-fade-in .2s ease' }}>
                {msg.role === 'tool' ? (
                  <div style={{ maxWidth: '90%' }}>
                    {/* §6.2 — tool call indicator */}
                    <div style={{ background: 'rgba(200,146,10,.1)', border: `1px solid ${GOLD}40`, borderRadius: 10, padding: '6px 12px', fontSize: 12, color: GOLD, fontStyle: 'italic', marginBottom: msg.toolResult ? 6 : 0 }}>
                      🔧 {msg.toolResult ? msg.toolName : `Calling ${msg.content}…`}
                    </div>
                    {/* §6.2 — inline result card */}
                    {msg.toolResult && <ToolResultCard toolName={msg.toolName ?? ''} result={msg.toolResult} onSendMessage={sendMessage} />}
                  </div>
                ) : (
                  <div style={{ maxWidth: '82%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: msg.role === 'user' ? `linear-gradient(135deg,${GOLD},#f59e0b)` : '#fff', color: msg.role === 'user' ? '#fff' : '#1f2937', fontSize: 14, lineHeight: 1.55, boxShadow: '0 1px 6px rgba(0,0,0,.08)' }}>
                    {msg.imagePreview && <img src={msg.imagePreview} alt="attached" style={{ maxWidth: '100%', borderRadius: 10, marginBottom: 6, display: 'block' }} />}
                    {msg.isVoice && <span style={{ fontSize: 12, opacity: .75, display: 'block', marginBottom: 2 }}>🎤 Voice message</span>}
                    {msg.role === 'assistant' && !msg.streaming
                      ? <MarkdownText text={msg.content} />
                      : <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                    }
                    {msg.streaming && <TypingDots />}
                  </div>
                )}
              </div>
            ))}
            {streaming && msgs[msgs.length - 1]?.role !== 'assistant' && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ background: '#fff', borderRadius: '18px 18px 18px 4px', boxShadow: '0 1px 6px rgba(0,0,0,.08)' }}><TypingDots /></div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick chips when empty */}
          {msgs.length === 0 && (
            <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8, overflowX: 'auto' }}>
              {QUICK_CHIPS.map(chip => (
                <button key={chip.label} onClick={() => sendMessage(chip.prompt)} style={{ flexShrink: 0, padding: '8px 14px', background: '#fff', border: `1.5px solid ${GOLD}60`, borderRadius: 99, color: NAVY, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{chip.label}</button>
              ))}
            </div>
          )}

          {/* Image preview */}
          {pendingImage && (
            <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <img src={pendingImage.preview} alt="preview" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: `2px solid ${GOLD}` }} />
              <button onClick={() => setPendingImage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 18 }}>&#x2715;</button>
            </div>
          )}

          {/* Input area */}
          <div style={{ padding: '0 16px 32px', display: 'flex', gap: 8, alignItems: 'flex-end', background: PARCH }}>
            {/* Mic */}
            <button
              onMouseDown={handleMicPress}
              onTouchStart={handleMicPress}
              disabled={streaming}
              style={{ width: 40, height: 40, borderRadius: '50%', background: recording ? '#ef4444' : '#f3f4f6', border: 'none', cursor: streaming ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18, transition: 'background .2s', animation: recording ? 'rgai-record 1s infinite' : 'none' }}
            ><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={recording ? "#fff" : "#4b5563"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></button>

            {/* Image */}
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={streaming}
              style={{ width: 40, height: 40, borderRadius: '50%', background: pendingImage ? `linear-gradient(135deg,${GOLD},#f59e0b)` : '#f3f4f6', border: 'none', cursor: streaming ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18, transition: 'background .2s' }}
            ><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={pendingImage ? "#fff" : "#4b5563"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></button>

            {/* Text input */}
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything spiritual..."
              rows={1}
              disabled={streaming || recording}
              style={{ flex: 1, padding: '10px 14px', borderRadius: 20, border: `1.5px solid ${GOLD}40`, background: '#fff', fontSize: 14, resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.4 }}
            />

            {/* Send */}
            <button
              onClick={() => sendMessage(input)}
              disabled={(!input.trim() && !pendingImage) || streaming || recording || Date.now() < cooldownUntil}
              style={{ width: 44, height: 44, borderRadius: '50%', background: (input.trim() || pendingImage) && !streaming && !recording ? `linear-gradient(135deg,${GOLD},#f59e0b)` : '#e5e7eb', border: 'none', cursor: (input.trim() || pendingImage) && !streaming && !recording ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18, transition: 'background .2s' }}
            >
              {streaming ? '⏸' : '▲'}
            </button>
          </div>

          {/* Powered by footer — shown once per session (§6.2) */}
          {footerShown && (
            <div style={{ textAlign: 'center', paddingBottom: 12, color: '#9ca3af', fontSize: 11 }}>
              Powered by <strong style={{ color: GOLD }}>RG AI</strong>
            </div>
          )}
        </div>
      )}
    </>
  );
}
