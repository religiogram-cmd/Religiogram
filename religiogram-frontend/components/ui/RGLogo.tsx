'use client';

interface RGLogoProps {
  size?: number;
  flat?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function RGLogo({ size = 80, flat = false, className = '', style }: RGLogoProps) {
  const shadow = flat
    ? 'none'
    : `0 ${Math.round(size * 0.08)}px ${Math.round(size * 0.30)}px rgba(8,15,70,.65),
       0 ${Math.round(size * 0.02)}px ${Math.round(size * 0.10)}px rgba(200,145,8,.35)`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-icon.png"
      alt="ReligioGram"
      width={size}
      height={size}
      className={className}
      style={{
        display: 'block',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: size * 0.22,
        boxShadow: shadow,
        objectFit: 'cover',
        ...style,
      }}
    />
  );
}

interface RGLogoWordmarkProps {
  iconSize?: number;
  showName?: boolean;
  flat?: boolean;
  className?: string;
}

export function RGLogoWordmark({
  iconSize = 56,
  showName = true,
  flat = false,
  className = '',
}: RGLogoWordmarkProps) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <RGLogo size={iconSize} flat={flat} />
      {showName && (
        <div className="flex flex-col items-center gap-0.5">
          <span style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: iconSize * 0.42,
            fontWeight: 700,
            color: '#0F2452',
            letterSpacing: '0.01em',
            lineHeight: 1,
          }}>
            ReligioGram
          </span>
          <span style={{
            fontSize: iconSize * 0.22,
            color: 'rgba(15,36,82,0.55)',
            letterSpacing: '0.04em',
            fontFamily: '"Plus Jakarta Sans", sans-serif',
          }}>
            Connecting you to sacred spaces
          </span>
        </div>
      )}
    </div>
  );
}

export default RGLogo;
