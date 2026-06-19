/**
 * Avatar fallback helpers.
 *
 * When a user has no avatarUrl, we render their initials on a gold-gradient
 * circle. "Utkarsh Singh Rajput" → "US" (first + last initial).
 * Single-word names get a single initial: "@utkarsh" → "U".
 */

export function getInitials(name?: string | null, username?: string | null): string {
  const source = (name ?? '').trim() || (username ?? '').trim();
  if (!source) return '?';
  // Strip leading @ if present (username case)
  const cleaned = source.replace(/^@+/, '').trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  // First word's first letter + last word's first letter
  return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase();
}

/** Shared style for the initials fallback circle. Caller passes size. */
export function initialsAvatarStyle(size: number): React.CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    background: 'linear-gradient(135deg,#C8920A,#6B3210)',
    color: '#FFFAEC',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: Math.round(size * 0.38),
    letterSpacing: '0.02em',
    flexShrink: 0,
    userSelect: 'none',
    fontFamily: '"Plus Jakarta Sans",sans-serif',
  };
}
