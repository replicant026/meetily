import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      importRecording: 'Import a recording',
      importDescription: 'Import an audio file to transcribe and summarize',
      importFile: 'Import file',
    };
    return map[key] ?? key;
  },
}));

// Mock ImportDialogContext
const mockOpenImportDialog = vi.fn();
vi.mock('@/contexts/ImportDialogContext', () => ({
  useImportDialog: () => ({ openImportDialog: mockOpenImportDialog }),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Upload: () => <span data-testid="icon-upload" />,
}));

// Import page component
import ImportPage from '@/app/import/page';

describe('Import route', () => {
  beforeEach(() => {
    mockOpenImportDialog.mockClear();
  });

  it('renders centered import empty state with heading and button', () => {
    render(<ImportPage />);

    const heading = screen.getByRole('heading', { name: /import a recording/i });
    expect(heading).toBeVisible();

    const button = screen.getByRole('button', { name: /import file/i });
    expect(button).toBeVisible();
  });

  it('opens the import dialog when button is clicked', () => {
    render(<ImportPage />);

    const button = screen.getByRole('button', { name: /import file/i });
    button.click();

    expect(mockOpenImportDialog).toHaveBeenCalledTimes(1);
  });

  it('shows description text', () => {
    render(<ImportPage />);

    expect(screen.getByText(/import an audio file/i)).toBeVisible();
  });
});
