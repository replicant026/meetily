import React from 'react';
import { AppDialog } from '@/components/ui/app-dialog';
import { AppButton } from '@/components/ui/app-button';

interface ConfirmationModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  text: string;
  isOpen: boolean;
}

export function ConfirmationModal({ onConfirm, onCancel, text, isOpen }: ConfirmationModalProps) {
  return (
    <AppDialog
      open={isOpen}
      onOpenChange={(open) => { if (!open) onCancel(); }}
      title="Confirm Delete"
      footer={
        <>
          <AppButton variant="secondary" onClick={onCancel}>
            Cancel
          </AppButton>
          <AppButton variant="destructive" onClick={onConfirm}>
            Delete
          </AppButton>
        </>
      }
    >
      <p className="text-[rgb(var(--app-muted-fg))]" style={{ fontSize: 'var(--app-font-sm, 0.875rem)' }}>{text}</p>
    </AppDialog>
  );
}
