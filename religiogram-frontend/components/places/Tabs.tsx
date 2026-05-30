'use client';

interface Tab {
  id: string;
  label: string;
  icon?: string;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  variant?: 'pill' | 'underline';
}

export function Tabs({ tabs, active, onChange, variant = 'pill' }: TabsProps) {
  if (variant === 'underline') {
    return (
      <div className="flex gap-0 border-b overflow-x-auto scrollbar-none"
        style={{ borderColor: 'rgba(169,113,66,.18)', scrollbarWidth: 'none' }}>
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="flex items-center gap-1.5 px-4 py-3 text-[13px] font-semibold whitespace-nowrap transition-all duration-200 relative flex-shrink-0"
              style={{
                fontFamily: "'Inter', sans-serif",
                color: isActive ? '#C8932A' : 'rgba(107,63,29,.5)',
                borderBottom: isActive ? '2.5px solid #C8932A' : '2.5px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {tab.icon && <span>{tab.icon}</span>}
              {tab.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex p-1 rounded-2xl gap-1"
      style={{ background: 'rgba(169,113,66,.1)', border: '1px solid rgba(169,113,66,.15)' }}>
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12.5px] transition-all duration-200 whitespace-nowrap"
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: isActive ? 700 : 500,
              color: isActive ? '#6B3F1D' : 'rgba(107,63,29,.55)',
              background: isActive ? '#fff' : 'transparent',
              boxShadow: isActive ? '0 2px 10px rgba(107,63,29,.14)' : 'none',
            }}
          >
            {tab.icon && <span>{tab.icon}</span>}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
