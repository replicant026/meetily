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

function parseHotwords(raw: string): HotwordRule[] {
    return raw
        .split(/[\r\n]+|\s{2,}/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((value) => ({ value, regex: new RegExp(escapeRegExp(value), 'gi') }));
}

// Wave 18 PR-52: load the hotword string from Tauri Store (PR-50 plumbing)
// and parse it into per-word regex rules. Memoised by raw content so
// re-renders are cheap.
export function useHotwords(): HotwordRule[] {
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