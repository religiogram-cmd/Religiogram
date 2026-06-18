'use client';

import { useEffect, useState, useRef, ChangeEvent } from 'react';
import { community, CommunityProfile, Post, UserSearchResult } from '@/lib/community-api';

const NAVY    = '#0F2452';
const GOLD    = '#C8920A';
const GOLD_L  = '#E0A92F';
const CREAM   = '#FFF8E7';
const TEXT    = '#1A0800';
const TEXT2   = '#4A3010';
const TEXT3   = '#8B6B35';
const RED     = '#B91C1C';

interface Props {
  me: CommunityProfile;
  onUpdate: (profile: CommunityProfile) => void;
}

type SubTab = 'posts' | 'friends' | 'requests';

export default function CommunityProfileTab({ me, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [subTab, setSubTab]   = useState<SubTab>('posts');
  const [posts, setPosts]     = useState<Post[]>([]);
  const [friends, setFriends] = useState<UserSearchResult[]>([]);
  const [requests, setRequests] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── Load tab data ─────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const tasks: Array<Promise<unknown>> = [];
    if (subTab === 'posts') {
      tasks.push(community.posts.byUser(me.id).then(r => { if (!cancelled) setPosts(r?.items ?? []); }).catch(() => {}));
    } else if (subTab === 'friends') {
      tasks.push(community.friends.list().then(r => { if (!cancelled) setFriends(r ?? []); }).catch(() => {}));
    } else if (subTab === 'requests') {
      tasks.push(community.friends.incomingRequests().then(r => { if (!cancelled) setRequests(r ?? []); }).catch(() => {}));
    }
    Promise.allSettled(tasks).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [subTab, me.id]);

  async function acceptRequest(u: UserSearchResult) {
    try {
      await community.friends.accept(u.id);
      setRequests(prev => prev.filter(x => x.id !== u.id));
      setFriends(prev => [{ ...u, friendStatus: 'friends' }, ...prev]);
    } catch { /* ignore */ }
  }
  async function rejectRequest(u: UserSearchResult) {
    try {
      await community.friends.reject(u.id);
      setRequests(prev => prev.filter(x => x.id !== u.id));
    } catch { /* ignore */ }
  }
  async function removeFriend(u: UserSearchResult) {
    if (!confirm(`Remove @${u.username} from friends?`)) return;
    try {
      await community.friends.remove(u.id);
      setFriends(prev => prev.filter(x => x.id !== u.id));
    } catch { /* ignore */ }
  }

  return (
    <div>
      {/* ── Hero card ──────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg,#0A1628 0%,${NAVY} 60%, #2A1808 100%)`,
        color: '#fff', padding: '20px 16px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 70, height: 70, borderRadius: '50%',
            background: me.avatarUrl ? `center/cover url('${me.avatarUrl}')` : 'linear-gradient(135deg,#C8920A,#6B3210)',
            border: '2.5px solid #fff', boxShadow: '0 2px 12px rgba(0,0,0,0.3)', flexShrink: 0,
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{
                fontFamily: '"Playfair Display",Georgia,serif',
                fontSize: 19, fontWeight: 800, margin: 0, lineHeight: 1.1,
              }}>{me.name || ('@' + me.username)}</h2>
              {me.accountType && me.accountType !== 'user' && (
                <span style={{ fontSize: 9, fontWeight: 800, color: NAVY, background: GOLD_L, padding: '2px 7px', borderRadius: 10 }}>
                  {(me.accountType || '').toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>@{me.username}</div>
            {me.bio && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', margin: '8px 0 0', lineHeight: 1.45 }}>{me.bio}</p>}
          </div>
        </div>
        <button onClick={() => setEditing(true)} style={{
          marginTop: 14, width: '100%',
          background: 'rgba(255,255,255,0.10)', color: '#fff',
          border: '1px solid rgba(255,255,255,0.25)',
          padding: '8px 0', borderRadius: 10,
          fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
        }}>
          Edit profile
        </button>
      </div>

      {/* ── Stats strip ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', background: '#fff', borderBottom: '1px solid rgba(200,146,10,0.18)' }}>
        <Stat label="Posts"   value={me.postCount   ?? posts.length} />
        <Stat label="Friends" value={me.friendCount ?? friends.length} divider />
        <Stat label="Followers" value={me.followerCount ?? 0} />
      </div>

      {/* ── Sub-tab bar ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', background: '#fff', borderBottom: '1px solid rgba(200,146,10,0.18)' }}>
        {([
          { k: 'posts',    l: 'Posts' },
          { k: 'friends',  l: 'Friends' },
          { k: 'requests', l: 'Requests' },
        ] as const).map(t => {
          const active = subTab === t.k;
          return (
            <button key={t.k} onClick={() => setSubTab(t.k)} style={{
              background: 'transparent', border: 'none',
              padding: '10px 0',
              borderBottom: `3px solid ${active ? NAVY : 'transparent'}`,
              color: active ? NAVY : TEXT3, fontSize: 12, fontWeight: active ? 800 : 600,
              cursor: 'pointer',
            }}>
              {t.l}
            </button>
          );
        })}
      </div>

      {/* ── Sub-tab content ────────────────────────────────── */}
      {loading && <div style={{ padding: 30, textAlign: 'center', color: TEXT3, fontSize: 12 }}>Loading…</div>}

      {!loading && subTab === 'posts' && (
        posts.length === 0
          ? <Empty icon="✍️" title="No posts yet" subtitle="Share a thought, photo or hashtag from the Feed tab." />
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
              {posts.map(p => (
                <div key={p.id} style={{ aspectRatio: '1', background: '#F6F1E5', position: 'relative', overflow: 'hidden' }}>
                  {p.photos[0]
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={p.photos[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                    : <div style={{ padding: 10, fontSize: 11, color: TEXT2, lineHeight: 1.4, overflow: 'hidden' }}>{p.text}</div>
                  }
                </div>
              ))}
            </div>
      )}

      {!loading && subTab === 'friends' && (
        friends.length === 0
          ? <Empty icon="🤝" title="No friends yet" subtitle="Search for users in the Messages tab and send a friend request." />
          : <PeopleList items={friends} actionLabel="Remove" onAction={removeFriend} />
      )}

      {!loading && subTab === 'requests' && (
        requests.length === 0
          ? <Empty icon="📨" title="No pending requests" subtitle="Friend requests will appear here." />
          : <RequestList items={requests} onAccept={acceptRequest} onReject={rejectRequest} />
      )}

      {/* ── Edit profile modal ─────────────────────────────── */}
      {editing && (
        <EditProfileModal
          me={me}
          onClose={() => setEditing(false)}
          onSaved={(p) => { onUpdate(p); setEditing(false); }}
        />
      )}
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────── */

function Stat({ label, value, divider }: { label: string; value: number; divider?: boolean }) {
  return (
    <div style={{
      padding: '12px 0', textAlign: 'center',
      borderLeft: divider ? '1px solid rgba(200,146,10,0.18)' : 'none',
      borderRight: divider ? '1px solid rgba(200,146,10,0.18)' : 'none',
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: TEXT, fontFamily: '"Playfair Display",Georgia,serif' }}>{value}</div>
      <div style={{ fontSize: 10.5, color: TEXT3, fontWeight: 700, letterSpacing: '0.04em', marginTop: 2 }}>{label.toUpperCase()}</div>
    </div>
  );
}

function Empty({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center', color: TEXT3, fontSize: 13, lineHeight: 1.6 }}>
      <div style={{ fontSize: 42, marginBottom: 10 }}>{icon}</div>
      <strong style={{ color: TEXT, fontSize: 14 }}>{title}</strong>
      <div style={{ marginTop: 6 }}>{subtitle}</div>
    </div>
  );
}

function PeopleList({ items, actionLabel, onAction }: { items: UserSearchResult[]; actionLabel: string; onAction: (u: UserSearchResult) => void }) {
  return (
    <div>
      {items.map(u => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fff', borderBottom: '1px solid rgba(200,146,10,0.10)' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: u.avatarUrl ? `center/cover url('${u.avatarUrl}')` : 'linear-gradient(135deg,#C8920A,#6B3210)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>{u.name || ('@' + u.username)}</div>
            <div style={{ fontSize: 10.5, color: TEXT3 }}>@{u.username}</div>
          </div>
          <button onClick={() => onAction(u)} style={{
            background: 'transparent', border: `1px solid ${TEXT3}`, color: TEXT3,
            borderRadius: 14, padding: '5px 10px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
          }}>{actionLabel}</button>
        </div>
      ))}
    </div>
  );
}

function RequestList({ items, onAccept, onReject }: { items: UserSearchResult[]; onAccept: (u: UserSearchResult) => void; onReject: (u: UserSearchResult) => void }) {
  return (
    <div>
      {items.map(u => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fff', borderBottom: '1px solid rgba(200,146,10,0.10)' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: u.avatarUrl ? `center/cover url('${u.avatarUrl}')` : 'linear-gradient(135deg,#C8920A,#6B3210)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>{u.name || ('@' + u.username)}</div>
            <div style={{ fontSize: 10.5, color: TEXT3 }}>@{u.username}</div>
          </div>
          <button onClick={() => onAccept(u)} style={{
            background: NAVY, color: '#fff', border: 'none',
            borderRadius: 14, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
          }}>Accept</button>
          <button onClick={() => onReject(u)} style={{
            background: 'transparent', border: `1px solid ${TEXT3}`, color: TEXT3,
            borderRadius: 14, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>Reject</button>
        </div>
      ))}
    </div>
  );
}

/* ── Edit profile modal ───────────────────────────────── */
function EditProfileModal({ me, onClose, onSaved }: { me: CommunityProfile; onClose: () => void; onSaved: (p: CommunityProfile) => void }) {
  const [name, setName] = useState(me.name ?? '');
  const [bio, setBio]   = useState(me.bio  ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me.avatarUrl ?? null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB.'); return; }
    setError('');
    setAvatarFile(f);
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(reader.result as string);
    reader.readAsDataURL(f);
  }

  async function save() {
    setSaving(true); setError('');
    try {
      let uploadedAvatarUrl: string | undefined;
      if (avatarFile) {
        try { uploadedAvatarUrl = await community.uploads.upload(avatarFile, 'avatar'); }
        catch { /* keep original */ }
      }
      const next = await community.me.update({
        name: name.trim() || undefined,
        bio: bio.trim() || undefined,
        avatarUrl: uploadedAvatarUrl ?? me.avatarUrl,
      });
      onSaved(next);
    } catch (err: any) {
      setError(err?.message ?? 'Could not save profile.');
      setSaving(false);
    }
  }

  return (
    <div style={modalBackdrop} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeader}>
          <button onClick={onClose} style={modalClose}>×</button>
          <strong style={{ fontSize: 14, color: TEXT }}>Edit profile</strong>
          <button onClick={save} disabled={saving} style={{
            background: saving ? 'rgba(15,36,82,0.30)' : NAVY, color: '#fff',
            border: 'none', borderRadius: 16, padding: '6px 14px', fontSize: 12, fontWeight: 800,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <button type="button" onClick={() => fileRef.current?.click()} style={{
              width: 76, height: 76, borderRadius: '50%',
              background: avatarUrl ? `center/cover url('${avatarUrl}')` : 'linear-gradient(135deg,#C8920A,#6B3210)',
              border: '2px solid #fff', boxShadow: '0 2px 12px rgba(60,30,5,0.16)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}>{!avatarUrl && <span style={{ fontSize: 30 }}>📷</span>}</button>
            <div style={{ flex: 1 }}>
              <button type="button" onClick={() => fileRef.current?.click()} style={{ background: 'transparent', border: 'none', color: NAVY, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                Change photo
              </button>
              <div style={{ fontSize: 10.5, color: TEXT3, marginTop: 4 }}>JPG/PNG · max 5 MB</div>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={onPick} style={{ display: 'none' }} />
          </div>

          <Label>Username</Label>
          <input value={'@' + me.username} disabled style={{ ...inputStyle, background: '#F6F1E5', color: TEXT3 }} />
          <div style={{ fontSize: 10.5, color: TEXT3, marginTop: 4 }}>Username can&apos;t be changed.</div>

          <Label style={{ marginTop: 14 }}>Display name</Label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Your name" style={inputStyle} />

          <Label style={{ marginTop: 14 }}>Bio</Label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 160))} rows={3} placeholder="A short bio…"
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          <div style={{ textAlign: 'right', fontSize: 10, color: TEXT3, marginTop: 4 }}>{bio.length} / 160</div>

          {error && <div style={{ marginTop: 12, color: RED, fontSize: 11.5, fontWeight: 600 }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: TEXT2, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, ...style }}>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 10,
  border: '1.5px solid rgba(200,146,10,0.30)', fontSize: 14, color: '#1A0800',
  background: '#FFFCF5', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
const modalBackdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 50,
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
};
const modalCard: React.CSSProperties = {
  background: '#fff', width: '100%', maxWidth: 560,
  borderTopLeftRadius: 18, borderTopRightRadius: 18,
  maxHeight: '92svh', overflowY: 'auto', boxShadow: '0 -8px 32px rgba(0,0,0,0.32)',
};
const modalHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '10px 12px', borderBottom: '1px solid rgba(200,146,10,0.18)',
  position: 'sticky', top: 0, background: '#fff', zIndex: 1,
};
const modalClose: React.CSSProperties = {
  background: 'transparent', border: 'none', fontSize: 22, color: TEXT3, cursor: 'pointer', padding: 0, width: 28, height: 28,
};
