'use client';
import { useState, useCallback } from 'react';
import { socialApi, SocialPost } from '@/lib/api';

const NAVY = '#0F2452';
const GOLD  = '#C8932A';

function getCurrentUser() {
  // Resolved at runtime from tokenStore (no localStorage — rg_dev_user removed in v36)
  return { name: 'You', id: '' };
}

function Avatar({ name, size=36 }: { name:string; size?:number }) {
  const ini = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const colors = ['#0F2452','#7C3AED','#059669'];
  const bg = colors[name.charCodeAt(0)%colors.length];
  return <div style={{ width:size, height:size, borderRadius:'50%', background:bg, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*.38, fontWeight:700, flexShrink:0 }}>{ini}</div>;
}

interface Props { onCreated: (post: SocialPost) => void; }

export default function CreatePost({ onCreated }: Props) {
  const [caption, setCaption]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [expanded, setExpanded] = useState(false);
  const user = getCurrentUser();

  const submit = useCallback(async () => {
    if (!caption.trim()) { setError('Write something to share.'); return; }
    setError(''); setLoading(true);
    try {
      const post = await socialApi.createPost({ caption: caption.trim() });
      onCreated(post);
      setCaption(''); setExpanded(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not post. Try again.');
    } finally { setLoading(false); }
  }, [caption, onCreated]);

  if (!expanded) {
    return (
      <button id="rg-create-post-trigger" onClick={() => setExpanded(true)}
        style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', cursor:'pointer', marginBottom:10, boxShadow:'0 1px 4px rgba(0,0,0,.05)', boxSizing:'border-box' }}>
        <Avatar name={user.name} />
        <span style={{ flex:1, textAlign:'left', fontSize:14, color:'#9CA3AF', fontWeight:400 }}>Share a thought, prayer, or experience…</span>
        <span style={{ width:32, height:32, borderRadius:8, background:`${NAVY}0D`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </span>
      </button>
    );
  }

  return (
    <div style={{ background:'#fff', borderRadius:16, padding:16, marginBottom:10, boxShadow:'0 2px 16px rgba(15,36,82,.1)', border:`1.5px solid ${GOLD}33` }}>
      {/* Author row */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
        <Avatar name={user.name} />
        <div>
          <span style={{ fontSize:14, fontWeight:700, color:'#111827', display:'block' }}>{user.name}</span>
          <span style={{ fontSize:11, color:'#9CA3AF' }}>Public post</span>
        </div>
      </div>
      <textarea value={caption} onChange={e=>{setCaption(e.target.value);setError('');}}
        placeholder="What's on your mind? Share a prayer, blessing, or spiritual experience…"
        rows={4} autoFocus
        style={{ width:'100%', border:`1.5px solid ${error?'#EF4444':'#E5E7EB'}`, borderRadius:10, padding:'10px 12px', fontSize:14, color:'#1A1A2E', background:'#F8FAFC', outline:'none', resize:'none', fontFamily:'inherit', lineHeight:1.65, boxSizing:'border-box', transition:'border-color .2s' }}
        onFocus={e=>{e.target.style.borderColor=GOLD;}} onBlur={e=>{if(!error)e.target.style.borderColor='#E5E7EB';}}
      />
      {error && <p style={{ color:'#EF4444', fontSize:12, margin:'4px 0 0', display:'flex', alignItems:'center', gap:4 }}>⚠ {error}</p>}
      {/* char count */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginTop:4, marginBottom:10 }}>
        <span style={{ fontSize:11, color: caption.length>2000?'#EF4444':'#9CA3AF' }}>{caption.length}/2200</span>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={()=>{setExpanded(false);setCaption('');setError('');}}
          style={{ flex:1, height:42, borderRadius:10, background:'#F1F5F9', border:'none', color:'#64748B', fontSize:14, fontWeight:600, cursor:'pointer' }}>
          Cancel
        </button>
        <button onClick={submit} disabled={loading||caption.length>2200}
          style={{ flex:2, height:42, borderRadius:10, background:NAVY, border:`1.5px solid ${GOLD}`, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', opacity:loading||caption.length>2200?0.6:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          {loading ? (
            <span style={{ width:18, height:18, border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin .7s linear infinite' }} />
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Share Post
            </>
          )}
        </button>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
    </div>
  );
}
