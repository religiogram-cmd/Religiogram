'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { community } from '@/lib/community-api';

const NAVY = '#0A1628';
const NAVY_2 = '#0F2452';
const GOLD = '#C8920A';
const GOLD_L = '#E0A92F';
const TEXT = '#1A0800';
const TEXT2 = '#4A3010';
const TEXT3 = '#8B6B35';

interface Props { username: string }

export default function UserProfileScreen({ username }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // byUsername endpoint missing on backend — use search fallback
        let found: any = null;
        try {
          found = await community.users.byUsername(username);
        } catch {
          const results = await community.users.search(username);
          found = results?.find((u: any) =>
            (u.username || '').toLowerCase() === username.toLowerCase()
          ) ?? results?.[0] ?? null;
        }
        if (found) {
          setUser(found);
          if (found.id) {
            // Check follow state via the friends list
            try {
              const friends = await community.friends.list();
              const isFollowing = (friends ?? []).some((f: any) =>
                f.id === found.id || f.userId === found.id
              );
              setFollowing(isFollowing);
            } catch {
              setFollowing(found.friendStatus === 'friends' || found.friendStatus === 'requested');
            }
            try {
              const r = await community.posts.byUser(found.id);
              setPosts(r.items ?? []);
            } catch { /* empty */ }
          }
        }
      } catch { /* user not found */ }
      setLoading(false);
    })();
  }, [username]);

  async function toggleFollow() {
    if (!user || followBusy) return;
    if (following) {
      const displayName = user.name || user.fullName || ('@' + user.username);
      if (!confirm(`Are you sure you want to unfollow ${displayName}?`)) return;
    }
    setFollowBusy(true);
    try {
      if (following) {
        await community.friends.remove(user.id);
        setFollowing(false);
      } else {
        await community.friends.send(user.id);
        setFollowing(true);
      }
    } catch { /* ignore */ }
    setFollowBusy(false);
  }

  function openDm() {
    if (!user) return;
    try {
      sessionStorage.setItem('rg_dm_peer', JSON.stringify({
        id: user.id,
        name: user.name || user.fullName || user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        accountType: user.accountType || 'user',
      }));
    } catch {}
    router.push('/social?tab=messages');
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100svh', background: '#FFFBF0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, border: `3px solid ${GOLD}40`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100svh', background: '#FFFBF0', padding: 20 }}>
        <button onClick={() => router.back()} style={{ background: 'transparent', border: 'none', color: NAVY, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 20 }}>← Back</button>
        <div style={{ textAlign: 'center', padding: 60, color: TEXT3 }}>User not found.</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100svh', background: '#FFFBF0', paddingBottom: 80 }}>
      {/* Hero header */}
      <div style={{
        background: `linear-gradient(150deg, ${NAVY} 0%, ${NAVY_2} 100%)`,
        color: '#FFFAEC', padding: '14px 18px 24px',
        position: 'relative',
      }}>
        <button onClick={() => router.back()} style={{
          background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
          borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>← Back</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: user.avatarUrl ? `center/cover url('${user.avatarUrl}')` : `linear-gradient(135deg, ${GOLD}, #6B3210)`,
            border: `2px solid ${GOLD_L}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 28, fontWeight: 700,
          }}>
            {!user.avatarUrl && (user.name?.[0] || user.username?.[0] || '?').toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: '"Playfair Display", serif' }}>
              {user.name || ('@' + user.username)}
            </div>
            <div style={{ fontSize: 12.5, color: GOLD_L, marginTop: 2 }}>@{user.username}</div>
          </div>
        </div>

        {user.bio && (
          <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.45, color: 'rgba(255,250,236,0.92)' }}>
            {user.bio}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button
            onClick={toggleFollow}
            disabled={followBusy}
            style={{
              flex: 1,
              background: following ? 'transparent' : `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`,
              color: '#fff',
              border: following ? `1.5px solid ${GOLD_L}` : 'none',
              borderRadius: 22, padding: '10px 16px',
              fontSize: 13, fontWeight: 800, cursor: followBusy ? 'wait' : 'pointer',
              boxShadow: following ? 'none' : '0 2px 8px rgba(200,146,10,0.30)',
            }}
          >
            {following ? 'Following ✓' : 'Follow'}
          </button>
          <button
            onClick={openDm}
            style={{
              flex: 1,
              background: 'transparent', color: '#FFFAEC',
              border: `1.5px solid rgba(255,250,236,0.4)`,
              borderRadius: 22, padding: '10px 16px',
              fontSize: 13, fontWeight: 800, cursor: 'pointer',
            }}
          >
            Message
          </button>
        </div>
      </div>

      {/* Posts grid */}
      <div style={{ padding: '14px 14px 20px' }}>
        <div style={{ fontSize: 11, color: TEXT3, fontWeight: 800, letterSpacing: '0.1em', marginBottom: 10 }}>
          POSTS ({posts.length})
        </div>
        {posts.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 30, textAlign: 'center', color: TEXT3, fontSize: 13, border: '1px solid rgba(200,146,10,0.18)' }}>
            No posts yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {posts.map((p) => (
              <div key={p.id} style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(200,146,10,0.18)' }}>
                <div style={{ fontSize: 11.5, color: TEXT3, marginBottom: 6 }}>{new Date(p.createdAt).toLocaleString()}</div>
                <div style={{ fontSize: 14, color: TEXT, whiteSpace: 'pre-wrap' }}>{p.caption || p.text || ''}</div>
                {(p.imageUrls?.length || p.photos?.length) && (
                  <div style={{ marginTop: 8 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={(p.imageUrls || p.photos)[0]} alt="" style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 10 }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
