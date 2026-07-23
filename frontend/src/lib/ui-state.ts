/**
 * Pure helpers for mapping errors and states to user-facing AppStatus models.
 * No side-effects, no React, safe to import anywhere.
 */

export type AppStatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type AppStatusKind = 'empty' | 'loading' | 'processing' | 'permission' | 'error' | 'offline';

export interface AppStatusModel {
  kind: AppStatusKind;
  tone: AppStatusTone;
  title: string;
  description?: string;
  action?: {
    label: string;
    onAction: () => void | Promise<void>;
  };
}

export interface AppToastInput {
  tone: Exclude<AppStatusTone, 'neutral'>;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

// ─── Path redaction ──────────────────────────────────────────────────

const WINDOWS_PATH = /[A-Z]:\\[^\s"']+\.?\w*/g;
const UNIX_PATH = /\/(?:Users|home|tmp|var|opt|etc)\/[^\s"']+\.?\w*/g;

/**
 * Replace absolute local paths in error messages with a generic label.
 */
export function redactLocalPaths(message: string): string {
  return message
    .replace(WINDOWS_PATH, 'the selected audio file')
    .replace(UNIX_PATH, 'the selected audio file');
}

// ─── Error → Status model ───────────────────────────────────────────

const PERMISSION_KEYWORDS = ['permission', 'denied', 'not allowed', 'unauthorized', 'access'];
const OFFLINE_KEYWORDS = ['offline', 'unavailable', 'network', 'fetch failed', 'connection'];
const DOWNLOAD_KEYWORDS = ['download', 'model not found', 'whisper', 'parakeet'];

function categoriseError(message: string): AppStatusKind {
  const lower = message.toLowerCase();
  if (PERMISSION_KEYWORDS.some((kw) => lower.includes(kw))) return 'permission';
  if (OFFLINE_KEYWORDS.some((kw) => lower.includes(kw))) return 'offline';
  if (DOWNLOAD_KEYWORDS.some((kw) => lower.includes(kw))) return 'error';
  return 'error';
}

/**
 * Convert an unknown error into a safe, user-facing AppStatusModel.
 * Never exposes raw paths, stack traces, or sensitive content.
 */
export function toAppStatusModel(error: unknown): AppStatusModel {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const safe = redactLocalPaths(raw);
  const kind = categoriseError(safe);

  return {
    kind,
    tone: kind === 'permission' ? 'warning' : 'danger',
    title: kind === 'permission' ? 'Permission required' : 'Something went wrong',
    description: safe,
  };
}
