'use client';
import * as React from 'react';
import type { HotwordRule } from '@/hooks/useHotwords';

interface WrapResult {
    nodes: React.ReactNode[];
    matchedCount: number;
}

// Wave 18 PR-52: split `text` into plain and matched spans. Greedy
// leftmost-wins: at each position, pick the rule that matches earliest
// in the remaining text. The original hotword value is preserved on the
// `<mark>` so the click handler can copy it verbatim.
export function wrapHotwords(
    text: string,
    rules: HotwordRule[],
    onMatch: (value: string) => void,
): WrapResult {
    if (rules.length === 0 || text.length === 0) {
        return { nodes: [text], matchedCount: 0 };
    }

    const nodes: React.ReactNode[] = [];
    let matchedCount = 0;
    let cursor = 0;
    let key = 0;

    while (cursor < text.length) {
        let bestStart = -1;
        let bestLen = 0;
        let bestValue = '';
        for (const rule of rules) {
            // Anchor at cursor; case-insensitive (set on the regex).
            rule.regex.lastIndex = cursor;
            const m = rule.regex.exec(text);
            if (m && m.index >= cursor) {
                if (bestStart === -1 || m.index < bestStart || (m.index === bestStart && m[0].length > bestLen)) {
                    bestStart = m.index;
                    bestLen = m[0].length;
                    bestValue = rule.value;
                }
            }
        }

        if (bestStart === -1) {
            nodes.push(text.slice(cursor));
            break;
        }

        if (bestStart > cursor) {
            nodes.push(text.slice(cursor, bestStart));
        }
        const matched = text.slice(bestStart, bestStart + bestLen);
        const value = bestValue;
        nodes.push(
            React.createElement(
                'mark',
                {
                    key: `hw-${key++}`,
                    className: 'hotword-mark',
                    title: value,
                    onClick: () => onMatch(value),
                    style: { background: '#fef3c7', color: 'inherit', padding: '0 2px', borderRadius: 2, cursor: 'pointer' },
                },
                matched,
            ),
        );
        matchedCount += 1;
        cursor = bestStart + bestLen;
    }

    return { nodes, matchedCount };
}