'use client';

import { useEffect, useRef, useState, ChangeEvent } from 'react';
import { community, CommunityProfile, DMThread, DMMessage, UserSearchResult } from '@/lib/community-api';

const NAVY    = '#0F2452';
const GOLD_L  = '#E0A92F';
const TEXT    = '#1A0800';
const TEXT2   = '#4A3010';
const TEXT3   = '#8B6B35';

interface Props { me: CommunityProfile; }

export default function CommunityMessagesTab({ me }: Props) {
  const [threads, setThreads] = useState<DMThread[]>([]);
  const [openPeer, setOpenPeer] = useState<UserSearchResult | DMThread['peer'] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    community.dms.threads()
      .then(r => {
        if (cancelled) return;
        // Filter out malformed threads (no peer)
        const safe = (r ?? []).filter((t: any) => t && t.peer && t.peer.id);
        setThreads(safe);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // If user clicked "Message" on a profile, sessionStorage has the peer info — open it
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('rg_dm_peer');
      if (raw) {
        sessionStorage.removeItem('rg_dm_peer');
        const peer = JSON.parse(raw);
        if (peer?.id) setOpenPeer(peer);
      }
    } catch {}
  }, []);

  if (openPeer) {
    return <DMThreadView me={me} peer={openPeer as any} onBack={() => setOpenPeer(null)} onThreadUpdate={(t) => {
      setThreads(prev => {
        const idx = prev.findIndex(x => x.peer.id === t.peer.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = t; return next; }
        return [t, ...prev];
      });
    }} />;
  }

  if (searchOpen) {
    return <UserSearchView me={me} onClose={() => setSearchOpen(false)} onPick={(u) => { setSearchOpen(false); setOpenPeer(u); }} />;
  }

  return (
    <div>
      {/* Search bar */}
      <div style={{ padding: 12, background: '#fff', borderBottom: '1px solid rgba(200,146,10,0.18)' }}>
        <button onClick={() => setSearchOpen(true)} style={{
          width: '100%', background: '#F6F1E5', border: '1px solid rgba(200,146,10,0.25)',
          borderRadius: 22, padding: '9px 14px', textAlign: 'left',
          fontSize: 12.5, color: TEXT3, cursor: 'pointer',
        }}>🔍 Search users by @username…</button>
      </div>

      {loading && <div style={{ padding: 30, textAlign: 'center', color: TEXT3, fontSize: 13 }}>Loading messages…</div>}
      {!loading && threads.length === 0 && (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: TEXT3, fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ fontSize: 42, marginBottom: 10 }}>💬</div>
          <strong style={{ color: TEXT, fontSize: 14 }}>No messages yet</strong>
          <div style={{ marginTop: 6 }}>Search for a friend by username to start a conversation.</div>
        </div>
      )}

      <div>
        {threads.map(t => (
          <button key={t.threadId} onClick={() => setOpenPeer(t.peer)} style={{
            width: '100%', background: '#fff', border: 'none',
            borderBottom: '1px solid rgba(200,146,10,0.12)',
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px', cursor: 'pointer',
          }}>
            <div style={{
              width: 46, height: 46, borderRadius: '50%',
              background: t.peer.avatarUrl ? `center/cover url('${t.peer.avatarUrl}')` : 'linear-gradient(135deg,#C8920A,#6B3210)',
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>{t.peer.name || ('@' + t.peer.username)}</span>
                {t.peer.accountType && t.peer.accountType !== 'user' && (
                  <span style={{ fontSize: 8.5, fontWeight: 800, color: NAVY, background: GOLD_L + '33', padding: '1px 5px', borderRadius: 8 }}>{(t.peer.accountType || '').toUpperCase()}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: t.unreadCount > 0 ? TEXT : TEXT3, fontWeight: t.unreadCount > 0 ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                {t.lastMessage?.text ?? (t.lastMessage?.photoUrl ? '📷 Photo' : 'No messages yet')}
              </div>
            </div>
            {t.unreadCount > 0 && (
              <span style={{ minWidth: 18, height: 18, background: '#DC2626', color: '#fff', borderRadius: 10, padding: '0 6px', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{t.unreadCount > 99 ? '99+' : t.unreadCount}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── User Search ───────────────────────────────────────── */
function UserSearchView({ me, onClose, onPick }: { me: CommunityProfile; onClose: () => void; onPick: (u: UserSearchResult) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    timerRef.current = setTimeout(() => {
      community.users.search(q.trim()).then(r => setResults(r ?? [])).catch(() => setResults([])).finally(() => setLoading(false));
    }, 250);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [q]);

  async function sendFriend(u: UserSearchResult) {
    if (!u.canFriend) return;
    try {
      await community.friends.send(u.id);
      setResults(prev => prev.map(x => x.id === u.id ? { ...x, friendStatus: 'requested' } : x));
    } catch { /* ignore */ }
  }

  return (
    <div>
      <div style={{ padding: 12, background: '#fff', borderBottom: '1px solid rgba(200,146,10,0.18)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 18, color: TEXT2, cursor: 'pointer' }}>←</button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search @username or name…" autoFocus style={{
          flex: 1, border: '1px solid rgba(200,146,10,0.25)', borderRadius: 18, padding: '9px 14px',
          fontSize: 13, background: '#FFFCF5', outline: 'none', fontFamily: 'inherit',
        }} />
      </div>
      {loading && <div style={{ padding: 20, textAlign: 'center', color: TEXT3, fontSize: 12 }}>Searching…</div>}
      {!loading && q.trim() && results.length === 0 && (
        <div style={{ padding: 30, textAlign: 'center', color: TEXT3, fontSize: 12 }}>No users found.</div>
      )}
      {results.map(u => (
        <button
          key={u.id}
          onClick={() => onPick(u)}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fff', borderBottom: '1px solid rgba(200,146,10,0.10)', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
        >
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: u.avatarUrl ? `center/cover url('${u.avatarUrl}')` : 'linear-gradient(135deg,#C8920A,#6B3210)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>{u.name || ('@' + u.username)}</span>
              {u.accountType && u.accountType !== 'user' && (
                <span style={{ fontSize: 8.5, fontWeight: 800, color: NAVY, background: GOLD_L + '33', padding: '1px 5px', borderRadius: 8 }}>{(u.accountType || '').toUpperCase()}</span>
              )}
            </div>
            <div style={{ fontSize: 10.5, color: TEXT3 }}>@{u.username}</div>
          </div>
          <span style={{ color: TEXT3, fontSize: 16 }}>›</span>
        </button>
      ))}
    </div>
  );
}

/* ── Single DM thread view ─────────────────────────────── */
function DMThreadView({ me, peer, onBack, onThreadUpdate }: { me: CommunityProfile; peer: any; onBack: () => void; onThreadUpdate: (t: DMThread) => void }) {
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canMessage = peer.canMessage !== false && (peer.accountType ?? 'user') === 'user';

  useEffect(() => {
    let cancelled = false;
    let firstLoad = true;
    const fetchMessages = () => {
      community.dms.messages(peer.id).then(r => {
        if (cancelled) return;
        setMessages(r?.items ?? []);
        if (firstLoad) {
          setLoading(false);
          setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 30);
          firstLoad = false;
        } else {
          const el = scrollRef.current;
          if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
            setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }), 30);
          }
        }
      }).catch(() => { if (firstLoad) setLoading(false); });
    };
    fetchMessages();

    // Real-time via socket; fall back to slower polling
    let unsubscribers: Array<() => void> = [];
    (async () => {
      try {
        const { connectSocket, onSocketEvent } = await import('@/lib/socket');
        await connectSocket();
        unsubscribers.push(onSocketEvent('dm.message', (payload: any) => {
          if (cancelled) return;
          if (payload?.senderId === peer.id || payload?.recipientId === peer.id) {
            fetchMessages();
          }
        }));
      } catch { /* socket unavailable */ }
    })();

    const id = setInterval(fetchMessages, 15_000); // fallback poll every 15s
    return () => {
      cancelled = true;
      clearInterval(id);
      unsubscribers.forEach(fn => fn());
    };
  }, [peer.id]);

  async function send(payload?: { photoUrl: string }) {
    if (!canMessage) return;
    const body = payload ? payload : { text: text.trim() };
    if (!payload && !text.trim()) return;
    setSending(true);
    try {
      const m = await community.dms.send(peer.id, body);
      setMessages(prev => [...prev, m]);
      if (!payload) setText('');
      setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 30);
      onThreadUpdate({ threadId: m.threadId, peer, lastMessage: m, unreadCount: 0, updatedAt: m.createdAt });
    } catch { /* ignore */ }
    setSending(false);
  }

  async function onPhotoPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    if (fileRef.current) fileRef.current.value = '';
    try {
      const url = await community.uploads.upload(f, 'dm');
      await send({ photoUrl: url });
    } catch { /* ignore */ }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', flexDirection: 'column',
      background: '#FAF6E8',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fff', borderBottom: '1px solid rgba(200,146,10,0.18)' }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 'none', fontSize: 20, color: TEXT2, cursor: 'pointer' }}>←</button>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: peer.avatarUrl ? `center/cover url('${peer.avatarUrl}')` : 'linear-gradient(135deg,#C8920A,#6B3210)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>{peer.name || ('@' + peer.username)}</div>
          <div style={{ fontSize: 10, color: TEXT3 }}>@{peer.username}</div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', background: '#FAF6E8' }}>
        {loading && <div style={{ textAlign: 'center', color: TEXT3, fontSize: 12 }}>Loading…</div>}
        {!canMessage && (
          <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B55', borderRadius: 10, padding: 12, color: TEXT2, fontSize: 12, lineHeight: 1.5, textAlign: 'center' }}>
            This is a {peer.accountType} account. Direct messaging isn&apos;t available — visit their profile for service options instead.
          </div>
        )}
        {messages.map(m => {
          // Robust ownership check — me may be community profile with userId or user with id
          const myId = (me as any).userId ?? (me as any).id;
          const mine = m.senderId === myId;
          const timeStr = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
              <div style={{
                maxWidth: '76%',
                background: mine ? NAVY : '#fff',
                color: mine ? '#fff' : TEXT,
                borderRadius: 14,
                borderTopRightRadius: mine ? 4 : 14,
                borderTopLeftRadius:  mine ? 14 : 4,
                padding: m.photoUrl && !m.text ? 4 : '7px 11px',
                fontSize: 13, lineHeight: 1.4,
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}>
                {m.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.photoUrl} alt="" style={{ maxWidth: 220, borderRadius: 10, display: 'block' }} />
                )}
                {m.text && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: m.photoUrl ? 6 : 0 }}>{m.text}</div>}
              </div>
              {timeStr && (
                <div style={{ fontSize: 9.5, color: TEXT3, marginTop: 2, padding: '0 4px' }}>{timeStr}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Composer */}
      {canMessage && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 10px calc(10px + env(safe-area-inset-bottom))', borderTop: '1px solid rgba(200,146,10,0.18)', background: '#fff', alignItems: 'flex-end' }}>
          <button onClick={() => fileRef.current?.click()} style={{ background: '#F6F1E5', border: 'none', borderRadius: '50%', width: 36, height: 36, fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>📷</button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={onPhotoPick} style={{ display: 'none' }} />
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 2000))} rows={1} placeholder="Write a message…"
            style={{ flex: 1, resize: 'none', border: '1px solid rgba(200,146,10,0.25)', borderRadius: 18, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', background: '#FFFCF5', outline: 'none' }} />
          <button onClick={() => send()} disabled={sending || !text.trim()} style={{
            background: text.trim() ? NAVY : 'rgba(15,36,82,0.30)', color: '#fff',
            border: 'none', borderRadius: '50%', width: 36, height: 36, fontSize: 16, cursor: text.trim() && !sending ? 'pointer' : 'not-allowed', flexShrink: 0,
          }}>➤</button>
        </div>
      )}
    </div>
  );
}

/* ── style helpers ──────────────────────────────────────── */
function smallBtn(variant: 'navy' | 'gold'): React.CSSProperties {
  return variant === 'navy'
    ? { background: NAVY, color: '#fff', border: 'none', borderRadius: 14, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }
    : { background: GOLD_L, color: NAVY, border: 'none', borderRadius: 14, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
}
const statusBadge: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, color: TEXT3, background: '#F3F4F6', padding: '4px 8px', borderRadius: 10,
};
