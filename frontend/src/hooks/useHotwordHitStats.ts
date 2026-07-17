'use client';

import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface HotwordHit {
    hotword: string;
    hit_count: number;
    last_hit_at: string;
}

export interface UseHotwordHitStatsResult {
    rows: HotwordHit[];
    loading: boolean;
    error: string | null;
    refresh: () => void;
}

// Wave 22 / PR-A: pulls per-hotword hit counts from the Rust-side
// hotword_hit_stats table so the settings UI can show which hotwords
// are carrying weight.
export function useHotwordHitStats(): UseHotwordHitStatsResult {
    const [rows, setRows] = useState<HotwordHit[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [nonce, setNonce] = useState<number>(0);

    useEffect(() => {
        let active = true;
        setLoading(true);
        invoke<HotwordHit[]>('get_hotword_hit_stats')
            .then((v) => {
                if (!active) return;
                setRows(v ?? []);
                setError(null);
            })
            .catch((e: unknown) => {
                if (!active) return;
                setRows([]);
                setError(typeof e === 'string' ? e : 'Failed to load hotword statistics');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [nonce]);

    const refresh = useCallback(() => setNonce((n) => n + 1), []);

    return { rows, loading, error, refresh };
}
