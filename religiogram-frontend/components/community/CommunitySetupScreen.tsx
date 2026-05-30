'use client';

import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { community, CommunityProfile, UsernameCheck } from '@/lib/community-api';

const NAVY    = '#0F2452';
const NAVY_2  = '#0A1628';
const GOLD    = '#C8920A';
const GOLD_L  = '#E0A92F';
const CREAM   = '#FBF4E1';
const CARD    = '#FFF8E7';
const TEXT    = '#1A0800';
const TEXT2   = '#4A3010';
const TEXT3   = '#8B6B35';
const GREEN   = '#16A34A';
const RED     = '#B91C1C';

const HERO_IMG = '/community-setup-hero.jpg'; // optional — clean image required

type AvailState = 'idle' | 'checking' | 'available' | 'unavailable' | 'invalid' | 'error';

interface Props {
  onComplete: (profile: CommunityProfile) => void;
  initialName?: string;
}

export default function CommunitySetupScreen({ onComplete, initialName }: Props) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [name, setName] = useState(initialName ?? '');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [check, setCheck] = useState<UsernameCheck | null>(null);
  const [availState, setAvailState] = useState<AvailState>('idle');

  const [submitting, setSubmitting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState('');

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Whether a clean community hero image exists. If it 404s, we drop to a
  // pure navy gradient so we never paint a hero with baked-in text behind
  // our own title (the religion heroes have engraved captions).
  const [heroOk, setHeroOk] = useState(true);

  /* ── Debounced live availability check ───────────────────────── */
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const u = username.trim().toLowerCase();
    if (!u) { setAvailState('idle'); setCheck(null); return; }
    if (u.length < 3) { setAvailState('invalid'); setCheck({ username: u, available: false, reason: 'too_short', suggestions: [] }); return; }
    if (u.length > 20) { setAvailState('invalid'); setCheck({ username: u, available: false, reason: 'too_long', suggestions: [] }); return; }
    if (!/^[a-z0-9._]+$/.test(u)) { setAvailState('invalid'); setCheck({ username: u, available: false, reason: 'invalid_chars', suggestions: [] }); return; }
    setAvailState('checking');
    timerRef.current = setTimeout(async () => {
      try {
        const c = await community.me.checkUsername(u);
        setCheck(c);
        setAvailState(c.available ? 'available' : 'unavailable');
      } catch {
        setAvailState('error');
      }
    }, 280);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [username]);

  /* ── Avatar selection + immediate preview ───────────── */
  async function onAvatarPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB.'); return; }
    setError('');
    setAvatarFile(f);
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(reader.result as string);
    reader.readAsDataURL(f);
  }

  async function submit() {
    if (!check?.available) return;
    setSubmitting(true);
    setError('');
    try {
      let uploadedAvatarUrl: string | undefined;
      if (avatarFile) {
        setUploadingAvatar(true);
        try {
          uploadedAvatarUrl = await community.uploads.upload(avatarFile, 'avatar');
        } catch {
          uploadedAvatarUrl = undefined;
        }
        setUploadingAvatar(false);
      }
      const profile = await community.me.setup({
        username: username.trim().toLowerCase(),
        name: name.trim() || undefined,
        bio: bio.trim() || undefined,
        avatarUrl: uploadedAvatarUrl,
      });
      onComplete(profile);
    } catch (err: any) {
      if (err?.status === 409) {
        setError('That username was just taken. Try another.');
        setAvailState('unavailable');
      } else {
        setError(err?.message ?? 'Could not finish setup. Please try again.');
      }
      setSubmitting(false);
    }
  }

  const canSubmit = availState === 'available' && !submitting;
  const reasonText = (() => {
    if (!check?.reason) return '';
    if (check.reason === 'too_short')    return 'At least 3 characters.';
    if (check.reason === 'too_long')     return 'Maximum 20 characters.';
    if (check.reason === 'invalid_chars')return 'Only letters, numbers, dots and underscores.';
    if (check.reason === 'reserved')     return 'This username is reserved.';
    if (check.reason === 'taken')        return 'Already taken — try one of the suggestions.';
    return '';
  })();

  return (
    <div style={{ minHeight: '100svh', background: CREAM, fontFamily: '"Plus Jakarta Sans",sans-serif', paddingBottom: 100 }}>

      {/* ─────────── HERO ─────────── */}
      <div style={{
        position: 'relative',
        // When the hero image is loaded we let the image dictate the height —
        // no cropping, so the lanterns + mandala arch + waterline all stay
        // visible. When it isn't, we use a 4:5 portrait box for the gradient
        // fallback to mirror the same shape.
        minHeight: heroOk ? undefined : 420,
        aspectRatio: heroOk ? undefined : '4 / 5',
        background: heroOk
          ? '#0A1628'
          : `linear-gradient(180deg, #F8E1AB 0%, #F0CB7A 40%, #C8920A 100%)`,
        overflow: 'hidden',
        lineHeight: 0,            // kill the inline-image gap
      }}>
        {/* Hero image — rendered as block-flow so the container height
            tracks the image's natural aspect ratio. No object-fit cropping. */}
        {heroOk && (
          <img
            src={HERO_IMG}
            alt=""
            aria-hidden
            onError={() => setHeroOk(false)}
            style={{
              display: 'block',
              width: '100%', height: 'auto',
            }}
          />
        )}

        {/* Back button — circular gold-ringed, sits in the dark top-corner
            area of the mockup. */}
        <button
          onClick={() => router.back()}
          aria-label="Back"
          style={{
            position: 'absolute', top: 16, left: 16, zIndex: 2,
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(10,22,40,0.45)',
            border: `1.5px solid ${GOLD_L}`,
            color: '#FFFAEC', fontSize: 22, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)',
          }}
        >‹</button>

        {/* Title block — only rendered when there's NO hero image.
            The provided hero illustration already has the WELCOME TO /
            Community / "Connect, Share & Inspire Across Faiths" / body copy
            baked in, so painting our own text on top of it stacks
            duplicated headlines. When the image is missing, we draw the
            same content over the gold gradient fallback so the page never
            looks empty. */}
        {!heroOk && (
          <div style={{
            position: 'relative', padding: '54px 22px 50px',
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 13, color: GOLD, fontWeight: 700,
              letterSpacing: '0.22em',
              fontFamily: '"Playfair Display",Georgia,serif',
            }}>
              WELCOME TO
            </div>
            <h1 style={{
              fontFamily: '"Playfair Display",Georgia,serif',
              fontSize: 42, fontWeight: 800, margin: '6px 0 0',
              lineHeight: 1, letterSpacing: '-0.01em',
              color: NAVY_2,
            }}>
              Community
            </h1>

            {/* Lotus divider */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 12, margin: '14px 0 14px',
            }}>
              <span style={{ width: 38, height: 1.5, background: GOLD, opacity: 0.7 }} />
              <span style={{ fontSize: 16, color: GOLD, lineHeight: 1 }}>❀</span>
              <span style={{ width: 38, height: 1.5, background: GOLD, opacity: 0.7 }} />
            </div>

            <p style={{
              fontSize: 15, color: NAVY_2, fontWeight: 700,
              fontFamily: '"Playfair Display",Georgia,serif',
              margin: 0, lineHeight: 1.3,
            }}>
              Connect, Share &amp; Inspire Across Faiths
            </p>
            <p style={{
              fontSize: 13, color: '#3A2A14', margin: '10px auto 0',
              lineHeight: 1.5, maxWidth: 320,
              fontWeight: 500,
            }}>
              Share experiences, ask questions, celebrate festivals, and
              connect with people from all spiritual traditions.
            </p>
          </div>
        )}
      </div>

      {/* ─────────── CARD (overlaps hero) ─────────── */}
      <div style={{
        position: 'relative',
        marginTop: -28,
        background: CARD,
        borderRadius: '26px 26px 0 0',
        padding: '26px 20px 24px',
        boxShadow: '0 -6px 30px rgba(8,22,58,0.18)',
      }}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>

          {/* ── Avatar picker ───────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 84, height: 84, borderRadius: '50%',
                background: avatarUrl ? `center/cover url('${avatarUrl}')` : 'linear-gradient(135deg,#D9A422,#8C5A12 100%)',
                border: '3px solid #fff',
                boxShadow: '0 3px 14px rgba(60,30,5,0.20)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', position: 'relative', flexShrink: 0,
              }}
            >
              {!avatarUrl && (
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              )}
              {/* + badge */}
              <span style={{
                position: 'absolute', bottom: -2, right: -2,
                width: 26, height: 26, borderRadius: '50%',
                background: GOLD, color: '#fff',
                border: '2.5px solid #fff',
                fontSize: 16, fontWeight: 800, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
              }}>+</span>
              {uploadingAvatar && (
                <span style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                  Uploading…
                </span>
              )}
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: TEXT }}>Profile photo</div>
              <div style={{ fontSize: 12, color: TEXT3, marginTop: 3 }}>Optional · JPG/PNG · max 5 MB</div>
              {avatarUrl && (
                <button onClick={() => { setAvatarUrl(null); setAvatarFile(null); }}
                  style={{ marginTop: 4, background: 'transparent', border: 'none', color: NAVY, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                  Remove
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" onChange={onAvatarPick} style={{ display: 'none' }} />
          </div>

          {/* divider */}
          <div style={{ height: 1, background: 'rgba(200,146,10,0.18)', margin: '4px 0 18px' }} />

          {/* ── Username (required) ──────────────────────────── */}
          <Label required>Username</Label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: 14, color: GOLD, fontSize: 15, fontWeight: 700 }}>@</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
              placeholder="yourname"
              autoComplete="off"
              autoFocus
              maxLength={20}
              style={{ ...inputStyle, paddingLeft: 32, paddingRight: 42 }}
            />
            <AvailIcon state={availState} />
          </div>
          {/* Status line under the input */}
          <div style={{ marginTop: 8, minHeight: 18, fontSize: 12, fontWeight: 600,
                         color: availState === 'available' ? GREEN
                              : availState === 'unavailable' || availState === 'invalid' ? RED
                              : TEXT3 }}>
            {availState === 'idle' && '3–20 chars · letters, numbers, dots, underscores'}
            {availState === 'checking' && 'Checking availability…'}
            {availState === 'available' && `✓ @${username} is available`}
            {availState === 'unavailable' && (reasonText || `@${username} is taken`)}
            {availState === 'invalid' && reasonText}
            {availState === 'error' && '⚠ Could not verify availability — you can still try.'}
          </div>

          {/* Suggestion chips if taken */}
          {check?.suggestions?.length ? (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {check.suggestions.slice(0, 6).map(s => (
                <button key={s} type="button" onClick={() => setUsername(s)}
                  style={{
                    background: '#fff', border: `1px solid ${NAVY}55`,
                    color: NAVY, fontSize: 12, fontWeight: 700,
                    padding: '5px 11px', borderRadius: 14, cursor: 'pointer',
                  }}>
                  @{s}
                </button>
              ))}
            </div>
          ) : null}

          {/* ── Display name (optional) ─────────────────────────────── */}
          <Label style={{ marginTop: 20 }}>Display name (optional)</Label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40}
            placeholder="What should friends call you?" style={inputStyle} />

          {/* ── Bio (optional) ──────────────────────────────── */}
          <Label style={{ marginTop: 16 }}>Bio (optional)</Label>
          <div style={{ position: 'relative' }}>
            <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 150))} rows={4}
              placeholder="Tell us a little about yourself…"
              style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit', paddingRight: 56 }} />
            <span style={{ position: 'absolute', right: 12, bottom: 10, fontSize: 11, color: TEXT3, fontWeight: 600 }}>
              {bio.length}/150
            </span>
          </div>

          {/* ── Errors ──────────────────────────────────────── */}
          {error && (
            <div style={{ marginTop: 14, padding: 11, background: '#FEE2E2', color: RED, borderRadius: 10, fontSize: 12.5, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {/* ── Continue button (navy with gold border + arrow) ── */}
          <button onClick={submit} disabled={!canSubmit} style={{
            width: '100%', marginTop: 22,
            background: canSubmit ? NAVY : 'rgba(15,36,82,0.30)',
            color: canSubmit ? GOLD_L : 'rgba(255,250,236,0.55)',
            fontSize: 16, fontWeight: 800,
            padding: '16px 0', borderRadius: 14,
            border: canSubmit ? `2px solid ${GOLD_L}` : `2px solid rgba(232,169,47,0.25)`,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            letterSpacing: 0.2,
            boxShadow: canSubmit ? '0 6px 18px rgba(15,36,82,0.25)' : 'none',
          }}>
            <span>{submitting ? 'Saving…' : 'Continue'}</span>
            {!submitting && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            )}
          </button>

          <p style={{ fontSize: 10.5, color: TEXT3, textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
            Temple and Priest accounts are read-only in messaging — they cannot DM regular users or send friend requests.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────── */

function Label({ children, required, style }: { children: React.ReactNode; required?: boolean; style?: React.CSSProperties }) {
  return (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: NAVY_2, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8, ...style }}>
      {children}{required && <span style={{ color: RED, marginLeft: 4 }}>*</span>}
    </label>
  );
}

function AvailIcon({ state }: { state: AvailState }) {
  const style: React.CSSProperties = {
    position: 'absolute', right: 14, top: 14,
    width: 20, height: 20, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800, color: '#fff',
  };
  if (state === 'checking') return <span style={{ ...style, background: '#F3F4F6', color: TEXT3 }}>…</span>;
  if (state === 'available') return <span style={{ ...style, background: GREEN }}>✓</span>;
  if (state === 'unavailable' || state === 'invalid') return <span style={{ ...style, background: RED }}>×</span>;
  if (state === 'error') return <span style={{ ...style, background: '#F59E0B' }}>!</span>;
  return null;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 14px',
  borderRadius: 12,
  border: `1.5px solid ${GOLD}55`,
  fontSize: 15,
  color: '#1A0800',
  background: '#FFFCF5',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
