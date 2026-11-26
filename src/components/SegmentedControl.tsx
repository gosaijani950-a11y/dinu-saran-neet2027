import React from 'react';
import { motion } from 'motion/react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  badge?: string | number;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  layoutId: string;
  ariaLabel: string;
  size?: 'xs' | 'sm';
  fullWidth?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  ariaLabel,
  size = 'sm',
  fullWidth = false,
  className = '',
}: SegmentedControlProps<T>) {
  const heightClass = size === 'xs' ? 'h-6.5 text-[11px] px-2' : 'h-7 text-xs px-2.5';

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-0.5 p-1 rounded-lg bg-[#EEF2F7] dark:bg-[#0E121B] border border-slate-200/80 dark:border-white/[0.05] ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={opt.disabled}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`relative ${heightClass} ${
              fullWidth ? 'flex-1 justify-center' : ''
            } rounded-md font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              active
                ? 'text-white dark:text-[#F1F5F9]'
                : 'text-[#475569] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F1F5F9]'
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-md bg-[#6366F1] shadow-xs"
              />
            )}
            <span className="relative z-10">{opt.label}</span>
            {opt.badge !== undefined && (
              <span
                className={`relative z-10 font-mono-num text-[10px] font-bold ${
                  active ? 'text-indigo-100' : 'text-[#64748B] dark:text-[#64748B]'
                }`}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
