'use client';

import { cn } from '@/lib/utils';
import { type ReactNode } from 'react';
import { AppButton } from './app-button';
import type { AppStatusModel } from '@/lib/ui-state';

interface AppStatusProps {
  model: AppStatusModel;
  className?: string;
  children?: ReactNode;
}

const toneIcon: Record<string, string> = {
  neutral: '○',
  info: 'ⓘ',
  success: '✓',
  warning: '⚠',
  danger: '✕',
};

export function AppStatus({ model, className, children }: AppStatusProps) {
  const isAlert = model.kind === 'error' || model.tone === 'danger';

  return (
    <div
      role={isAlert ? 'alert' : 'status'}
      aria-live={isAlert ? 'assertive' : 'polite'}
      className={cn(
        'flex flex-col items-center justify-center gap-3 p-6 text-center',
        className,
      )}
    >
      <span
        className={cn('text-2xl', {
          'text-[rgb(var(--app-muted-fg))]': model.tone === 'neutral' || model.tone === 'info',
          'text-[rgb(var(--app-success))]': model.tone === 'success',
          'text-[rgb(var(--app-warning))]': model.tone === 'warning',
          'text-[rgb(var(--app-danger))]': model.tone === 'danger',
        })}
        aria-hidden="true"
      >
        {toneIcon[model.tone] ?? '○'}
      </span>

      <p className="text-sm font-medium text-[rgb(var(--app-fg))]">{model.title}</p>

      {model.description && (
        <p className="max-w-md text-xs text-[rgb(var(--app-muted-fg))]">{model.description}</p>
      )}

      {model.action && (
        <AppButton
          variant={model.tone === 'danger' ? 'destructive' : 'primary'}
          size="sm"
          onClick={() => model.action!.onAction()}
        >
          {model.action.label}
        </AppButton>
      )}

      {children}
    </div>
  );
}
