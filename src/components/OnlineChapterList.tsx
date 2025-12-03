import React, { useState, useEffect, useRef } from 'react';
import { MangaPillService } from '../services/MangaPillService';
import type { MangaPillChapter } from '../services/MangaPillService';
import { WebtoonService } from '../services/WebtoonService';
import type { WebtoonChapter } from '../services/WebtoonService';
import type { Manga } from '../services/StorageService';
import { Check, RefreshCw, ChevronDown, Loader2, Download, Settings, X, Lock, Search, ExternalLink } from 'lucide-react';
import { StorageService } from '../services/StorageService';
import { ArenaScansService } from '../services/ArenaScansService';

export interface OnlineViewState {
    selectedBatch: number;
    currentMangaId: string | null;
    webtoonMaxPage: number;
    webtoonMangaUrl: string | undefined;
    source: 'mangapill' | 'webtoon' | 'arenascans';
}

interface OnlineChapterListProps {
    mangaTitle: string;
    currentManga: Manga;
    cachedChapters?: (MangaPillChapter | WebtoonChapter)[];
    onCacheUpdate?: (chapters: (MangaPillChapter | WebtoonChapter)[]) => void;
    // View State
    viewState: OnlineViewState;
    onViewStateChange: (newState: Partial<OnlineViewState>) => void;
    // Download props
    downloadQueue: string[];
    activeDownloads: string[];
    downloadProgress: Record<string, number>;
    onQueueDownload: (chapter: any, mangaTitle: string, source: 'mangapill' | 'webtoon' | 'arenascans', mangaId?: string) => void;
    onUpdateManga: (updatedManga: Manga) => void;
}

export const OnlineChapterList: React.FC<OnlineChapterListProps> = ({
    mangaTitle,
    currentManga,
    cachedChapters = [],
    onCacheUpdate,
    viewState,
    onViewStateChange,
    downloadQueue,
    activeDownloads,
    downloadProgress,
    onQueueDownload,
    onUpdateManga
}) => {
    const [chapters, setChapters] = useState<(MangaPillChapter | WebtoonChapter)[]>(cachedChapters);
    const [loading, setLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [lockedCount, setLockedCount] = useState(0);
    const [showUnlockDialog, setShowUnlockDialog] = useState(false);
    const [unlockChapter, setUnlockChapter] = useState<WebtoonChapter | null>(null);

    // Destructure view state for easier access
    const { selectedBatch, currentMangaId, webtoonMaxPage, source } = viewState;

    const [visibleCount, setVisibleCount] = useState(20);
    const observerTarget = useRef(null);
    const sourceRef = useRef(source);

    const [isBatchDropdownOpen, setIsBatchDropdownOpen] = useState(false);
    const batchDropdownRef = useRef<HTMLDivElement>(null);

    // Batch Size Logic
    const [batchSize, setBatchSize] = useState<number>(currentManga.preferredBatchSize || 100);
    const [showBatchPrompt, setShowBatchPrompt] = useState(false);
    const [tempBatchSize, setTempBatchSize] = useState<string>('100');

    // Initialize source if not set (first load)
    useEffect(() => {
        if (!viewState.source) {
            const isWebtoonType = currentManga.type === 'Manhwa' ||
                currentManga.type === 'Manhua' ||
                currentManga.genres?.some(g => g.toLowerCase() === 'webtoon');
            onViewStateChange({ source: isWebtoonType ? 'webtoon' : 'mangapill' });
        }
    }, []);

    // Check for preferred batch size on mount/manga change
    useEffect(() => {
        if (currentManga.preferredBatchSize) {
            setBatchSize(currentManga.preferredBatchSize);
        } else {
            // If not set, show prompt
            setTempBatchSize('100');
            setShowBatchPrompt(true);
        }
    }, [currentManga.id]);

    const handleSaveBatchSize = async () => {
        const size = parseInt(tempBatchSize);
        if (!isNaN(size) && size > 0) {
            setBatchSize(size);
            setShowBatchPrompt(false);

            // Save to manga
            const updatedManga = { ...currentManga, preferredBatchSize: size };

            // Update storage
            const library = await StorageService.loadLibrary();
            const newLibrary = library.map(m => m.id === currentManga.id ? updatedManga : m);
            await StorageService.saveLibrary(newLibrary);

            onUpdateManga(updatedManga);

            // Reset batch selection to 0 when size changes
            onViewStateChange({ selectedBatch: 0 });
        }
    };

    const isWebtoon = source === 'webtoon';
    useEffect(() => {
        sourceRef.current = source;
        if (chapters.length === 0 && !showBatchPrompt) {
            loadChapters();
        }
    }, [source, showBatchPrompt]);

    useEffect(() => {
        if (onCacheUpdate && chapters.length > 0) {
            onCacheUpdate(chapters);
        }
    }, [chapters]);

    // Reset visible count when chapters change or batch changes
    useEffect(() => {
        setVisibleCount(20);
    }, [chapters, selectedBatch]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (batchDropdownRef.current && !batchDropdownRef.current.contains(event.target as Node)) {
                setIsBatchDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadChapters = async (retryCount = 0, queryOverride?: string) => {
        const currentSource = source;
        setLoading(true);
        setLoadingProgress('');
        setError(null);
        setLockedCount(0); // Reset locked count

        // Only reset chapters if we are changing source or don't have them
        if (currentSource !== sourceRef.current) {
            setChapters([]);
        }

        setVisibleCount(20);

        // Prepare list of titles to search
        // If queryOverride is present, use ONLY that.
        // Otherwise, use mangaTitle + alternativeTitles
        let searchQueries = [mangaTitle];
        if (queryOverride) {
            searchQueries = [queryOverride];
        } else {
            // Check if we have alternative titles
            let alts = currentManga.alternativeTitles || [];

            // If no alternative titles, try to fetch them on the fly (for existing library items)
            if (alts.length === 0) {
                try {
                    console.log(`[SmartFallback] No alternative titles found. Fetching from Jikan...`);
                    const { MangaService } = await import('../services/MangaService');
                    const metadata = await MangaService.searchManga(mangaTitle);
                    if (metadata.length > 0 && metadata[0].alternativeTitles) {
                        alts = metadata[0].alternativeTitles;
                        console.log(`[SmartFallback] Found alternatives:`, alts);

                        // Persist to storage for future use
                        const updatedManga = { ...currentManga, alternativeTitles: alts };
                        StorageService.saveManga(updatedManga); // Fire and forget
                        onUpdateManga(updatedManga);
                    }
                } catch (e) {
                    console.warn(`[SmartFallback] Failed to fetch alternatives`, e);
                }
            }

            if (alts.length > 0) {
                const uniqueAlts = alts.filter(t => t.toLowerCase() !== mangaTitle.toLowerCase());
                searchQueries = [...searchQueries, ...uniqueAlts];
            }
        }

        try {
            let foundChapters = false;

            for (const query of searchQueries) {
                if (sourceRef.current !== currentSource) return;

                // Update loading progress to show what we are searching
                if (searchQueries.length > 1) {
                    setLoadingProgress(`Searching for "${query}"...`);
                }

                if (currentSource === 'mangapill') {
                    console.log(`Searching MangaPill for: ${query}`);
                    const searchResults = await MangaPillService.searchManga(query);

                    if (searchResults.length > 0) {
                        const manga = searchResults[0];
                        const slug = manga.url.split('/').pop() || '';
                        const chapterList = await MangaPillService.getChapters(manga.id, slug);

                        // Sort ascending
                        chapterList.sort((a, b) => parseFloat(a.number) - parseFloat(b.number));
                        setChapters(chapterList);
                        foundChapters = true;
                        break; // Found it!
                    }
                } else if (currentSource === 'arenascans') {
                    console.log(`Searching ArenaScans for: ${query}`);
                    const searchResults = await ArenaScansService.search(query);

                    if (searchResults.length > 0) {
                        const manga = searchResults[0];
                        const chapterListRaw = await ArenaScansService.getChapters(manga.slug);

                        const chapterList: WebtoonChapter[] = chapterListRaw.map(ch => ({
                            id: ch.id,
                            title: ch.title,
                            date: '',
                            url: ch.url
                        }));

                        chapterList.sort((a, b) => {
                            const numA = parseFloat(a.title.match(/Chapter\s+(\d+(\.\d+)?)/i)?.[1] || '0');
                            const numB = parseFloat(b.title.match(/Chapter\s+(\d+(\.\d+)?)/i)?.[1] || '0');
                            return numA - numB;
                        });

                        setChapters(chapterList);
                        foundChapters = true;
                        break; // Found it!
                    }
                } else {
                    // Webtoon Logic
                    const searchResults = await WebtoonService.searchManga(query);

                    if (searchResults.length > 0) {
                        const firstResult = searchResults[0];
                        onViewStateChange({
                            currentMangaId: firstResult.id,
                            webtoonMangaUrl: firstResult.url
                        });

                        const { WebtoonMobileService } = await import('../services/WebtoonMobileService');
                        const episodes = await WebtoonMobileService.getChapters(firstResult.id);

                        if (episodes.length > 0) {
                            const chapterList: WebtoonChapter[] = episodes.map(ep => ({
                                id: ep.episodeNo.toString(),
                                title: ep.episodeTitle,
                                date: new Date(ep.exposureDateMillis).toLocaleDateString(),
                                url: ep.viewerLink
                            }));

                            chapterList.sort((a, b) => parseInt(a.id) - parseInt(b.id));

                            // Check for locked chapters
                            const locked = await WebtoonMobileService.getLockedChapterCount(firstResult.id);
                            setLockedCount(locked);

                            // HYBRID: If locked chapters exist, try to find them on ArenaScans
                            if (locked > 0) {
                                setLoadingProgress('Checking ArenaScans for locked chapters...');
                                try {
                                    // Prepare queries for ArenaScans (Title + Alternatives)
                                    // Use searchQueries (includes on-the-fly alternatives)
                                    const arenaQueries = [...new Set(searchQueries)];

                                    for (const arenaQuery of arenaQueries) {
                                        console.log(`[Hybrid] Searching ArenaScans for: ${arenaQuery}`);
                                        const arenaResults = await ArenaScansService.search(arenaQuery);

                                        if (arenaResults.length > 0) {
                                            const arenaManga = arenaResults[0];
                                            const arenaChaptersRaw = await ArenaScansService.getChapters(arenaManga.slug);

                                            // Create a map of Arena chapters by number
                                            const arenaMap = new Map<number, any>();
                                            arenaChaptersRaw.forEach(ch => {
                                                const match = ch.title.match(/Chapter\s+(\d+(\.\d+)?)/i);
                                                if (match) {
                                                    arenaMap.set(parseFloat(match[1]), ch);
                                                }
                                            });

                                            // We have the last Webtoon chapter number
                                            const lastWebtoonCh = chapterList[chapterList.length - 1];
                                            const lastWebtoonNum = parseInt(lastWebtoonCh.id);

                                            // Find max chapter in ArenaScans
                                            let maxArenaNum = 0;
                                            for (const num of arenaMap.keys()) {
                                                if (num > maxArenaNum) maxArenaNum = num;
                                            }

                                            // We want to cover at least up to the locked chapters, or further if Arena has more
                                            const targetEnd = Math.max(lastWebtoonNum + locked, maxArenaNum);
                                            let foundLockedCount = 0;

                                            // Append chapters from ArenaScans
                                            for (let i = lastWebtoonNum + 1; i <= targetEnd; i++) {
                                                const arenaCh = arenaMap.get(i);
                                                if (arenaCh) {
                                                    // Found on ArenaScans! Add as a valid chapter
                                                    chapterList.push({
                                                        id: `AS_${arenaCh.id}`, // Mark as ArenaScans source
                                                        title: `Episode ${i}`, // Keep consistent naming
                                                        date: 'ArenaScans',
                                                        url: arenaCh.url
                                                    });

                                                    // If this was one of the locked chapters, count it as found
                                                    if (i <= lastWebtoonNum + locked) {
                                                        foundLockedCount++;
                                                    }
                                                }
                                            }

                                            // Reduce the locked count by the number of locked chapters we found
                                            // This prevents double rendering (once as unlocked, once as locked placeholder)
                                            // If we found extra chapters beyond the locked range, they are just added to the list
                                            setLockedCount(Math.max(0, locked - foundLockedCount));

                                            break; // Found matches, stop searching alternatives
                                        }
                                    }
                                } catch (e) {
                                    console.error("[Hybrid] Failed to fetch ArenaScans chapters", e);
                                }
                            }

                            setChapters(chapterList);
                            foundChapters = true;
                            break; // Found it!
                        }
                    }
                }
            }

            if (!foundChapters) {
                if (retryCount < 1 && !queryOverride && searchQueries.length === 1) {
                    // Only retry if we didn't try alternatives already
                    console.log("Manga not found, retrying in 1s...");
                    setTimeout(() => loadChapters(retryCount + 1), 1000);
                    return;
                }
                setError(`Manga not found on ${currentSource === 'arenascans' ? 'ArenaScans' : currentSource === 'mangapill' ? 'MangaPill' : 'Webtoon'}.`);
            }

            setLoading(false);

        } catch (err) {
            console.error(err);
            if (sourceRef.current === currentSource) {
                setError("Failed to load chapters.");
                setLoading(false);
            }
        }
    };

    // Handle Batch Selection for Webtoon
    const prevBatchRef = useRef(selectedBatch);
    const prevBatchSizeRef = useRef(batchSize);

    useEffect(() => {
        // Just trigger re-render or reset visible count if batch changes
        if (source === 'webtoon' && chapters.length > 0) {
            const isBatchChanged = prevBatchRef.current !== selectedBatch;
            if (isBatchChanged) {
                setVisibleCount(20);
            }
            prevBatchRef.current = selectedBatch;
            prevBatchSizeRef.current = batchSize;
        }
    }, [selectedBatch, batchSize, chapters.length]);

    const handleDownload = (chapter: MangaPillChapter | WebtoonChapter) => {
        if (downloadQueue.includes(chapter.id) || activeDownloads.includes(chapter.id)) return;

        let downloadSource = source;
        // Check if it's a hybrid chapter from ArenaScans
        if (source === 'webtoon' && chapter.id.startsWith('AS_')) {
            downloadSource = 'arenascans';
            // We need to clean the ID if necessary, but App.tsx handles arenascans download using the chapter object properties
            // The ID 'AS_...' is unique so it's fine for queue tracking
        }

        onQueueDownload(chapter, mangaTitle, downloadSource, currentMangaId || undefined);
    };



    // Append Locked Chapters if Webtoon
    const allChaptersWithLocked = [...chapters];
    if (source === 'webtoon' && lockedCount > 0 && chapters.length > 0) {
        const lastChapter = chapters[chapters.length - 1];
        const lastNum = parseInt(lastChapter.id);

        for (let i = 1; i <= lockedCount; i++) {
            const lockedNum = lastNum + i;
            allChaptersWithLocked.push({
                id: `LOCKED_${lockedNum}`,
                title: `Episode ${lockedNum}`,
                date: 'App Only',
                url: 'LOCKED'
            } as WebtoonChapter);
        }
    }

    // Re-calculate batches with locked chapters
    let displayBatches: { index: number, label: string }[] = [];
    if (allChaptersWithLocked.length > 0) {
        const totalBatches = Math.ceil(allChaptersWithLocked.length / batchSize);
        displayBatches = Array.from({ length: totalBatches }, (_, i) => {
            const start = i * batchSize;
            const end = Math.min((i + 1) * batchSize - 1, allChaptersWithLocked.length - 1);

            let label = '';
            const startCh = allChaptersWithLocked[start];
            const endCh = allChaptersWithLocked[end];

            if (source === 'mangapill') {
                label = `${(startCh as MangaPillChapter).number} - ${(endCh as MangaPillChapter).number}`;
            } else {
                // Webtoon or ArenaScans
                const sTitle = startCh.title.replace('Episode ', '').replace('Chapter ', '');
                const eTitle = endCh.title.replace('Episode ', '').replace('Chapter ', '');
                label = `${sTitle} - ${eTitle}`;
            }
            return { index: i, label };
        });
    }

    const getBatchChaptersWithLocked = () => {
        if (allChaptersWithLocked.length <= batchSize * 1.5) return allChaptersWithLocked;
        const start = selectedBatch * batchSize;
        const end = start + batchSize;
        return allChaptersWithLocked.slice(start, end);
    };

    const batchChaptersWithLocked = getBatchChaptersWithLocked();
    const displayedChaptersWithLocked = batchChaptersWithLocked.slice(0, visibleCount);

    const loadMore = async () => {
        if (visibleCount < batchChaptersWithLocked.length) {
            setVisibleCount(prev => Math.min(prev + 20, batchChaptersWithLocked.length));
        }
    };

    // Infinite Scroll Observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting) {
                    const canLoadMore = visibleCount < batchChaptersWithLocked.length;
                    if (canLoadMore && !loading) {
                        loadMore();
                    }
                }
            },
            { threshold: 0.5 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => {
            if (observerTarget.current) {
                observer.unobserve(observerTarget.current);
            }
        };
    }, [observerTarget, visibleCount, batchChaptersWithLocked.length, loading]);

    const handleUnlockClick = (chapter: WebtoonChapter) => {
        setUnlockChapter(chapter);
        setShowUnlockDialog(true);
    };

    const switchToSource = (newSource: 'arenascans' | 'mangapill') => {
        onViewStateChange({ source: newSource });
        setShowUnlockDialog(false);
    };

    console.log('[OnlineChapterList] Render. Read Chapters:', currentManga.readChapters);

    return (
        <div className="flex flex-col h-full relative">
            {/* Batch Size Prompt Modal */}
            {showBatchPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-[#1f1f1f] rounded-lg shadow-2xl max-w-sm w-full p-6 border border-[#333] relative">
                        <button
                            onClick={() => setShowBatchPrompt(false)}
                            className="absolute top-2 right-2 text-gray-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
                        >
                            <X size={20} />
                        </button>
                        <h3 className="text-lg font-bold text-white mb-2">Batch Size</h3>
                        <p className="text-gray-400 mb-4 text-sm">
                            How many chapters do you want to load per batch? (1-500)
                        </p>
                        <input
                            type="number"
                            value={tempBatchSize}
                            onChange={(e) => setTempBatchSize(e.target.value)}
                            className="w-full bg-[#141414] text-white border border-[#333] rounded p-3 mb-4 focus:border-blue-500 focus:outline-none"
                            min="1"
                            max="500"
                        />
                        <button
                            onClick={handleSaveBatchSize}
                            className="w-full py-3 rounded bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20"
                        >
                            Confirm
                        </button>
                    </div>
                </div>
            )}

            {/* Unlock Dialog */}
            {showUnlockDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-[#1f1f1f] rounded-lg shadow-2xl max-w-sm w-full p-6 border border-[#333] relative">
                        <button
                            onClick={() => setShowUnlockDialog(false)}
                            className="absolute top-2 right-2 text-gray-400 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
                        >
                            <X size={20} />
                        </button>
                        <div className="flex flex-col items-center mb-4">
                            <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center mb-3">
                                <Lock size={24} className="text-yellow-500" />
                            </div>
                            <h3 className="text-lg font-bold text-white text-center">Unlock Chapter</h3>
                            <p className="text-gray-400 text-sm text-center mt-1">
                                This chapter is locked on Webtoon. Try finding it on other sources?
                            </p>
                        </div>

                        <div className="flex flex-col gap-3">
                            {/* Manual Search Input */}
                            <div className="mb-2">
                                <label className="text-xs text-gray-500 mb-1 block ml-1">Search Alternative Title</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Blinded by the Setting Sun"
                                    className="w-full bg-[#141414] text-white border border-[#333] rounded p-2 text-sm focus:border-blue-500 focus:outline-none"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const query = e.currentTarget.value.trim();
                                            if (query) {
                                                // Trigger search with manual query
                                                // We need to temporarily override the mangaTitle for this search
                                                // But simpler is to just pass it to a new search function or update state
                                                // For now, let's just update the viewState source and let the user know they are searching manually
                                                // Actually, we need to pass this query to loadChapters.
                                                // Let's modify loadChapters to accept an optional query override.
                                                loadChapters(0, query);
                                                onViewStateChange({ source: 'arenascans' }); // Default to arena for manual
                                                setShowUnlockDialog(false);
                                            }
                                        }
                                    }}
                                />
                            </div>

                            <button
                                onClick={() => switchToSource('arenascans')}
                                className="flex items-center gap-3 w-full p-3 rounded bg-[#2a2a2a] hover:bg-[#333] border border-[#333] transition-colors group"
                            >
                                <div className="w-8 h-8 rounded bg-red-500/20 flex items-center justify-center group-hover:bg-red-500/30">
                                    <Search size={16} className="text-red-500" />
                                </div>
                                <div className="flex flex-col items-start">
                                    <span className="text-sm font-bold text-white">Search ArenaScans</span>
                                    <span className="text-xs text-gray-500">Auto-search "{mangaTitle}"</span>
                                </div>
                            </button>

                            <button
                                onClick={() => switchToSource('mangapill')}
                                className="flex items-center gap-3 w-full p-3 rounded bg-[#2a2a2a] hover:bg-[#333] border border-[#333] transition-colors group"
                            >
                                <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30">
                                    <Search size={16} className="text-blue-500" />
                                </div>
                                <div className="flex flex-col items-start">
                                    <span className="text-sm font-bold text-white">Search MangaPill</span>
                                    <span className="text-xs text-gray-500">Alternative Source</span>
                                </div>
                            </button>

                            <a
                                href={`https://m.webtoons.com/en/fantasy/dummy/viewer?title_no=${currentMangaId}&episode_no=${unlockChapter?.id.replace('LOCKED_', '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 w-full p-3 rounded bg-[#2a2a2a] hover:bg-[#333] border border-[#333] transition-colors group mt-2"
                            >
                                <div className="w-8 h-8 rounded bg-[#00D564]/20 flex items-center justify-center group-hover:bg-[#00D564]/30">
                                    <ExternalLink size={16} className="text-[#00D564]" />
                                </div>
                                <div className="flex flex-col items-start">
                                    <span className="text-sm font-bold text-white">Open Webtoon App</span>
                                    <span className="text-xs text-gray-500">Official Source (Paid/Free)</span>
                                </div>
                            </a>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center mb-4 px-1">
                <h3 className="text-white font-bold">Online Chapters</h3>
                <div className="flex items-center gap-2">
                    {isWebtoon ? (
                        <span className="text-xs text-[#00D564] font-bold bg-[#00D564]/20 px-2 py-1 rounded">
                            Webtoon
                        </span>
                    ) : source === 'arenascans' ? (
                        <span className="text-xs text-red-400 font-bold bg-red-900/30 px-2 py-1 rounded">
                            ArenaScans
                        </span>
                    ) : (
                        <span className="text-xs text-blue-400 font-bold bg-blue-900/30 px-2 py-1 rounded">
                            MangaPill
                        </span>
                    )}

                    {/* Refresh Button */}
                    <button onClick={() => loadChapters()} className="p-1 hover:bg-white/10 rounded-full transition-colors ml-1">
                        <RefreshCw size={14} className="text-gray-400" />
                    </button>
                </div>
            </div>

            {/* Custom Batch Selector */}
            {(allChaptersWithLocked.length > batchSize * 1.5 || (source === 'webtoon' && webtoonMaxPage > 10)) && (
                <div className="mb-4 px-1 flex gap-2">
                    <div className="relative flex-1" ref={batchDropdownRef}>
                        <button
                            onClick={() => setIsBatchDropdownOpen(!isBatchDropdownOpen)}
                            className="w-full bg-[#1f1f1f] text-white p-3 rounded-lg text-sm border border-gray-800 flex justify-between items-center hover:bg-[#2a2a2a] transition-colors"
                        >
                            <span className="font-medium text-gray-200">
                                Chapters {displayBatches[selectedBatch]?.label || 'Loading...'}
                            </span>
                            <ChevronDown size={16} className={`text-gray-400 transition-transform ${isBatchDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isBatchDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-[#1f1f1f] border border-gray-800 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar">
                                {displayBatches.map(batch => (
                                    <button
                                        key={batch.index}
                                        onClick={() => {
                                            onViewStateChange({ selectedBatch: batch.index });
                                            setIsBatchDropdownOpen(false);
                                        }}
                                        className={`w-full text-left px-4 py-3 text-sm transition-colors border-b border-gray-800 last:border-0 flex justify-between items-center
                                            ${selectedBatch === batch.index ? 'bg-red-600/10 text-red-500' : 'text-gray-300 hover:bg-[#2a2a2a]'}`}
                                    >
                                        <span>Chapters {batch.label}</span>
                                        {selectedBatch === batch.index && <Check size={14} />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Settings Button */}
                    <button
                        onClick={() => {
                            setTempBatchSize(batchSize.toString());
                            setShowBatchPrompt(true);
                        }}
                        className="bg-[#1f1f1f] text-gray-400 p-3 rounded-lg border border-gray-800 hover:bg-[#2a2a2a] hover:text-white transition-colors"
                    >
                        <Settings size={20} />
                    </button>
                </div>
            )}

            {loading && chapters.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <Loader2 className="animate-spin text-blue-500" />
                    {loadingProgress && <span className="text-xs text-gray-500">{loadingProgress}</span>}
                </div>
            )}

            {error && (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <div className="text-red-400 text-sm bg-red-900/20 px-4 py-2 rounded">
                        {error}
                    </div>
                    <button
                        onClick={() => loadChapters()}
                        className="text-xs text-gray-400 underline hover:text-white"
                    >
                        Try Again
                    </button>
                </div>
            )}

            {!error && (
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="flex flex-col gap-2 min-h-[300px]">
                        {(() => {
                            // Optimization: Pre-calculate sets for O(1) lookups
                            const readIds = new Set(currentManga.readChapters || []);
                            const readTitles = new Set<string>();
                            if (currentManga.chapters) {
                                currentManga.readChapters?.forEach(readId => {
                                    const localChapter = currentManga.chapters.find(c => c.id === readId);
                                    if (localChapter) readTitles.add(localChapter.title);
                                });
                            }

                            const downloadedTitles = new Set(currentManga.chapters.map(c => c.title));

                            return displayedChaptersWithLocked.map((chapter) => {
                                // Safety check
                                if (source === 'webtoon' && !('date' in chapter)) return null;
                                if (source === 'mangapill' && !('url' in chapter)) return null;

                                const isLocked = chapter.url === 'LOCKED';
                                const isActive = activeDownloads.includes(chapter.id);
                                const isQueued = downloadQueue.includes(chapter.id);
                                const isDownloading = isActive || isQueued;
                                const progress = downloadProgress[chapter.id] || 0;

                                // Optimized lookups
                                const downloaded = downloadedTitles.has(chapter.title);
                                const isRead = readIds.has(chapter.id) || readTitles.has(chapter.title);

                                return (
                                    <div key={chapter.id} className="flex items-center justify-between p-3 bg-[#1f1f1f] rounded hover:bg-[#2f2f2f] transition-colors">
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-sm font-medium line-clamp-1 ${isRead ? 'text-gray-500' : 'text-gray-200'}`}>
                                                    {chapter.title}
                                                </span>
                                                {isRead && (
                                                    <span className="text-[10px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">READ</span>
                                                )}
                                            </div>
                                            {'date' in chapter && <span className="text-gray-500 text-xs">{(chapter as WebtoonChapter).date}</span>}
                                        </div>

                                        {downloaded ? (
                                            <span className="text-green-500 flex items-center gap-1 text-xs font-bold">
                                                <Check size={14} /> SAVED
                                            </span>
                                        ) : isLocked ? (
                                            <button
                                                onClick={() => handleUnlockClick(chapter as WebtoonChapter)}
                                                className="p-2 rounded-full bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 transition-colors"
                                            >
                                                <Lock size={16} />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleDownload(chapter)}
                                                disabled={isDownloading}
                                                className={`p-2 rounded-full transition-colors ${isDownloading ? 'bg-gray-700' : 'bg-[#333] hover:bg-[#444] text-white'}`}
                                            >
                                                {isActive ? (
                                                    <div className="flex items-center justify-center w-5 h-5">
                                                        <span className="text-[9px] font-bold text-white">{Math.round(progress * 100)}%</span>
                                                    </div>
                                                ) : isQueued ? (
                                                    <div className="flex items-center justify-center w-5 h-5">
                                                        <Loader2 size={14} className="animate-spin text-gray-400" />
                                                    </div>
                                                ) : (
                                                    <Download size={16} />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                );
                            });
                        })()}

                        {/* Infinite Scroll Loader / Trigger */}
                        <div ref={observerTarget} className="w-full py-4 flex justify-center h-10">
                            {loading && chapters.length > 0 && <Loader2 className="animate-spin text-gray-500" size={20} />}
                        </div>
                    </div >
                </div >
            )}
        </div>
    );
};
