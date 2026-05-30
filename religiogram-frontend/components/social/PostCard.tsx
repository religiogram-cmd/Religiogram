'use client';
import { useState, useCallback } from 'react';
import { socialApi, SocialPost, PostComment } from '@/lib/api';

const NAVY = '#0F2452';
const GOLD  = '#C8932A';

/* ── Helpers ── */
function initials(name?: string | null) {
  return (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
}
function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60)     return 'just now';
  if (s < 3600)   return `${Math.floor(s/60)}m ago`;
  if (s < 86400)  return `${Math.floor(s/3600)}h ago`;
  if (s < 604800) return `${Math.floor(s/86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short' });
}

function Avatar({ name, avatarUrl, size=38 }: { name?: string|null; avatarUrl?: string|null; size?: number }) {
  if (avatarUrl) return <img src={avatarUrl} alt={name||''} style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0 }} />;
  const colors = ['#0F2452','#7C3AED','#059669','#D97706','#DC2626'];
  const bg = colors[(name||'?').charCodeAt(0) % colors.length];
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:bg, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*.38, fontWeight:700, flexShrink:0, letterSpacing:'-.5px' }}>
      {initials(name)}
    </div>
  );
}

/* ── Like / Comment icons ── */
function HeartIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="#EF4444" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ) : (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

interface PostCardProps {
  post: SocialPost;
  currentUserId?: string;
  onDelete?: (id: string) => void;
  onProfilePress?: (userId: string) => void;
}

export default function PostCard({ post: initial, currentUserId, onDelete, onProfilePress }: PostCardProps) {
  const [post, setPost]           = useState(initial);
  const [showComments, setShow]   = useState(false);
  const [comments, setComments]   = useState<PostComment[]>([]);
  const [loadingC, setLoadingC]   = useState(false);
  const [text, setText]           = useState('');
  const [submitting, setSubmit]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleLike = useCallback(async () => {
    const snap = { ...post };
    setPost((p: any) => ({ ...p, isLiked:!p.isLiked, likesCount:p.isLiked?p.likesCount-1:p.likesCount+1 }));
    try { await socialApi.toggleLike(post.id); } catch { setPost(snap); }
  }, [post]);

  const toggleComments = useCallback(async () => {
    if (!showComments && comments.length === 0) {
      setLoadingC(true);
      try { const r = await socialApi.getComments(post.id); setComments(r.items); }
      catch {} finally { setLoadingC(false); }
    }
    setShow((v: any) => !v);
  }, [showComments, comments.length, post.id]);

  const submit = useCallback(async () => {
    if (!text.trim()) return;
    setSubmit(true);
    try {
      const c = await socialApi.addComment(post.id, text.trim());
      setComments((cs: any) => [...cs, c]);
      setPost((p: any) => ({ ...p, commentsCount:p.commentsCount+1 }));
      setText('');
    } catch {} finally { setSubmit(false); }
  }, [text, post.id]);

  const isOwn = currentUserId === post.author?.id;

  return (
    <div style={{ background:'#fff', borderRadius:16, marginBottom:10, boxShadow:'0 1px 4px rgba(0,0,0,.06)', overflow:'hidden' }}>

      {/* ── Author row ── */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px 8px' }}>
        <button onClick={() => onProfilePress?.(post.author?.id||'')} style={{ background:'none', border:'none', cursor:'pointer', padding:0, display:'flex' }}>
          <Avatar name={post.author?.fullName} avatarUrl={post.author?.avatarUrl} size={40} />
        </button>
        <div style={{ flex:1 }}>
          <button onClick={() => onProfilePress?.(post.author?.id||'')} style={{ background:'none', border:'none', cursor:'pointer', padding:0, textAlign:'left' }}>
            <span style={{ fontSize:14, fontWeight:700, color:'#111827', display:'block', lineHeight:1.3 }}>{post.author?.fullName||'User'}</span>
          </button>
          <span style={{ fontSize:11.5, color:'#9CA3AF' }}>{timeAgo(post.createdAt)}</span>
        </div>
        {isOwn && (
          confirmDelete ? (
            <div style={{ display:'flex', gap:4 }}>
              <button onClick={async () => { try { await socialApi.deletePost(post.id); onDelete?.(post.id); } catch {} setConfirmDelete(false); }}
                style={{ background:'#dc2626', color:'white', border:'none', borderRadius:6, padding:'3px 8px', fontSize:11, fontWeight:600, cursor:'pointer' }}>Delete</button>
              <button onClick={() => setConfirmDelete(false)}
                style={{ background:'none', border:'1px solid #ccc', borderRadius:6, padding:'3px 8px', fontSize:11, cursor:'pointer' }}>Cancel</button>
            </div>
          ) : (
          <button onClick={() => setConfirmDelete(true)}
            style={{ background:'none', border:'none', cursor:'pointer', padding:'4px 6px', borderRadius:8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
          )
        )}
      </div>

      {/* ── Images ── */}
      {post.imageUrls.length > 0 && (
        <div style={{ overflowX:post.imageUrls.length>1?'auto':'hidden', display:'flex', gap:1 }}>
          {post.imageUrls.map((url: any,i: any) => (
            <img key={i} src={url} alt="" style={{ minWidth:post.imageUrls.length===1?'100%':240, height:post.imageUrls.length===1?'auto':220, maxHeight:400, objectFit:'cover', display:'block' }} />
          ))}
        </div>
      )}

      {/* ── Caption ── */}
      {post.caption && (
        <p style={{ margin:0, padding:post.imageUrls.length>0?'10px 14px 4px':'4px 14px', fontSize:14, color:'#1F2937', lineHeight:1.6 }}>
          {post.caption}
        </p>
      )}

      {/* ── Actions ── */}
      <div style={{ display:'flex', alignItems:'center', gap:0, padding:'6px 8px 10px', borderTop: post.caption||post.imageUrls.length>0 ? '1px solid #F9FAFB' : 'none', marginTop:6 }}>
        <button onClick={handleLike}
          style={{ display:'flex', alignItems:'center', gap:5, background:'none', border:'none', cursor:'pointer', padding:'6px 10px', borderRadius:10, color: post.isLiked?'#EF4444':'#6B7280' }}>
          <HeartIcon filled={post.isLiked} />
          <span style={{ fontSize:13, fontWeight:600, color:post.isLiked?'#EF4444':'#6B7280', minWidth:16 }}>{post.likesCount}</span>
        </button>
        <button onClick={toggleComments}
          style={{ display:'flex', alignItems:'center', gap:5, background:'none', border:'none', cursor:'pointer', padding:'6px 10px', borderRadius:10 }}>
          <ChatIcon />
          <span style={{ fontSize:13, fontWeight:600, color:'#6B7280', minWidth:16 }}>{post.commentsCount}</span>
        </button>
      </div>

      {/* ── Comments ── */}
      {showComments && (
        <div style={{ borderTop:'1px solid #F3F4F6', padding:'10px 14px 14px', background:'#FAFAFA' }}>
          {loadingC ? (
            <p style={{ textAlign:'center', color:'#9CA3AF', fontSize:13, padding:'8px 0' }}>Loading comments…</p>
          ) : (
            <>
              {comments.length === 0 && (
                <p style={{ textAlign:'center', color:'#9CA3AF', fontSize:13, marginBottom:12 }}>Be the first to comment</p>
              )}
              <div style={{ maxHeight:240, overflowY:'auto', marginBottom:10 }}>
                {comments.map((c: any) => (
                  <div key={c.id} style={{ display:'flex', gap:8, marginBottom:10 }}>
                    <Avatar name={c.author?.fullName} size={28} />
                    <div style={{ flex:1 }}>
                      <div style={{ background:'#fff', borderRadius:'0 12px 12px 12px', padding:'7px 11px', border:'1px solid #F3F4F6', display:'inline-block', maxWidth:'100%' }}>
                        <span style={{ fontSize:12, fontWeight:700, color:NAVY }}>{c.author?.fullName||'User'} </span>
                        <span style={{ fontSize:13, color:'#374151', wordBreak:'break-word' }}>{c.content}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}
                  placeholder="Write a comment…"
                  style={{ flex:1, height:38, borderRadius:19, border:'1.5px solid #E5E7EB', padding:'0 14px', fontSize:13, outline:'none', background:'#fff', color:'#1A1A2E' }} />
                <button onClick={submit} disabled={submitting||!text.trim()}
                  style={{ width:38, height:38, borderRadius:'50%', background:NAVY, border:`1.5px solid ${GOLD}`, color:'#fff', cursor:'pointer', opacity:submitting||!text.trim()?.5:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
