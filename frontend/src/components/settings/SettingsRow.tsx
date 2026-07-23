'use client';

import { cn } from '@/lib/utils';
import { type ReactNode } from 'react';

interface SettingsRowProps {
  label: string;
  description?: string;
  children: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}

export function SettingsRow({
  label,
  description,
  children,
  disabled,
  disabledReason,
  className,
}: SettingsRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 py-3',
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[rgb(var(--app-fg))]">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-[rgb(var(--app-muted-fg))]">{description}</p>
        )}
        {disabled && disabledReason && (
          <p className="mt-0.5 text-xs text-[rgb(var(--app-warning))]">{disabledReason}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
