'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { socialApi, DmThread, DirectMessage } from '@/lib/api';

const NAVY = '#0F2452';
const GOLD  = '#C8932A';

function Avatar({ name, size=44 }: { name?: string|null; size?: number }) {
  const ini = (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const colors = ['#0F2452','#7C3AED','#059669','#D97706'];
  const bg = colors[(name||'?').charCodeAt(0)%colors.length];
  return <div style={{ width:size, height:size, borderRadius:'50%', background:bg, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*.36, fontWeight:700, flexShrink:0 }}>{ini}</div>;
}

function timeAgo(iso: string) {
  const s=(Date.now()-new Date(iso).getTime())/1000;
  if(s<60) return 'now'; if(s<3600) return Math.floor(s/60)+'m'; if(s<86400) return Math.floor(s/3600)+'h'; return Math.floor(s/86400)+'d';
}

/* ── Chat ── */
function ChatView({ thread, myId, onBack }: { thread:DmThread; myId:string; onBack:()=>void }) {
  const [msgs, setMsgs]       = useState<DirectMessage[]>([]);
  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    socialApi.getConversation(thread.userId).then(r=>setMsgs(r.items)).catch(()=>{}).finally(()=>setLoading(false));
  }, [thread.userId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [msgs]);

  const send = useCallback(async () => {
    if (!text.trim()) return;
    const c=text.trim(); setText(''); setSending(true);
    try { const m=await socialApi.sendMessage(thread.userId,c); setMsgs((ms: any)=>[...ms,m]); }
    catch { setText(c); } finally { setSending(false); }
  }, [text, thread.userId]);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100svh - 148px)' }}>
      {/* Chat header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'#fff', borderRadius:14, marginBottom:8, boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
        <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', padding:'4px 8px 4px 0', color:NAVY, display:'flex', alignItems:'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <Avatar name={thread.fullName} size={36} />
        <div style={{ flex:1 }}>
          <span style={{ fontSize:14, fontWeight:700, color:'#111827', display:'block' }}>{thread.fullName}</span>
          <span style={{ fontSize:11, color:'#9CA3AF' }}>Tap to view profile</span>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 4px', display:'flex', flexDirection:'column', gap:6 }}>
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', paddingTop:40 }}>
            <span style={{ width:24, height:24, border:`2px solid ${GOLD}30`, borderTopColor:NAVY, borderRadius:'50%', display:'inline-block', animation:'spin .8s linear infinite' }} />
          </div>
        ) : msgs.length===0 ? (
          <div style={{ textAlign:'center', paddingTop:40 }}>
            <p style={{ color:'#9CA3AF', fontSize:14 }}>No messages yet. Say hello! 👋</p>
          </div>
        ) : msgs.map((m: any) => {
          const mine = m.senderId===myId;
          return (
            <div key={m.id} style={{ display:'flex', justifyContent:mine?'flex-end':'flex-start' }}>
              <div style={{ maxWidth:'75%', padding:'9px 13px', borderRadius:mine?'16px 16px 4px 16px':'16px 16px 16px 4px', background:mine?NAVY:'#fff', color:mine?'#fff':'#1F2937', fontSize:14, lineHeight:1.5, boxShadow:'0 1px 3px rgba(0,0,0,.08)' }}>
                <span>{m.content}</span>
                <span style={{ display:'block', fontSize:10, marginTop:3, opacity:.6, textAlign:'right' }}>{timeAgo(m.createdAt)}{mine&&m.readAt?' ✓✓':''}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display:'flex', gap:8, alignItems:'center', paddingTop:10, marginTop:8, borderTop:'1px solid #F3F4F6' }}>
        <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()} placeholder={`Message ${thread.fullName}…`}
          style={{ flex:1, height:42, borderRadius:21, border:'1.5px solid #E5E7EB', padding:'0 16px', fontSize:14, outline:'none', background:'#fff', color:'#1A1A2E' }} />
        <button onClick={send} disabled={sending||!text.trim()}
          style={{ width:42, height:42, borderRadius:'50%', background:NAVY, border:`1.5px solid ${GOLD}`, color:'#fff', cursor:'pointer', opacity:sending||!text.trim()?.4:1, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
    </div>
  );
}

/* ── Inbox ── */
export default function DMInbox({ currentUserId }: { currentUserId:string }) {
  const [threads, setThreads] = useState<DmThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive]   = useState<DmThread|null>(null);

  useEffect(() => {
    socialApi.getInbox().then(setThreads).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  if (active) return <ChatView thread={active} myId={currentUserId} onBack={()=>setActive(null)} />;

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}>
      <span style={{ width:28, height:28, border:`2px solid ${GOLD}40`, borderTopColor:NAVY, borderRadius:'50%', display:'inline-block', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
    </div>
  );

  if (threads.length===0) return (
    <div style={{ textAlign:'center', padding:'48px 20px', background:'#fff', borderRadius:16 }}>
      <div style={{ width:64, height:64, borderRadius:18, background:`${NAVY}0D`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="1.6" strokeLinecap="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <p style={{ margin:'0 0 6px', fontSize:16, fontWeight:700, color:'#111827' }}>No messages yet</p>
      <p style={{ margin:0, fontSize:13, color:'#9CA3AF' }}>Add friends in Discover and start chatting</p>
    </div>
  );

  return (
    <div style={{ background:'#fff', borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
      {threads.map((t: any, i: any) => (
        <button key={t.userId} onClick={()=>setActive(t)}
          style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'13px 14px', borderBottom:i<threads.length-1?'1px solid #F9FAFB':'none', background:'none', border:'none', cursor:'pointer', textAlign:'left' }}>
          <div style={{ position:'relative', flexShrink:0 }}>
            <Avatar name={t.fullName} size={46} />
            {t.unreadCount>0 && (
              <span style={{ position:'absolute', top:-2, right:-2, background:'#EF4444', color:'#fff', borderRadius:'50%', minWidth:18, height:18, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, padding:'0 3px' }}>{t.unreadCount}</span>
            )}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
              <span style={{ fontSize:14, fontWeight:t.unreadCount>0?700:600, color:'#111827' }}>{t.fullName}</span>
              <span style={{ fontSize:11.5, color:'#9CA3AF' }}>{timeAgo(t.lastMessageAt)}</span>
            </div>
            <span style={{ fontSize:13, color:t.unreadCount>0?'#374151':'#9CA3AF', fontWeight:t.unreadCount>0?500:400, display:'block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.lastMessage}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
