/**
 * Single source of truth for all application preferences.
 *
 * Design rules:
 *  - Every preference has an explicit default and a discriminated type.
 *  - No credentials are stored here; API keys live in their own service.
 *  - The normalise/migrate helpers are pure and safe to call on any input.
 *  - Version field enables forward-compatible migration from older stores.
 */

// ─── Discriminated types ────────────────────────────────────────────

export type Theme = 'system' | 'light' | 'dark';
export type UiScale = '80' | '90' | '100' | '110' | '120';
export type SidebarPreference = 'fixed' | 'auto_hide';
export type AudioFormat = 'wav' | 'mp3' | 'ogg';
export type RetentionPolicy = 'never' | '7d' | '30d' | '90d';
export type SpeakerMatchingMode = 'off' | 'suggest' | 'automatic';
export type ExportDateFormat = 'iso' | 'local';
export type DefaultDetailTab = 'summary' | 'transcript';

export interface InterfacePreferences {
  theme: Theme;
  uiScale: UiScale;
  language: string; // locale code, e.g. "en-US"
  sidebarPreference: SidebarPreference;
  startWithSystem: boolean;
  startHidden: boolean;
  consentAnalytics: boolean;
}

export interface RecordingPreferences {
  saveAudio: boolean;
  saveLocation: string; // empty = default
  audioFormat: AudioFormat;
  namePattern: string; // e.g. "meeting_{date}_{time}"
  retention: RetentionPolicy;
}

export interface TranscriptionPreferences {
  provider: string;
  model: string;
  language: string; // transcription language, "auto" = detect
  hotwords: string[];
  autoPostProcess: boolean;
  vadThreshold: number; // 0.0–1.0, 0 = disabled
}

export interface SpeakerPreferences {
  matchingMode: SpeakerMatchingMode;
  lockChannels: boolean;
}

export interface SummaryPreferences {
  defaultLlmProvider: string;
  defaultLlmModel: string;
  autoGenerate: boolean;
  includeChapters: boolean;
  includeActionItems: boolean;
  defaultLanguage: string; // "auto" = detect
  systemPrompt: string;
  defaultDetailTab: DefaultDetailTab;
}

export interface ExportPreferences {
  namePattern: string;
  dateFormat: ExportDateFormat;
  includeYamlMetadata: boolean;
  inlineMetadata: boolean;
  autoExport: boolean;
}

export interface ShortcutPreferences {
  toggleRecording: string; // e.g. "Ctrl+Shift+R"
  captureScreen: string; // e.g. "Ctrl+Shift+S"
}

export interface NotificationPreferences {
  enabled: boolean;
  recordingStarted: boolean;
  recordingStopped: boolean;
  updateAvailable: boolean;
  updateInstalled: boolean;
  suppressDuringRecording: boolean;
}

export interface AppSettings {
  version: number;
  interface: InterfacePreferences;
  recording: RecordingPreferences;
  transcription: TranscriptionPreferences;
  speakers: SpeakerPreferences;
  summary: SummaryPreferences;
  export: ExportPreferences;
  shortcuts: ShortcutPreferences;
  notifications: NotificationPreferences;
}

// ─── Schema version ─────────────────────────────────────────────────

export const SETTINGS_VERSION = 1;

// ─── Safe defaults ──────────────────────────────────────────────────

export const DEFAULT_INTERFACE: InterfacePreferences = {
  theme: 'system',
  uiScale: '100',
  language: 'auto',
  sidebarPreference: 'fixed',
  startWithSystem: false,
  startHidden: false,
  consentAnalytics: false,
};

export const DEFAULT_RECORDING: RecordingPreferences = {
  saveAudio: true,
  saveLocation: '',
  audioFormat: 'wav',
  namePattern: 'meeting_{date}_{time}',
  retention: 'never',
};

export const DEFAULT_TRANSCRIPTION: TranscriptionPreferences = {
  provider: 'parakeet',
  model: 'parakeet-tdt-0.6b-v3-int8',
  language: 'auto',
  hotwords: [],
  autoPostProcess: false,
  vadThreshold: 0,
};

export const DEFAULT_SPEAKERS: SpeakerPreferences = {
  matchingMode: 'suggest',
  lockChannels: true,
};

export const DEFAULT_SUMMARY: SummaryPreferences = {
  defaultLlmProvider: 'ollama',
  defaultLlmModel: 'llama3.2:latest',
  autoGenerate: false,
  includeChapters: true,
  includeActionItems: true,
  defaultLanguage: 'auto',
  systemPrompt: '',
  defaultDetailTab: 'summary',
};

export const DEFAULT_EXPORT: ExportPreferences = {
  namePattern: '{title}_{date}',
  dateFormat: 'iso',
  includeYamlMetadata: false,
  inlineMetadata: false,
  autoExport: false,
};

export const DEFAULT_SHORTCUTS: ShortcutPreferences = {
  toggleRecording: '',
  captureScreen: '',
};

export const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  enabled: true,
  recordingStarted: true,
  recordingStopped: true,
  updateAvailable: true,
  updateInstalled: true,
  suppressDuringRecording: true,
};

export const DEFAULT_SETTINGS: AppSettings = {
  version: SETTINGS_VERSION,
  interface: DEFAULT_INTERFACE,
  recording: DEFAULT_RECORDING,
  transcription: DEFAULT_TRANSCRIPTION,
  speakers: DEFAULT_SPEAKERS,
  summary: DEFAULT_SUMMARY,
  export: DEFAULT_EXPORT,
  shortcuts: DEFAULT_SHORTCUTS,
  notifications: DEFAULT_NOTIFICATIONS,
};

// ─── Validation helpers (pure, no side-effects) ─────────────────────

const VALID_THEMES: Theme[] = ['system', 'light', 'dark'];
const VALID_SCALES: UiScale[] = ['80', '90', '100', '110', '120'];
const VALID_SIDEBAR: SidebarPreference[] = ['fixed', 'auto_hide'];
const VALID_FORMATS: AudioFormat[] = ['wav', 'mp3', 'ogg'];
const VALID_RETENTION: RetentionPolicy[] = ['never', '7d', '30d', '90d'];
const VALID_MATCHING: SpeakerMatchingMode[] = ['off', 'suggest', 'automatic'];
const VALID_DATE_FMT: ExportDateFormat[] = ['iso', 'local'];
const VALID_DETAIL_TAB: DefaultDetailTab[] = ['summary', 'transcript'];

function isValidEnum<T extends string>(value: unknown, valid: T[]): value is T {
  return typeof value === 'string' && (valid as string[]).includes(value);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── Section normalisers ────────────────────────────────────────────

export function normaliseInterface(raw: unknown): InterfacePreferences {
  if (!isPlainObject(raw)) return { ...DEFAULT_INTERFACE };
  return {
    theme: isValidEnum(raw.theme, VALID_THEMES) ? raw.theme : DEFAULT_INTERFACE.theme,
    uiScale: isValidEnum(raw.uiScale, VALID_SCALES) ? raw.uiScale : DEFAULT_INTERFACE.uiScale,
    language: typeof raw.language === 'string' ? raw.language : DEFAULT_INTERFACE.language,
    sidebarPreference: isValidEnum(raw.sidebarPreference, VALID_SIDEBAR)
      ? raw.sidebarPreference
      : DEFAULT_INTERFACE.sidebarPreference,
    startWithSystem: typeof raw.startWithSystem === 'boolean' ? raw.startWithSystem : DEFAULT_INTERFACE.startWithSystem,
    startHidden: typeof raw.startHidden === 'boolean' ? raw.startHidden : DEFAULT_INTERFACE.startHidden,
    consentAnalytics: typeof raw.consentAnalytics === 'boolean' ? raw.consentAnalytics : DEFAULT_INTERFACE.consentAnalytics,
  };
}

export function normaliseRecording(raw: unknown): RecordingPreferences {
  if (!isPlainObject(raw)) return { ...DEFAULT_RECORDING };
  return {
    saveAudio: typeof raw.saveAudio === 'boolean' ? raw.saveAudio : DEFAULT_RECORDING.saveAudio,
    saveLocation: typeof raw.saveLocation === 'string' ? raw.saveLocation : DEFAULT_RECORDING.saveLocation,
    audioFormat: isValidEnum(raw.audioFormat, VALID_FORMATS) ? raw.audioFormat : DEFAULT_RECORDING.audioFormat,
    namePattern: typeof raw.namePattern === 'string' && raw.namePattern.length > 0
      ? raw.namePattern
      : DEFAULT_RECORDING.namePattern,
    retention: isValidEnum(raw.retention, VALID_RETENTION) ? raw.retention : DEFAULT_RECORDING.retention,
  };
}

export function normaliseTranscription(raw: unknown): TranscriptionPreferences {
  if (!isPlainObject(raw)) return { ...DEFAULT_TRANSCRIPTION };
  const hotwords = Array.isArray(raw.hotwords)
    ? raw.hotwords.filter((w: unknown): w is string => typeof w === 'string')
    : DEFAULT_TRANSCRIPTION.hotwords;
  return {
    provider: typeof raw.provider === 'string' ? raw.provider : DEFAULT_TRANSCRIPTION.provider,
    model: typeof raw.model === 'string' ? raw.model : DEFAULT_TRANSCRIPTION.model,
    language: typeof raw.language === 'string' ? raw.language : DEFAULT_TRANSCRIPTION.language,
    hotwords,
    autoPostProcess: typeof raw.autoPostProcess === 'boolean' ? raw.autoPostProcess : DEFAULT_TRANSCRIPTION.autoPostProcess,
    vadThreshold: clampNumber(raw.vadThreshold, 0, 1, DEFAULT_TRANSCRIPTION.vadThreshold),
  };
}

export function normaliseSpeakers(raw: unknown): SpeakerPreferences {
  if (!isPlainObject(raw)) return { ...DEFAULT_SPEAKERS };
  return {
    matchingMode: isValidEnum(raw.matchingMode, VALID_MATCHING) ? raw.matchingMode : DEFAULT_SPEAKERS.matchingMode,
    lockChannels: typeof raw.lockChannels === 'boolean' ? raw.lockChannels : DEFAULT_SPEAKERS.lockChannels,
  };
}

export function normaliseSummary(raw: unknown): SummaryPreferences {
  if (!isPlainObject(raw)) return { ...DEFAULT_SUMMARY };
  return {
    defaultLlmProvider: typeof raw.defaultLlmProvider === 'string' ? raw.defaultLlmProvider : DEFAULT_SUMMARY.defaultLlmProvider,
    defaultLlmModel: typeof raw.defaultLlmModel === 'string' ? raw.defaultLlmModel : DEFAULT_SUMMARY.defaultLlmModel,
    autoGenerate: typeof raw.autoGenerate === 'boolean' ? raw.autoGenerate : DEFAULT_SUMMARY.autoGenerate,
    includeChapters: typeof raw.includeChapters === 'boolean' ? raw.includeChapters : DEFAULT_SUMMARY.includeChapters,
    includeActionItems: typeof raw.includeActionItems === 'boolean' ? raw.includeActionItems : DEFAULT_SUMMARY.includeActionItems,
    defaultLanguage: typeof raw.defaultLanguage === 'string' ? raw.defaultLanguage : DEFAULT_SUMMARY.defaultLanguage,
    systemPrompt: typeof raw.systemPrompt === 'string' ? raw.systemPrompt : DEFAULT_SUMMARY.systemPrompt,
    defaultDetailTab: isValidEnum(raw.defaultDetailTab, VALID_DETAIL_TAB)
      ? raw.defaultDetailTab
      : DEFAULT_SUMMARY.defaultDetailTab,
  };
}

export function normaliseExport(raw: unknown): ExportPreferences {
  if (!isPlainObject(raw)) return { ...DEFAULT_EXPORT };
  return {
    namePattern: typeof raw.namePattern === 'string' && raw.namePattern.length > 0
      ? raw.namePattern
      : DEFAULT_EXPORT.namePattern,
    dateFormat: isValidEnum(raw.dateFormat, VALID_DATE_FMT) ? raw.dateFormat : DEFAULT_EXPORT.dateFormat,
    includeYamlMetadata: typeof raw.includeYamlMetadata === 'boolean' ? raw.includeYamlMetadata : DEFAULT_EXPORT.includeYamlMetadata,
    inlineMetadata: typeof raw.inlineMetadata === 'boolean' ? raw.inlineMetadata : DEFAULT_EXPORT.inlineMetadata,
    autoExport: typeof raw.autoExport === 'boolean' ? raw.autoExport : DEFAULT_EXPORT.autoExport,
  };
}

export function normaliseShortcuts(raw: unknown): ShortcutPreferences {
  if (!isPlainObject(raw)) return { ...DEFAULT_SHORTCUTS };
  return {
    toggleRecording: typeof raw.toggleRecording === 'string' ? raw.toggleRecording : DEFAULT_SHORTCUTS.toggleRecording,
    captureScreen: typeof raw.captureScreen === 'string' ? raw.captureScreen : DEFAULT_SHORTCUTS.captureScreen,
  };
}

export function normaliseNotifications(raw: unknown): NotificationPreferences {
  if (!isPlainObject(raw)) return { ...DEFAULT_NOTIFICATIONS };
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_NOTIFICATIONS.enabled,
    recordingStarted: typeof raw.recordingStarted === 'boolean' ? raw.recordingStarted : DEFAULT_NOTIFICATIONS.recordingStarted,
    recordingStopped: typeof raw.recordingStopped === 'boolean' ? raw.recordingStopped : DEFAULT_NOTIFICATIONS.recordingStopped,
    updateAvailable: typeof raw.updateAvailable === 'boolean' ? raw.updateAvailable : DEFAULT_NOTIFICATIONS.updateAvailable,
    updateInstalled: typeof raw.updateInstalled === 'boolean' ? raw.updateInstalled : DEFAULT_NOTIFICATIONS.updateInstalled,
    suppressDuringRecording: typeof raw.suppressDuringRecording === 'boolean' ? raw.suppressDuringRecording : DEFAULT_NOTIFICATIONS.suppressDuringRecording,
  };
}

// ─── Top-level normalise/migrate ────────────────────────────────────

/**
 * Normalise raw settings from the store. Invalid fields fall back to
 * their individual defaults — the rest of the object is preserved.
 * Returns a complete, valid AppSettings.
 */
export function normaliseSettings(raw: unknown): AppSettings {
  if (!isPlainObject(raw)) return { ...DEFAULT_SETTINGS };

  const version = typeof raw.version === 'number' ? raw.version : 0;

  return {
    version: SETTINGS_VERSION,
    interface: normaliseInterface(raw.interface),
    recording: normaliseRecording(raw.recording),
    transcription: normaliseTranscription(raw.transcription),
    speakers: normaliseSpeakers(raw.speakers),
    summary: normaliseSummary(raw.summary),
    export: normaliseExport(raw.export),
    shortcuts: normaliseShortcuts(raw.shortcuts),
    notifications: normaliseNotifications(raw.notifications),
  };
}

// ─── Partial merge (for updateAppSettings) ──────────────────────────

/**
 * Merge a partial patch into existing settings. Only provided sections
 * are replaced (at section level), never merged field-by-field from
 * the patch — the caller is expected to send a complete section.
 */
export function mergeSettingsPatch(
  current: AppSettings,
  patch: Partial<AppSettings>,
): AppSettings {
  return {
    version: SETTINGS_VERSION,
    interface: patch.interface ? normaliseInterface(patch.interface) : current.interface,
    recording: patch.recording ? normaliseRecording(patch.recording) : current.recording,
    transcription: patch.transcription ? normaliseTranscription(patch.transcription) : current.transcription,
    speakers: patch.speakers ? normaliseSpeakers(patch.speakers) : current.speakers,
    summary: patch.summary ? normaliseSummary(patch.summary) : current.summary,
    export: patch.export ? normaliseExport(patch.export) : current.export,
    shortcuts: patch.shortcuts ? normaliseShortcuts(patch.shortcuts) : current.shortcuts,
    notifications: patch.notifications ? normaliseNotifications(patch.notifications) : current.notifications,
  };
}
