'use client';

import { toast } from 'sonner';
import type { AppToastInput } from '@/lib/ui-state';

/**
 * Typed wrapper around Sonner. The only new toast entry point.
 * Never serialises arbitrary error values.
 */
export function showAppToast(input: AppToastInput): void {
  const { tone, title, description, action } = input;

  const fn = tone === 'danger' ? toast.error : tone === 'warning' ? toast.warning : tone === 'success' ? toast.success : toast.info;

  fn(title, {
    description,
    action: action
      ? {
          label: action.label,
          onClick: action.onClick,
        }
      : undefined,
  });
}
