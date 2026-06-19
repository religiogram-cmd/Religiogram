'use client';

import { useEffect, useRef, useState } from 'react';
import { community, CommunityProfile, Post, Comment } from '@/lib/community-api';
import { getInitials, initialsAvatarStyle } from '@/lib/avatar-utils';

const NAVY    = '#0F2452';
const NAVY_2  = '#0A1628';
const GOLD    = '#C8920A';
const GOLD_L  = '#E0A92F';
const CREAM   = '#FFFAEC';
const TEXT    = '#1A0800';
const TEXT2   = '#4A3010';
const TEXT3   = '#8B6B35';
const RED     = '#DC2626';
const HEART   = '#E11D48';

interface Props {
  me: CommunityProfile;
  onOpenComposer: () => void;
}

/* ── Quick-share circles (5) ───────────────────────────── */
const QUICK_SHARES: Array<{
  key: string;
  label: string;
  bg: string;
  fg: string;
  icon: string;
}> = [
  { key: 'prayer',     label: 'Share Prayer',  bg: '#FFE6CC', fg: '#B45309', icon: '🙏' },
  { key: 'photo',      label: 'Photo',          bg: '#E9DDFF', fg: '#5B3FAA', icon: '🖼️' },
  { key: 'experience', label: 'Experience',     bg: '#DBF3D8', fg: '#2D8C40', icon: '✨' },
  { key: 'question',   label: 'Ask Community',  bg: '#FFD7C9', fg: '#B91C1C', icon: '❓' },
  { key: 'help',       label: 'Help Others',    bg: '#D8EBFF', fg: '#1B4FAA', icon: '🤲' },
];

/* ── A small rotating set of generic inspiration quotes ── */
const INSPIRATIONS: Array<{ quote: string; source: string; image?: string }> = [
  { quote: 'The mind finds peace when the heart connects with the divine.', source: 'Bhagavad Gita', image: '/holy-places-hero.jpg' },
  { quote: 'Prayer is not asking. It is a longing of the soul.', source: 'Mahatma Gandhi' },
  { quote: 'In the silence of the heart, the soul finds its home.', source: 'Sant Kabir' },
];

export default function CommunityFeedTab({ me, onOpenComposer }: Props) {
  const [posts, setPosts]   = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [commentsFor, setCommentsFor] = useState<Post | null>(null);
  const [inspIdx] = useState(() => Math.floor(Math.random() * INSPIRATIONS.length));

  /* ── initial load + socket realtime (polling fallback every 60s) ── */
  useEffect(() => {
    let cancelled = false;
    let initialLoad = true;
    const fetchFeed = () => {
      if (initialLoad) setLoading(true);
      community.posts.feed()
        .then(r => {
          if (cancelled) return;
          setPosts(r?.items ?? []);
          setNextCursor(r?.nextCursor);
        })
        .catch(() => {})
        .finally(() => {
          if (cancelled) return;
          if (initialLoad) { setLoading(false); initialLoad = false; }
        });
    };
    fetchFeed();

    // Realtime via Socket.IO — new posts from followed users
    let unsubscribers: Array<() => void> = [];
    (async () => {
      try {
        const { connectSocket, onSocketEvent } = await import('@/lib/socket');
        await connectSocket();
        unsubscribers.push(onSocketEvent('post.new', () => { if (!cancelled) fetchFeed(); }));
        unsubscribers.push(onSocketEvent('post.liked', (p: any) => {
          if (!cancelled && p?.postId) {
            patchPost(p.postId, post => ({ ...post, likeCount: Math.max(0, p.likeCount ?? post.likeCount) }));
          }
        }));
      } catch { /* socket unavailable → polling still runs */ }
    })();

    // Fallback poll (less aggressive than before since socket should catch most updates)
    const id = setInterval(fetchFeed, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
      unsubscribers.forEach(fn => fn());
    };
  }, []);

  async function loadMore() {
    if (!nextCursor) return;
    try {
      const r = await community.posts.feed(nextCursor);
      setPosts(prev => [...prev, ...(r.items ?? [])]);
      setNextCursor(r.nextCursor);
    } catch { /* ignore */ }
  }

  /* ── mutation helpers (optimistic) ────────────────────── */
  function patchPost(id: string, f: (p: Post) => Post) {
    setPosts(prev => prev.map(p => p.id === id ? f(p) : p));
  }

  async function toggleLike(post: Post) {
    const next = !post.likedByMe;
    patchPost(post.id, p => ({ ...p, likedByMe: next, likeCount: Math.max(0, p.likeCount + (next ? 1 : -1)) }));
    try {
      const res = next ? await community.posts.like(post.id) : await community.posts.unlike(post.id);
      patchPost(post.id, p => ({ ...p, likeCount: Math.max(0, res.likeCount ?? p.likeCount) }));
    } catch {
      patchPost(post.id, p => ({ ...p, likedByMe: !next, likeCount: Math.max(0, p.likeCount + (next ? -1 : 1)) }));
    }
  }

  async function sharePost(post: Post) {
    const url = typeof window !== 'undefined' ? `${window.location.origin}/p/${post.id}` : '';
    const { showToast } = await import('@/components/ui/Toast');
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({
          title: 'Post on ReligioGram',
          text: (post as any).caption || (post as any).text || '',
          url,
        });
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        showToast('Link copied', 'success');
      }
      try {
        const res = await community.posts.share(post.id);
        patchPost(post.id, p => ({ ...p, shareCount: res.shareCount ?? p.shareCount + 1 }));
      } catch { /* ignore */ }
    } catch { /* user cancelled native share */ }
  }


  const insp = INSPIRATIONS[inspIdx];

  /* ── pull-to-refresh + manual refresh ──────────────────── */
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pullState = useRef({ startY: 0, pulling: false, distance: 0 });
  const [pullDist, setPullDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  async function manualRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const r = await community.posts.feed();
      setPosts(r?.items ?? []);
      setNextCursor(r?.nextCursor);
    } catch { /* ignore */ }
    setRefreshing(false);
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY > 0) return;
    pullState.current.startY = e.touches[0].clientY;
    pullState.current.pulling = true;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!pullState.current.pulling) return;
    const dy = e.touches[0].clientY - pullState.current.startY;
    if (dy > 0 && window.scrollY === 0) {
      const d = Math.min(120, dy);
      pullState.current.distance = d;
      setPullDist(d);
    } else if (dy <= 0) {
      pullState.current.pulling = false;
      setPullDist(0);
    }
  };
  const onTouchEnd = async () => {
    if (!pullState.current.pulling) return;
    pullState.current.pulling = false;
    if (pullState.current.distance > 60 && !refreshing) {
      setRefreshing(true);
      setPullDist(50);
      try {
        const r = await community.posts.feed();
        setPosts(r?.items ?? []);
        setNextCursor(r?.nextCursor);
      } catch { /* ignore */ }
      setRefreshing(false);
    }
    setPullDist(0);
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ padding: '12px 12px 24px', transform: `translateY(${pullDist}px)`, transition: pullState.current.pulling ? 'none' : 'transform 0.2s' }}
    >
      {/* Pull-to-refresh spinner */}
      {(pullDist > 0 || refreshing) && (
        <div style={{ position: 'absolute', top: -40, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: `3px solid ${GOLD}30`, borderTopColor: GOLD,
            animation: refreshing ? 'rg-spin 0.8s linear infinite' : 'none',
            transform: refreshing ? 'none' : `rotate(${pullDist * 3}deg)`,
          }} />
          <style>{`@keyframes rg-spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* ── Today's Inspiration banner ────────────────────── */}
      <section style={{
        marginTop: 14,
        background: `linear-gradient(135deg, ${NAVY_2} 0%, ${NAVY} 100%)`,
        border: `1px solid ${GOLD}55`,
        borderRadius: 16, overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 4px 16px rgba(15,36,82,0.25)',
      }}>
        <div style={{ display: 'flex', gap: 0 }}>
          <div style={{ flex: 1, padding: '14px 14px 14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(232,169,47,0.20)', border: `1px solid ${GOLD_L}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>🔥</span>
              <span style={{ color: GOLD_L, fontWeight: 800, fontSize: 11.5, letterSpacing: '0.02em' }}>Today&apos;s Inspiration</span>
            </div>
            <div style={{ fontFamily: '"Playfair Display",Georgia,serif', color: '#FFFAEC', fontSize: 15.5, lineHeight: 1.4, marginBottom: 6 }}>
              &ldquo;{insp.quote}&rdquo;
            </div>
            <div style={{ color: GOLD_L, fontSize: 11, fontWeight: 600 }}>– {insp.source}</div>
          </div>
          {insp.image && (
            <div style={{
              width: 110, flexShrink: 0,
              backgroundImage: `linear-gradient(90deg, ${NAVY} 0%, transparent 30%), url('${insp.image}')`,
              backgroundSize: 'cover', backgroundPosition: 'center',
            }} />
          )}
        </div>
      </section>

      {/* ── Feed ─────────────────────────────────────────── */}
      {loading && (
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              background: '#fff', borderRadius: 14, padding: 14,
              border: '1px solid rgba(200,146,10,0.18)',
              display: 'flex', flexDirection: 'column', gap: 10,
              animation: 'rg-skel 1.5s ease-in-out infinite',
              animationDelay: `${i * 0.15}s`,
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(110deg,#F3E9D2 30%,#FFF8E6 50%,#F3E9D2 70%)' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ width: '40%', height: 11, borderRadius: 6, background: 'linear-gradient(110deg,#F3E9D2 30%,#FFF8E6 50%,#F3E9D2 70%)' }} />
                  <div style={{ width: '25%', height: 9, borderRadius: 6, background: 'linear-gradient(110deg,#F3E9D2 30%,#FFF8E6 50%,#F3E9D2 70%)' }} />
                </div>
              </div>
              <div style={{ width: '90%', height: 12, borderRadius: 6, background: 'linear-gradient(110deg,#F3E9D2 30%,#FFF8E6 50%,#F3E9D2 70%)' }} />
              <div style={{ width: '65%', height: 12, borderRadius: 6, background: 'linear-gradient(110deg,#F3E9D2 30%,#FFF8E6 50%,#F3E9D2 70%)' }} />
            </div>
          ))}
          <style>{`@keyframes rg-skel { 0%,100% { opacity:1 } 50% { opacity:0.5 } }`}</style>
        </div>
      )}
      {!loading && posts.length === 0 && (
        <div style={{
          marginTop: 18,
          background: '#fff', borderRadius: 14, padding: '40px 24px', textAlign: 'center',
          border: '1px solid rgba(200,146,10,0.22)',
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: '#F3F4F6',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, color: NAVY, marginBottom: 10,
          }}>👥</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, marginBottom: 6, fontFamily: '"Playfair Display",Georgia,serif' }}>Your feed is empty</div>
          <div style={{ fontSize: 12.5, color: TEXT3, lineHeight: 1.6 }}>
            Discover and add friends to see their posts,<br/>or share your first post above.
          </div>
        </div>
      )}

      <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        {posts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            isOwner={!!(me && post.author && (post.author as any).id === (me as any).userId)}
            onLike={() => toggleLike(post)}
            onShare={() => sharePost(post)}
            onOpenComments={() => setCommentsFor(post)}
          />
        ))}
      </div>

      {nextCursor && (
        <button onClick={loadMore} style={{ display: 'block', margin: '14px auto', background: 'transparent', border: 'none', color: NAVY, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          Load more
        </button>
      )}

      {commentsFor && (
        <CommentsSheet
          post={commentsFor}
          me={me}
          onClose={() => setCommentsFor(null)}
          onCountChange={(n) => patchPost(commentsFor.id, p => ({ ...p, commentCount: n }))}
        />
      )}
    </div>
  );
}

/* ── Post card ─────────────────────────────────────────── */
function PostCard({
  post, isOwner, onLike, onShare, onOpenComments,
}: {
  post: Post;
  isOwner: boolean;
  onLike: () => void;
  onShare: () => void;
  onOpenComments: () => void;
}) {
  const categoryTag = (post.hashtags ?? []).find(h => ['prayer','photo','experience','question','help'].includes(h));
  const categoryLabel = (() => {
    switch (categoryTag) {
      case 'prayer':     return { label: 'Share Prayer', icon: '🙏', bg: '#FFE6CC', fg: '#B45309' };
      case 'photo':      return { label: 'Photo',         icon: '🖼️', bg: '#E9DDFF', fg: '#5B3FAA' };
      case 'experience': return { label: 'Spiritual Experience', icon: '📋', bg: '#E9DDFF', fg: '#5B3FAA' };
      case 'question':   return { label: 'Question',      icon: '❓', bg: '#FFD7C9', fg: '#B91C1C' };
      case 'help':       return { label: 'Help Others',   icon: '🤲', bg: '#D8EBFF', fg: '#1B4FAA' };
      default: return null;
    }
  })();

  return (
    <article style={{
      background: '#fff', borderRadius: 16,
      padding: 14,
      boxShadow: '0 2px 10px rgba(60,30,5,0.06)',
      border: '1px solid rgba(200,146,10,0.18)',
    }}>
      {/* Header row */}
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        {post.author.avatarUrl ? (
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: `center/cover url('${post.author.avatarUrl}')`,
            flexShrink: 0,
          }} />
        ) : (
          <div style={initialsAvatarStyle(40)}>{getInitials(post.author.name, post.author.username)}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>
              {post.author.name || ('@' + post.author.username)}
            </span>
            {(post.author as any).isVerified === true && <VerifiedBadge />}
          </div>
          <div style={{ fontSize: 11, color: TEXT3, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{timeAgo(post.createdAt)}</span>
          </div>
        </div>
        {isOwner && (
          <button
            onClick={async () => {
              if (!confirm('Delete this post?')) return;
              try {
                await community.posts.remove(post.id);
                location.reload();
              } catch {
                alert('Could not delete. Try again.');
              }
            }}
            style={{ background: 'transparent', border: 'none', color: TEXT3, fontSize: 18, cursor: 'pointer', padding: 0, marginTop: -4 }}
            aria-label="Delete post"
            title="Delete post"
          >🗑</button>
        )}
      </header>

      {/* Body row — text left, image right */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {post.text && (
            <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: 8 }}>
              {renderWithHashtags(post.text, post.hashtags)}
            </div>
          )}
          {categoryLabel && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 8,
              background: categoryLabel.bg, color: categoryLabel.fg,
              fontSize: 10.5, fontWeight: 700,
            }}>
              {categoryLabel.icon} {categoryLabel.label}
            </span>
          )}
        </div>
        {(() => {
          const imgs: string[] = (post as any).photos ?? (post as any).imageUrls ?? [];
          return imgs.length > 0 && (
            <div style={{
              width: 120, aspectRatio: '4/3', borderRadius: 10, overflow: 'hidden', flexShrink: 0,
              border: '1px solid rgba(200,146,10,0.2)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgs[0]} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          );
        })()}
      </div>

      {/* Action row */}
      <div style={{
        marginTop: 10, paddingTop: 10,
        borderTop: '1px solid rgba(200,146,10,0.15)',
        display: 'flex', justifyContent: 'space-around',
        alignItems: 'center', gap: 4,
      }}>
        <ActionButton icon={post.likedByMe ? '❤️' : '🤍'} label={formatCount(post.likeCount)} onClick={onLike} active={post.likedByMe} activeColor={HEART} />
        <ActionButton icon="💬" label={formatCount(post.commentCount)} onClick={onOpenComments} />
        <ActionButton icon="↗" label="Share" onClick={onShare} />
      </div>
    </article>
  );
}

function VerifiedBadge() {
  return (
    <span aria-label="verified" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 14, height: 14, borderRadius: '50%',
      background: 'linear-gradient(135deg,#E0A92F,#B45309)',
      color: '#fff', fontSize: 8, fontWeight: 900,
      boxShadow: '0 0 0 1.5px #fff',
    }}>✓</span>
  );
}

function ActionButton({ icon, label, onClick, active, activeColor }: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  activeColor?: string;
}) {
  const color = active ? (activeColor ?? '#0F2452') : '#4A3010';
  const [bumping, setBumping] = useState(false);
  return (
    <button
      onClick={() => {
        setBumping(true);
        setTimeout(() => setBumping(false), 380);
        onClick();
      }}
      style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: 5, fontSize: 12, fontWeight: 700, color,
        padding: '4px 0',
      }}
    >
      <span
        style={{
          fontSize: 15,
          display: 'inline-block',
          transform: bumping ? 'scale(1.45)' : 'scale(1)',
          transition: 'transform 0.18s cubic-bezier(.34,1.56,.64,1)',
          filter: bumping && active ? 'drop-shadow(0 0 6px rgba(220,38,38,0.55))' : 'none',
        }}
      >{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/* ── helpers ───────────────────────────────────────────── */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 100_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0) + 'K';
  if (n < 1_000_000) return Math.round(n / 1000) + 'K';
  return (n / 1_000_000).toFixed(1) + 'M';
}
function timeAgo(iso: string): string {
  const d = new Date(iso); const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + ' hrs ago';
  if (s < 604800) return Math.floor(s / 86400) + 'd ago';
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}
function renderWithHashtags(text: string, hashtags: string[]) {
  if (!hashtags?.length) return text;
  const parts = text.split(/(\s+)/);
  return parts.map((p, i) => {
    if (p.startsWith('#') && hashtags.includes(p.slice(1).toLowerCase())) {
      return <span key={i} style={{ color: '#0F2452', fontWeight: 700, cursor: 'pointer' }}>{p}</span>;
    }
    return <span key={i}>{p}</span>;
  });
}

/* ── Comments sheet (inlined; lighter version of v1) ──── */
function CommentsSheet({ post, me, onClose, onCountChange }: { post: Post; me: CommunityProfile; onClose: () => void; onCountChange: (n: number) => void }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    community.posts.comments(post.id).then(r => {
      if (cancelled) return;
      setComments(r?.items ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [post.id]);

  async function send() {
    if (!text.trim()) return;
    setPosting(true);
    try {
      const c = await community.posts.comment(post.id, text.trim());
      setComments(prev => [...prev, c]);
      onCountChange(post.commentCount + 1);
      setText('');
    } catch { /* ignore */ }
    setPosting(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', width: '100%', maxWidth: 560, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '90svh', minHeight: '50svh', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 32px rgba(0,0,0,0.32)', paddingBottom: 'env(safe-area-inset-bottom)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid rgba(200,146,10,0.18)' }}>
          <strong style={{ fontSize: 14, color: TEXT }}>Comments</strong>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 22, color: TEXT3, cursor: 'pointer', padding: 0, width: 28, height: 28 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
          {loading && <div style={{ textAlign: 'center', color: TEXT3, fontSize: 12, padding: 20 }}>Loading…</div>}
          {!loading && comments.length === 0 && <div style={{ textAlign: 'center', color: TEXT3, fontSize: 12, padding: 20 }}>Be the first to comment.</div>}
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid rgba(200,146,10,0.10)' }}>
              {c.author.avatarUrl ? (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: `center/cover url('${c.author.avatarUrl}')`, flexShrink: 0 }} />
              ) : (
                <div style={initialsAvatarStyle(28)}>{getInitials(c.author.name, c.author.username)}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: TEXT, lineHeight: 1.2 }}>{c.author.name || ('@' + c.author.username)} <span style={{ color: TEXT3, fontWeight: 500, fontSize: 10 }}>· {timeAgo(c.createdAt)}</span></div>
                <div style={{ fontSize: 12.5, color: TEXT, marginTop: 2, whiteSpace: 'pre-wrap' }}>{c.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid rgba(200,146,10,0.18)', padding: 10, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          {me.avatarUrl ? (
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: `center/cover url('${me.avatarUrl}')`, flexShrink: 0 }} />
          ) : (
            <div style={initialsAvatarStyle(30)}>{getInitials(me.name, me.username)}</div>
          )}
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} rows={1} placeholder="Add a comment…"
            style={{ flex: 1, resize: 'none', border: '1px solid rgba(200,146,10,0.25)', borderRadius: 16, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#FFFCF5' }} />
          <button onClick={send} disabled={posting || !text.trim()} style={{
            background: text.trim() ? NAVY : 'rgba(15,36,82,0.30)', color: '#fff',
            border: 'none', borderRadius: 16, padding: '8px 14px',
            fontSize: 12, fontWeight: 800, cursor: text.trim() && !posting ? 'pointer' : 'not-allowed', flexShrink: 0,
          }}>{posting ? '…' : 'Send'}</button>
        </div>
      </div>
    </div>
  );
}
