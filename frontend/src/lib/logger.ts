/// Production-safe logger. Suppresses all output in production builds.
/// Zero-cost when NODE_ENV === 'production' — calls are dead-code eliminated.

const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  log: (...args: unknown[]) => { if (isDev) console.log(...args); },
  error: (...args: unknown[]) => { if (isDev) console.error(...args); },
  warn: (...args: unknown[]) => { if (isDev) console.warn(...args); },
  debug: (...args: unknown[]) => { if (isDev) console.debug(...args); },
};
