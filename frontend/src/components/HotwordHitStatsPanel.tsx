'use client';

import { useTranslations } from 'next-intl';
import { useHotwordHitStats } from '@/hooks/useHotwordHitStats';

// Wave 22 / PR-A: shows per-hotword hit-rate so users can see which
// configured hotwords are carrying weight during ASR. Reads are live
// from the Rust-side hotword_hit_stats table via get_hotword_hit_stats.

const STALE_SECONDS = 30 * 24 * 60 * 60; // 30 days

function formatRelative(
    unixSeconds: string,
    t: (k: string, values?: Record<string, string | number>) => string
): string {
    const secs = Number(unixSeconds);
    if (!Number.isFinite(secs) || secs <= 0) return '-';
    const diff = Math.floor(Date.now() / 1000) - secs;
    if (diff < 0) return t('transcript.stats.just_now');
    if (diff < 60) return t('transcript.stats.relative_seconds', { count: diff });
    if (diff < 3600) return t('transcript.stats.relative_minutes', { count: Math.floor(diff / 60) });
    if (diff < 86400) return t('transcript.stats.relative_hours', { count: Math.floor(diff / 3600) });
    if (diff < 30 * 86400) return t('transcript.stats.relative_days', { count: Math.floor(diff / 86400) });
    return t('transcript.stats.relative_over_30_days');
}

export function HotwordHitStatsPanel() {
    const t = useTranslations();
    const { rows, loading, error, refresh } = useHotwordHitStats();

    const max = rows.reduce((m, r) => (r.hit_count > m ? r.hit_count : m), 0);
    const nowSeconds = Math.floor(Date.now() / 1000);

    return (
        <div className="space-y-2">
            <div className="flex items-baseline justify-between">
                <label className="text-sm font-medium text-gray-700">
                    {t('transcript.stats.title')}
                </label>
                <button
                    type="button"
                    onClick={refresh}
                    className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                    disabled={loading}
                >
                    {t('transcript.stats.refresh')}
                </button>
            </div>
            <p className="text-xs text-gray-500">{t('transcript.stats.description')}</p>

            {error ? (
                <p className="text-sm text-red-600">{error}</p>
            ) : loading ? (
                <p className="text-sm text-gray-500">{t('transcript.stats.loading')}
                </p>
            ) : rows.length === 0 ? (
                <p className="text-sm text-gray-500">{t('transcript.stats.empty')}</p>
            ) : (
                <div className="border border-gray-200 rounded-md overflow-hidden">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="text-left px-3 py-2 font-medium text-gray-600">
                                    {t('transcript.stats.column_hotword')}
                                </th>
                                <th className="text-right px-3 py-2 font-medium text-gray-600">
                                    {t('transcript.stats.column_hits')}
                                </th>
                                <th className="text-right px-3 py-2 font-medium text-gray-600">
                                    {t('transcript.stats.column_last_hit')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => {
                                const widthPct = max > 0 ? Math.max(2, (r.hit_count / max) * 100) : 0;
                                const lastSecs = Number(r.last_hit_at);
                                const isStale = Number.isFinite(lastSecs) && nowSeconds - lastSecs > STALE_SECONDS;
                                return (
                                    <tr key={r.hotword} className="border-t border-gray-100">
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-gray-800">{r.hotword}</span>
                                                {isStale && (
                                                    <span className="text-xs text-amber-600">
                                                        {t('transcript.stats.stale_hint')}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-1 h-1.5 bg-gray-100 rounded">
                                                <div
                                                    className="h-1.5 bg-blue-500 rounded"
                                                    style={{ width: `${widthPct}%` }}
                                                />
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                                            {r.hit_count}
                                        </td>
                                        <td className="px-3 py-2 text-right text-xs text-gray-500">
                                            {formatRelative(r.last_hit_at, t)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
