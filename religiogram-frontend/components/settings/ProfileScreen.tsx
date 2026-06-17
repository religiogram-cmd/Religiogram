'use client';
// P0-2 fix: import canonical token store

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, usersApi, PublicUser } from '@/lib/api';
import { tokenStore } from '@/lib/api';
import { useReligion, UserReligion } from '@/lib/useReligion';

const NAVY = '#0F2452';
const GOLD = '#C8932A';
const BG   = '#F6F7FA';

/* ─── Icon components ─────────────────────────────── */
function MapPinIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
}
function GlobeIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
}
function BellIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
}
function UserIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}
function CardIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
}
function StarIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
}
function BookingsIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
}
function ProviderIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="12" y1="3" x2="12" y2="7"/><line x1="10" y1="5" x2="14" y2="5"/></svg>;
}
function FaithIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8c-2.2 0-4 1.8-4 4s1.8 4 4 4a3 3 0 0 0 3-3"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>;
}

const FAITH_OPTIONS: { key: UserReligion; label: string; symbol: string; desc: string }[] = [
  { key:'all',       label:'All Faiths', symbol:'🌐', desc:'Explore all places of worship' },
  { key:'hindu',     label:'Hindu',      symbol:'ॐ',  desc:'Temples & Hindu sacred sites'  },
  { key:'muslim',    label:'Muslim',     symbol:'☪',  desc:'Mosques & Islamic sacred sites' },
  { key:'sikh',      label:'Sikh',       symbol:'☬',  desc:'Gurudwaras & Sikh sacred sites' },
  { key:'christian', label:'Christian',  symbol:'✝',  desc:'Churches & Christian sacred sites' },
];

function FaithSheet({ current, onSelect, onClose }: { current: UserReligion | null; onSelect: (r: UserReligion) => void; onClose: () => void }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:600, display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.55)' }} onClick={onClose} />
      <div style={{ position:'relative', background:'#FFFBF0', borderRadius:'22px 22px 0 0', padding:'0 0 32px', boxShadow:'0 -8px 40px rgba(0,0,0,.25)' }}>
        {/* Handle */}
        <div style={{ display:'flex', justifyContent:'center', padding:'14px 0 6px' }}>
          <div style={{ width:40, height:4, borderRadius:2, background:'rgba(10,22,40,.18)' }} />
        </div>
        <div style={{ textAlign:'center', padding:'4px 0 18px' }}>
          <div style={{ fontSize:17, fontWeight:900, color:'#0A1628', fontFamily:"'Playfair Display',Georgia,serif" }}>Your Faith Preference</div>
          <div style={{ fontSize:12, color:'rgba(10,22,40,.5)', marginTop:3 }}>Changes apply to Holy Places & Priests</div>
        </div>
        {FAITH_OPTIONS.map(f => (
          <button key={f.key} onClick={() => { onSelect(f.key); onClose(); }} style={{
            width:'100%', background: current === f.key ? 'rgba(200,146,10,.1)' : 'transparent',
            border:'none', borderBottom:'1px solid rgba(10,22,40,.07)', padding:'14px 22px',
            display:'flex', alignItems:'center', gap:14, cursor:'pointer', textAlign:'left',
          }}>
            <div style={{ width:44, height:44, borderRadius:12, flexShrink:0,
              background: current === f.key ? '#C8920A' : 'rgba(10,22,40,.07)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize: f.key === 'hindu' ? 22 : 20, fontWeight:900,
              color: current === f.key ? '#fff' : '#0A1628',
            }}>{f.symbol}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:15, fontWeight:700, color:'#0A1628', marginBottom:2 }}>{f.label}</div>
              <div style={{ fontSize:11.5, color:'rgba(10,22,40,.5)' }}>{f.desc}</div>
            </div>
            {current === f.key && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8920A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
function HelpIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
}
function ShieldIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
}
function LogOutIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
}
function TrashIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
}
function AlertTriangleIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
}
function ChevronRight() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>;
}

/* ─── Reusable Row ─────────────────────────────────── */
interface RowProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  sublabel?: string;
  badge?: string;
  onClick?: () => void;
  danger?: boolean;
}
function Row({ icon, iconBg, label, sublabel, badge, onClick, danger }: RowProps) {
  return (
    <button onClick={onClick}
      style={{ display:'flex', alignItems:'center', gap:14, width:'100%', padding:'14px 20px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left' }}>
      <span style={{ width:38, height:38, borderRadius:10, background:iconBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'#fff' }}>
        {icon}
      </span>
      <span style={{ flex:1 }}>
        <span style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ display:'block', fontSize:15, fontWeight:500, color: danger ? '#EF4444' : '#1F2937', lineHeight:1.3 }}>{label}</span>
          {badge && (
            <span style={{ fontSize:10, fontWeight:700, background:`${GOLD}25`, color:'#92680A', borderRadius:20, padding:'2px 7px', letterSpacing:'0.04em' }}>
              {badge}
            </span>
          )}
        </span>
        {sublabel && <span style={{ fontSize:12, color:'#6B7280', display:'block', marginTop:2 }}>{sublabel}</span>}
      </span>
      {!danger && <ChevronRight />}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:16 }}>
      <p style={{ fontSize:11, fontWeight:700, letterSpacing:'0.1em', color:'#9CA3AF', textTransform:'uppercase', marginBottom:6, paddingLeft:20 }}>{title}</p>
      <div style={{ background:'#fff', borderRadius:16, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
        {children}
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ height:1, background:'#F3F4F6', marginLeft:72 }} />;
}

/* ─── Edit Profile Modal ───────────────────────────── */
function EditProfileModal({
  initial,
  onSave,
  onClose,
  isSaving,
}: {
  initial: { name: string; bio: string; avatarUrl: string };
  onSave: (patch: { name?: string; bio?: string; avatarUrl?: string }) => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  const [name,      setName]      = useState(initial.name);
  const [bio,       setBio]       = useState(initial.bio);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);

  const isDirty =
    name !== initial.name ||
    bio  !== initial.bio  ||
    avatarUrl !== initial.avatarUrl;

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', fontSize: 14,
    border: '1.5px solid #E5E7EB', borderRadius: 10, outline: 'none',
    color: '#111827', background: '#FAFAFA', boxSizing: 'border-box',
    fontFamily: '"Plus Jakarta Sans", sans-serif',
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:700, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      {/* Backdrop */}
      <div
        style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }}
        onClick={!isSaving ? onClose : undefined}
      />

      {/* Sheet */}
      <div style={{
        position:'relative', background:'#fff', borderRadius:'22px 22px 0 0',
        width:'100%', maxWidth:520, padding:'0 0 env(safe-area-inset-bottom, 24px)',
        boxShadow:'0 -8px 40px rgba(0,0,0,0.2)',
      }}>
        {/* Handle */}
        <div style={{ display:'flex', justifyContent:'center', padding:'14px 0 4px' }}>
          <div style={{ width:40, height:4, borderRadius:2, background:'rgba(10,22,40,.15)' }} />
        </div>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 20px 16px' }}>
          <h2 style={{ fontSize:17, fontWeight:800, color:'#111827', margin:0, fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
            Edit Profile
          </h2>
          <button
            onClick={onClose}
            disabled={isSaving}
            style={{ background:'none', border:'none', cursor:'pointer', padding:4, color:'#6B7280' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div style={{ padding:'0 20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
          {/* Display name */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:5, letterSpacing:'0.03em' }}>
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your full name"
              maxLength={100}
              disabled={isSaving}
              style={fieldStyle}
            />
          </div>

          {/* Bio */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:5, letterSpacing:'0.03em' }}>
              Bio <span style={{ fontWeight:400, color:'#9CA3AF' }}>(optional, 160 chars)</span>
            </label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="A short bio about yourself…"
              maxLength={160}
              rows={3}
              disabled={isSaving}
              style={{ ...fieldStyle, resize:'none', lineHeight:1.5 }}
            />
            <div style={{ textAlign:'right', fontSize:11, color:'#9CA3AF', marginTop:3 }}>
              {bio.length}/160
            </div>
          </div>

          {/* Avatar URL */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:5, letterSpacing:'0.03em' }}>
              Avatar URL <span style={{ fontWeight:400, color:'#9CA3AF' }}>(optional)</span>
            </label>
            <input
              type="url"
              value={avatarUrl}
              onChange={e => setAvatarUrl(e.target.value)}
              placeholder="https://…"
              disabled={isSaving}
              style={fieldStyle}
            />
          </div>

          {/* Save */}
          <button
            onClick={() => onSave({ name: name.trim() || undefined, bio: bio.trim() || undefined, avatarUrl: avatarUrl.trim() || undefined })}
            disabled={!isDirty || isSaving}
            style={{
              padding:'13px', borderRadius:12, border:'none',
              background: isDirty && !isSaving ? NAVY : '#F3F4F6',
              color: isDirty && !isSaving ? '#fff' : '#9CA3AF',
              fontSize:15, fontWeight:700, cursor: isDirty && !isSaving ? 'pointer' : 'not-allowed',
              fontFamily:'"Plus Jakarta Sans",sans-serif',
              transition:'background 0.15s, color 0.15s',
            }}
          >
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Delete Account Modal ─────────────────────────── */
function DeleteAccountModal({ onConfirm, onClose, isDeleting }: {
  onConfirm: () => void;
  onClose: () => void;
  isDeleting: boolean;
}) {
  const [inputVal, setInputVal] = useState('');
  const confirmed = inputVal === 'DELETE';

  return (
    <div style={{ position:'fixed', inset:0, zIndex:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
      {/* Backdrop */}
      <div
        style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)' }}
        onClick={!isDeleting ? onClose : undefined}
      />

      {/* Modal card */}
      <div style={{
        position:'relative', background:'#fff', borderRadius:20, padding:'28px 24px 24px',
        width:'100%', maxWidth:380, boxShadow:'0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Icon */}
        <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}>
          <div style={{ width:56, height:56, borderRadius:'50%', background:'#FEE2E2', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <AlertTriangleIcon />
          </div>
        </div>

        <h2 style={{ fontSize:18, fontWeight:800, color:'#111827', textAlign:'center', margin:'0 0 8px', fontFamily:'"Plus Jakarta Sans",sans-serif' }}>
          Delete Account
        </h2>
        <p style={{ fontSize:13.5, color:'#6B7280', textAlign:'center', lineHeight:1.6, margin:'0 0 20px' }}>
          This will <strong style={{ color:'#EF4444' }}>permanently erase</strong> your profile, bookings, and all personal data. This action cannot be undone.
        </p>

        {/* Confirmation input */}
        <label style={{ display:'block', fontSize:12, fontWeight:700, color:'#374151', marginBottom:6, letterSpacing:'0.03em' }}>
          Type <span style={{ fontFamily:'monospace', background:'#F3F4F6', padding:'1px 5px', borderRadius:4 }}>DELETE</span> to confirm
        </label>
        <input
          type="text"
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          placeholder="DELETE"
          disabled={isDeleting}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={{
            width:'100%', padding:'11px 14px', fontSize:14, fontFamily:'monospace',
            border: `2px solid ${confirmed ? '#EF4444' : '#E5E7EB'}`,
            borderRadius:10, outline:'none', background: confirmed ? '#FFF5F5' : '#fff',
            color:'#111827', boxSizing:'border-box', marginBottom:18,
            transition:'border-color 0.15s, background 0.15s',
          }}
        />

        {/* Actions */}
        <button
          onClick={onConfirm}
          disabled={!confirmed || isDeleting}
          style={{
            width:'100%', padding:'13px', borderRadius:12, border:'none', cursor: confirmed && !isDeleting ? 'pointer' : 'not-allowed',
            background: confirmed && !isDeleting ? '#EF4444' : '#F3F4F6',
            color: confirmed && !isDeleting ? '#fff' : '#9CA3AF',
            fontSize:15, fontWeight:700, fontFamily:'"Plus Jakarta Sans",sans-serif',
            marginBottom:10, transition:'background 0.15s, color 0.15s',
          }}
        >
          {isDeleting ? 'Deleting account…' : 'Permanently Delete Account'}
        </button>

        <button
          onClick={onClose}
          disabled={isDeleting}
          style={{
            width:'100%', padding:'13px', borderRadius:12, border:'1px solid #E5E7EB',
            background:'transparent', cursor: isDeleting ? 'not-allowed' : 'pointer',
            color:'#374151', fontSize:15, fontWeight:600, fontFamily:'"Plus Jakarta Sans",sans-serif',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ─── Local profile-edit cache ──────────────────────
 * The mock backend stores user edits in memory only, so refreshing the page
 * after a mock restart wipes the name/avatar/bio the user just typed. We
 * keep a per-user override in localStorage and apply it on top of whatever
 * the server returns. The real backend persists, so this overlay just
 * becomes a no-op once the canonical record carries the same values.
 * ─────────────────────────────────────────────────── */
type ProfileOverride = { name?: string; avatarUrl?: string; bio?: string };

const overrideKey = (id?: string | null) => (id ? `rg_profile_override_${id}` : null);

function readOverride(id?: string | null): ProfileOverride {
  if (typeof window === 'undefined') return {};
  const k = overrideKey(id);
  if (!k) return {};
  try { return JSON.parse(window.localStorage.getItem(k) || '{}'); }
  catch { return {}; }
}

function writeOverride(id: string, patch: ProfileOverride) {
  if (typeof window === 'undefined') return;
  const k = overrideKey(id)!;
  try {
    const prev = readOverride(id);
    window.localStorage.setItem(k, JSON.stringify({ ...prev, ...patch }));
  } catch { /* quota / private mode — ignore */ }
}

function applyOverride<T extends Partial<PublicUser> & Record<string, unknown>>(u: T): T {
  const o = readOverride((u as any).id);
  const merged: any = { ...u };
  if (o.name) {
    merged.name     = o.name;
    merged.fullName = o.name;
  }
  if (o.avatarUrl) merged.avatarUrl = o.avatarUrl;
  if (o.bio !== undefined) merged.bio = o.bio;
  return merged;
}

/* ─── Main screen ──────────────────────────────────── */
export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser]     = useState<PublicUser | null>(null);
  const [communityProfile, setCommunityProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      usersApi.me().catch(() => null),
      // Pull community profile (username + displayName) and merge
      fetch('/v1/community/me', {
        headers: { Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('rg_access') : ''}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then(b => b?.data ?? null)
        .catch(() => null),
    ]).then(([u, cp]) => {
      if (u) {
        const merged: any = applyOverride(u as any);
        if (cp) {
          // Prefer community profile's displayName + username
          if (cp.displayName) merged.name = merged.fullName = cp.displayName;
          if (cp.username) merged.username = cp.username;
          if (cp.avatarUrl) merged.avatarUrl = cp.avatarUrl;
        }
        setUser(merged);
        setCommunityProfile(cp);
      } else if (cp) {
        // No users/me but have community profile — show partial UI
        setUser({ name: cp.displayName, fullName: cp.displayName, username: cp.username, avatarUrl: cp.avatarUrl } as any);
        setCommunityProfile(cp);
      }
    }).finally(() => setLoading(false));
  }, []);

  const handleLogout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    router.replace('/');
  }, [router]);

  // ── Edit Profile ──────────────────────────────────────
  const [showEditModal,  setShowEditModal]  = useState(false);
  const [isSavingEdit,   setIsSavingEdit]   = useState(false);

  const handleSaveProfile = useCallback(async (patch: { name?: string; bio?: string; avatarUrl?: string }) => {
    setIsSavingEdit(true);

    // Split into (a) fields the real backend's UpdateProfileDto accepts and
    // (b) extra fields we only keep locally (bio isn't on the DTO yet — sending
    // it would be rejected by `forbidNonWhitelisted: true`).
    const serverPatch: { name?: string; avatarUrl?: string } = {};
    if (patch.name      && patch.name.trim())      serverPatch.name      = patch.name.trim();
    if (patch.avatarUrl && patch.avatarUrl.trim()) serverPatch.avatarUrl = patch.avatarUrl.trim();

    const localExtras: Record<string, unknown> = {};
    if (patch.bio !== undefined) localExtras.bio = patch.bio.trim();

    let serverUpdate: Record<string, unknown> = {};
    try {
      if (Object.keys(serverPatch).length > 0) {
        // Canonical helper handles CSRF, cookie credentials, auth refresh.
        serverUpdate = (await usersApi.updateProfile(serverPatch)) as Record<string, unknown>;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Profile] updateProfile failed; applying changes locally.', err);
    }

    // Mirror changes to community profile (displayName + bio + avatarUrl)
    try {
      const communityPatch: Record<string, string> = {};
      if (serverPatch.name) communityPatch.displayName = serverPatch.name;
      if (serverPatch.avatarUrl) communityPatch.avatarUrl = serverPatch.avatarUrl;
      if (patch.bio !== undefined) communityPatch.bio = patch.bio;
      if (Object.keys(communityPatch).length > 0) {
        await fetch('/v1/community/me', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('rg_access') : ''}`,
          },
          body: JSON.stringify(communityPatch),
        });
      }
    } catch (err) {
      console.warn('[Profile] community profile update failed (non-fatal).', err);
    }

    // Apply locally. Mirror `name` into `fullName` so the navy header + initials
    // update immediately — the real backend only stores `name`, but our UI reads
    // both keys depending on the source (auth/me vs profile/get).
    setUser(prev => {
      const base = prev ?? ({} as any);
      const merged: any = { ...base, ...serverPatch, ...serverUpdate, ...localExtras };
      const finalName = (serverUpdate as any).name ?? serverPatch.name ?? base.name ?? base.fullName;
      if (finalName) {
        merged.name     = finalName;
        merged.fullName = finalName;
      }
      // Persist override so the next page-load survives mock-server restarts.
      if (merged.id) {
        writeOverride(merged.id, {
          name:      finalName,
          avatarUrl: (serverPatch.avatarUrl as string | undefined),
          bio:       (localExtras as any).bio,
        });
      }
      return merged;
    });
    setShowEditModal(false);
    setIsSavingEdit(false);
  }, []);

  // ── Delete Account ─────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting]           = useState(false);

  const handleDeleteAccount = useCallback(async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const token = tokenStore.access;
      const res = await fetch('/users/me', {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`Server responded ${res.status}`);
      }
      // tokenStore is in-memory — cleared automatically on navigation
      router.replace('/');
    } catch (err) {
      console.error('Delete account failed:', err);
      setIsDeleting(false);
      alert('Failed to delete account. Please try again or contact support.');
    }
  }, [isDeleting, router]);

  const displayName = (user?.fullName || (user as any)?.name || '').trim();
  const initials = displayName
    ? displayName.split(/\s+/).map((w: string) => w[0]).join('').slice(0,2).toUpperCase()
    : (user?.email?.[0] || user?.phone?.slice(-2) || '?').toUpperCase();

  const isProvider = user?.role === 'provider' || user?.role === 'admin';
  const { religion, confirmReligion } = useReligion();
  const [showFaithSheet, setShowFaithSheet] = useState(false);


  return (
    <div style={{ minHeight:'100svh', background:BG }}>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(160deg, #0F2452 0%, #0F2452 55%, #2C5282 100%)',
        paddingTop: 'max(56px,env(safe-area-inset-top,56px))',
        paddingBottom: 28, paddingLeft: 20, paddingRight: 20, position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative orbs */}
        <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, borderRadius:'50%', background:'rgba(200,147,42,0.10)' }} />
        <div style={{ position:'absolute', bottom:-20, left:-20, width:80, height:80, borderRadius:'50%', background:'rgba(200,147,42,0.07)' }} />
        {/* Curved bottom */}
        <div style={{ position:'absolute', bottom:-1, left:0, right:0, height:24, background:BG, borderRadius:'22px 22px 0 0' }} />

        <div style={{ display:'flex', alignItems:'center', gap:16, position:'relative' }}>
          {/* Avatar */}
          <div style={{
            width:72, height:72, borderRadius:'50%', flexShrink:0,
            background: 'linear-gradient(135deg, #D4A335 0%, #C8932A 60%, #9A6F15 100%)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:24, fontWeight:800, color:'#fff',
            border:'3px solid rgba(255,255,255,0.30)',
            boxShadow:'0 4px 20px rgba(0,0,0,0.25)',
            fontFamily:'"Plus Jakarta Sans", sans-serif',
          }}>
            {loading ? '…' : initials}
          </div>
          <div>
            <p style={{ color:'#fff', fontWeight:800, fontSize:20, margin:0, lineHeight:1.2, letterSpacing:'-0.02em', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
              {loading ? 'Loading…' : (displayName || 'User')}
            </p>
            <p style={{ color:'rgba(255,255,255,0.60)', fontSize:12.5, margin:'4px 0 0', fontFamily:'"Plus Jakarta Sans", sans-serif' }}>
              {user?.phone || user?.email || ''}
            </p>
            {user?.role && (
              <span style={{ display:'inline-flex', alignItems:'center', marginTop:7,
                background:'rgba(200,147,42,0.25)', backdropFilter:'blur(8px)',
                border:'1px solid rgba(200,147,42,0.4)',
                color:'#F5D988', fontSize:10.5, fontWeight:700, borderRadius:999,
                padding:'2px 10px', textTransform:'capitalize', letterSpacing:'0.06em',
                fontFamily:'"Plus Jakarta Sans", sans-serif',
              }}>
                {user.role}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Sections ── */}
      <div style={{ padding:'8px 16px 120px' }}>

        <Section title="Preferences">
          <Row icon={<FaithIcon />}  iconBg="#C8920A"  label="My Faith / Religion" sublabel={religion ? FAITH_OPTIONS.find(f=>f.key===religion)?.label ?? 'All Faiths' : 'Not set'} onClick={() => setShowFaithSheet(true)} />
          <Row icon={<MapPinIcon />} iconBg={NAVY}     label="Default City"    sublabel="Set your home city for local services" onClick={() => {}} />
          <Divider />
          <Row icon={<GlobeIcon />}  iconBg="#4B6CB7"  label="Language"        sublabel="English" onClick={() => {}} />
          <Divider />
          <Row icon={<BellIcon />}   iconBg="#7C3AED"  label="Notifications"   sublabel="Manage alerts & reminders" onClick={() => router.push('/notifications')} />
        </Section>

        <Section title="Account">
          <Row icon={<UserIcon />}    iconBg={NAVY}    label="Edit Profile"     sublabel="Update name, photo & details"        onClick={() => setShowEditModal(true)} />
          <Divider />
          <Row icon={<BookingsIcon />} iconBg="#0891B2" label="My Bookings"     sublabel="View upcoming & past bookings"       onClick={() => router.push('/bookings')} />
          <Divider />
          <Row icon={<CardIcon />}    iconBg="#6B7280"  label="Payment Methods" sublabel="Add or manage payment options"       onClick={() => {}} />
          <Divider />
          {/* ── Become / Manage Service Provider ── */}
          {isProvider ? (
            <>
              <Row
                icon={<ProviderIcon />}
                iconBg="#D97706"
                label="Manage Provider Profile"
                sublabel="Update services, pricing & availability"
                badge="PROVIDER"
                onClick={() => router.push('/provider-onboarding')}
              />
              <Divider />
              <Row
                icon={<ProviderIcon />}
                iconBg="#2563eb"
                label="My Provider Status"
                sublabel="View KYC & verification progress"
                onClick={() => router.push('/provider-status')}
              />
            </>
          ) : (
            <>
              <Row
                icon={<ProviderIcon />}
                iconBg={GOLD}
                label="Become a Service Provider"
                sublabel="List your services, set pricing, get bookings"
                badge="NEW"
                onClick={() => router.push('/provider-onboarding')}
              />
              <Divider />
              <Row
                icon={<ProviderIcon />}
                iconBg="#6b7280"
                label="Check Application Status"
                sublabel="See your KYC & onboarding progress"
                onClick={() => router.push('/provider-status')}
              />
            </>
          )}
        </Section>

        <Section title="Support">
          <Row icon={<HelpIcon />}   iconBg="#D97706"  label="Help Center"     sublabel="FAQs and support articles"  onClick={() => router.push('/support')} />
          <Divider />
          <Row icon={<ShieldIcon />} iconBg="#6B7280"  label="Terms & Privacy" sublabel="Legal information"          onClick={() => router.push('/terms')} />
        </Section>

        {/* Logout */}
        <div style={{ background:'#fff', borderRadius:16, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', marginBottom:16 }}>
          <Row icon={<LogOutIcon />} iconBg="#EF4444" label="Log Out" danger onClick={handleLogout} />
        </div>

        {/* Danger Zone */}
        <div style={{ marginBottom:16 }}>
          <p style={{ fontSize:11, fontWeight:700, letterSpacing:'0.1em', color:'#EF4444', textTransform:'uppercase', marginBottom:6, paddingLeft:20, opacity:0.7 }}>Danger Zone</p>
          <div style={{ background:'#FFF5F5', borderRadius:16, overflow:'hidden', boxShadow:'0 1px 4px rgba(239,68,68,0.10)', border:'1px solid rgba(239,68,68,0.15)' }}>
            <Row icon={<TrashIcon />} iconBg="#EF4444" label="Delete Account" sublabel="Permanently erase your data — cannot be undone" danger onClick={() => setShowDeleteModal(true)} />
          </div>
        </div>

      </div>
      {showEditModal && (
        <EditProfileModal
          initial={{
            name:      displayName,
            bio:       (user as any)?.bio ?? '',
            avatarUrl: user?.avatarUrl ?? '',
          }}
          onSave={handleSaveProfile}
          onClose={() => setShowEditModal(false)}
          isSaving={isSavingEdit}
        />
      )}
      {showFaithSheet && (
        <FaithSheet
          current={religion}
          onSelect={confirmReligion}
          onClose={() => setShowFaithSheet(false)}
        />
      )}
      {showDeleteModal && (
        <DeleteAccountModal
          onConfirm={handleDeleteAccount}
          onClose={() => setShowDeleteModal(false)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}
