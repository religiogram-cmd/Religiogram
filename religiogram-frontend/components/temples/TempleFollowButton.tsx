'use client';
import { useEffect, useState } from 'react';
import { followsApi } from '@/lib/api';

const NAVY = '#0F2452';

interface Props {
  templeId: string;
}

/**
 * Small follow/unfollow button for temples.
 * Self-contained: loads its own follow state on mount.
 */
export function TempleFollowButton({ templeId }: Props) {
  const [followId, setFollowId]   = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [toggling, setToggling]   = useState(false);

  useEffect(() => {
    followsApi.myFollowing()
      .then(({ items }) => {
        const f = items.find(f => f.followeeType === 'temple' && f.followeeId === templeId);
        setFollowId(f?.id ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [templeId]);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (toggling || loading) return;
    setToggling(true);
    try {
      if (followId) {
        await followsApi.unfollow(followId);
        setFollowId(null);
      } else {
        const f = await followsApi.follow('temple', templeId);
        setFollowId(f.id);
      }
    } catch { /* silent */ }
    setToggling(false);
  };

  const isFollowing = !!followId;

  return (
    <button
      onClick={toggle}
      disabled={loading || toggling}
      aria-label={isFollowing ? 'Unfollow temple' : 'Follow temple'}
      style={{
        padding:'5px 12px', borderRadius:100, fontSize:11, fontWeight:600,
        border:`1.5px solid ${isFollowing ? '#E2E8F0' : NAVY}`,
        background: isFollowing ? 'transparent' : NAVY,
        color: isFollowing ? '#64748B' : '#fff',
        cursor: loading ? 'default' : 'pointer',
        transition:'all .15s',
        opacity: loading || toggling ? 0.5 : 1,
        whiteSpace:'nowrap',
      }}
    >
      {loading ? '…' : toggling ? '…' : isFollowing ? 'Following' : '+ Follow'}
    </button>
  );
}
