'use client';

import { cn } from '@/lib/utils';
import { type HTMLAttributes, forwardRef } from 'react';

type Variant = 'panel' | 'card' | 'subtle';

interface AppSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
}

const variantClasses: Record<Variant, string> = {
  panel: 'bg-[rgb(var(--app-surface))] border border-[rgb(var(--app-border))] shadow-[var(--app-shadow-panel)] rounded-[var(--app-radius-md)]',
  card: 'bg-[rgb(var(--app-surface))] rounded-[var(--app-radius-sm)]',
  subtle: 'bg-[rgb(var(--app-muted))] rounded-[var(--app-radius-sm)]',
};

export const AppSurface = forwardRef<HTMLDivElement, AppSurfaceProps>(
  ({ variant = 'panel', className, ...props }, ref) => (
    <div ref={ref} className={cn(variantClasses[variant], className)} {...props} />
  ),
);
AppSurface.displayName = 'AppSurface';
