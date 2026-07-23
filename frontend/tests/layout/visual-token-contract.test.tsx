import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';

describe('visual token contract', () => {
  it('uses warm desktop surface and display heading utility', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toContain('--app-bg: 250 248 243');
    expect(css).toContain('--app-display-font:');
    expect(css).toContain('.app-display-heading');
  });
});
