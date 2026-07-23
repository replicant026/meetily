'use client';

import { cn } from '@/lib/utils';
import { type ReactNode } from 'react';

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function SettingsSection({ title, description, children, className }: SettingsSectionProps) {
  return (
    <section className={cn('space-y-4', className)}>
      <div>
        <h2 className="text-lg font-semibold text-[rgb(var(--app-fg))]">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-[rgb(var(--app-muted-fg))]">{description}</p>
        )}
      </div>
      <div className="divide-y divide-[rgb(var(--app-border))]">{children}</div>
    </section>
  );
}
