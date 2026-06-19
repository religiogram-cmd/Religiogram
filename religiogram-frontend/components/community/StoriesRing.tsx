'use client';

import { useEffect, useRef, useState } from 'react';
import { community } from '@/lib/community-api';
import { showToast } from '@/components/ui/Toast';

const GOLD = '#C8920A';
const GOLD_L = '#E0A92F';
const NAVY = '#0F2452';
const TEXT = '#1A0800';

interface Story {
  id: string;
  userId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  imageUrl: string;
  text?: string;
  createdAt: string;
}

interface Props {
  me: { userId: string; username?: string; displayName?: string; avatarUrl?: string };
}

export default function StoriesRing({ me }: Props) {
  const [stories, setStories] = useState<Story[]>([]);
  const [uploading, setUploading] = useState(false);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadStories();
  }, []);

  async function loadStories() {
    try {
      const r: any = await community.stories.feed();
      const arr = Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items : Array.isArray(r?.data) ? r.data : [];
      // Normalize backend story shape to what viewer expects
      setStories(arr.map((s: any) => ({
        id: s.id,
        userId: s.userId ?? s.authorId ?? s.author?.id,
        username: s.username ?? s.author?.username,
        displayName: s.displayName ?? s.author?.displayName ?? s.author?.name,
        avatarUrl: s.avatarUrl ?? s.author?.avatarUrl,
        imageUrl: s.imageUrl ?? s.mediaUrl,
        text: s.text,
        createdAt: s.createdAt,
      })).filter((s: Story) => s.imageUrl));
    } catch { /* empty */ }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { showToast('Please pick an image', 'error'); return; }
    if (f.size > 5 * 1024 * 1024) { showToast('Image must be under 5MB', 'error'); return; }
    setUploading(true);
    try {
      const url = await community.uploads.upload(f, 'story');
      await community.stories.create({ type: 'image', mediaUrl: url });
      showToast('Story posted ✓', 'success');
      loadStories();
    } catch {
      showToast('Story upload failed', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // Group stories by user
  const byUser = new Map<string, Story[]>();
  for (const s of stories) {
    if (!byUser.has(s.userId)) byUser.set(s.userId, []);
    byUser.get(s.userId)!.push(s);
  }
  const userStories = Array.from(byUser.entries()).map(([userId, arr]) => ({
    userId,
    user: arr[0],
    stories: arr,
  }));

  return (
    <>
      <div style={{ background: '#fff', borderRadius: 14, padding: '10px 4px', border: '1px solid rgba(200,146,10,0.18)', overflowX: 'auto', display: 'flex', gap: 10, whiteSpace: 'nowrap', marginBottom: 10 }}>
        {/* Your story / Add */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, padding: '0 4px' }}
        >
          <div style={{ position: 'relative', width: 56, height: 56 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: me.avatarUrl ? `center/cover url('${me.avatarUrl}')` : 'linear-gradient(135deg,#C8920A,#6B3210)',
              border: '2px dashed rgba(200,146,10,0.5)',
            }} />
            <div style={{
              position: 'absolute', bottom: -2, right: -2,
              background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`,
              border: '2px solid #fff',
              borderRadius: '50%', width: 22, height: 22,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 14, fontWeight: 800,
            }}>+</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, color: TEXT, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {uploading ? 'Posting…' : 'Your story'}
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: 'none' }} />

        {/* Others' stories */}
        {userStories.map((u, idx) => (
          <button
            key={u.userId}
            onClick={() => setViewerIdx(idx)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, padding: '0 4px' }}
          >
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              padding: 2,
              background: `linear-gradient(135deg, ${GOLD}, #E11D48, ${GOLD_L})`,
            }}>
              <div style={{
                width: '100%', height: '100%', borderRadius: '50%',
                background: u.user.avatarUrl ? `center/cover url('${u.user.avatarUrl}')` : 'linear-gradient(135deg,#C8920A,#6B3210)',
                border: '2px solid #fff',
              }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: TEXT, maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {u.user.displayName || u.user.username || 'user'}
            </span>
          </button>
        ))}
      </div>

      {viewerIdx !== null && userStories[viewerIdx] && (
        <StoryViewer
          group={userStories[viewerIdx]}
          onClose={() => setViewerIdx(null)}
          onNext={() => setViewerIdx(i => (i !== null && i + 1 < userStories.length ? i + 1 : null))}
          onPrev={() => setViewerIdx(i => (i !== null && i > 0 ? i - 1 : i))}
        />
      )}
    </>
  );
}

function StoryViewer({ group, onClose, onNext, onPrev }: {
  group: { user: Story; stories: Story[] };
  onClose: () => void; onNext: () => void; onPrev: () => void;
}) {
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setProgress(0);
    const STORY_DURATION = 5000;
    const start = Date.now();
    const id = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / STORY_DURATION) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(id);
        if (storyIdx + 1 < group.stories.length) {
          setStoryIdx(i => i + 1);
        } else {
          onNext();
        }
      }
    }, 50);
    return () => clearInterval(id);
  }, [storyIdx, group.stories.length, onNext]);

  const current = group.stories[storyIdx];
  if (!current) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9990, background: '#000', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
      {/* Progress bars */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 10px 4px' }}>
        {group.stories.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 2.5, borderRadius: 2, background: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
            <div style={{
              width: `${i < storyIdx ? 100 : i === storyIdx ? progress : 0}%`,
              height: '100%', background: '#fff',
            }} />
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 14px 8px' }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: group.user.avatarUrl ? `center/cover url('${group.user.avatarUrl}')` : 'linear-gradient(135deg,#C8920A,#6B3210)' }} />
        <div style={{ flex: 1, color: '#fff', fontSize: 13, fontWeight: 700 }}>
          {group.user.displayName || group.user.username}
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', padding: 0 }}>×</button>
      </div>

      {/* Image */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        {/* Tap areas */}
        <button onClick={() => storyIdx > 0 ? setStoryIdx(i => i - 1) : onPrev()} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '33%', background: 'transparent', border: 'none', cursor: 'pointer' }} />
        <button onClick={() => storyIdx + 1 < group.stories.length ? setStoryIdx(i => i + 1) : onNext()} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '33%', background: 'transparent', border: 'none', cursor: 'pointer' }} />
      </div>
    </div>
  );
}
