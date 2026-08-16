import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsShell } from '@/components/settings/SettingsShell';

const user = userEvent.setup();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

// Return the last segment of the key so buttons match "general", "audio", etc.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key.split('.').pop() ?? key,
}));

describe('SettingsShell', () => {
  it('renders navigation with all section buttons', () => {
    render(
      <SettingsShell>{(section) => <div data-testid="content">{section}</div>}</SettingsShell>,
    );

    expect(screen.getByRole('navigation', { name: /settings sections/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /general/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /audio/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /speakers/i })).toBeVisible();
  });

  it('defaults to general section and updates on click', async () => {
    render(
      <SettingsShell>{(section) => <div data-testid="content">{section}</div>}</SettingsShell>,
    );

    expect(screen.getByTestId('content')).toHaveTextContent('general');

    await user.click(screen.getByRole('button', { name: /audio/i }));
    expect(screen.getByTestId('content')).toHaveTextContent('audio');
  });

  it('keeps the settings category list scoped to the settings page', () => {
    render(
      <SettingsShell>{(section) => <div data-testid="content">{section}</div>}</SettingsShell>,
    );

    expect(screen.getByRole('navigation', { name: /settings sections/i })).toBeVisible();
    // Should NOT have a second "main navigation" — that's AppShell's job
    expect(screen.queryAllByRole('navigation', { name: /main navigation/i })).toHaveLength(0);
  });

  it('keeps settings content within desktop viewport', () => {
    render(
      <SettingsShell>{() => <div>content</div>}</SettingsShell>,
    );
    const main = screen.getByRole('main');
    expect(main).toHaveClass('min-w-0');
    expect(main).toHaveClass('overflow-x-hidden');
  });

  it('marks the active section with aria-current after click', async () => {
    render(
      <SettingsShell>{(section) => <div>{section}</div>}</SettingsShell>,
    );

    const audioBtn = screen.getByRole('button', { name: /audio/i });

    // After clicking audio, it should become the active section
    await user.click(audioBtn);
    await waitFor(() => {
      expect(audioBtn).toHaveAttribute('aria-current', 'page');
    });
  });
});
