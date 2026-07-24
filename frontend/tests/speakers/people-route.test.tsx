import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock speaker API
vi.mock('@/lib/speaker-api', () => ({
  listPeople: vi.fn().mockResolvedValue([
    { id: 'person-1', display_name: 'Felipe', color: '#3b82f6', reference_count: 2, playable_reference_count: 2, meeting_count: 5, last_seen_at: new Date().toISOString(), email: null },
    { id: 'person-2', display_name: 'Ana', color: '#10b981', reference_count: 0, playable_reference_count: 0, meeting_count: 1, last_seen_at: null, email: null },
  ]),
  createPerson: vi.fn().mockResolvedValue('new-id'),
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock UI components
vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

import { SpeakerDirectory } from '@/components/speakers/SpeakerDirectory';

describe('People directory', () => {
  it('renders a list without detail panel', async () => {
    render(<SpeakerDirectory />);
    // Wait for people to load
    const felipe = await screen.findByText('Felipe');
    expect(felipe).toBeVisible();
    // No detail panel "no_selection" text
    expect(screen.queryByText('detail.no_selection')).not.toBeInTheDocument();
  });

  it('navigates to /people/<id> on click', async () => {
    render(<SpeakerDirectory />);
    const felipe = await screen.findByText('Felipe');
    felipe.closest('button')?.click();
    expect(mockPush).toHaveBeenCalledWith('/people/person-1');
  });
});
