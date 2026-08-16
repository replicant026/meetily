import { describe, expect, it } from 'vitest';
import {
  normaliseSettings,
  normaliseInterface,
  normaliseRecording,
  normaliseTranscription,
  normaliseSpeakers,
  normaliseSummary,
  normaliseExport,
  normaliseShortcuts,
  normaliseNotifications,
  mergeSettingsPatch,
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  type AppSettings,
} from '@/lib/settings-preferences';

describe('normaliseSettings', () => {
  it('returns defaults for null/undefined input', () => {
    expect(normaliseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normaliseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults for non-object input', () => {
    expect(normaliseSettings('garbage')).toEqual(DEFAULT_SETTINGS);
    expect(normaliseSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it('preserves valid fields and fixes only invalid ones', () => {
    const input = {
      version: 0,
      interface: { theme: 'dark', uiScale: '120', language: 'pt-BR', sidebarPreference: 'auto_hide' },
      recording: { saveAudio: false, audioFormat: 'mp3' },
      speakers: { matchingMode: 'automatic', lockChannels: false },
    };
    const result = normaliseSettings(input);

    expect(result.interface.theme).toBe('dark');
    expect(result.interface.uiScale).toBe('120');
    expect(result.interface.language).toBe('pt-BR');
    expect(result.interface.sidebarPreference).toBe('auto_hide');
    expect(result.recording.saveAudio).toBe(false);
    expect(result.recording.audioFormat).toBe('mp3');
    expect(result.speakers.matchingMode).toBe('automatic');
    expect(result.speakers.lockChannels).toBe(false);
    // Fields not provided should be defaults
    expect(result.interface.startWithSystem).toBe(DEFAULT_SETTINGS.interface.startWithSystem);
    expect(result.transcription).toEqual(DEFAULT_SETTINGS.transcription);
  });

  it('always sets version to current SETTINGS_VERSION', () => {
    expect(normaliseSettings({ version: 0 }).version).toBe(SETTINGS_VERSION);
    expect(normaliseSettings({ version: 99 }).version).toBe(SETTINGS_VERSION);
  });
});

describe('normaliseInterface', () => {
  it('rejects invalid theme values', () => {
    expect(normaliseInterface({ theme: 'neon' }).theme).toBe('system');
    expect(normaliseInterface({ theme: 'dark' }).theme).toBe('dark');
  });

  it('rejects invalid scale values', () => {
    expect(normaliseInterface({ uiScale: '75' }).uiScale).toBe('100');
    expect(normaliseInterface({ uiScale: '90' }).uiScale).toBe('90');
  });

  it('accepts boolean flags', () => {
    const result = normaliseInterface({ startWithSystem: true, startHidden: true, consentAnalytics: true });
    expect(result.startWithSystem).toBe(true);
    expect(result.startHidden).toBe(true);
    expect(result.consentAnalytics).toBe(true);
  });
});

describe('normaliseRecording', () => {
  it('rejects invalid audio format', () => {
    expect(normaliseRecording({ audioFormat: 'flac' }).audioFormat).toBe('wav');
  });

  it('rejects invalid retention policy', () => {
    expect(normaliseRecording({ retention: 'forever' }).retention).toBe('never');
    expect(normaliseRecording({ retention: '30d' }).retention).toBe('30d');
  });

  it('rejects empty name pattern', () => {
    expect(normaliseRecording({ namePattern: '' }).namePattern).toBe(DEFAULT_SETTINGS.recording.namePattern);
  });
});

describe('normaliseTranscription', () => {
  it('clamps vadThreshold to 0..1', () => {
    expect(normaliseTranscription({ vadThreshold: -0.5 }).vadThreshold).toBe(0);
    expect(normaliseTranscription({ vadThreshold: 2 }).vadThreshold).toBe(1);
    expect(normaliseTranscription({ vadThreshold: 0.7 }).vadThreshold).toBe(0.7);
  });

  it('filters non-string hotwords', () => {
    const result = normaliseTranscription({ hotwords: ['valid', 42, null, 'also'] });
    expect(result.hotwords).toEqual(['valid', 'also']);
  });
});

describe('normaliseSpeakers', () => {
  it('rejects invalid matching mode', () => {
    expect(normaliseSpeakers({ matchingMode: 'always' }).matchingMode).toBe('suggest');
    expect(normaliseSpeakers({ matchingMode: 'off' }).matchingMode).toBe('off');
  });
});

describe('normaliseSummary', () => {
  it('rejects invalid detail tab', () => {
    expect(normaliseSummary({ defaultDetailTab: 'actions' }).defaultDetailTab).toBe('summary');
    expect(normaliseSummary({ defaultDetailTab: 'transcript' }).defaultDetailTab).toBe('transcript');
  });
});

describe('normaliseExport', () => {
  it('rejects invalid date format', () => {
    expect(normaliseExport({ dateFormat: 'timestamp' }).dateFormat).toBe('iso');
  });
});

describe('normaliseShortcuts', () => {
  it('accepts empty shortcuts as valid defaults', () => {
    expect(normaliseShortcuts({}).toggleRecording).toBe('');
  });

  it('preserves provided shortcut strings', () => {
    expect(normaliseShortcuts({ toggleRecording: 'Ctrl+Shift+R' }).toggleRecording).toBe('Ctrl+Shift+R');
  });
});

describe('normaliseNotifications', () => {
  it('defaults all flags to true', () => {
    const result = normaliseNotifications({});
    expect(result.enabled).toBe(true);
    expect(result.recordingStarted).toBe(true);
    expect(result.suppressDuringRecording).toBe(true);
  });
});

describe('mergeSettingsPatch', () => {
  const base: AppSettings = { ...DEFAULT_SETTINGS };

  it('replaces only provided sections', () => {
    const result = mergeSettingsPatch(base, {
      interface: { ...DEFAULT_SETTINGS.interface, theme: 'dark' },
    });
    expect(result.interface.theme).toBe('dark');
    expect(result.recording).toEqual(base.recording);
    expect(result.transcription).toEqual(base.transcription);
  });

  it('normalises patched sections', () => {
    const result = mergeSettingsPatch(base, {
      interface: { theme: 'invalid' } as never,
    });
    expect(result.interface.theme).toBe('system');
  });

  it('always sets version to current', () => {
    const result = mergeSettingsPatch(base, {});
    expect(result.version).toBe(SETTINGS_VERSION);
  });
});
