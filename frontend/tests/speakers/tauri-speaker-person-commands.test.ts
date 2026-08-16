import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Tauri speaker person commands', () => {
  it('registers the person-creation command used by the frontend', () => {
    const source = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');

    expect(source).toMatch(/async fn create_speaker_person\s*\(/);
    expect(source).toMatch(/invoke_handler\([\s\S]*?create_speaker_person,/);
    expect(source).toMatch(/async fn list_speaker_voice_references\s*\(/);
    expect(source).toMatch(/invoke_handler\([\s\S]*?list_speaker_voice_references,/);
  });
});
