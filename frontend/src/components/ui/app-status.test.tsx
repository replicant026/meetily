import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppStatus } from '@/components/ui/app-status';

const user = userEvent.setup();

describe('AppStatus', () => {
  it('renders a permission state with the supplied action and accessible description', async () => {
    const action = vi.fn();
    render(
      <AppStatus
        model={{
          kind: 'permission',
          tone: 'warning',
          title: 'Microphone access required',
          description: 'Allow Meetily to access your microphone.',
          action: { label: 'Open settings', onAction: action },
        }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Microphone access required');
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(action).toHaveBeenCalledOnce();
  });

  it('renders danger states as alert role', () => {
    render(
      <AppStatus
        model={{
          kind: 'error',
          tone: 'danger',
          title: 'Transcription failed',
        }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Transcription failed');
  });
});
