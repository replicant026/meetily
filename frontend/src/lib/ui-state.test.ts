import { describe, expect, it } from 'vitest';
import { redactLocalPaths, toAppStatusModel } from '@/lib/ui-state';

describe('redactLocalPaths', () => {
  it('replaces Windows absolute paths', () => {
    expect(redactLocalPaths('Could not read C:\\Users\\Felip\\meeting.wav')).toBe(
      'Could not read the selected audio file',
    );
  });

  it('replaces Unix absolute paths', () => {
    expect(redactLocalPaths('Error: /home/user/audio.wav not found')).toBe(
      'Error: the selected audio file not found',
    );
  });

  it('leaves messages without paths unchanged', () => {
    expect(redactLocalPaths('Recording started')).toBe('Recording started');
  });
});

describe('toAppStatusModel', () => {
  it('maps permission errors to warning tone', () => {
    const model = toAppStatusModel(new Error('Microphone permission denied'));
    expect(model.kind).toBe('permission');
    expect(model.tone).toBe('warning');
    expect(model.title).toBe('Permission required');
  });

  it('redacts Windows paths in description', () => {
    const model = toAppStatusModel(new Error('Could not read C:\\Users\\Felip\\meeting.wav'));
    expect(model.description).toBe('Could not read the selected audio file');
  });

  it('maps unknown errors to danger/error', () => {
    const model = toAppStatusModel(new Error('Something broke'));
    expect(model.kind).toBe('error');
    expect(model.tone).toBe('danger');
  });

  it('handles null/undefined gracefully', () => {
    const model = toAppStatusModel(null);
    expect(model.kind).toBe('error');
    expect(model.description).toBe('Unknown error');
  });
});
