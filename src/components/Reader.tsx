import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import { X, Settings, Loader2 } from 'lucide-react';
import { MangaPillService } from '../services/MangaPillService';
import { WebtoonService } from '../services/WebtoonService';
import { StorageService, type Manga, type Chapter } from '../services/StorageService';
import { DownloadService } from '../services/DownloadService';

interface ReaderProps {
    chapterFileName: string;
    currentChapterId: string;
    chapters: Chapter[];
    manga?: Manga; // Add manga prop
    onClose: () => void;
    onChapterChange: (chapterId: string) => void;
    getChapterContent: (fileName: string) => Promise<string[]>;
    initialPage?: number | 'last';
    onProgress?: (page: number, total: number, chapterId?: string) => void;
    onChapterComplete?: (chapterId: string) => void;
    onFinish?: () => void;
    onUpdateManga?: (manga: Manga) => void; // Add onUpdateManga prop
    mangaType?: string;
}

interface LoadedChapter {
    id: string;
    title: string;
    pages: string[];
    status: 'loading' | 'loaded' | 'error';
}

// Helper Component for Zoom
// Helper Component for Zoom
// Helper Component for Zoom
// Helper Component for Zoom
const ZoomableImage = ({ src, alt, onDoubleTap }: { src: string, alt: string, onDoubleTap?: () => void }) => {
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const scale = useMotionValue(1);

    // We need a state for constraints because dragConstraints prop needs to be updated for the drag interaction
    const [constraintScale, setConstraintScale] = useState(1);

    const containerRef = useRef<HTMLDivElement>(null);
    const lastTap = useRef<number>(0);
    const initialDistance = useRef<number | null>(null);
    const initialScale = useRef<number>(1);
    const isPinching = useRef(false);

    const handleTap = () => {
        const now = Date.now();
        if (now - lastTap.current < 300) {
            // Double tap
            const currentScale = scale.get();
            const targetScale = currentScale > 1.1 ? 1 : 2.5;

            animate(scale, targetScale, { type: "spring", stiffness: 300, damping: 30 });
            if (targetScale === 1) {
                animate(x, 0, { type: "spring", stiffness: 300, damping: 30 });
                animate(y, 0, { type: "spring", stiffness: 300, damping: 30 });
            }
            setConstraintScale(targetScale);

            if (onDoubleTap) onDoubleTap();
        }
        lastTap.current = now;
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            isPinching.current = true;
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
            initialDistance.current = dist;
            initialScale.current = scale.get();
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2 && initialDistance.current !== null && containerRef.current) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
            const delta = dist / initialDistance.current;
            const newScale = Math.min(Math.max(initialScale.current * delta, 1), 4);

            scale.set(newScale);

            // Clamp x and y to keep image within bounds during zoom
            const width = containerRef.current.clientWidth;
            const height = containerRef.current.clientHeight;
            const xLimit = (width * (newScale - 1)) / 2;
            const yLimit = (height * (newScale - 1)) / 2;

            const currentX = x.get();
            const currentY = y.get();

            if (currentX > xLimit) x.set(xLimit);
            if (currentX < -xLimit) x.set(-xLimit);
            if (currentY > yLimit) y.set(yLimit);
            if (currentY < -yLimit) y.set(-yLimit);
        }
    };

    const handleTouchEnd = () => {
        if (isPinching.current) {
            isPinching.current = false;
            initialDistance.current = null;

            const currentScale = scale.get();
            if (currentScale < 1.1) {
                animate(scale, 1);
                animate(x, 0);
                animate(y, 0);
                setConstraintScale(1);
            } else {
                setConstraintScale(currentScale);
            }
        }
    };

    // Helper to fetch image securely with Referer
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const fetchImage = async () => {
            // Only use Secure Fetch for remote Webtoon/Naver images
            // Local files (localhost, file://) should be loaded directly
            const isRemoteWebtoon = src.startsWith('http') &&
                (src.includes('webtoons.com') || src.includes('pstatic.net') || src.includes('naver.com'));

            if (!isRemoteWebtoon) {
                if (isMounted) setBlobUrl(src);
                return;
            }

            try {
                const { CapacitorHttp } = await import('@capacitor/core');
                const response = await CapacitorHttp.get({
                    url: src,
                    responseType: 'blob',
                    headers: {
                        'Referer': 'https://www.webtoons.com/',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });

                if (response.data) {
                    const base64 = response.data;
                    const mimeType = response.headers['content-type'] || 'image/jpeg';
                    const url = `data:${mimeType};base64,${base64}`;
                    if (isMounted) setBlobUrl(url);
                } else {
                    throw new Error('No data');
                }
            } catch (err) {
                console.error('Failed to fetch image securely:', err);
                if (isMounted) setError(true);
            }
        };

        fetchImage();
        return () => { isMounted = false; };
    }, [src]);

    if (error) {
        return (
            <div className="w-full h-96 flex items-center justify-center text-red-500 bg-gray-900">
                <p>Failed to load image</p>
            </div>
        );
    }

    if (!blobUrl) {
        return (
            <div className="w-full h-96 flex items-center justify-center text-gray-500 bg-gray-900 animate-pulse">
                <Loader2 className="animate-spin" />
            </div>
        );
    }

    // Calculate drag constraints based on the committed constraintScale
    const xLimit = containerRef.current ? (containerRef.current.clientWidth * (constraintScale - 1)) / 2 : 0;
    const yLimit = containerRef.current ? (containerRef.current.clientHeight * (constraintScale - 1)) / 2 : 0;

    return (
        <div
            ref={containerRef}
            className="w-full h-full flex items-center justify-center overflow-hidden"
            onClick={handleTap}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <motion.img
                src={blobUrl}
                alt={alt}
                style={{ x, y, scale, cursor: constraintScale > 1 ? 'grab' : 'default' }}
                className="max-w-full max-h-full object-contain select-none"
                drag={constraintScale > 1}
                dragElastic={0.1}
                dragConstraints={{
                    left: -xLimit,
                    right: xLimit,
                    top: -yLimit,
                    bottom: yLimit,
                }}
            />
        </div>
    );
};

// Simple Secure Image for Vertical Mode
const SecureImage = ({ src, alt }: { src: string, alt: string }) => {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const fetchImage = async () => {
            // Only use Secure Fetch for remote Webtoon/Naver images
            // Local files (localhost, file://) should be loaded directly
            const isRemoteWebtoon = src.startsWith('http') &&
                (src.includes('webtoons.com') || src.includes('pstatic.net') || src.includes('naver.com'));

            if (!isRemoteWebtoon) {
                if (isMounted) setBlobUrl(src);
                return;
            }

            try {
                const { CapacitorHttp } = await import('@capacitor/core');
                const response = await CapacitorHttp.get({
                    url: src,
                    responseType: 'blob',
                    headers: {
                        'Referer': 'https://www.webtoons.com/',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });

                if (response.data) {
                    const base64 = response.data;
                    const mimeType = response.headers['content-type'] || 'image/jpeg';
                    const url = `data:${mimeType};base64,${base64}`;
                    if (isMounted) setBlobUrl(url);
                } else {
                    throw new Error('No data');
                }
            } catch (err) {
                console.error('Failed to fetch image securely:', err);
                if (isMounted) setError(true);
            }
        };

        fetchImage();
        return () => { isMounted = false; };
    }, [src]);

    if (error) {
        return (
            <div className="w-full h-96 flex items-center justify-center text-red-500 bg-gray-900">
                <p>Failed to load image</p>
            </div>
        );
    }

    if (!blobUrl) {
        return (
            <div className="w-full h-96 flex items-center justify-center text-gray-500 bg-gray-900 animate-pulse">
                <Loader2 className="animate-spin" />
            </div>
        );
    }

    return (
        <img
            src={blobUrl}
            alt={alt}
            className="w-full h-auto block"
            loading="lazy"
        />
    );
};

export const Reader: React.FC<ReaderProps> = ({
    currentChapterId,
    chapters,
    manga, // Destructure manga
    onClose,
    onChapterChange,
    getChapterContent,
    initialPage = 0,
    onProgress,
    onChapterComplete,
    onFinish,
    onUpdateManga, // Destructure onUpdateManga
    mangaType
}) => {
    // State
    const [loadedChapters, setLoadedChapters] = useState<LoadedChapter[]>([]);
    const [readingMode, setReadingMode] = useState<'vertical' | 'ltr' | 'rtl'>('vertical');
    const [showControls, setShowControls] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [activeChapterId, setActiveChapterId] = useState<string>(currentChapterId);
    const [currentPage, setCurrentPage] = useState(0); // Relative to active chapter
    const [isLoadingNextOnline, setIsLoadingNextOnline] = useState(false); // New state
    const [allChapters, setAllChapters] = useState<Chapter[]>(chapters); // Track all chapters including online ones

    // Sync allChapters when props change (initial load)
    useEffect(() => {
        setAllChapters(prev => {
            // Merge props.chapters into prev, avoiding duplicates
            const newChapters = [...prev];
            chapters.forEach(c => {
                if (!newChapters.some(nc => nc.id === c.id)) {
                    newChapters.push(c);
                }
            });
            // Sort by something? No, trust order.
            // Actually, if we are just starting, props.chapters is the truth.
            // But if we added online chapters, we want to keep them.
            // For now, let's just assume props.chapters is the base.
            if (prev.length === 0) return chapters;
            return newChapters;
        });
    }, [chapters]);

    // Debug State
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [showDebug] = useState(false);

    const addLog = (msg: string) => {
        console.log(msg);
        setDebugLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
    };

    const hasTriedLoadingNextRef = useRef(false);

    // Reset the ref when the active chapter changes
    useEffect(() => {
        hasTriedLoadingNextRef.current = false;
    }, [activeChapterId]);


    // Refs
    const verticalContainerRef = useRef<HTMLDivElement>(null);
    const horizontalContainerRef = useRef<HTMLDivElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const settingsBtnRef = useRef<HTMLButtonElement>(null); // Ref for settings button
    const isLoadingRef = useRef(false);
    const scrollAnchorRef = useRef<{ id: string, offset: number } | null>(null);
    const scrollAdjustmentRef = useRef<number>(0);
    const isResumingRef = useRef(false);
    const activeChapterIdRef = useRef(currentChapterId);
    const hasInitialScrolledRef = useRef(false);
    const completedChaptersRef = useRef<Set<string>>(new Set());
    const nearBottomLoggedRef = useRef<Set<string>>(new Set());

    // Save progress to storage
    const saveProgress = async (updates: { currentChapterId?: string, completedChapterId?: string, newChapter?: Chapter, currentPage?: number }) => {
        if (!manga) return;

        try {
            const updatedManga = { ...manga };

            if (updates.currentChapterId) {
                updatedManga.lastReadChapterId = updates.currentChapterId;
            }

            if (updates.currentPage !== undefined) {
                updatedManga.lastReadPage = updates.currentPage;
            }

            if (updates.completedChapterId) {
                const readChapters = new Set(updatedManga.readChapters || []);
                readChapters.add(updates.completedChapterId);
                updatedManga.readChapters = Array.from(readChapters);
            }

            if (updates.newChapter) {
                if (!updatedManga.chapters.some(c => c.id === updates.newChapter!.id)) {
                    updatedManga.chapters = [...updatedManga.chapters, updates.newChapter!];
                }
            }

            // CLEANUP: Remove read chapter IDs that no longer exist in chapters array
            if (updatedManga.readChapters && updatedManga.readChapters.length > 0) {
                const validChapterIds = new Set(updatedManga.chapters.map(c => c.id));
                const cleanedReadChapters = updatedManga.readChapters.filter(id => validChapterIds.has(id));

                if (cleanedReadChapters.length !== updatedManga.readChapters.length) {
                    addLog(`Cleaned readChapters: ${updatedManga.readChapters.length} -> ${cleanedReadChapters.length}`);
                    updatedManga.readChapters = cleanedReadChapters;
                }
            }

            // CRITICAL: Verify we're not about to delete all chapters
            if (updatedManga.chapters.length === 0 && manga.chapters.length > 0) {
                console.error("[Reader] CRITICAL: Attempted to save manga with 0 chapters!");
                addLog(`ERROR: Attempted to delete all chapters! Aborting save.`);
                return;
            }

            addLog(`Saving progress: chId=${updates.currentChapterId}, page=${updates.currentPage}, completed=${updates.completedChapterId}, chapters=${updatedManga.chapters.length}`);

            // Use onUpdateManga if available to sync with parent state
            if (onUpdateManga) {
                onUpdateManga(updatedManga);
            } else {
                // Fallback to direct save (though App.tsx might overwrite if not synced)
                await StorageService.saveManga(updatedManga);
            }
        } catch (e) {
            console.error("Failed to save progress", e);
            addLog("Error saving progress");
        }
    };

    const loadNextOnlineChapter = async () => {
        // Silent return if already tried or loading
        if (hasTriedLoadingNextRef.current || isLoadingNextOnline) return;

        addLog(`loadNextOnlineChapter called. Source: ${manga?.source}, ID: ${manga?.sourceMangaId}`);

        if (!manga || !manga.source || !manga.sourceMangaId) {
            if (!manga?.source) addLog("Missing source");
            if (!manga?.sourceMangaId) addLog("Missing sourceMangaId");
            return;
        }

        hasTriedLoadingNextRef.current = true;
        setIsLoadingNextOnline(true);
        addLog(`Checking for next online chapter from ${manga.source}...`);

        try {
            let nextChapterData = null;
            let nextChapterPages: string[] = [];

            if (manga.source === 'mangapill') {
                const slug = manga.sourceMangaId;
                const onlineChapters = await MangaPillService.getChapters(manga.id, slug);

                // Find current chapter in the online list by matching numbers
                const lastLoaded = loadedChapters[loadedChapters.length - 1];
                const getChapterNum = (title: string) => {
                    const m = title.match(/Chapter\s*(\d+(\.\d+)?)/i) || title.match(/(\d+(\.\d+)?)/);
                    return m ? parseFloat(m[1] || m[0]) : -1;
                };
                const lastNum = getChapterNum(lastLoaded.title);

                const sortedIndex = onlineChapters.findIndex(c => Math.abs(parseFloat(c.number) - lastNum) < 0.01);

                if (sortedIndex !== -1 && sortedIndex < onlineChapters.length - 1) {
                    nextChapterData = onlineChapters[sortedIndex + 1];
                    addLog(`Found next chapter: ${nextChapterData.title} (Num: ${nextChapterData.number})`);
                    nextChapterPages = await MangaPillService.getChapterPages(nextChapterData.url);
                } else {
                    addLog(`Could not find current chapter ${lastLoaded.title} (Num: ${lastNum}) in online list.`);
                }
            } else if (manga.source === 'webtoon') {
                const mangaId = manga.sourceMangaId;
                const lastLoaded = loadedChapters[loadedChapters.length - 1];

                // Helper to extract number
                const getEpisodeNum = (title: string) => {
                    const m = title.match(/Episode\s*(\d+)/i) || title.match(/Ep\.?\s*(\d+)/i) || title.match(/#(\d+)/) || title.match(/^(\d+)$/);
                    return m ? parseInt(m[1]) : -1;
                };

                const lastNum = getEpisodeNum(lastLoaded.title);
                addLog(`Webtoon: Last loaded chapter number: ${lastNum}`);

                if (lastNum !== -1) {
                    const targetNum = lastNum + 1;
                    addLog(`Webtoon: Looking for Episode ${targetNum}...`);

                    // 1. Fetch Page 1 to get metadata (Latest Ep, Max Page)
                    let { chapters: page1Chapters, maxPage } = await WebtoonService.getChapters(mangaId, 1);

                    const findChapter = (list: any[], num: number) => list.find(c => {
                        const cNum = getEpisodeNum(c.title);
                        const cIdNum = parseInt(c.id);
                        return cNum === num || cIdNum === num;
                    });

                    // Check Page 1 first
                    nextChapterData = findChapter(page1Chapters, targetNum);

                    if (!nextChapterData && maxPage > 1) {
                        // 2. Smart Pagination Heuristic
                        const latestEp = page1Chapters[0];
                        const latestNum = getEpisodeNum(latestEp.title);

                        if (latestNum !== -1) {
                            const itemsPerPage = page1Chapters.length; // usually 10
                            const diff = latestNum - targetNum;
                            let estimatedPage = 1 + Math.floor(diff / itemsPerPage);
                            estimatedPage = Math.min(estimatedPage, maxPage);
                            estimatedPage = Math.max(estimatedPage, 1);

                            addLog(`Webtoon: Heuristic estimated page ${estimatedPage} (Latest: ${latestNum}, Target: ${targetNum})`);

                            if (estimatedPage !== 1) {
                                const { chapters: estimatedChapters, maxPage: newMax } = await WebtoonService.getChapters(mangaId, estimatedPage);
                                nextChapterData = findChapter(estimatedChapters, targetNum);
                                if (newMax > maxPage) maxPage = newMax;
                            }

                            // 3. Fallback: Check last page
                            if (!nextChapterData) {
                                const { chapters: lastPageChapters } = await WebtoonService.getChapters(mangaId, maxPage);
                                nextChapterData = findChapter(lastPageChapters, targetNum);
                            }
                        }
                    }

                    // 3. Fallback: Pagination Traversal
                    // If the heuristic failed, it might be because maxPage was only the *visible* max page (e.g. 10)
                    // but the true max page is 20. We need to traverse.
                    if (!nextChapterData && maxPage > 1) {
                        addLog(`Webtoon: Heuristic failed. Starting Pagination Traversal...`);

                        let currentSearchPage = maxPage;
                        let attempts = 0;
                        const MAX_ATTEMPTS = 5; // Prevent infinite loops
                        const visitedPages = new Set<number>();
                        visitedPages.add(1); // We already checked page 1

                        while (!nextChapterData && attempts < MAX_ATTEMPTS) {
                            if (visitedPages.has(currentSearchPage)) {
                                break; // Already checked this page
                            }
                            visitedPages.add(currentSearchPage);

                            addLog(`Webtoon: Checking Page ${currentSearchPage}...`);
                            const { chapters: pageChapters, maxPage: newMaxPage } = await WebtoonService.getChapters(mangaId, currentSearchPage);

                            // Check if target is in this list
                            nextChapterData = findChapter(pageChapters, targetNum);
                            if (nextChapterData) break;

                            // If we found a new max page that is greater than where we are, jump to it
                            if (newMaxPage > currentSearchPage) {
                                currentSearchPage = newMaxPage;
                                attempts++;
                            } else {
                                // We reached the true end
                                break;
                            }
                        }
                    }

                    if (nextChapterData) {
                        addLog(`Webtoon: Found Episode ${targetNum}`);
                        nextChapterPages = await WebtoonService.getChapterPages(mangaId, nextChapterData.id);
                    } else {
                        addLog(`Webtoon: Could not find Episode ${targetNum} using heuristic or fallbacks.`);
                        addLog(`Debug: MaxPage=${maxPage}, Target=${targetNum}`);
                    }
                } else {
                    addLog(`Webtoon: Could not parse number from title: ${lastLoaded.title}`);
                }
            }

            if (nextChapterData && nextChapterPages.length > 0) {
                const newChapter: LoadedChapter = {
                    id: nextChapterData.id, // Use online ID
                    title: nextChapterData.title,
                    pages: nextChapterPages,
                    status: 'loaded'
                };

                // Check if already exists (by title) to avoid duplicates
                if (!loadedChapters.some(c => c.title === newChapter.title)) {
                    setLoadedChapters(prev => [...prev, newChapter]);
                    addLog(`Loaded online chapter: ${newChapter.title}`);

                    // [NEW] Download to local storage in background
                    const downloadAndSave = async () => {
                        try {
                            addLog(`Auto-downloading ${nextChapterData.title} to local storage...`);
                            const fileName = await DownloadService.downloadChapter(
                                nextChapterData.title,
                                manga.title,
                                async () => nextChapterPages, // Pages already fetched
                                { 'Referer': 'https://www.webtoons.com/' }
                            );

                            addLog(`Downloaded ${nextChapterData.title} as ${fileName}`);

                            // Update chapter metadata with local fileName
                            const newChapterMeta: Chapter = {
                                id: nextChapterData.id,
                                title: nextChapterData.title,
                                fileName: fileName // Use local file instead of 'online'
                            };

                            setAllChapters(prev => [...prev, newChapterMeta]);
                            saveProgress({ newChapter: newChapterMeta });
                        } catch (err) {
                            addLog(`Failed to download ${nextChapterData.title}: ${err}`);
                            // Fallback to online reference
                            const newChapterMeta: Chapter = {
                                id: nextChapterData.id,
                                title: nextChapterData.title,
                                fileName: 'online'
                            };
                            setAllChapters(prev => [...prev, newChapterMeta]);
                            saveProgress({ newChapter: newChapterMeta });
                        }
                    };

                    // Fire and forget - don't wait
                    downloadAndSave();
                }
            } else {
                addLog("No next online chapter found.");
            }

        } catch (error) {
            console.error("Failed to load next online chapter", error);
            addLog("Error loading online chapter");
        } finally {
            setIsLoadingNextOnline(false);
        }
    };

    useEffect(() => {
        console.log('[Reader] MOUNTED');
        return () => console.log('[Reader] UNMOUNTED');
    }, []);

    // Determine default reading mode
    // Determine default reading mode
    useEffect(() => {
        if (mangaType === 'Manhwa' || mangaType === 'Manhua' || mangaType === 'Webtoon') {
            setReadingMode('vertical');
        } else {
            setReadingMode('rtl'); // Default for Manga
        }
    }, [mangaType]);



    // Sync activeChapterId with prop and ref
    useEffect(() => {
        setActiveChapterId(currentChapterId);
        activeChapterIdRef.current = currentChapterId;
    }, [currentChapterId]);

    // Initial Load
    useEffect(() => {
        const init = async () => {
            // If we already have this chapter loaded (seamless transition), don't reload everything
            if (loadedChapters.some(c => c.id === currentChapterId)) {
                return;
            }

            const currentChapter = chapters.find(c => c.id === currentChapterId);
            if (!currentChapter) {
                addLog(`ERROR: Chapter not found! ID: ${currentChapterId}`);
                addLog(`Available chapters: ${chapters.length}`);
                if (chapters.length > 0) {
                    addLog(`First chap ID: ${chapters[0].id}`);
                }
                return;
            }

            addLog(`Init chapter: ${currentChapterId}(${currentChapter.title})`);

            // Only reset if it's a fresh load (not in list)
            setLoadedChapters([{
                id: currentChapter.id,
                title: currentChapter.title,
                pages: [],
                status: 'loading'
            }]);

            try {
                let pages: string[] = [];
                // Check if online chapter - ONLY check fileName
                if (currentChapter.fileName === 'online') {
                    // It's an online chapter, fetch pages
                    addLog(`Initializing online chapter: ${currentChapter.title}`);

                    // Extract episode number from title (WebtoonService expects episode_no, not internal UUID)
                    const extractEpisodeNum = (title: string): string => {
                        const m = title.match(/Episode\s*(\d+)/i) || title.match(/Ep\.?\s*(\d+)/i) || title.match(/#(\d+)/) || title.match(/^(\d+)$/);
                        return m ? m[1] : currentChapter.id; // Fallback to ID if no number found
                    };

                    const episodeNum = extractEpisodeNum(currentChapter.title);
                    addLog(`Extracted episode number: ${episodeNum} from title: ${currentChapter.title}`);

                    if (manga?.source === 'webtoon' && manga.sourceMangaId) {
                        pages = await WebtoonService.getChapterPages(manga.sourceMangaId, episodeNum);
                    } else if (manga?.source === 'mangapill' && manga.sourceMangaId) {
                        pages = await WebtoonService.getChapterPages(manga.sourceMangaId, episodeNum);
                    }
                } else {
                    // Local chapter
                    addLog(`Loading local chapter from file: ${currentChapter.fileName}`);
                    pages = await getChapterContent(currentChapter.fileName);
                }

                setLoadedChapters([{
                    id: currentChapter.id,
                    title: currentChapter.title,
                    pages,
                    status: 'loaded'
                }]);
                addLog(`Loaded ${pages.length} pages for ${currentChapterId}`);

            } catch (err) {
                console.error("Failed to load initial chapter", err);
                addLog(`Error loading chapter: ${err} `);
                setLoadedChapters(prev => prev.map(c => c.id === currentChapterId ? { ...c, status: 'error' } : c));
            }
        };

        init();
    }, [currentChapterId]);

    // Handle Initial Page Scroll (Resume)
    useEffect(() => {
        if (loadedChapters.length === 0) return;

        const activeChapter = loadedChapters.find(c => c.id === currentChapterId);

        if (activeChapter && activeChapter.status === 'loaded' && !hasInitialScrolledRef.current) {
            addLog(`Resume triggered.Page: ${initialPage}, Chapter: ${activeChapter.id} `);

            if (initialPage === 'last') {
                if (verticalContainerRef.current) {
                    addLog('Scrolling to bottom (last page)');
                    verticalContainerRef.current.scrollTop = verticalContainerRef.current.scrollHeight;
                    hasInitialScrolledRef.current = true;
                }
            } else if (typeof initialPage === 'number' && initialPage > 0) {
                isResumingRef.current = true;
                // Polling for element
                let attempts = 0;
                addLog(`Starting poll for page ${initialPage}`);
                const interval = setInterval(() => {
                    attempts++;
                    const chapterEl = document.getElementById(`chapter-${activeChapter.id}`);
                    if (chapterEl) {
                        const images = chapterEl.querySelectorAll('.chapter-image');
                        if (images[initialPage]) {
                            addLog(`Found page ${initialPage} on attempt ${attempts}, scrolling...`);
                            images[initialPage].scrollIntoView({ block: 'start' });
                            hasInitialScrolledRef.current = true;
                            setCurrentPage(initialPage as number); // Sync UI immediately
                            clearInterval(interval);

                            setTimeout(() => {
                                isResumingRef.current = false;
                                addLog('Resume complete, scroll events enabled');
                            }, 1000);
                        }
                    }
                    if (attempts > 50) { // 5 seconds
                        addLog('Resume timed out (element not found)');
                        clearInterval(interval);
                        isResumingRef.current = false;
                    }
                }, 100);
            } else {
                addLog('Initial page is 0, no scroll needed');
                hasInitialScrolledRef.current = true;
            }
        }
    }, [chapters, loadedChapters]);

    const loadChapter = async (chapter: Chapter, position: 'append' | 'prepend'): Promise<string[]> => {
        if (isLoadingRef.current) return [];
        isLoadingRef.current = true;

        // Add placeholder
        const newChapterState: LoadedChapter = {
            id: chapter.id,
            title: chapter.title,
            pages: [],
            status: 'loading'
        };

        if (position === 'prepend') {
            // Save scroll anchor
            if (verticalContainerRef.current) {
                const firstChild = verticalContainerRef.current.firstElementChild as HTMLElement;
                if (firstChild) {
                    scrollAnchorRef.current = {
                        id: firstChild.id,
                        offset: firstChild.getBoundingClientRect().top
                    };
                }
            }
            setLoadedChapters(prev => [newChapterState, ...prev]);
        } else {
            setLoadedChapters(prev => [...prev, newChapterState]);
        }

        try {
            const pages = await getChapterContent(chapter.fileName);

            setLoadedChapters(prev => prev.map(c => c.id === chapter.id ? { ...c, pages, status: 'loaded' } : c));

            // Memory Cleanup (Keep max 3 chapters)
            setLoadedChapters(prev => {
                if (prev.length > 3) {
                    if (position === 'append') {
                        // Cleanup Adjustment Logic
                        const firstChapterId = prev[0].id;

                        // CRITICAL: Do not remove the chapter the user is currently reading!
                        if (firstChapterId === activeChapterIdRef.current) {
                            return prev;
                        }

                        const firstEl = document.getElementById(`chapter - ${firstChapterId} `);
                        if (firstEl && verticalContainerRef.current) {
                            const height = firstEl.clientHeight;
                            scrollAdjustmentRef.current = -height;
                        }
                        return prev.slice(1); // Remove first
                    } else {
                        return prev.slice(0, -1); // Remove last
                    }
                }
                return prev;
            });

            return pages;

        } catch (err) {
            console.error("Failed to load chapter", err);
            addLog(`Error loading chapter content: ${err} `);
            setLoadedChapters(prev => prev.map(c => c.id === chapter.id ? { ...c, status: 'error' } : c));
            return [];
        } finally {
            isLoadingRef.current = false;
        }
    };

    // Scroll Restoration for Prepend & Cleanup Adjustment
    useLayoutEffect(() => {
        if (verticalContainerRef.current) {
            // Handle Prepend Restoration
            if (scrollAnchorRef.current) {
                const anchor = scrollAnchorRef.current;
                const element = document.getElementById(`chapter - ${anchor.id} `);
                if (element) {
                    addLog(`Restoring scroll to anchor: ${anchor.id} `);
                    element.scrollIntoView({ block: 'start' });
                    scrollAnchorRef.current = null;
                }
            }

            // Handle Cleanup Adjustment (when removing from top)
            if (scrollAdjustmentRef.current !== 0) {
                addLog(`Adjusting scroll by ${scrollAdjustmentRef.current} px`);
                verticalContainerRef.current.scrollTop += scrollAdjustmentRef.current;
                scrollAdjustmentRef.current = 0;
            }
        }
    }, [loadedChapters]);

    // Scroll Handler for Infinite Scroll
    const handleScroll = async () => {
        if (readingMode !== 'vertical' || !verticalContainerRef.current || isLoadingRef.current || isResumingRef.current) return;

        const container = verticalContainerRef.current;
        const scrollTop = container.scrollTop;
        const clientHeight = container.clientHeight;

        // 1. Detect Active Chapter & Page
        let bestChapterId = activeChapterIdRef.current;
        const containerRect = container.getBoundingClientRect();
        const centerY = containerRect.top + (clientHeight / 2);

        let foundCenter = false;

        loadedChapters.forEach(chapter => {
            const chapterEl = document.getElementById(`chapter-${chapter.id}`);
            if (chapterEl) {
                const rect = chapterEl.getBoundingClientRect();
                if (rect.top <= centerY && rect.bottom >= centerY) {
                    bestChapterId = chapter.id;
                    foundCenter = true;
                }
            }
        });

        if (!foundCenter) {
            let maxVisibility = 0;
            loadedChapters.forEach(chapter => {
                const chapterEl = document.getElementById(`chapter-${chapter.id}`);
                if (chapterEl) {
                    const rect = chapterEl.getBoundingClientRect();
                    const intersection = Math.max(0, Math.min(rect.bottom, containerRect.bottom) - Math.max(rect.top, containerRect.top));
                    if (intersection > maxVisibility) {
                        maxVisibility = intersection;
                        bestChapterId = chapter.id;
                    }
                }
            });
        }

        // Find current page within active chapter (MUST calculate BEFORE chapter change)
        let bestPage = 0;
        if (bestChapterId) {
            const chapterEl = document.getElementById(`chapter-${bestChapterId}`);
            if (chapterEl) {
                const images = chapterEl.querySelectorAll('.chapter-image');
                let minDist = Infinity;
                const centerY = clientHeight / 2;

                images.forEach((img, index) => {
                    const rect = img.getBoundingClientRect();
                    const imgCenter = rect.top + (rect.height / 2);
                    const dist = Math.abs(imgCenter - centerY);

                    if (dist < minDist) {
                        minDist = dist;
                        bestPage = index;
                    }
                });
                setCurrentPage(bestPage);
            }
        }

        // Handle chapter change (now we have bestPage calculated)
        if (bestChapterId !== activeChapterIdRef.current) {
            const prevIndex = allChapters.findIndex(c => c.id === activeChapterIdRef.current);
            const newIndex = allChapters.findIndex(c => c.id === bestChapterId);

            addLog(`Chapter change: ${activeChapterIdRef.current} -> ${bestChapterId}`);
            addLog(`Indices: ${prevIndex} -> ${newIndex}`);

            // Update active chapter (do NOT mark previous as read on transition)
            activeChapterIdRef.current = bestChapterId;
            setActiveChapterId(bestChapterId);
            onChapterChange(bestChapterId);

            // Save progress - NOW with currentPage included
            saveProgress({ currentChapterId: bestChapterId, currentPage: bestPage });
        }

        // Update progress and check for completion
        if (bestChapterId) {
            const currentChap = loadedChapters.find(c => c.id === bestChapterId);
            if (currentChap && onProgress) {
                // Call onProgress to update App.tsx state
                onProgress(bestPage, currentChap.pages.length, bestChapterId);

                // [NEW] Mark as complete if on last page (only once per chapter)
                const isLastPage = bestPage >= currentChap.pages.length - 1;
                if (isLastPage && !completedChaptersRef.current.has(bestChapterId)) {
                    completedChaptersRef.current.add(bestChapterId);
                    addLog(`Reached last page of ${bestChapterId}, marking as complete`);
                    if (onChapterComplete) {
                        onChapterComplete(bestChapterId);
                    }
                    // CRITICAL: Also save currentChapterId and currentPage when completing
                    saveProgress({
                        completedChapterId: bestChapterId,
                        currentChapterId: bestChapterId,
                        currentPage: bestPage
                    });
                }
            }
        }

        // 2. Infinite Scroll Logic
        // Trigger when scrolled past 70% of the CURRENT ACTIVE CHAPTER
        let isNearBottomOfChapter = false;
        if (bestChapterId) {
            const activeChap = loadedChapters.find(c => c.id === bestChapterId);
            if (activeChap) {
                const chapterProgress = (bestPage + 1) / activeChap.pages.length;
                isNearBottomOfChapter = chapterProgress >= 0.7;
                if (isNearBottomOfChapter && !nearBottomLoggedRef.current.has(bestChapterId)) {
                    nearBottomLoggedRef.current.add(bestChapterId);
                    addLog(`Near bottom of chapter: ${bestPage + 1}/${activeChap.pages.length} (${Math.round(chapterProgress * 100)}%)`);
                }
            }
        }

        const isNearTop = scrollTop < 1000;

        if (isNearBottomOfChapter) {
            const lastLoaded = loadedChapters[loadedChapters.length - 1];
            if (lastLoaded.status !== 'loaded') return;

            const currentIndex = allChapters.findIndex(c => c.id === lastLoaded.id);
            if (currentIndex !== -1 && currentIndex < allChapters.length - 1) {
                const nextChapter = allChapters[currentIndex + 1];
                if (!loadedChapters.some(c => c.id === nextChapter.id)) {
                    addLog(`Loading next chapter: ${nextChapter.title}`);
                    await loadChapter(nextChapter, 'append');
                }
            } else if (currentIndex === allChapters.length - 1) {
                if (manga?.source && manga?.sourceMangaId) {
                    loadNextOnlineChapter();
                } else if (onFinish) {
                    onFinish();
                }
            }
        }

        if (isNearTop) {
            const firstLoaded = loadedChapters[0];
            if (firstLoaded.status !== 'loaded') return;

            const currentIndex = allChapters.findIndex(c => c.id === firstLoaded.id);
            if (currentIndex > 0) {
                const prevChapter = allChapters[currentIndex - 1];
                if (!loadedChapters.some(c => c.id === prevChapter.id)) {
                    addLog(`Loading prev chapter: ${prevChapter.title}`);
                    await loadChapter(prevChapter, 'prepend');
                }
            }
        }
    };

    const handleHorizontalScroll = async () => {
        if (!horizontalContainerRef.current || isLoadingRef.current) return;

        const container = horizontalContainerRef.current;
        const clientWidth = container.clientWidth;

        // 1. Detect Active Page
        const centerX = container.getBoundingClientRect().left + (clientWidth / 2);
        const centerY = container.getBoundingClientRect().top + (container.clientHeight / 2);

        const centerEl = document.elementFromPoint(centerX, centerY);
        const pageContainer = centerEl?.closest('.page-container') as HTMLElement;

        if (pageContainer) {
            const chapterId = pageContainer.getAttribute('data-chapter-id');
            const pageIndex = parseInt(pageContainer.getAttribute('data-page-index') || '0');

            if (chapterId && chapterId !== activeChapterIdRef.current) {
                // Chapter Changed
                addLog(`Horizontal: Chapter change ${activeChapterIdRef.current} -> ${chapterId}`);
                activeChapterIdRef.current = chapterId;
                setActiveChapterId(chapterId);
                onChapterChange(chapterId);
            }

            if (chapterId && pageIndex !== currentPage) {
                setCurrentPage(pageIndex);
                const currentChap = loadedChapters.find(c => c.id === chapterId);
                if (currentChap && onProgress) {
                    onProgress(pageIndex, currentChap.pages.length, chapterId);
                }
            }
        }

        // 2. Infinite Scroll Logic (Horizontal)
        const isRTL = readingMode === 'rtl';

        // Check Last Chapter (Next)
        const lastChapter = loadedChapters[loadedChapters.length - 1];
        if (lastChapter.status === 'loaded') {
            // Trigger earlier: Check if we are viewing one of the last 5 pages
            const totalPages = lastChapter.pages.length;
            const thresholdPage = Math.max(0, totalPages - 5);

            if (activeChapterId === lastChapter.id && currentPage >= thresholdPage) {
                const currentIndex = chapters.findIndex(c => c.id === lastChapter.id);

                if (currentIndex < chapters.length - 1) {
                    const nextChapter = chapters[currentIndex + 1];
                    if (!loadedChapters.some(c => c.id === nextChapter.id)) {
                        addLog(`Horizontal: Pre-loading next chapter ${nextChapter.title}`);
                        await loadChapter(nextChapter, 'append');
                    }
                } else {
                    if (manga?.source && manga?.sourceMangaId) {
                        loadNextOnlineChapter();
                    }
                }
            }
        }

        // Check First Chapter (Prev)
        const firstChapter = loadedChapters[0];
        if (firstChapter.status === 'loaded') {
            const firstPageId = `page-${firstChapter.id}-0`;
            const firstPageEl = document.getElementById(firstPageId);
            if (firstPageEl) {
                const rect = firstPageEl.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();

                const isVisible = isRTL
                    ? (rect.left <= containerRect.right && rect.right >= containerRect.right - 100)
                    : (rect.right >= containerRect.left && rect.left <= containerRect.left + 100);

                if (isVisible) {
                    const currentIndex = chapters.findIndex(c => c.id === firstChapter.id);
                    if (currentIndex > 0) {
                        const prevChapter = chapters[currentIndex - 1];
                        if (!loadedChapters.some(c => c.id === prevChapter.id)) {
                            addLog(`Horizontal: Loading prev chapter ${prevChapter.title}`);
                            await loadChapter(prevChapter, 'prepend');
                        }
                    }
                }
            }
        }
    };

    // Single Page Navigation Logic

    // Close settings when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // Check if click is outside settings AND not on the toggle button
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node) &&
                settingsBtnRef.current && !settingsBtnRef.current.contains(event.target as Node)) {
                setShowSettings(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
            {/* Debug Overlay */}
            {showDebug && (
                <div className="absolute top-20 left-4 z-[100] bg-black/90 text-green-400 p-2 rounded text-[10px] font-mono max-w-[80vw] max-h-60 overflow-y-auto border border-green-900 shadow-lg break-words">
                    <div className="font-bold border-b border-green-900 mb-1 pb-1 text-xs flex justify-between items-center">
                        <span>Debug Logs</span>
                        <button
                            onClick={() => {
                                const text = debugLogs.join('\n');
                                navigator.clipboard.writeText(text);
                                alert('Logs copied to clipboard');
                            }}
                            className="bg-green-900/50 hover:bg-green-900 px-2 py-0.5 rounded text-[9px] uppercase transition-colors"
                        >
                            Copy
                        </button>
                    </div>
                    {debugLogs.map((log, i) => (
                        <div key={i} className="mb-0.5 border-b border-green-900/30 pb-0.5">{log}</div>
                    ))}
                </div>
            )}

            {/* Header Controls */}
            <AnimatePresence>
                {showControls && (
                    <motion.div
                        initial={{ y: -100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -100, opacity: 0 }}
                        className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-50 flex justify-between items-start"
                    >
                        <button onClick={onClose} className="p-2 bg-black/50 rounded-full text-white backdrop-blur-md">
                            <X size={24} />
                        </button>

                        <div className="flex gap-2 relative">
                            <div className="bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium text-white border border-white/10 flex items-center">
                                <span className="mr-2 max-w-[150px] truncate">
                                    {loadedChapters.find(c => c.id === activeChapterId)?.title || `Chapter ${activeChapterId}`}
                                </span>
                                <span className="text-white/50">|</span>
                                <span className="ml-2">
                                    Page {currentPage + 1} / {loadedChapters.find(c => c.id === activeChapterId)?.pages.length || '?'}
                                </span>
                            </div>
                            <button
                                ref={settingsBtnRef}
                                onClick={() => setShowSettings(!showSettings)}
                                className="p-2 bg-black/50 rounded-full text-white backdrop-blur-md"
                            >
                                <Settings size={24} />
                            </button>
                            {/* <button
                                onClick={() => setShowDebug(!showDebug)}
                                className={`p-2 rounded-full text-white backdrop-blur-md ${showDebug ? 'bg-green-900/50 text-green-400' : 'bg-black/50'}`}
                            >
                                <Bug size={24} />
                            </button> */}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Settings Modal */}
            <AnimatePresence>
                {showSettings && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute top-16 right-4 z-50 bg-gray-900 border border-gray-800 p-4 rounded-xl shadow-2xl w-64"
                        ref={settingsRef}
                    >
                        <h3 className="text-white font-bold mb-3">Reading Settings</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-gray-400 text-xs uppercase font-bold mb-2 block">Reading Mode</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['vertical', 'Left to right', 'Right to left'].map(mode => (
                                        <button
                                            key={mode}
                                            onClick={() => setReadingMode(mode === 'Left to right' ? 'ltr' : mode === 'Right to left' ? 'rtl' : mode as any)}
                                            className={`px-2 py-1.5 rounded text-xs font-medium capitalize transition-colors ${(readingMode === 'vertical' && mode === 'vertical') ||
                                                (readingMode === 'ltr' && mode === 'Left to right') ||
                                                (readingMode === 'rtl' && mode === 'Right to left')
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                                }`}
                                        >
                                            {mode}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Reader Area */}
            <div
                className="flex-1 relative w-full h-full"
                onClick={() => setShowControls(prev => !prev)}
            >
                {readingMode === 'vertical' ? (
                    <div
                        ref={verticalContainerRef}
                        className="w-full h-full overflow-y-auto overflow-x-hidden scroll-smooth"
                        onScroll={handleScroll}
                    >
                        {loadedChapters.map((chapter) => (
                            <div key={chapter.id} id={`chapter-${chapter.id}`} className="flex flex-col items-center min-h-screen" data-chapter-id={chapter.id}>
                                {chapter.status === 'loading' && (
                                    <div className="w-full h-96 flex flex-col items-center justify-center text-gray-500 gap-4">
                                        <Loader2 className="animate-spin" size={40} />
                                        <p>Loading {chapter.title}...</p>
                                    </div>
                                )}
                                {chapter.status === 'error' && (
                                    <div className="w-full h-96 flex items-center justify-center text-red-500">
                                        <p>Failed to load {chapter.title}</p>
                                    </div>
                                )}
                                {chapter.status === 'loaded' && chapter.pages.map((page, index) => (
                                    <div key={index} className="w-full max-w-3xl mx-auto relative chapter-image" id={`page-${chapter.id}-${index}`}>
                                        <SecureImage
                                            src={page}
                                            alt={`Page ${index + 1}`}
                                        />
                                    </div>
                                ))}
                                <div className="h-20 flex items-center justify-center text-gray-600 text-sm">
                                    End of {chapter.title}
                                </div>
                            </div>
                        ))}
                        {isLoadingNextOnline && (
                            <div className="w-full py-8 flex flex-col items-center justify-center text-blue-400 gap-2">
                                <Loader2 className="animate-spin" size={32} />
                                <p className="text-sm font-medium">Fetching next chapter...</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div
                        ref={horizontalContainerRef}
                        className={`w-full h-full overflow-x-auto overflow-y-hidden flex flex-row snap-x snap-mandatory`}
                        dir={readingMode === 'rtl' ? 'rtl' : 'ltr'}
                        onScroll={handleHorizontalScroll}
                    >
                        {loadedChapters.map((chapter) => (
                            <div key={chapter.id} className="flex flex-shrink-0" data-chapter-id={chapter.id}>
                                {chapter.status === 'loaded' && chapter.pages.map((page, index) => (
                                    <div
                                        key={index}
                                        className="w-screen h-full flex-shrink-0 snap-center flex items-center justify-center bg-black page-container"
                                        data-chapter-id={chapter.id}
                                        data-page-index={index}
                                        id={`page-${chapter.id}-${index}`}
                                    >
                                        <ZoomableImage
                                            src={page}
                                            alt={`Page ${index + 1}`}
                                            onDoubleTap={() => setShowControls(prev => !prev)}
                                        />
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
