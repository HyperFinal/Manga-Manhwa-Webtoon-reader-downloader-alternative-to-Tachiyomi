import React, { useState, useEffect, useRef } from 'react';
import { MangaPillService } from '../services/MangaPillService';
import type { MangaPillChapter } from '../services/MangaPillService';
import { WebtoonService } from '../services/WebtoonService';
import type { WebtoonChapter } from '../services/WebtoonService';
import type { Manga } from '../services/StorageService';
import { Check, RefreshCw, ChevronDown, Loader2, Download, Settings, X } from 'lucide-react';
import { StorageService } from '../services/StorageService';

export interface OnlineViewState {
    selectedBatch: number;
    currentMangaId: string | null;
    webtoonMaxPage: number;
    webtoonMangaUrl: string | undefined;
    source: 'mangapill' | 'webtoon';
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
    onQueueDownload: (chapter: any, mangaTitle: string, source: 'mangapill' | 'webtoon', mangaId?: string) => void;
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

    // Destructure view state for easier access
    const { selectedBatch, currentMangaId, webtoonMaxPage, webtoonMangaUrl, source } = viewState;

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

    const loadChapters = async (retryCount = 0) => {
        const currentSource = source;
        setLoading(true);
        setLoadingProgress('');
        setError(null);

        // Only reset chapters if we are changing source or don't have them
        if (currentSource !== sourceRef.current) {
            setChapters([]);
        }

        setVisibleCount(20);
        // Do NOT reset viewState here, as we want to preserve it


        try {
            if (currentSource === 'mangapill') {
                console.log(`Searching MangaPill for: ${mangaTitle} (Attempt ${retryCount + 1})`);
                const searchResults = await MangaPillService.searchManga(mangaTitle);

                if (sourceRef.current !== currentSource) return;

                if (searchResults.length === 0) {
                    if (retryCount < 1) {
                        console.log("Manga not found, retrying in 1s...");
                        setTimeout(() => loadChapters(retryCount + 1), 1000);
                        return;
                    }
                    setError("Manga not found on MangaPill.");
                    setLoading(false);
                    return;
                }

                const manga = searchResults[0];
                const slug = manga.url.split('/').pop() || '';

                const chapterList = await MangaPillService.getChapters(manga.id, slug);

                if (sourceRef.current !== currentSource) return;

                // Sort ascending by chapter number
                chapterList.sort((a, b) => {
                    const numA = parseFloat(a.number);
                    const numB = parseFloat(b.number);
                    return numA - numB;
                });

                setChapters(chapterList);
                setLoading(false);
            } else {
                // Webtoon Logic - Lazy Load
                const searchResults = await WebtoonService.searchManga(mangaTitle);

                if (sourceRef.current !== currentSource) return;

                if (searchResults.length === 0) {
                    setError("Manga not found on Webtoon.");
                    setLoading(false);
                    return;
                }

                const firstResult = searchResults[0];
                const mangaId = firstResult.id;
                const mangaUrl = firstResult.url;

                onViewStateChange({
                    currentMangaId: mangaId,
                    webtoonMangaUrl: mangaUrl
                });

                // 1. Fetch Page 9999 to get the max page (oldest chapters)
                const lastPageResult = await WebtoonService.getChapters(mangaId, 9999, mangaUrl);
                if (sourceRef.current !== currentSource) return;

                const maxPage = lastPageResult.currentPage;
                onViewStateChange({ webtoonMaxPage: maxPage });

                // Trigger batch load for batch 0
                loadWebtoonBatch(0, maxPage, mangaId, mangaUrl);
            }

        } catch (err) {
            console.error(err);
            if (sourceRef.current === currentSource) {
                setError("Failed to load chapters.");
                setLoading(false);
            }
        }
    };

    const loadWebtoonBatch = async (batchIndex: number, maxPage: number, mangaId: string, mangaUrl: string) => {
        setLoading(true);
        setLoadingProgress('Loading batch...');
        setChapters([]); // Clear current list while loading new batch

        try {
            // Calculate pages for this batch
            // 1 page = 10 chapters usually.
            const pagesPerBatch = Math.ceil(batchSize / 10);

            const startPage = maxPage - (batchIndex * pagesPerBatch);
            const endPage = Math.max(1, startPage - pagesPerBatch + 1);

            if (startPage < 1) {
                setLoading(false);
                return;
            }

            const pagesToFetch = [];
            for (let p = startPage; p >= endPage; p--) {
                pagesToFetch.push(p);
            }

            let batchChaptersList: WebtoonChapter[] = [];

            const chunkSize = 5;
            for (let i = 0; i < pagesToFetch.length; i += chunkSize) {
                if (sourceRef.current !== 'webtoon') return;

                const chunk = pagesToFetch.slice(i, i + chunkSize);
                const results = await Promise.all(
                    chunk.map(p => WebtoonService.getChapters(mangaId, p, mangaUrl))
                );

                results.forEach(res => {
                    batchChaptersList = [...batchChaptersList, ...res.chapters];
                });
            }

            // Deduplicate
            batchChaptersList = batchChaptersList.filter((ch, index, self) =>
                index === self.findIndex((t) => t.id === ch.id)
            );

            // Sort ascending
            batchChaptersList.sort((a, b) => parseInt(a.id) - parseInt(b.id));
            setChapters(batchChaptersList);

        } catch (err) {
            console.error("Error loading webtoon batch", err);
            setError("Failed to load batch.");
        } finally {
            setLoading(false);
            setLoadingProgress('');
        }
    };

    // Handle Batch Selection for Webtoon
    const prevBatchRef = useRef(selectedBatch);
    const prevBatchSizeRef = useRef(batchSize);

    useEffect(() => {
        if (source === 'webtoon' && currentMangaId && webtoonMaxPage > 0 && webtoonMangaUrl) {
            const isBatchChanged = prevBatchRef.current !== selectedBatch;
            const isSizeChanged = prevBatchSizeRef.current !== batchSize;
            const hasChapters = chapters.length > 0;

            if (isBatchChanged || isSizeChanged || !hasChapters) {
                loadWebtoonBatch(selectedBatch, webtoonMaxPage, currentMangaId, webtoonMangaUrl);
            }
            prevBatchRef.current = selectedBatch;
            prevBatchSizeRef.current = batchSize;
        }
    }, [selectedBatch, batchSize]); // Trigger on batch or size change

    const handleDownload = (chapter: MangaPillChapter | WebtoonChapter) => {
        if (downloadQueue.includes(chapter.id) || activeDownloads.includes(chapter.id)) return;
        onQueueDownload(chapter, mangaTitle, source, currentMangaId || undefined);
    };

    const isDownloaded = (chapter: MangaPillChapter | WebtoonChapter) => {
        return currentManga.chapters.some(ch => ch.title === chapter.title);
    };

    // Filter chapters based on batch (ONLY FOR MANGAPILL)
    const getBatchChapters = () => {
        if (source === 'webtoon') return chapters; // Webtoon already loads only the batch

        if (chapters.length <= batchSize * 1.5) return chapters; // Threshold logic
        const start = selectedBatch * batchSize;
        const end = start + batchSize;
        return chapters.slice(start, end);
    };

    const batchChapters = getBatchChapters();

    const loadMore = async () => {
        if (visibleCount < batchChapters.length) {
            setVisibleCount(prev => Math.min(prev + 20, batchChapters.length));
        }
    };

    // Infinite Scroll Observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting) {
                    const canLoadMore = visibleCount < batchChapters.length;
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
    }, [observerTarget, visibleCount, batchChapters.length, loading]);


    const displayedChapters = batchChapters.slice(0, visibleCount);

    // Calculate batches
    let batches: { index: number, label: string }[] = [];

    if (source === 'mangapill') {
        const totalBatches = Math.ceil(chapters.length / batchSize);
        batches = Array.from({ length: totalBatches }, (_, i) => {
            const start = i * batchSize;
            const end = Math.min((i + 1) * batchSize - 1, chapters.length - 1);
            const sNum = (chapters[start] as MangaPillChapter).number;
            const eNum = (chapters[end] as MangaPillChapter).number;
            return {
                index: i,
                label: `${sNum} - ${eNum}`
            };
        });
    } else {
        // Webtoon Batches based on Max Page
        const pagesPerBatch = Math.ceil(batchSize / 10);
        const totalBatches = Math.ceil(webtoonMaxPage / pagesPerBatch);

        batches = Array.from({ length: totalBatches }, (_, i) => {
            // Estimate chapter numbers (Rough estimate since we don't know exact count per page always)
            const startChap = (i * batchSize) + 1;
            const endChap = (i + 1) * batchSize;
            return {
                index: i,
                label: `${startChap} - ${endChap}`
            };
        });
    }

    console.log('[OnlineChapterList] Render. Read Chapters:', currentManga.readChapters);

    return (
        <div className="flex flex-col h-full relative">
            {/* Batch Size Prompt Modal */}
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

            <div className="flex justify-between items-center mb-4 px-1">
                <h3 className="text-white font-bold">Online Chapters</h3>
                <div className="flex items-center gap-2">
                    {isWebtoon ? (
                        <span className="text-xs text-[#00D564] font-bold bg-[#00D564]/20 px-2 py-1 rounded">
                            Webtoon
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
            {(chapters.length > batchSize * 1.5 || (source === 'webtoon' && webtoonMaxPage > 10)) && (
                <div className="mb-4 px-1 flex gap-2">
                    <div className="relative flex-1" ref={batchDropdownRef}>
                        <button
                            onClick={() => setIsBatchDropdownOpen(!isBatchDropdownOpen)}
                            className="w-full bg-[#1f1f1f] text-white p-3 rounded-lg text-sm border border-gray-800 flex justify-between items-center hover:bg-[#2a2a2a] transition-colors"
                        >
                            <span className="font-medium text-gray-200">
                                Chapters {batches[selectedBatch]?.label || 'Loading...'}
                            </span>
                            <ChevronDown size={16} className={`text-gray-400 transition-transform ${isBatchDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isBatchDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-[#1f1f1f] border border-gray-800 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar">
                                {batches.map(batch => (
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
                        {displayedChapters.map((chapter) => {
                            // Safety check
                            if (source === 'webtoon' && !('date' in chapter)) return null;
                            if (source === 'mangapill' && !('url' in chapter)) return null;

                            const downloaded = isDownloaded(chapter);
                            const isActive = activeDownloads.includes(chapter.id);
                            const isQueued = downloadQueue.includes(chapter.id);
                            const isDownloading = isActive || isQueued;
                            const progress = downloadProgress[chapter.id] || 0;

                            // Check read status by Title (since IDs differ between online and local)
                            const isRead = currentManga.readChapters?.includes(chapter.id) ||
                                currentManga.readChapters?.some(readId => {
                                    const localChapter = currentManga.chapters.find(c => c.id === readId);
                                    if (localChapter && localChapter.title === chapter.title) {
                                        return true;
                                    }
                                    // Debug log for mismatch
                                    if (localChapter && Math.random() < 0.001) { // Throttle logs
                                        console.log(`[OnlineChapterList] Mismatch: '${localChapter.title}' vs '${chapter.title}'`);
                                    }
                                    return false;
                                });

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
                        })}

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
