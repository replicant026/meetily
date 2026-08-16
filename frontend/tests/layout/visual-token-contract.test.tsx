import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const globalsPath = path.resolve(__dirname, '../../src/app/globals.css');

describe('Visual token contract', () => {
  const css = readFileSync(globalsPath, 'utf8');

  it('defines --app-bg', () => {
    expect(css).toContain('--app-bg');
  });

  it('defines --app-surface', () => {
    expect(css).toContain('--app-surface');
  });

  it('defines --app-border', () => {
    expect(css).toContain('--app-border');
  });

  it('defines --app-fg', () => {
    expect(css).toContain('--app-fg');
  });

  it('defines --app-accent', () => {
    expect(css).toContain('--app-accent');
  });

  it('defines .app-display-heading', () => {
    expect(css).toContain('.app-display-heading');
  });

  it('defines .app-page', () => {
    expect(css).toContain('.app-page');
  });

  it('defines .app-surface', () => {
    expect(css).toContain('.app-surface');
  });

  it('defines dark theme overrides', () => {
    expect(css).toContain("[data-theme='dark']");
  });
});
