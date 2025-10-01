// ProgressBar - Shows a percentage as a colored bar
import React from 'react';

interface ProgressBarProps {
  percent: number;
  label?: string;
  color?: 'green' | 'yellow' | 'red' | 'blue';
  showPercentage?: boolean;
}

export default function ProgressBar({
  percent,
  label,
  color = 'blue',
  showPercentage = true
}: ProgressBarProps) {
  const colorClasses = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
  };

  const barColor = colorClasses[color];

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-sm text-white/70 mb-1">
          <span>{label}</span>
          {showPercentage && <span>{percent}%</span>}
        </div>
      )}
      <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-300`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
}
