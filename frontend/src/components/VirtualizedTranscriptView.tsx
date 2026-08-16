'use client';

import { useCallback, useRef, useReducer, startTransition, useEffect, useState, useMemo, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { useTranscriptStreaming } from "@/hooks/useTranscriptStreaming";
import { useHotwords, type HotwordRule } from "@/hooks/useHotwords";
// PR-42-iii: streaming LLM postprocess events.
import { useTranscriptPostprocessEvents } from "@/hooks/useTranscriptPostprocessEvents";
import { wrapHotwords } from "@/lib/wrapHotwords";
import { toast } from "sonner";
import { ConfidenceIndicator } from "./ConfidenceIndicator";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { RecordingStatusBar } from "./RecordingStatusBar";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, ChevronUp, Play, Search, X } from "lucide-react";
import { TranscriptSegmentData } from "@/types";
import { useTranslations } from "next-intl";
import { getSpeakerColor, buildSpeakerColorMap } from "@/lib/speaker-colors";

export interface VirtualizedTranscriptViewProps {
    /** Transcript segments to display */
    segments: TranscriptSegmentData[];
    /** Whether recording is in progress */
    isRecording?: boolean;
    /** Whether recording is paused */
    isPaused?: boolean;
    /** Whether processing/finalizing transcription */
    isProcessing?: boolean;
    /** Whether stopping */
    isStopping?: boolean;
    /** Enable streaming effect for latest segment */
    enableStreaming?: boolean;
    /** Show confidence indicators */
    showConfidence?: boolean;
    /** Completely disable auto-scroll behavior (for meeting details page) */
    disableAutoScroll?: boolean;

    // Pagination props (infinite scroll)
    hasMore?: boolean;
    isLoadingMore?: boolean;
    totalCount?: number;
    loadedCount?: number;
    onLoadMore?: () => void;
    /** Called when user clicks the timestamp button to jump audio playback */
    onTimestampClick?: (sec: number) => void;
    /** Seeks and starts the shared player at a transcript segment. */
    onPlayFromTimestamp?: (sec: number) => void;
    /** Shared player position, used to mark the segment currently playing. */
    currentAudioTime?: number;
    customSpeakerNames?: Record<string, string>;
    onSpeakerRename?: (speakerId: string, friendlyName: string) => void;
    onEnrollSpeaker?: (speakerId: string) => void;
    onSpeakerClick?: (speakerLabel: string, segmentIds: string[]) => void;
    transientSpeaker?: string | null;
}

// Threshold for enabling virtualization (below this, use simple rendering)
const VIRTUALIZATION_THRESHOLD = 10;

// Helper function to format seconds as recording-relative time [MM:SS]
function formatRecordingTime(seconds: number | undefined): string {
    if (seconds === undefined) return '[--:--]';

    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;

    return `[${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}]`;
}

// Helper function to remove filler words and repetitions
function cleanStopWords(text: string): string {
    const stopWords = ['uh', 'um', 'er', 'ah', 'hmm', 'hm', 'eh', 'oh'];

    let cleanedText = text;
    stopWords.forEach(word => {
        const pattern = new RegExp(`\\b${word}\\b[,\\s]*`, 'gi');
        cleanedText = cleanedText.replace(pattern, ' ');
    });

    return cleanedText.replace(/\s+/g, ' ').trim();
}

// Post-process ReactNode array to wrap search query matches in <mark> tags.
// Only touches plain-text nodes; existing React elements (hotword marks) pass through.
function applySearchHighlight(
    nodes: React.ReactNode[],
    query: string,
    keyPrefix: string,
): React.ReactNode[] {
    if (!query.trim()) return nodes;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const lower = query.toLowerCase();
    const result: React.ReactNode[] = [];
    let k = 0;
    for (const node of nodes) {
        if (typeof node !== 'string') { result.push(node); continue; }
        for (const part of node.split(regex)) {
            if (!part) continue;
            if (part.toLowerCase() === lower) {
                result.push(
                    <mark key={`${keyPrefix}-${k++}`} className="bg-yellow-200 text-inherit rounded-sm px-0.5">
                        {part}
                    </mark>
                );
            } else {
                result.push(part);
            }
        }
    }
    return result;
}

// Memoized transcript segment component
const TranscriptSegment = memo(function TranscriptSegment({
    id,
    timestamp,
    endTime,
    text,
    confidence,
    isStreaming,
    showConfidence,
    onTimestampClick,
    onPlayFromTimestamp,
    isActive,
    speaker,
    transientSpeaker,
    customSpeakerNames,
    onSpeakerRename,
    speakerColorMap,
    onEnrollSpeaker,
    onSpeakerClick,
    hotwords,
    protectedSet,
    postprocessFailed,
    postprocessFailedMessage,
    searchQuery,
    isSearchActive,
}: {
    id: string;
    timestamp: number;
    endTime?: number | null;
    text: string;
    confidence?: number;
    isStreaming: boolean;
    showConfidence: boolean;
    onTimestampClick?: (sec: number) => void;
    onPlayFromTimestamp?: (sec: number) => void;
    isActive: boolean;
    speaker?: string | null;
    transientSpeaker?: string | null;
    customSpeakerNames?: Record<string, string>;
    onSpeakerRename?: (speakerId: string, friendlyName: string) => void;
    speakerColorMap?: Map<string, import("@/lib/speaker-colors").SpeakerColor>;
    onEnrollSpeaker?: (speakerId: string) => void;
    onSpeakerClick?: (speakerLabel: string) => void;
    hotwords: HotwordRule[];
    protectedSet?: Set<string>;
    postprocessFailed?: boolean;
    postprocessFailedMessage?: string;
    searchQuery?: string;
    isSearchActive?: boolean;
}) {
    const t = useTranslations('settings.transcript');
    const handleHotwordCopy = useCallback((value: string) => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(value).then(() => {
                toast.success(t('hotword_copy_success', { value }));
            });
        }
    }, [t]);
    const displayText = cleanStopWords(text) || (text.trim() === '' ? '[Silence]' : text);
    const hotwordNodes = wrapHotwords(displayText, hotwords, handleHotwordCopy, protectedSet).nodes;
    const displayNodes = searchQuery ? applySearchHighlight(hotwordNodes, searchQuery, `sh-${id}`) : hotwordNodes;
    const customName = speaker ? customSpeakerNames?.[speaker] : undefined;
    const speakerColor = speaker ? (speakerColorMap?.get(speaker) ?? getSpeakerColor(speaker)) : null;
    const [isRenaming, setIsRenaming] = useState(false);
    const [draftName, setDraftName] = useState('');
    const openRename = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!onSpeakerRename) return;
        setDraftName(customName ?? '');
        setIsRenaming(true);
    };
    const commitRename = () => {
        const trimmed = draftName.trim();
        if (speaker && trimmed) {
            onSpeakerRename?.(speaker, trimmed);
            toast.success(t('speaker_renamed', { from: speaker, to: trimmed }));
        }
        setIsRenaming(false);
    };
    const cancelRename = () => setIsRenaming(false);
    const timeButton = (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onTimestampClick?.(timestamp);
            }}
            disabled={!onTimestampClick}
            className={
                "text-xs flex-shrink-0 min-w-[50px] text-right " +
                (onTimestampClick
                    ? "text-stone-500 hover:text-stone-900 hover:underline cursor-pointer"
                    : "text-gray-400 cursor-default")
            }
            aria-label={t('jump_to', { time: formatRecordingTime(timestamp) })}
        >
            {formatRecordingTime(timestamp)}
        </button>
    );

    return (
        <div
            id={`segment-${id}`}
            className={`group/segment mb-3 rounded-r-md border-l-2 px-2 py-1 transition-colors ${
                isActive ? 'border-blue-500 bg-blue-50 shadow-sm' : isSearchActive ? 'border-yellow-400 bg-yellow-50/50 shadow-sm' : 'border-transparent'
            }`}
            aria-current={isActive ? 'true' : undefined}
        >
            <div className="grid items-start gap-x-3" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
                {/* Column 1: Speaker identity */}
                <div className="min-w-0 pt-0.5">
                    {speaker && !isRenaming && (
                        <span className="inline-flex items-center gap-0.5 group/speaker">
                            <button
                                type="button"
                                onClick={(e) => {
                                    if (onSpeakerClick) {
                                        onSpeakerClick(speaker);
                                    } else {
                                        openRename(e);
                                    }
                                }}
                                className="inline-flex items-center gap-2 text-sm font-medium text-stone-800 cursor-pointer hover:text-stone-950"
                                title={onSpeakerClick ? t('speaker_assign_tooltip', { default: 'Click to assign this speaker to a person' }) : t('speaker_rename_placeholder')}
                            >
                                <span
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold"
                                    style={{
                                        backgroundColor: speakerColor?.backgroundColor ?? '#e7e5e4',
                                        color: speakerColor?.foregroundColor ?? '#44403c',
                                    }}
                                >
                                    {(customName ?? speaker).slice(0, 2).toUpperCase()}
                                </span>
                                <span className="max-w-28 truncate">{customName ?? speaker}</span>
                            </button>
                            {onSpeakerRename && (
                                <button
                                    type="button"
                                    onClick={openRename}
                                    className="opacity-0 group-hover/speaker:opacity-100 transition-opacity p-0.5 text-gray-400 hover:text-blue-600 rounded"
                                    title={t('speaker_rename_placeholder')}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                                </button>
                            )}
                            {onEnrollSpeaker && (
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onEnrollSpeaker(speaker); }}
                                    className="opacity-0 group-hover/speaker:opacity-100 transition-opacity p-0.5 text-gray-400 hover:text-green-600 rounded"
                                    title={t('save_voice_profile')}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                                </button>
                            )}
                        </span>
                    )}
                    {!speaker && transientSpeaker && !isRenaming && (
                        <span
                            className="text-xs font-medium text-gray-600 border border-dashed border-gray-400 px-2 py-0.5 rounded cursor-help"
                            title={t('transient_tooltip', { default: 'Realtime hint; will be re-clustered when the recording stops.' })}
                        >
                            {transientSpeaker}
                        </span>
                    )}
                    {speaker && isRenaming && (
                        <span className="inline-flex items-center gap-1">
                            <input
                                autoFocus
                                type="text"
                                value={draftName}
                                onChange={(e) => setDraftName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitRename();
                                    else if (e.key === 'Escape') cancelRename();
                                }}
                                placeholder={t('speaker_rename_placeholder')}
                                className="text-xs px-1.5 py-0.5 border border-blue-300 rounded w-28 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button type="button" onClick={commitRename} className="p-0.5 text-green-600 hover:text-green-800" title={t('speaker_rename_save')} aria-label={t('speaker_rename_save')}><Check size={14} /></button>
                            <button type="button" onClick={cancelRename} className="p-0.5 text-gray-500 hover:text-gray-700" title={t('speaker_rename_cancel')} aria-label={t('speaker_rename_cancel')}><X size={14} /></button>
                        </span>
                    )}
                </div>

                {/* Column 2: Transcript body text */}
                <div className="min-w-0">
                    {isStreaming ? (
                        <div className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-2">
                            <p className="text-[19px] text-stone-900 leading-8" style={{ fontFamily: 'var(--app-display-font, inherit)' }}>{displayNodes}{postprocessFailed ? (<span className="ml-1 inline-flex align-baseline text-amber-600" title={postprocessFailedMessage ?? ""} aria-label="LLM postprocess failed">⚠</span>) : null}</p>
                        </div>
                    ) : (
                        <p className="text-[19px] text-stone-900 leading-8" style={{ fontFamily: 'var(--app-display-font, inherit)' }}>{displayNodes}{postprocessFailed ? (<span className="ml-1 inline-flex align-baseline text-amber-600" title={postprocessFailedMessage ?? ""} aria-label="LLM postprocess failed">⚠</span>) : null}</p>
                    )}
                </div>

                {/* Column 3: Timestamp action */}
                <div className="pt-0.5">
                    {onPlayFromTimestamp && (
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onPlayFromTimestamp(timestamp);
                            }}
                            className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded text-blue-700 opacity-0 transition-opacity hover:bg-blue-100 focus:opacity-100 group-hover/segment:opacity-100"
                            title="Play from this segment"
                            aria-label={`Play from ${formatRecordingTime(timestamp)}`}
                        >
                            <Play size={14} fill="currentColor" />
                        </button>
                    )}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            {timeButton}
                        </TooltipTrigger>
                        <TooltipContent>
                            {confidence !== undefined && showConfidence && (
                                <ConfidenceIndicator confidence={confidence} showIndicator={showConfidence} />
                            )}
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
});

export const VirtualizedTranscriptView: React.FC<VirtualizedTranscriptViewProps> = ({
    segments,
    onTimestampClick,
    onPlayFromTimestamp,
    currentAudioTime,
    isRecording = false,
    isPaused = false,
    isProcessing = false,
    isStopping = false,
    enableStreaming = false,
    showConfidence = true,
    disableAutoScroll = false,
    hasMore = false,
    isLoadingMore = false,
    totalCount = 0,
    loadedCount = 0,
    onLoadMore,
    customSpeakerNames,
    onSpeakerRename,
    onEnrollSpeaker,
    onSpeakerClick,
}) => {
    const t = useTranslations('settings.transcript');
    // Wave 18 PR-52: shared hotword rules so every TranscriptSegment uses the same list.
    const { rules: hotwords, protectedSet } = useHotwords();
    // Build stable speaker→color map from segment order (prevents color reset on rename)
    const speakerColorMap = useMemo(() => buildSpeakerColorMap(segments), [segments]);
    const activeSegmentId = useMemo(() => {
        if (currentAudioTime === undefined) return undefined;
        return segments.find((segment, index) =>
            currentAudioTime >= segment.timestamp &&
            currentAudioTime < (segment.endTime ?? segments[index + 1]?.timestamp ?? Infinity)
        )?.id;
    }, [currentAudioTime, segments]);

    // Wrap onSpeakerClick to resolve segment IDs for the clicked label
    const handleSpeakerClick = useCallback((speakerLabel: string) => {
        if (!onSpeakerClick) return;
        const segmentIds = segments
            .filter((s) => s.speaker === speakerLabel)
            .map((s) => s.id);
        onSpeakerClick(speakerLabel, segmentIds);
    }, [onSpeakerClick, segments]);
    // Create scroll ref first - shared between virtualizer and auto-scroll hook
    const scrollRef = useRef<HTMLDivElement>(null);
    // Ref for infinite scroll trigger element
    const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

    // Force re-render without flushSync (avoids React warning)
    const [, rerender] = useReducer((x: number) => x + 1, 0);

    // Setup virtualizer for efficient rendering of large lists
    const virtualizer = useVirtualizer({
        count: segments.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => 60, // Estimated height per segment
        overscan: 10, // Render extra items above/below viewport
        onChange: () => {
            startTransition(() => {
                rerender();
            });
        },
    });

    // Custom hook for auto-scrolling (supports both virtualized and non-virtualized)
    useAutoScroll({
        scrollRef,
        segments,
        isRecording,
        isPaused,
        virtualizer,
        virtualizationThreshold: VIRTUALIZATION_THRESHOLD,
        disableAutoScroll,
    });

    // Streaming text effect hook (typewriter animation for new transcripts)
    const { streamingSegmentId, getDisplayText } = useTranscriptStreaming(
        segments,
        isRecording,
        enableStreaming
    );
    // PR-42-iii: streaming LLM postprocess; corrected text replaces the
    // streaming typewriter output once it arrives. Failed attempts fall
    // back to the original text plus an inline failure marker.
    const postprocess = useTranscriptPostprocessEvents(true);
    const resolveDisplayText = (segment: TranscriptSegmentData): string =>
        postprocess.getDisplayText(segment.id, getDisplayText(segment));

    // --- Transcript search ---
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeMatchIndex, setActiveMatchIndex] = useState(0);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Cmd/Ctrl+F → toggle search bar
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                e.stopPropagation();
                setSearchOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, []);

    // Escape → close search (only when open)
    useEffect(() => {
        if (!searchOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setSearchOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [searchOpen]);

    // Auto-focus input when search opens; clear state when it closes
    useEffect(() => {
        if (searchOpen) {
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
        } else {
            setSearchQuery('');
            setActiveMatchIndex(0);
        }
    }, [searchOpen]);

    // Matching segments (case-insensitive substring)
    const matchingSegments = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const lower = searchQuery.toLowerCase();
        return segments.filter(s => resolveDisplayText(s).toLowerCase().includes(lower));
    }, [searchQuery, segments, postprocess, getDisplayText]);

    // Reset active index when query changes
    useEffect(() => {
        setActiveMatchIndex(0);
    }, [searchQuery]);

    const goToNextMatch = useCallback(() => {
        if (matchingSegments.length === 0) return;
        setActiveMatchIndex(prev => (prev + 1) % matchingSegments.length);
    }, [matchingSegments.length]);

    const goToPrevMatch = useCallback(() => {
        if (matchingSegments.length === 0) return;
        setActiveMatchIndex(prev => (prev - 1 + matchingSegments.length) % matchingSegments.length);
    }, [matchingSegments.length]);

    // Scroll active match into view
    const activeSearchSegmentId = useMemo(() => {
        if (!searchOpen || !searchQuery.trim() || matchingSegments.length === 0) return undefined;
        return matchingSegments[Math.min(activeMatchIndex, matchingSegments.length - 1)]?.id;
    }, [searchOpen, searchQuery, activeMatchIndex, matchingSegments]);

    // Infinite scroll: IntersectionObserver to trigger loading more
    useEffect(() => {
        if (!onLoadMore || !hasMore || isLoadingMore || isRecording || segments.length === 0) {
            return;
        }

        const triggerElement = loadMoreTriggerRef.current;
        if (!triggerElement) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
                    onLoadMore();
                }
            },
            {
                root: null,
                rootMargin: '100px',
                threshold: 0,
            }
        );

        observer.observe(triggerElement);

        return () => observer.disconnect();
    }, [hasMore, isLoadingMore, onLoadMore, isRecording, segments.length]);

    // Scroll-based fallback for fast scrolling
    useEffect(() => {
        if (!onLoadMore || !hasMore || isLoadingMore || isRecording) return;

        const scrollElement = scrollRef.current;
        if (!scrollElement) return;

        let ticking = false;

        const handleScroll = () => {
            if (ticking || isLoadingMore || !hasMore) return;

            ticking = true;
            requestAnimationFrame(() => {
                const { scrollTop, scrollHeight, clientHeight } = scrollElement;
                const scrollBottom = scrollHeight - scrollTop - clientHeight;

                // Trigger load when within 200px of bottom
                if (scrollBottom < 200 && hasMore && !isLoadingMore) {
                    onLoadMore();
                }
                ticking = false;
            });
        };

        scrollElement.addEventListener('scroll', handleScroll, { passive: true });
        return () => scrollElement.removeEventListener('scroll', handleScroll);
    }, [onLoadMore, hasMore, isLoadingMore, isRecording]);

    // Use simple rendering for small lists, virtualization for large lists
    const useVirtualization = segments.length >= VIRTUALIZATION_THRESHOLD;

    // Scroll active search match into view
    useEffect(() => {
        if (!activeSearchSegmentId) return;
        if (useVirtualization) {
            const idx = segments.findIndex(s => s.id === activeSearchSegmentId);
            if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'center', behavior: 'auto' });
        } else {
            const el = document.getElementById(`segment-${activeSearchSegmentId}`);
            if (el) el.scrollIntoView({ block: 'center' });
        }
    }, [activeSearchSegmentId, useVirtualization, segments, virtualizer]);

    return (
        <div ref={scrollRef} className="flex flex-col h-full overflow-y-auto px-4 py-2">
            {/* Recording Status Bar - Sticky at top, always visible when recording */}
            <AnimatePresence>
                {isRecording && (
                    <div className="sticky top-0 z-10 bg-white pb-2">
                        <RecordingStatusBar isPaused={isPaused} />
                    </div>
                )}
            </AnimatePresence>

            {/* Transcript Search Bar */}
            <AnimatePresence>
                {searchOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.15 }}
                        className="sticky top-0 z-20 flex justify-end py-2 pointer-events-none"
                    >
                        <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-sm shadow-lg border border-gray-200 rounded-full px-3 py-1.5 pointer-events-auto">
                            <Search size={14} className="text-gray-400 flex-shrink-0" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); goToNextMatch(); }
                                    else if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); goToPrevMatch(); }
                                }}
                                placeholder="Search transcript..."
                                className="w-40 text-sm bg-transparent border-none outline-none text-gray-800 placeholder-gray-400"
                            />
                            {searchQuery.trim() && (
                                <span className="text-xs text-gray-500 whitespace-nowrap tabular-nums select-none">
                                    {matchingSegments.length > 0
                                        ? `${Math.min(activeMatchIndex + 1, matchingSegments.length)} of ${matchingSegments.length}`
                                        : 'No matches'}
                                </span>
                            )}
                            {searchQuery.trim() && matchingSegments.length > 0 && (
                                <>
                                    <button onClick={goToPrevMatch} className="p-0.5 text-gray-400 hover:text-gray-700 rounded transition-colors" aria-label="Previous match">
                                        <ChevronUp size={14} />
                                    </button>
                                    <button onClick={goToNextMatch} className="p-0.5 text-gray-400 hover:text-gray-700 rounded transition-colors" aria-label="Next match">
                                        <ChevronDown size={14} />
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => setSearchOpen(false)}
                                className="p-0.5 text-gray-400 hover:text-gray-700 rounded transition-colors ml-0.5"
                                aria-label="Close search"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Content - add padding when recording to prevent overlap */}
            <div className={isRecording ? 'pt-2' : ''}>
            {segments.length === 0 ? (
                // Empty state
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center text-gray-500 mt-8"
                >
                    {isRecording ? (
                        <>
                            <div className="flex items-center justify-center mb-3">
                                <div className={`w-3 h-3 rounded-full ${isPaused ? 'bg-orange-500' : 'bg-blue-500 animate-pulse'}`}></div>
                            </div>
                            <p className="text-sm text-gray-600">
                                {isPaused ? t('recording_paused') : t('listening_for_speech')}
                            </p>
                            <p className="text-xs mt-1 text-gray-400">
                                {isPaused ? t('click_resume') : t('speak_to_see')}
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="text-lg font-semibold">{t('welcome')}</p>
                            <p className="text-xs mt-1">{t('start_recording_hint')}</p>
                        </>
                    )}
                </motion.div>
            ) : useVirtualization ? (
                // Virtualized rendering for large lists
                <>
                    <div
                        style={{
                            height: virtualizer.getTotalSize(),
                            width: "100%",
                            position: "relative",
                        }}
                    >
                        {virtualizer.getVirtualItems().map((virtualRow) => {
                            const segment = segments[virtualRow.index];
                            const isStreaming = streamingSegmentId === segment.id;

                            return (
                                <div
                                    key={segment.id}
                                    data-index={virtualRow.index}
                                    ref={virtualizer.measureElement}
                                    style={{
                                        position: "absolute",
                                        top: 0,
                                        left: 0,
                                        width: "100%",
                                        transform: `translateY(${virtualRow.start}px)`,
                                    }}
                                >
                                    <TranscriptSegment
                                        id={segment.id}
                                        timestamp={segment.timestamp}
                                        endTime={segment.endTime}
                                        text={resolveDisplayText(segment)}
                                        confidence={segment.confidence}
                                        postprocessFailed={postprocess.hasFailed(segment.id)}
                                        postprocessFailedMessage={postprocess.getFailedMessage(segment.id)}
                                        isStreaming={isStreaming}
                                        showConfidence={showConfidence}
                                        speaker={segment.speaker}
                                        transientSpeaker={segment.transient_speaker ?? undefined}
                                        customSpeakerNames={customSpeakerNames}
                                        onSpeakerRename={onSpeakerRename}
                                        speakerColorMap={speakerColorMap}
                                        onEnrollSpeaker={onEnrollSpeaker}
                                        onSpeakerClick={handleSpeakerClick}
                                        onTimestampClick={onTimestampClick}
                                        onPlayFromTimestamp={onPlayFromTimestamp}
                                        isActive={segment.id === activeSegmentId}
                                        hotwords={hotwords}
                                        protectedSet={protectedSet}
                                        searchQuery={searchOpen ? searchQuery : undefined}
                                        isSearchActive={segment.id === activeSearchSegmentId}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* Infinite scroll trigger and loading indicator */}
                    {(hasMore || isLoadingMore) && !isRecording && segments.length > 0 && (
                        <div ref={loadMoreTriggerRef} className="flex justify-center items-center py-4 mt-2">
                            {isLoadingMore ? (
                                <div className="flex items-center gap-2 text-gray-500">
                                    <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                                    <span className="text-sm">{t('loading_more')}</span>
                                </div>
                            ) : hasMore && totalCount > 0 ? (
                                <span className="text-sm text-gray-400">
                                    {t('showing_segments', { loaded: loadedCount, total: totalCount })}
                                </span>
                            ) : null}
                        </div>
                    )}

                    {/* Listening indicator when recording */}
                    {!isStopping && isRecording && !isPaused && !isProcessing && segments.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-2 mt-4 text-gray-500"
                        >
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            <span className="text-sm">{t('listening')}</span>
                        </motion.div>
                    )}
                </>
            ) : (
                // Simple rendering for small lists (better animations)
                <>
                    <div className="space-y-1">
                        {segments.map((segment) => {
                            const isStreaming = streamingSegmentId === segment.id;

                            return (
                                <motion.div
                                    key={segment.id}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.15 }}
                                >
                                    <TranscriptSegment
                                        id={segment.id}
                                        timestamp={segment.timestamp}
                                        endTime={segment.endTime}
                                        text={resolveDisplayText(segment)}
                                        confidence={segment.confidence}
                                        postprocessFailed={postprocess.hasFailed(segment.id)}
                                        postprocessFailedMessage={postprocess.getFailedMessage(segment.id)}
                                        isStreaming={isStreaming}
                                        showConfidence={showConfidence}
                                        speaker={segment.speaker}
                                        transientSpeaker={segment.transient_speaker ?? undefined}
                                        customSpeakerNames={customSpeakerNames}
                                        onSpeakerRename={onSpeakerRename}
                                        speakerColorMap={speakerColorMap}
                                        onEnrollSpeaker={onEnrollSpeaker}
                                        onSpeakerClick={handleSpeakerClick}
                                        onTimestampClick={onTimestampClick}
                                        onPlayFromTimestamp={onPlayFromTimestamp}
                                        isActive={segment.id === activeSegmentId}
                                        hotwords={hotwords}
                                        searchQuery={searchOpen ? searchQuery : undefined}
                                        isSearchActive={segment.id === activeSearchSegmentId}
                                        protectedSet={protectedSet}
                                    />
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Infinite scroll trigger (for small lists that grow) */}
                    {(hasMore || isLoadingMore) && !isRecording && segments.length > 0 && (
                        <div ref={loadMoreTriggerRef} className="flex justify-center items-center py-4 mt-2">
                            {isLoadingMore ? (
                                <div className="flex items-center gap-2 text-gray-500">
                                    <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                                    <span className="text-sm">{t('loading_more')}</span>
                                </div>
                            ) : hasMore && totalCount > 0 ? (
                                <span className="text-sm text-gray-400">
                                    {t('showing_segments', { loaded: loadedCount, total: totalCount })}
                                </span>
                            ) : null}
                        </div>
                    )}

                    {/* Listening indicator when recording */}
                    {!isStopping && isRecording && !isPaused && !isProcessing && segments.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-2 mt-4 text-gray-500"
                        >
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            <span className="text-sm">{t('listening')}</span>
                        </motion.div>
                    )}
                </>
            )}
            </div>
        </div>
    );
};
