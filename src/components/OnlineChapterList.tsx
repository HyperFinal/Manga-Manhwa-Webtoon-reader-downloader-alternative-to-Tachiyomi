import React, { useState, useEffect, useRef } from 'react';
import { MangaPillService } from '../services/MangaPillService';
import type { MangaPillChapter } from '../services/MangaPillService';
import { WebtoonService } from '../services/WebtoonService';
import type { WebtoonChapter } from '../services/WebtoonService';
import { DownloadService } from '../services/DownloadService';
import { StorageService } from '../services/StorageService';
import type { Manga, Chapter } from '../services/StorageService';
import { Download, Loader2, Check, RefreshCw, ChevronDown } from 'lucide-react';

interface OnlineChapterListProps {
    mangaTitle: string;
    currentManga: Manga;
    onChapterDownloaded: (updatedManga: Manga) => void;
}

type Source = 'mangapill' | 'webtoon';

export const OnlineChapterList: React.FC<OnlineChapterListProps> = ({ mangaTitle, currentManga, onChapterDownloaded }) => {
    const [chapters, setChapters] = useState<(MangaPillChapter | WebtoonChapter)[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);


    // Determine if we should show Webtoon tab
    const isWebtoon = currentManga.type === 'Manhwa' ||
        currentManga.type === 'Manhua' ||
        currentManga.genres?.some(g => g.toLowerCase() === 'webtoon');

    // Initialize source based on type
    const [source] = useState<Source>(() => isWebtoon ? 'webtoon' : 'mangapill');

    const [visibleCount, setVisibleCount] = useState(20);
    const observerTarget = useRef(null);
    const sourceRef = useRef(source);

    // Webtoon specific state
    const [currentMangaId, setCurrentMangaId] = useState<string | null>(null);

    const [selectedBatch, setSelectedBatch] = useState(0);
    const [isBatchDropdownOpen, setIsBatchDropdownOpen] = useState(false);
    const batchDropdownRef = useRef<HTMLDivElement>(null);
    const BATCH_SIZE = 100;
    const BATCH_THRESHOLD = 150;

    useEffect(() => {
        sourceRef.current = source;
        loadChapters();
    }, [source]);

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
        setChapters([]);
        setVisibleCount(20);
        setSelectedBatch(0);
        setCurrentMangaId(null);

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
            } else {
                // Webtoon Logic - Fetch ALL chapters
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

                setCurrentMangaId(mangaId);

                // 1. Fetch Page 9999 to get the max page (oldest chapters)
                const lastPageResult = await WebtoonService.getChapters(mangaId, 9999, mangaUrl);
                if (sourceRef.current !== currentSource) return;

                let allChapters: WebtoonChapter[] = [...lastPageResult.chapters];
                const maxPage = lastPageResult.currentPage; // This is the true last page number

                if (maxPage > 1) {
                    // 2. Fetch all other pages in parallel batches
                    const pagesToFetch = [];
                    // We already have maxPage, so fetch 1 to maxPage-1
                    for (let p = maxPage - 1; p >= 1; p--) {
                        pagesToFetch.push(p);
                    }

                    const chunkSize = 5; // Fetch 5 pages at a time
                    for (let i = 0; i < pagesToFetch.length; i += chunkSize) {
                        if (sourceRef.current !== currentSource) return;

                        const chunk = pagesToFetch.slice(i, i + chunkSize);
                        setLoadingProgress(`Loading chapters... ${Math.round((i / pagesToFetch.length) * 100)}%`);

                        const results = await Promise.all(
                            chunk.map(p => WebtoonService.getChapters(mangaId, p, mangaUrl))
                        );

                        results.forEach(res => {
                            allChapters = [...allChapters, ...res.chapters];
                        });
                    }
                }

                // Deduplicate
                allChapters = allChapters.filter((ch, index, self) =>
                    index === self.findIndex((t) => t.id === ch.id)
                );

                // Sort ascending
                allChapters.sort((a, b) => parseInt(a.id) - parseInt(b.id));
                setChapters(allChapters);
            }

        } catch (err) {
            console.error(err);
            if (sourceRef.current === currentSource) {
                setError("Failed to load chapters.");
            }
        } finally {
            if (sourceRef.current === currentSource) {
                setLoading(false);
                setLoadingProgress('');
            }
        }
    };

    const handleDownload = async (chapter: MangaPillChapter | WebtoonChapter) => {
        if (downloadingId) return;

        setDownloadingId(chapter.id);
        setProgress(0);

        try {
            let fileName: string;
            let chapterTitle: string;

            if (source === 'mangapill') {
                const c = chapter as MangaPillChapter;
                chapterTitle = c.title;
                fileName = await DownloadService.downloadChapter(
                    chapterTitle,
                    mangaTitle,
                    () => MangaPillService.getChapterPages(c.url),
                    { 'Referer': 'https://mangapill.com/' },
                    (p: number) => setProgress(p)
                );
            } else {
                const c = chapter as WebtoonChapter;
                chapterTitle = c.title;

                let mangaId = currentMangaId;
                if (!mangaId) {
                    const searchResults = await WebtoonService.searchManga(mangaTitle);
                    if (searchResults.length > 0) {
                        mangaId = searchResults[0].id;
                        setCurrentMangaId(mangaId);
                    } else {
                        throw new Error("Manga ID not found");
                    }
                }

                fileName = await DownloadService.downloadChapter(
                    chapterTitle,
                    mangaTitle,
                    () => WebtoonService.getChapterPages(mangaId!, c.id),
                    { 'Referer': 'https://www.webtoons.com/' },
                    (p: number) => setProgress(p)
                );
            }

            const newChapter: Chapter = {
                id: Date.now().toString(),
                title: chapterTitle,
                fileName: fileName
            };

            const updatedManga = {
                ...currentManga,
                chapters: [...currentManga.chapters, newChapter]
            };

            const library = await StorageService.loadLibrary();
            const newLibrary = library.map(m => m.id === currentManga.id ? updatedManga : m);
            await StorageService.saveLibrary(newLibrary);

            onChapterDownloaded(updatedManga);

        } catch (err) {
            console.error("Download failed", err);
            alert("Download failed. Check your internet connection.");
        } finally {
            setDownloadingId(null);
            setProgress(0);
        }
    };

    const isDownloaded = (chapter: MangaPillChapter | WebtoonChapter) => {
        return currentManga.chapters.some(ch => ch.title === chapter.title);
    };

    // Filter chapters based on batch
    const getBatchChapters = () => {
        if (chapters.length <= BATCH_THRESHOLD) return chapters;
        const start = selectedBatch * BATCH_SIZE;
        const end = start + BATCH_SIZE;
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
    const totalBatches = Math.ceil(chapters.length / BATCH_SIZE);
    const batches = Array.from({ length: totalBatches }, (_, i) => {
        const start = i * BATCH_SIZE;
        const end = Math.min((i + 1) * BATCH_SIZE - 1, chapters.length - 1);

        let startLabel = `${start + 1}`;
        let endLabel = `${end + 1}`;

        // Helper to get chapter number safely
        const getChapNum = (idx: number) => {
            const ch = chapters[idx];
            if (source === 'mangapill' && 'number' in ch) return (ch as MangaPillChapter).number;
            return null;
        };

        const sNum = getChapNum(start);
        const eNum = getChapNum(end);

        if (sNum) startLabel = sNum;
        if (eNum) endLabel = eNum;

        return {
            index: i,
            label: `${startLabel} - ${endLabel}`
        };
    });

    return (
        <div className="flex flex-col h-full">
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
            {chapters.length > BATCH_THRESHOLD && (
                <div className="mb-4 px-1 relative" ref={batchDropdownRef}>
                    <button
                        onClick={() => setIsBatchDropdownOpen(!isBatchDropdownOpen)}
                        className="w-full bg-[#1f1f1f] text-white p-3 rounded-lg text-sm border border-gray-800 flex justify-between items-center hover:bg-[#2a2a2a] transition-colors"
                    >
                        <span className="font-medium text-gray-200">
                            Chapters {batches[selectedBatch]?.label}
                        </span>
                        <ChevronDown size={16} className={`text-gray-400 transition-transform ${isBatchDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isBatchDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-[#1f1f1f] border border-gray-800 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar">
                            {batches.map(batch => (
                                <button
                                    key={batch.index}
                                    onClick={() => {
                                        setSelectedBatch(batch.index);
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
                            const isDownloading = downloadingId === (chapter.id);

                            return (
                                <div key={chapter.id} className="flex items-center justify-between p-3 bg-[#1f1f1f] rounded hover:bg-[#2f2f2f] transition-colors">
                                    <div className="flex flex-col">
                                        <span className="text-gray-200 text-sm font-medium line-clamp-1">{chapter.title}</span>
                                        {'date' in chapter && <span className="text-gray-500 text-xs">{(chapter as WebtoonChapter).date}</span>}
                                    </div>

                                    {downloaded ? (
                                        <span className="text-green-500 flex items-center gap-1 text-xs font-bold">
                                            <Check size={14} /> SAVED
                                        </span>
                                    ) : (
                                        <button
                                            onClick={() => handleDownload(chapter)}
                                            disabled={!!downloadingId}
                                            className={`p-2 rounded-full transition-colors ${isDownloading ? 'bg-gray-700' : 'bg-[#333] hover:bg-[#444] text-white'}`}
                                        >
                                            {isDownloading ? (
                                                <div className="flex items-center justify-center w-5 h-5">
                                                    <span className="text-[9px] font-bold text-white">{Math.round(progress * 100)}%</span>
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
                    </div>
                </div>
            )}
        </div>
    );
};

