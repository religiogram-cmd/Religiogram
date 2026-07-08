'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { community, CommunityProfile, UserSearchResult, Post } from '@/lib/community-api';
import { getInitials, initialsAvatarStyle } from '@/lib/avatar-utils';

const NAVY    = '#0F2452';
const GOLD_L  = '#E0A92F';
const TEXT    = '#1A0800';
const TEXT2   = '#4A3010';
const TEXT3   = '#8B6B35';

interface Props { me: CommunityProfile; }

/**
 * Discover tab.
 *
 * Layout (top → bottom):
 *   1. Search box       — @username / name / hashtag lookup (unchanged)
 *   2. Public post feed — recent posts (below the search when idle)
 *
 * The "Suggested people" list previously lived here; it now renders at the
 * bottom of the Messages tab so users can jump straight into a DM.
 *
 * Feed source: the backend has GET /v1/social/feed but it filters to your
 * own posts + accepted friends' posts. For a truly public "discover" view
 * we call the same endpoint with ?public=true — if the backend ignores
 * the flag we still get a friends-scoped feed (best-available fallback)
 * and render posts as-is, so nothing crashes.
 */
export default function CommunityDiscoverTab({ me }: Props) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [feed, setFeed] = useState<Post[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);

  useEffect(() => {
    community.posts.feed()
      .then(r => setFeed((r?.items ?? []) as Post[]))
      .catch(() => setFeed([]))
      .finally(() => setFeedLoading(false));
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    timerRef.current = setTimeout(() => {
      community.users.search(q.trim())
        .then(r => setResults(r ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [q]);

  return (
    <div style={{ padding: '12px 12px 24px' }}>
      <div style={{ background: '#fff', border: '1px solid rgba(200,146,10,0.30)', borderRadius: 22, padding: '4px 4px 4px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search @username, name, or hashtag..."
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontFamily: 'inherit', padding: '8px 0' }}
        />
      </div>

      {q.trim() ? (
        <div style={{ marginTop: 14 }}>
          {searching && <div style={{ color: TEXT3, fontSize: 12, padding: 14, textAlign: 'center' }}>Searching...</div>}
          {!searching && results.length === 0 && (
            <div style={{ color: TEXT3, fontSize: 12.5, padding: 24, textAlign: 'center' }}>No matches found.</div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {results.map(u => (
              <button
                key={u.id}
                onClick={() => router.push(`/u/${u.username}`)}
                style={{ background: '#fff', borderRadius: 12, padding: '10px 12px', border: '1px solid rgba(200,146,10,0.18)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', width: '100%', textAlign: 'left' }}
              >
                {u.avatarUrl ? (
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: `center/cover url('${u.avatarUrl}')`, flexShrink: 0 }} />
                ) : (
                  <div style={initialsAvatarStyle(40)}>{getInitials(u.name, u.username)}</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>{u.name || ('@' + u.username)}</span>
                    {u.accountType && u.accountType !== 'user' && (
                      <span style={{ fontSize: 9, fontWeight: 800, color: NAVY, background: GOLD_L + '33', padding: '1px 5px', borderRadius: 8 }}>{(u.accountType || '').toUpperCase()}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10.5, color: TEXT3 }}>@{u.username}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <section style={{ marginTop: 18 }}>
          <h2 style={{ fontFamily: '"Playfair Display",Georgia,serif', fontSize: 16, color: TEXT, margin: '0 0 8px 4px', fontWeight: 800 }}>
            Latest posts
          </h2>
          {feedLoading ? (
            <div style={{ background: '#fff', borderRadius: 12, padding: 18, textAlign: 'center', color: TEXT3, fontSize: 12.5, border: '1px solid rgba(200,146,10,0.20)' }}>
              Loading posts...
            </div>
          ) : feed.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, padding: 18, textAlign: 'center', color: TEXT3, fontSize: 12.5, border: '1px solid rgba(200,146,10,0.20)', lineHeight: 1.5 }}>
              No posts yet &mdash; be the first to share!
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {feed.map(p => (
                <DiscoverPostCard key={p.id} post={p} onOpenAuthor={(u) => router.push(`/u/${u}`)} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* Compact post card for the Discover feed — author + text + photo teaser
 * + like/comment counts + relative timestamp. Deliberately lighter than
 * the full Feed tab card (no comment thread, no share sheet) so Discover
 * feels like a browsing view, not the primary reading surface.        */
function DiscoverPostCard({ post, onOpenAuthor }: { post: Post; onOpenAuthor: (username: string) => void }) {
  const timeStr = formatRelative(post.createdAt);
  const firstPhoto = post.photos?.[0];
  return (
    <article style={{ background: '#fff', border: '1px solid rgba(200,146,10,0.20)', borderRadius: 14, padding: '12px 12px 10px' }}>
      <button
        onClick={() => onOpenAuthor(post.author.username)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left', marginBottom: 8 }}
      >
        {post.author.avatarUrl ? (
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: `center/cover url('${post.author.avatarUrl}')`, flexShrink: 0 }} />
        ) : (
          <div style={initialsAvatarStyle(36)}>{getInitials(post.author.name, post.author.username)}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>
            {post.author.name || ('@' + post.author.username)}
          </div>
          <div style={{ fontSize: 10.5, color: TEXT3 }}>@{post.author.username} &middot; {timeStr}</div>
        </div>
      </button>

      {post.text && (
        <div style={{ fontSize: 13, color: TEXT2, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: firstPhoto ? 8 : 6 }}>
          {post.text}
        </div>
      )}
      {firstPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={firstPhoto}
          alt=""
          style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 10, display: 'block', marginBottom: 8 }}
        />
      )}

      <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: TEXT3, fontWeight: 700 }}>
        <span>&#x2661; {post.likeCount}</span>
        <span>&#x1F4AC; {post.commentCount}</span>
      </div>
    </article>
  );
}

/* Cheap "2m", "3h", "5d" relative timestamps — deliberately not
 * bringing date-fns/dayjs into a small card component. */
function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}
