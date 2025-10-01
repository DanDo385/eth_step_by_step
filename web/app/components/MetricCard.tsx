// MetricCard - Displays a metric with label, value, and optional badge/color
import React from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  badge?: string;
  badgeColor?: string;
  tooltip?: string;
  icon?: string;
  className?: string;
}

export default function MetricCard({
  label,
  value,
  badge,
  badgeColor = 'text-blue-400',
  tooltip,
  icon,
  className = ''
}: MetricCardProps) {
  return (
    <div
      className={`bg-black/40 border border-white/10 rounded-lg p-4 ${className}`}
      title={tooltip}
    >
      <div className="text-sm text-white/60 mb-1 flex items-center gap-2">
        {icon && <span>{icon}</span>}
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <div className="text-2xl font-semibold text-white">{value}</div>
        {badge && (
          <span className={`text-xs font-medium ${badgeColor}`}>
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}
