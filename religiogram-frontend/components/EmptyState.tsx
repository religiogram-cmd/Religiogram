import React from 'react';

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-800 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 max-w-xs mb-6">{subtitle}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-2 bg-amber-600 text-white rounded-full text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
