'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { community, CommunityProfile, UserSearchResult } from '@/lib/community-api';

const NAVY    = '#0F2452';
const GOLD    = '#C8920A';
const GOLD_L  = '#E0A92F';
const TEXT    = '#1A0800';
const TEXT2   = '#4A3010';
const TEXT3   = '#8B6B35';

interface Props { me: CommunityProfile; }

/** Discover: search users by @username; trending hashtag chips for browsing. */
export default function CommunityDiscoverTab({ me }: Props) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [trending, setTrending] = useState<Array<{ tag: string; postCount: number }>>([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [suggestedUsers, setSuggestedUsers] = useState<UserSearchResult[]>([]);

  useEffect(() => {
    community.hashtags.suggest('').then(setTrending).catch(() => setTrending([]));
    // Load suggested users (just search common letters to surface real users)
    community.users.search('a')
      .then(r => setSuggestedUsers((r ?? []).slice(0, 5)))
      .catch(() => setSuggestedUsers([]));
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

  async function sendFriend(u: UserSearchResult) {
    if (!u.canFriend) return;
    try {
      await community.friends.send(u.id);
      setResults(prev => prev.map(x => x.id === u.id ? { ...x, friendStatus: 'requested' } : x));
    } catch { /* ignore */ }
  }

  return (
    <div style={{ padding: '12px 12px 24px' }}>
      {/* Search field */}
      <div style={{ background: '#fff', border: '1px solid rgba(200,146,10,0.30)', borderRadius: 22, padding: '4px 4px 4px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, color: TEXT3 }}>🔍</span>
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search @username, name, or hashtag…"
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontFamily: 'inherit', padding: '8px 0' }}
        />
      </div>

      {/* Results / Trending */}
      {q.trim() ? (
        <div style={{ marginTop: 14 }}>
          {searching && <div style={{ color: TEXT3, fontSize: 12, padding: 14, textAlign: 'center' }}>Searching…</div>}
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
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: u.avatarUrl ? `center/cover url('${u.avatarUrl}')` : 'linear-gradient(135deg,#C8920A,#6B3210)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>{u.name || ('@' + u.username)}</span>
                    {u.accountType && u.accountType !== 'user' && (
                      <span style={{ fontSize: 9, fontWeight: 800, color: NAVY, background: GOLD_L + '33', padding: '1px 5px', borderRadius: 8 }}>{(u.accountType || '').toUpperCase()}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10.5, color: TEXT3 }}>@{u.username}</div>
                </div>
                <span style={{ color: TEXT3, fontSize: 16 }}>›</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Trending hashtags */}
          <section style={{ marginTop: 14 }}>
            <h2 style={{ fontFamily: '"Playfair Display",Georgia,serif', fontSize: 16, color: TEXT, margin: '0 0 8px 4px', fontWeight: 800 }}>
              Trending
            </h2>
            {trending.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 12, padding: 18, textAlign: 'center', color: TEXT3, fontSize: 12.5, border: '1px solid rgba(200,146,10,0.20)' }}>
                No trending hashtags yet — be the first to post with one.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {trending.slice(0, 20).map(t => (
                  <button key={t.tag} style={{
                    background: '#fff', border: '1px solid rgba(200,146,10,0.30)',
                    color: NAVY, fontWeight: 800, fontSize: 12,
                    padding: '6px 12px', borderRadius: 16, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                    #{t.tag}
                    <span style={{ color: TEXT3, fontWeight: 500, fontSize: 10 }}>{t.postCount}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Suggested seekers */}
          <section style={{ marginTop: 18 }}>
            <h2 style={{ fontFamily: '"Playfair Display",Georgia,serif', fontSize: 16, color: TEXT, margin: '0 0 8px 4px', fontWeight: 800 }}>
              Suggested people
            </h2>
            {suggestedUsers.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 12, padding: 18, textAlign: 'center', color: TEXT3, fontSize: 12.5, border: '1px solid rgba(200,146,10,0.20)' }}>
                Type a name or username above to find people to follow.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {suggestedUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => router.push(`/u/${u.username}`)}
                    style={{ background: '#fff', borderRadius: 12, padding: '10px 12px', border: '1px solid rgba(200,146,10,0.18)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', width: '100%', textAlign: 'left' }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: u.avatarUrl ? `center/cover url('${u.avatarUrl}')` : 'linear-gradient(135deg,#C8920A,#6B3210)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>{u.name || ('@' + u.username)}</div>
                      <div style={{ fontSize: 10.5, color: TEXT3, marginTop: 2 }}>@{u.username}</div>
                    </div>
                    <span style={{ color: TEXT3, fontSize: 16 }}>›</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
