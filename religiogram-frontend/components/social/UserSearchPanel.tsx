'use client';
import { useState, useCallback, useRef } from 'react';
import { socialApi, SocialUser } from '@/lib/api';

const NAVY = '#0F2452';
const GOLD  = '#C8932A';

function Avatar({ name, size=44 }: { name?: string|null; size?: number }) {
  const ini = (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const colors = ['#0F2452','#7C3AED','#059669','#D97706'];
  const bg = colors[(name||'?').charCodeAt(0)%colors.length];
  return <div style={{ width:size, height:size, borderRadius:'50%', background:bg, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*.36, fontWeight:700, flexShrink:0 }}>{ini}</div>;
}

interface Props { onViewProfile?: (userId: string) => void; }

export default function UserSearchPanel({ onViewProfile }: Props) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<SocialUser[]>([]);
  const [loading, setLoading]   = useState(false);
  const [pending, setPending]   = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null);

  const search = useCallback((q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try { setResults(await socialApi.searchUsers(q)); }
      catch {} finally { setLoading(false); }
    }, 350);
  }, []);

  const addFriend = useCallback(async (u: SocialUser) => {
    if (u.friendshipStatus) return;
    setPending((s) => new Set<string>(s).add(u.id) as Set<string>);
    try {
      await socialApi.sendFriendRequest(u.id);
      setResults((rs: any) => rs.map((r: any) => r.id===u.id ? { ...r, friendshipStatus:'pending' as const } : r));
    } catch {} finally { setPending((s) => { const n=new Set<string>(s); n.delete(u.id); return n; }); }
  }, []);

  const btnProps = (u: SocialUser) => {
    if (u.friendshipStatus==='accepted') return { label:'Friends', bg:'#059669', text:'#fff', disabled:true };
    if (u.friendshipStatus==='pending')  return { label:'Pending', bg:'#F1F5F9', text:'#6B7280', disabled:true };
    return { label:'Add Friend', bg:NAVY, text:'#fff', disabled:false };
  };

  return (
    <div>
      {/* Search box */}
      <div style={{ position:'relative', marginBottom:16 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.2" strokeLinecap="round"
          style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input value={query} onChange={e=>search(e.target.value)} placeholder="Search by name or email…"
          style={{ width:'100%', height:46, paddingLeft:42, paddingRight:loading?40:16, borderRadius:12, border:'1.5px solid #E5E7EB', background:'#fff', fontSize:14, outline:'none', color:'#1A1A2E', boxSizing:'border-box', boxShadow:'0 1px 4px rgba(0,0,0,.05)' }} />
        {loading && (
          <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', width:16, height:16, border:'2px solid #E5E7EB', borderTopColor:NAVY, borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }} />
        )}
      </div>

      {/* Results */}
      {results.length > 0 ? (
        <div style={{ background:'#fff', borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
          {results.map((u: any, i: any) => {
            const btn = btnProps(u);
            return (
              <div key={u.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderBottom:i<results.length-1?'1px solid #F9FAFB':'none' }}>
                <button onClick={()=>onViewProfile?.(u.id)} style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
                  <Avatar name={u.fullName} />
                </button>
                <div style={{ flex:1, minWidth:0 }}>
                  <button onClick={()=>onViewProfile?.(u.id)} style={{ background:'none', border:'none', cursor:'pointer', padding:0, textAlign:'left', display:'block', width:'100%' }}>
                    <span style={{ fontSize:14, fontWeight:700, color:'#111827', display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.fullName}</span>
                  </button>
                  <span style={{ fontSize:12, color:'#9CA3AF', display:'flex', alignItems:'center', gap:4 }}>
                    <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background:u.role==='provider'?GOLD:'#9CA3AF' }} />
                    {u.role}
                    {u.email ? ` · ${u.email}` : ''}
                  </span>
                </div>
                <button onClick={()=>addFriend(u)} disabled={btn.disabled||pending.has(u.id)}
                  style={{ height:34, paddingInline:14, borderRadius:8, background:btn.bg, color:btn.text, border:'none', fontSize:12.5, fontWeight:600, cursor:btn.disabled?'default':'pointer', opacity:pending.has(u.id)?.6:1, whiteSpace:'nowrap', flexShrink:0 }}>
                  {pending.has(u.id) ? '…' : btn.label}
                </button>
              </div>
            );
          })}
        </div>
      ) : query.trim() && !loading ? (
        <div style={{ textAlign:'center', padding:'40px 16px', background:'#fff', borderRadius:14 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" style={{ margin:'0 auto 10px', display:'block' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p style={{ color:'#6B7280', fontSize:14, margin:0 }}>No users found for <strong>"{query}"</strong></p>
        </div>
      ) : !query.trim() ? (
        <div style={{ textAlign:'center', padding:'40px 16px', background:'#fff', borderRadius:14 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" style={{ margin:'0 auto 12px', display:'block' }}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <p style={{ color:'#9CA3AF', fontSize:14, margin:0 }}>Search for people to connect with</p>
        </div>
      ) : null}
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
    </div>
  );
}
