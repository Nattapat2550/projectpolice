import React from 'react';

interface StatCardProps {
  title: string;
  value: number;
  icon: string;
  valueClass?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, icon, valueClass = '' }) => {
  return (
    <div className="p-4 md:p-5 rounded-2xl bg-[var(--container)] border border-[var(--shadow)]/20 shadow-sm flex items-center justify-between transition-all hover:scale-[1.01] duration-200">
      <div>
        <p className="text-xs md:text-sm font-medium text-[var(--foreground)]/60">{title}</p>
        <h3 className={`text-2xl md:text-3xl font-bold mt-1 tracking-tight ${valueClass}`}>{value}</h3>
      </div>
      <span className="text-xl md:text-2xl opacity-80">{icon}</span>
    </div>
  );
};