'use client';

import { useState, useRef, ChangeEvent } from 'react';
import { community, CommunityProfile, Post } from '@/lib/community-api';

const NAVY    = '#0F2452';
const GOLD    = '#C8920A';
const GOLD_L  = '#E0A92F';
const TEXT    = '#1A0800';
const TEXT3   = '#8B6B35';
const RED     = '#B91C1C';

const MAX_PHOTOS = 4;

type PostCategory = 'prayer' | 'photo' | 'experience' | 'question' | 'help';

interface Props {
  me: CommunityProfile;
  initialCategory?: PostCategory;
  onClose: () => void;
  onPosted: (p: Post) => void;
}

export default function PostComposerModal({ me, initialCategory, onClose, onPosted }: Props) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<PostCategory | null>(initialCategory ?? null);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const arr = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS - files.length);
    setFiles(prev => [...prev, ...arr]);
    if (fileRef.current) fileRef.current.value = '';
  }

  function extractHashtags(t: string): string[] {
    const tags: string[] = [];
    const re = /#([a-zA-Z0-9_]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      const tag = m[1].toLowerCase();
      if (!tags.includes(tag)) tags.push(tag);
    }
    if (category) tags.push(category);
    return tags;
  }

  async function submit() {
    if (!text.trim() && files.length === 0) return;
    setSubmitting(true); setError('');
    try {
      const photoUrls: string[] = [];
      for (const f of files) {
        try {
          const url = await community.uploads.upload(f, 'post');
          photoUrls.push(url);
        } catch { /* skip failed */ }
      }
      const hashtags = extractHashtags(text);
      // Send BOTH naming conventions for defensive compatibility.
      const body: any = {
        text: text.trim(),
        caption: text.trim(),
      };
      if (photoUrls.length > 0) {
        body.photoUrls = photoUrls;
        body.imageUrls = photoUrls;
      }
      if (hashtags.length > 0) body.hashtags = hashtags;
      // eslint-disable-next-line no-console
      console.log('[post] creating with body:', body);
      const post = await community.posts.create(body);
      // eslint-disable-next-line no-console
      console.log('[post] created:', post);
      onPosted(post);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[post] create failed:', err);
      const detail = err?.body?.message || err?.body?.error?.message || err?.message || 'unknown error';
      setError(`Post failed: ${detail}`);
      setSubmitting(false);
    }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <button onClick={onClose} style={closeBtn}>x</button>
          <strong style={{ fontSize: 15, color: TEXT }}>Create post</strong>
          <button onClick={submit} disabled={submitting || (!text.trim() && files.length === 0)} style={{
            background: submitting || (!text.trim() && files.length === 0) ? 'rgba(15,36,82,0.20)' : NAVY,
            color: '#fff', border: 'none', borderRadius: 16,
            fontSize: 12, fontWeight: 800,
            padding: '6px 14px', cursor: submitting ? 'not-allowed' : 'pointer',
          }}>{submitting ? 'Posting...' : 'Post'}</button>
        </div>

        <div style={{ padding: 14 }}>
          {/* Author chip */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: me.avatarUrl ? `center/cover url('${me.avatarUrl}')` : 'linear-gradient(135deg,#C8920A,#6B3210)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: TEXT }}>{me.name || ('@' + me.username)}</div>
              <div style={{ fontSize: 10, color: TEXT3 }}>Posting publicly</div>
            </div>
          </div>

          {/* Text */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 2000))}
            rows={6}
            placeholder="What's on your mind? Use #hashtags to be discovered."
            autoFocus
            style={{
              width: '100%', border: 'none', resize: 'none',
              fontSize: 14, fontFamily: 'inherit', color: TEXT,
              background: 'transparent', outline: 'none', minHeight: 100,
            }}
          />

          {/* Photo previews */}
          {files.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 6 }}>
              {files.map((f, i) => (
                <div key={i} style={{ position: 'relative', aspectRatio: '1', background: '#F6F1E5', borderRadius: 8, overflow: 'hidden' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} style={{
                    position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer',
                  }}>x</button>
                </div>
              ))}
            </div>
          )}

          {error && <div style={{ marginTop: 8, color: RED, fontSize: 11.5, fontWeight: 600 }}>{error}</div>}

          {/* Bottom toolbar */}
          <div style={{ borderTop: '1px solid rgba(200,146,10,0.18)', marginTop: 12, paddingTop: 12, display: 'flex', gap: 8 }}>
            <button onClick={() => fileRef.current?.click()} disabled={files.length >= MAX_PHOTOS} style={{
              background: files.length >= MAX_PHOTOS ? '#F6F1E5' : `linear-gradient(135deg,${GOLD},${GOLD_L})`,
              border: 'none', borderRadius: 22, padding: '9px 16px',
              fontSize: 13, fontWeight: 700,
              color: files.length >= MAX_PHOTOS ? TEXT3 : '#fff',
              cursor: files.length >= MAX_PHOTOS ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: files.length >= MAX_PHOTOS ? 'none' : '0 2px 8px rgba(200,146,10,0.30)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Add Photo ({files.length}/{MAX_PHOTOS})
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" multiple onChange={onPick} style={{ display: 'none' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(10,22,40,0.55)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  zIndex: 1000,
};

const card: React.CSSProperties = {
  background: '#FFFAEC', width: '100%', maxWidth: 520,
  borderRadius: '18px 18px 0 0', maxHeight: '94vh', overflowY: 'auto',
  boxShadow: '0 -8px 32px rgba(0,0,0,0.20)',
};

const header: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '12px 14px', borderBottom: '1px solid rgba(200,146,10,0.18)',
  position: 'sticky', top: 0, background: '#FFFAEC', zIndex: 2,
};

const closeBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', fontSize: 22, color: TEXT,
  cursor: 'pointer', lineHeight: 1, padding: 0, width: 28,
};
