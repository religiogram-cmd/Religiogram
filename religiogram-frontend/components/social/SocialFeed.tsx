'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { socialApi } from '@/lib/api';
import PostCard from './PostCard';
import CreatePost from './CreatePost';
import BookingSuggestionCard from './BookingSuggestionCard';
import { EmptyState } from '@/components/EmptyState';

const GOLD = '#C8920A';
const GOLD2 = '#E8A020';
const NAVY = '#0A1628';

export default function SocialFeed() {
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<'feed' | 'discover'>('feed');
  // For booking-suggestion cards (injected at 1-in-6 positions)
  const [userReligion, setUserReligion] = useState<string | undefined>(undefined);
  const [userCity, setUserCity] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Read religion + city from localStorage (set during onboarding)
    try {
      const r = localStorage.getItem('rg_religion');
      const c = localStorage.getItem('rg_city');
      if (r) setUserReligion(r);
      if (c) setUserCity(c);
    } catch { /* ssr guard */ }
  }, []);

  const loadPosts = useCallback(async (p = 1, replace = false) => {
    try {
      const data = await socialApi.getFeed(p);
      const newPosts = data.items ?? [];
      setPosts((prev: any) => replace ? newPosts : [...prev, ...newPosts]);
      setHasMore(newPosts.length >= 15);
      setPage(p);
    } catch {
      /* silently handle */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadPosts(1, true); }, [tab, loadPosts]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPosts(1, true);
  };

  const handleLoadMore = () => {
    if (hasMore && !loading) loadPosts(page + 1);
  };

  const handlePostCreated = () => {
    setShowCreate(false);
    loadPosts(1, true);
  };

  if (loading) return (
    <div style={{ minHeight: '100svh', background: '#F6F7FA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${GOLD}30`, borderTopColor: GOLD, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div style={{ minHeight: '100svh', background: '#F6F7FA', paddingBottom: 96 }}>
      {/* Header */}
      <div style={{ background: NAVY, paddingTop: 'env(safe-area-inset-top,0px)', paddingBottom: 0 }}>
        <div style={{ padding: '14px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ color: GOLD, fontSize: 20, fontWeight: 800, margin: 0, fontFamily: '"Playfair Display",Georgia,serif' }}>Community</h1>
          <button onClick={() => setShowCreate(true)} style={{
            width: 36, height: 36, borderRadius: '50%', background: GOLD2, border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', padding: '10px 20px 0', gap: 24 }}>
          {(['feed', 'discover'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              paddingBottom: 10, borderBottom: tab === t ? `2px solid ${GOLD2}` : '2px solid transparent',
              color: tab === t ? GOLD2 : 'rgba(255,255,255,0.5)',
              fontSize: 13, fontWeight: 700, fontFamily: '"Plus Jakarta Sans",sans-serif',
              textTransform: 'capitalize',
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Pull-to-refresh indicator */}
      {refreshing && (
        <div style={{ textAlign: 'center', padding: '12px 0', background: '#F6F7FA' }}>
          <div style={{ width: 20, height: 20, border: `2px solid ${GOLD}40`, borderTopColor: GOLD, borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
        </div>
      )}

      {/* Posts */}
      <div style={{ padding: '12px 0' }}>
        {posts.length === 0 ? (
          <EmptyState
            icon="🕌"
            title="No posts yet"
            subtitle="Be the first to share a moment from your spiritual journey"
            action={{ label: 'Create Post', onClick: () => setShowCreate(true) }}
          />
        ) : (
          posts.flatMap((post: any, i: number) => {
            const items: React.ReactNode[] = [<PostCard key={post.id ?? i} post={post} />];
            // Inject a booking suggestion card after every 5th post (1-in-6 max)
            if ((i + 1) % 5 === 0) {
              items.push(
                <BookingSuggestionCard
                  key={`suggest-${i}`}
                  religion={userReligion}
                  city={userCity}
                />
              );
            }
            return items;
          })
        )}

        {/* Load more */}
        {hasMore && posts.length > 0 && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <button onClick={handleLoadMore} style={{
              background: 'white', border: `1px solid ${GOLD}40`, borderRadius: 100,
              padding: '8px 24px', fontSize: 13, fontWeight: 600, color: NAVY,
              fontFamily: '"Plus Jakarta Sans",sans-serif', cursor: 'pointer',
            }}>Load more</button>
          </div>
        )}
      </div>

      {/* Create post modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', maxHeight: '90svh', overflow: 'auto' }}>
            <CreatePost onCreated={handlePostCreated} />
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
