import React from 'react';

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  valueClass?: string;
  onClick?: () => void;
  isActive?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, icon, valueClass = '', onClick, isActive = false }) => {
  return (
    <div
      onClick={onClick}
      className={`p-4 md:p-5 rounded-lg bg-[var(--button)] border-2 flex items-center justify-between transition-all duration-200 cursor-pointer select-none ${
        isActive
          ? 'border-[var(--blueText)] shadow-md scale-[1.01] ring-2 ring-[var(--blueText)]/30'
          : 'border-[var(--wrapper)] hover:scale-[1.01] hover:border-[var(--blueText)]/50'
      }`}
    >
      <div>
        <p className="text-xs md:text-sm font-medium text-[var(--foreground)]/60">{title}</p>
        <h3 className={`text-2xl md:text-3xl font-bold mt-1 tracking-tight ${valueClass}`}>{value}</h3>
      </div>
      <span className="text-xl md:text-2xl opacity-80">{icon}</span>
    </div>
  );
};