'use client';

export type TempleTab = 'local' | 'all';

export interface TempleTabsProps {
  active: TempleTab;
  onChange: (tab: TempleTab) => void;
  /** Whether the Local tab should be disabled (e.g. user denied geolocation). */
  localDisabled?: boolean;
}

/**
 * Two-pill tab switcher. Controlled — state lives on the parent screen
 * so a shallow link (`?tab=all`) or initial location state can pre-select.
 */
export function TempleTabs({ active, onChange, localDisabled }: TempleTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Temple list filters"
      className="inline-flex items-center p-1 rounded-2xl"
      style={{
        background: 'rgba(255,252,245,.78)',
        border: '1px solid rgba(197,138,75,.2)',
        boxShadow: 'inset 0 1px 3px rgba(107,63,29,.06)',
      }}
    >
      <TabPill
        label="Local"
        icon={
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        }
        active={active === 'local'}
        disabled={localDisabled}
        onClick={() => onChange('local')}
      />
      <TabPill
        label="All India"
        icon={
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        }
        active={active === 'all'}
        onClick={() => onChange('all')}
      />
    </div>
  );
}

function TabPill({
  label,
  icon,
  active,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-4 h-9 rounded-xl text-[12.5px] font-semibold transition-all disabled:opacity-50"
      style={{
        background: active
          ? 'linear-gradient(140deg, #0F2452 0%, #243F75 50%, #2D4F8A 100%)'
          : 'transparent',
        color: active ? '#ffffff' : '#6B7280',
        boxShadow: active ? '0 4px 12px rgba(169,113,66,.32)' : 'none',
      }}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );
}
