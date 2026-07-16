'use client';
import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface HotwordRule {
    value: string;
    regex: RegExp;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseHotwords(raw: string): { rules: HotwordRule[]; protectedSet: Set<string> } {
    // Wave 18 PR-55: a leading `!` on a token marks it as protected against
    // the postprocess chain. The prefix is stripped from the displayed value
    // but the original token is recorded in `protectedSet` so callers can
    // render it differently (underline + lock tooltip).
    const rules: HotwordRule[] = [];
    const protectedSet = new Set<string>();
    for (const token of raw.split(/[\r\n]+|\s{2,}/)) {
        const trimmed = token.trim();
        if (!trimmed) continue;
        const isProtected = trimmed.startsWith('!');
        const value = isProtected ? trimmed.replace(/^!\s*/, '').trim() : trimmed;
        if (!value) continue;
        rules.push({ value, regex: new RegExp(escapeRegExp(value), 'gi') });
        if (isProtected) protectedSet.add(value);
    }
    return { rules, protectedSet };
}

export interface HotwordResult {
    rules: HotwordRule[];
    protectedSet: Set<string>;
}

// Wave 18 PR-52: load the hotword string from Tauri Store (PR-50 plumbing)
// and parse it into per-word regex rules. Memoised by raw content so
// re-renders are cheap. Wave 18 PR-55 added the `protectedSet` so callers
// can distinguish user-marked protected terms from plain hotwords.
export function useHotwords(): HotwordResult {
    const [raw, setRaw] = useState<string>('');

    useEffect(() => {
        let active = true;
        invoke<string | null>('get_transcription_hotwords')
            .then((v) => {
                if (active) setRaw(v ?? '');
            })
            .catch(() => {
                if (active) setRaw('');
            });
        return () => {
            active = false;
        };
    }, []);

    return useMemo(() => parseHotwords(raw), [raw]);
}