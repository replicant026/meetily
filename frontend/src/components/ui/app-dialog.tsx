'use client';

import { cn } from '@/lib/utils';
import { type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AppButton } from './app-button';

interface AppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function AppDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: AppDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/40 z-[var(--z-modal)]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
            'w-[90vw] max-w-lg max-h-[85vh] overflow-y-auto',
            'bg-[rgb(var(--app-surface))] border border-[rgb(var(--app-border))]',
            'rounded-[var(--app-radius-md)] shadow-lg p-6',
            'z-[var(--z-modal)]',
            'focus-visible:outline-none',
            className,
          )}
        >
          <DialogPrimitive.Title className="text-base font-semibold text-[rgb(var(--app-fg))]">
            {title}
          </DialogPrimitive.Title>

          {description && (
            <DialogPrimitive.Description className="mt-1 text-xs text-[rgb(var(--app-muted-fg))]">
              {description}
            </DialogPrimitive.Description>
          )}

          <div className="mt-4">{children}</div>

          {footer && (
            <div className="mt-6 flex items-center justify-end gap-2">{footer}</div>
          )}

          <DialogPrimitive.Close asChild>
            <AppButton
              variant="quiet"
              size="sm"
              className="absolute right-3 top-3"
              aria-label="Close"
            >
              ✕
            </AppButton>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
