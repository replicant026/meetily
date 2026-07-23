'use client';

import { cn } from '@/lib/utils';
import { type ButtonHTMLAttributes, forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'destructive';

interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[rgb(var(--app-accent))] text-[rgb(var(--app-accent-fg))] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]',
  secondary:
    'bg-[rgb(var(--app-muted))] text-[rgb(var(--app-fg))] hover:bg-[rgb(var(--app-border))] focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-border))]',
  quiet:
    'bg-transparent text-[rgb(var(--app-muted-fg))] hover:text-[rgb(var(--app-fg))] hover:bg-[rgb(var(--app-muted))] focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-border))]',
  destructive:
    'bg-[rgb(var(--app-danger))] text-[rgb(var(--app-danger-fg))] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-danger))]',
};

const sizeClasses: Record<string, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
};

export const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(
  ({ variant = 'secondary', size = 'md', className, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-[var(--app-radius-sm)] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);
AppButton.displayName = 'AppButton';
