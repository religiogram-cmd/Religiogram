'use client';

import { useState } from 'react';
import { tokenStore } from '@/lib/api';

const GOLD = '#C8920A';
const NAVY = '#0A1628';

interface BirthProfile {
  fullName: string;
  birthDate: string;
  birthTime: string;
  birthCity: string;
}

interface Props {
  onSave?: (profile: BirthProfile) => void;
  onCancel?: () => void;
}

export default function AiBirthProfileForm({ onSave, onCancel }: Props) {
  const [form, setForm] = useState<BirthProfile>({
    fullName: '',
    birthDate: '',
    birthTime: '',
    birthCity: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName || !form.birthDate || !form.birthCity) {
      setError('Name, birth date and city are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const API = process.env.NEXT_PUBLIC_API_BASE ?? '';
      const tok = tokenStore.access ?? '';
      const res = await fetch(`${API}/api/v1/ai/birth-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Save failed');
      onSave?.(form);
    } catch {
      setError('Could not save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof BirthProfile, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '11px 14px',
          border: `1.5px solid #e5e7eb`,
          borderRadius: 10,
          fontSize: 14,
          outline: 'none',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );

  return (
    <div style={{
      background: '#fff',
      borderRadius: 20,
      padding: 24,
      maxWidth: 420,
      margin: '0 auto',
      boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔮</div>
        <h2 style={{ color: NAVY, fontWeight: 800, fontSize: 20, margin: '0 0 6px' }}>
          Your Birth Details
        </h2>
        <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
          Required for accurate kundli and personalized guidance
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {field('Full Name', 'fullName', 'text', 'As per birth certificate')}
        {field('Date of Birth', 'birthDate', 'date')}
        {field('Time of Birth', 'birthTime', 'time')}
        {field('Birth City', 'birthCity', 'text', 'City where you were born')}

        {error && (
          <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          style={{
            width: '100%',
            padding: '13px',
            background: `linear-gradient(135deg, ${GOLD}, #f59e0b)`,
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 15,
            cursor: saving ? 'wait' : 'pointer',
            marginBottom: 10,
          }}
        >
          {saving ? 'Saving…' : '🔮 Save Birth Profile'}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              width: '100%',
              padding: '11px',
              background: 'transparent',
              color: '#9ca3af',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}
