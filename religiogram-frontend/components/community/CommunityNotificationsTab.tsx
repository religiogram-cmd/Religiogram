'use client';

import { useEffect, useState } from 'react';
import { community, CommunityProfile, NotificationItem } from '@/lib/community-api';

const NAVY    = '#0F2452';
const GOLD    = '#C8920A';
const GOLD_L  = '#E0A92F';
const TEXT    = '#1A0800';
const TEXT2   = '#4A3010';
const TEXT3   = '#8B6B35';

interface Props {
  me: CommunityProfile;
  onUnreadChange?: (count: number) => void;
}

const ICONS: Record<NotificationItem['type'], string> = {
  like:            '❤️',
  comment:         '💬',
  friend_request:  '👋',
  friend_accept:   '🤝',
  dm:              '✉️',
  mention:         '📣',
  story_view:      '👁',
};

const VERBS: Record<NotificationItem['type'], string> = {
  like:           'liked your post',
  comment:        'commented on your post',
  friend_request: 'sent you a friend request',
  friend_accept:  'accepted your friend request',
  dm:             'sent you a message',
  mention:        'mentioned you',
  story_view:     'viewed your story',
};

export default function CommunityNotificationsTab({ me, onUnreadChange }: Props) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    community.notifications.list()
      .then(r => {
        if (cancelled) return;
        setItems(r?.items ?? []);
        setNextCursor(r?.nextCursor);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function loadMore() {
    if (!nextCursor) return;
    try {
      const r = await community.notifications.list(nextCursor);
      setItems(prev => [...prev, ...(r.items ?? [])]);
      setNextCursor(r.nextCursor);
    } catch { /* ignore */ }
  }

  async function markAllRead() {
    setMarking(true);
    try {
      await community.notifications.markAllRead();
      const now = new Date().toISOString();
      setItems(prev => prev.map(n => n.readAt ? n : { ...n, readAt: now }));
      onUnreadChange?.(0);
    } catch { /* ignore */ }
    setMarking(false);
  }

  async function markOne(id: string) {
    try {
      await community.notifications.markRead(id);
      const now = new Date().toISOString();
      let unreadDelta = 0;
      setItems(prev => prev.map(n => {
        if (n.id !== id) return n;
        if (!n.readAt) unreadDelta = -1;
        return { ...n, readAt: now };
      }));
      if (unreadDelta < 0 && onUnreadChange) {
        const remaining = items.filter(n => !n.readAt && n.id !== id).length;
        onUnreadChange(remaining);
      }
    } catch { /* ignore */ }
  }

  async function acceptFriend(n: NotificationItem) {
    if (n.type !== 'friend_request') return;
    try {
      await community.friends.accept(n.actor.id);
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, type: 'friend_accept', readAt: new Date().toISOString() } : x));
    } catch { /* ignore */ }
  }

  return (
    <div>
      <div style={{ padding: '10px 14px', background: '#fff', borderBottom: '1px solid rgba(200,146,10,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 14, color: TEXT }}>Activity</strong>
        <button onClick={markAllRead} disabled={marking || items.every(n => n.readAt)} style={{
          background: 'transparent', border: 'none', color: NAVY, fontSize: 11.5, fontWeight: 700,
          cursor: items.every(n => n.readAt) ? 'not-allowed' : 'pointer',
          opacity: items.every(n => n.readAt) ? 0.4 : 1,
        }}>Mark all read</button>
      </div>

      {loading && <div style={{ padding: 30, textAlign: 'center', color: TEXT3, fontSize: 13 }}>Loading activity…</div>}
      {!loading && items.length === 0 && (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: TEXT3, fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ fontSize: 42, marginBottom: 10 }}>🔔</div>
          <strong style={{ color: TEXT, fontSize: 14 }}>Nothing new</strong>
          <div style={{ marginTop: 6 }}>You&apos;ll see likes, comments, messages and friend updates here.</div>
        </div>
      )}

      {items.map(n => {
        const unread = !n.readAt;
        return (
          <button key={n.id}
            onClick={() => markOne(n.id)}
            style={{
              width: '100%', textAlign: 'left',
              background: unread ? '#FFFCF1' : '#fff',
              border: 'none',
              borderBottom: '1px solid rgba(200,146,10,0.12)',
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '12px 14px',
              cursor: 'pointer', position: 'relative',
            }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: n.actor.avatarUrl ? `center/cover url('${n.actor.avatarUrl}')` : 'linear-gradient(135deg,#C8920A,#6B3210)',
              }} />
              <span style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 20, height: 20, borderRadius: '50%',
                background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, border: '1.5px solid #F6F1E5',
              }}>{ICONS[n.type]}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: TEXT, lineHeight: 1.4 }}>
                <strong style={{ fontWeight: 800 }}>{n.actor.name || ('@' + n.actor.username)}</strong>{' '}
                <span style={{ color: TEXT2 }}>{VERBS[n.type]}</span>
              </div>
              {n.preview && (
                <div style={{ fontSize: 11, color: TEXT3, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  &ldquo;{n.preview}&rdquo;
                </div>
              )}
              <div style={{ fontSize: 10, color: TEXT3, marginTop: 4 }}>{timeAgo(n.createdAt)}</div>
            </div>
            {/* Inline accept button for friend requests */}
            {n.type === 'friend_request' && (
              <button onClick={(e) => { e.stopPropagation(); acceptFriend(n); }} style={{
                background: NAVY, color: '#fff', border: 'none', borderRadius: 14,
                padding: '6px 12px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
              }}>Accept</button>
            )}
            {unread && (
              <span style={{ position: 'absolute', top: 14, right: 14, width: 8, height: 8, borderRadius: '50%', background: '#DC2626' }} />
            )}
          </button>
        );
      })}

      {nextCursor && (
        <button onClick={loadMore} style={{ display: 'block', margin: '14px auto', background: 'transparent', border: 'none', color: NAVY, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          Load more
        </button>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const d = new Date(iso); const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 604800) return Math.floor(s / 86400) + 'd ago';
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}
