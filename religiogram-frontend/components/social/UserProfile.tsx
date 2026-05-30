'use client';
import { useState, useEffect, useCallback } from 'react';
import { socialApi, SocialPost, SocialUser } from '@/lib/api';
import PostCard from './PostCard';

const NAVY = '#0F2452';
const GOLD = '#C8932A';

interface Props { userId: string; currentUserId: string; onBack: () => void; }

export default function UserProfile({ userId, currentUserId, onBack }: Props) {
  const [profile, setProfile] = useState<SocialUser | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(false);

  useEffect(() => {
    Promise.all([
      socialApi.searchUsers('').then(all => all.find(u => u.id === userId) || null),
      socialApi.getUserPosts(userId),
    ]).then(([u, p]) => { setProfile(u); setPosts(p.items); }).catch(() => {}).finally(() => setLoading(false));
  }, [userId]);

  const handleFriendAction = useCallback(async () => {
    if (!profile) return;
    setActioning(true);
    try {
      if (!profile.friendshipStatus) {
        await socialApi.sendFriendRequest(userId);
        setProfile((p: any) => p ? { ...p, friendshipStatus: 'pending' } : p);
      } else if (profile.friendshipStatus === 'accepted' && profile.friendshipId) {
        await socialApi.removeFriend(profile.friendshipId);
        setProfile((p: any) => p ? { ...p, friendshipStatus: null, friendshipId: null } : p);
      }
    } catch {} finally { setActioning(false); }
  }, [profile, userId]);

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200 }}><span style={{ color:'#9CA3AF' }}>Loading…</span></div>;

  const btnLabel = profile?.friendshipStatus === 'accepted' ? 'Remove Friend' : profile?.friendshipStatus === 'pending' ? 'Pending' : '+ Add Friend';
  const btnBg = profile?.friendshipStatus === 'accepted' ? '#EF4444' : profile?.friendshipStatus === 'pending' ? '#9CA3AF' : NAVY;
  const isMe = userId === currentUserId;

  return (
    <div>
      <button onClick={onBack} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', color:NAVY, fontSize:14, fontWeight:600, marginBottom:16, padding:0 }}>
        ← Back
      </button>

      {/* Profile header */}
      <div style={{ background:'#fff', borderRadius:18, padding:'24px 20px', marginBottom:16, boxShadow:'0 1px 6px rgba(0,0,0,.07)', textAlign:'center' }}>
        <div style={{ width:72, height:72, borderRadius:'50%', background:NAVY, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, fontWeight:700, margin:'0 auto 12px' }}>
          {(profile?.fullName||'?').split(' ').map((w: any)=>w[0]).join('').slice(0,2).toUpperCase()}
        </div>
        <h2 style={{ margin:'0 0 4px', fontSize:20, fontWeight:700, color:'#1A1A2E' }}>{profile?.fullName||'User'}</h2>
        <p style={{ margin:'0 0 12px', fontSize:13, color:'#9CA3AF' }}>{profile?.email||''}</p>
        <span style={{ display:'inline-block', background:GOLD, color:'#fff', borderRadius:20, padding:'2px 12px', fontSize:12, fontWeight:600, textTransform:'capitalize', marginBottom:16 }}>{profile?.role||'seeker'}</span>
        {!isMe && (
          <div>
            <button onClick={handleFriendAction} disabled={actioning || profile?.friendshipStatus === 'pending'}
              style={{ height:40, paddingInline:24, borderRadius:12, background:btnBg, color:'#fff', border:`1.5px solid ${GOLD}`, fontSize:14, fontWeight:600, cursor:'pointer', opacity:actioning?0.6:1 }}>
              {actioning ? '…' : btnLabel}
            </button>
          </div>
        )}
      </div>

      {/* Posts */}
      <p style={{ fontSize:12, fontWeight:700, letterSpacing:'0.1em', color:'#9CA3AF', textTransform:'uppercase', marginBottom:10, paddingLeft:4 }}>
        POSTS ({posts.length})
      </p>
      {posts.length === 0 ? (
        <div style={{ textAlign:'center', padding:'32px 16px', background:'#fff', borderRadius:18 }}>
          <p style={{ color:'#9CA3AF', fontSize:14 }}>No posts yet.</p>
        </div>
      ) : (
        posts.map((p: any) => <PostCard key={p.id} post={p} currentUserId={currentUserId} onDelete={id=>setPosts((ps: any)=>ps.filter((x: any)=>x.id!==id))} />)
      )}
    </div>
  );
}
