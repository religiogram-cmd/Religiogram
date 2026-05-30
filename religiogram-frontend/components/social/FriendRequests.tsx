'use client';
import { useState, useEffect, useCallback } from 'react';
import { socialApi, Friendship } from '@/lib/api';

const NAVY = '#0F2452';
const GOLD  = '#C8932A';

function Avatar({ name, size=44 }: { name?: string|null; size?: number }) {
  const ini = (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const colors = ['#0F2452','#7C3AED','#059669','#D97706'];
  const bg = colors[(name||'?').charCodeAt(0)%colors.length];
  return <div style={{ width:size, height:size, borderRadius:'50%', background:bg, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*.36, fontWeight:700, flexShrink:0 }}>{ini}</div>;
}

export default function FriendRequests() {
  const [pending, setPending]   = useState<Friendship[]>([]);
  const [loading, setLoading]   = useState(true);
  const [acting, setActing]     = useState<Set<string>>(new Set());

  useEffect(() => {
    socialApi.getPendingRequests().then(setPending).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const respond = useCallback(async (f: Friendship, accept: boolean) => {
    setActing((s) => new Set<string>(s).add(f.id) as Set<string>);
    try {
      if (accept) await socialApi.acceptRequest(f.id);
      else        await socialApi.rejectRequest(f.id);
      setPending((ps: any) => ps.filter((p: any) => p.id !== f.id));
    } catch {} finally { setActing((s) => { const n=new Set<string>(s); n.delete(f.id); return n; }); }
  }, []);

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}>
      <span style={{ width:28, height:28, border:`2px solid ${GOLD}40`, borderTopColor:NAVY, borderRadius:'50%', display:'inline-block', animation:'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
    </div>
  );

  if (pending.length === 0) return (
    <div style={{ textAlign:'center', padding:'48px 20px', background:'#fff', borderRadius:16 }}>
      <div style={{ width:64, height:64, borderRadius:18, background:`${NAVY}0D`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="1.6" strokeLinecap="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
        </svg>
      </div>
      <p style={{ margin:'0 0 6px', fontSize:16, fontWeight:700, color:'#111827' }}>No pending requests</p>
      <p style={{ margin:0, fontSize:13, color:'#9CA3AF' }}>Friend requests you receive will appear here</p>
    </div>
  );

  return (
    <div>
      <p style={{ fontSize:12, fontWeight:700, letterSpacing:'.08em', color:'#9CA3AF', textTransform:'uppercase', margin:'0 0 10px 4px' }}>
        {pending.length} Pending Request{pending.length!==1?'s':''}
      </p>
      <div style={{ background:'#fff', borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,.06)' }}>
        {pending.map((f: any, i: any) => (
          <div key={f.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px', borderBottom:i<pending.length-1?'1px solid #F9FAFB':'none' }}>
            <Avatar name={f.requester?.fullName} />
            <div style={{ flex:1, minWidth:0 }}>
              <span style={{ fontSize:14, fontWeight:700, color:'#111827', display:'block' }}>{f.requester?.fullName||'User'}</span>
              <span style={{ fontSize:12, color:'#9CA3AF' }}>{f.requester?.email||'Wants to connect'}</span>
            </div>
            <div style={{ display:'flex', gap:8, flexShrink:0 }}>
              <button onClick={()=>respond(f,false)} disabled={acting.has(f.id)}
                style={{ height:34, paddingInline:12, borderRadius:8, background:'#F1F5F9', border:'none', color:'#6B7280', fontSize:13, fontWeight:600, cursor:'pointer', opacity:acting.has(f.id)?.5:1 }}>
                Decline
              </button>
              <button onClick={()=>respond(f,true)} disabled={acting.has(f.id)}
                style={{ height:34, paddingInline:14, borderRadius:8, background:NAVY, border:`1.5px solid ${GOLD}`, color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', opacity:acting.has(f.id)?.5:1 }}>
                {acting.has(f.id)?'…':'Accept'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
