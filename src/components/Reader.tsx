import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import { X, ArrowDown, ArrowRight, ArrowLeft, Settings, Bug, Loader2 } from 'lucide-react';
import type { Chapter } from '../services/StorageService';

interface ReaderProps {
    chapterFileName: string;
    currentChapterId: string;
    chapters: Chapter[];
    onClose: () => void;
    onChapterChange: (chapterId: string) => void;
    getChapterContent: (fileName: string) => Promise<string[]>;
    initialPage?: number | 'last';
    onProgress?: (page: number, total: number, chapterId?: string) => void;
    onChapterComplete?: (chapterId: string) => void;
    onFinish?: () => void;
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
            if (currentScale < 1) {
                animate(scale, 1);
                animate(x, 0);
                animate(y, 0);
                setConstraintScale(1);
            } else {
                setConstraintScale(currentScale);
            }
        }
    };

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
                src={src}
                alt={alt}
                style={{ x, y, scale, cursor: constraintScale > 1 ? 'grab' : 'default' }}
                className="max-w-full max-h-full object-contain select-none"
                drag={constraintScale > 1}
                dragElastic={0.1}
                dragConstraints={{
                    left: -xLimit,
                    right: xLimit,
                    top: -yLimit,
                    bottom: yLimit
                }}
            />
        </div>
    );
};

export const Reader: React.FC<ReaderProps> = ({
    currentChapterId,
    chapters,
    onClose,
    onChapterChange,
    getChapterContent,
    initialPage = 0,
    onProgress,
    onChapterComplete,
    onFinish,
    mangaType
}) => {
    // State
    const [loadedChapters, setLoadedChapters] = useState<LoadedChapter[]>([]);
    const [readingMode, setReadingMode] = useState<'vertical' | 'ltr' | 'rtl'>('vertical');
    const [showControls, setShowControls] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [activeChapterId, setActiveChapterId] = useState<string>(currentChapterId);
    const [currentPage, setCurrentPage] = useState(0); // Relative to active chapter

    // Debug State
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [showDebug, setShowDebug] = useState(true);

    const addLog = (msg: string) => {
        console.log(msg);
        setDebugLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
    };

    // Refs
    const verticalContainerRef = useRef<HTMLDivElement>(null);
    const horizontalContainerRef = useRef<HTMLDivElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const isLoadingRef = useRef(false);
    const scrollAnchorRef = useRef<{ id: string, offset: number } | null>(null);
    const scrollAdjustmentRef = useRef<number>(0);
    const isResumingRef = useRef(false);
    const activeChapterIdRef = useRef(currentChapterId);
    const hasInitialScrolledRef = useRef(false);

    useEffect(() => {
        console.log('[Reader] MOUNTED');
        return () => console.log('[Reader] UNMOUNTED');
    }, []);

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

            addLog(`Init chapter: ${currentChapterId} (${currentChapter.title})`);

            // Only reset if it's a fresh load (not in list)
            setLoadedChapters([{
                id: currentChapter.id,
                title: currentChapter.title,
                pages: [],
                status: 'loading'
            }]);

            try {
                const pages = await getChapterContent(currentChapter.fileName);
                setLoadedChapters([{
                    id: currentChapter.id,
                    title: currentChapter.title,
                    pages,
                    status: 'loaded'
                }]);
                addLog(`Loaded ${pages.length} pages for ${currentChapterId}`);

            } catch (err) {
                console.error("Failed to load initial chapter", err);
                addLog(`Error loading chapter: ${err}`);
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
            addLog(`Resume triggered. Page: ${initialPage}, Chapter: ${activeChapter.id}`);

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

                        const firstEl = document.getElementById(`chapter-${firstChapterId}`);
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
            addLog(`Error loading chapter content: ${err}`);
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
                const element = document.getElementById(`chapter-${anchor.id}`);
                if (element) {
                    addLog(`Restoring scroll to anchor: ${anchor.id}`);
                    element.scrollIntoView({ block: 'start' });
                    scrollAnchorRef.current = null;
                }
            }

            // Handle Cleanup Adjustment (when removing from top)
            if (scrollAdjustmentRef.current !== 0) {
                addLog(`Adjusting scroll by ${scrollAdjustmentRef.current}px`);
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
        const scrollHeight = container.scrollHeight;
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

        if (bestChapterId !== activeChapterIdRef.current) {
            const prevIndex = chapters.findIndex(c => c.id === activeChapterIdRef.current);
            const newIndex = chapters.findIndex(c => c.id === bestChapterId);

            addLog(`Chapter change: ${activeChapterIdRef.current} -> ${bestChapterId}`);
            addLog(`Indices: ${prevIndex} -> ${newIndex}`);

            if (newIndex > prevIndex && onChapterComplete) {
                addLog(`Marking ${activeChapterIdRef.current} as complete`);
                onChapterComplete(activeChapterIdRef.current);
            } else {
                addLog(`Not marking complete. New > Prev: ${newIndex > prevIndex}`);
            }

            activeChapterIdRef.current = bestChapterId;
            setActiveChapterId(bestChapterId);
            onChapterChange(bestChapterId);
        }

        // Find current page within active chapter
        if (bestChapterId) {
            const chapterEl = document.getElementById(`chapter-${bestChapterId}`);
            if (chapterEl) {
                const images = chapterEl.querySelectorAll('.chapter-image');
                let minDist = Infinity;
                const centerY = clientHeight / 2;
                let bestPage = 0;

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
                const currentChap = loadedChapters.find(c => c.id === bestChapterId);
                if (currentChap && onProgress) {
                    onProgress(bestPage, currentChap.pages.length, bestChapterId);
                }
            }
        }

        // 2. Infinite Scroll Logic
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 4000;
        const isNearTop = scrollTop < 1000;

        if (isNearBottom) {
            const lastLoaded = loadedChapters[loadedChapters.length - 1];
            if (lastLoaded.status !== 'loaded') return;

            const currentIndex = chapters.findIndex(c => c.id === lastLoaded.id);
            if (currentIndex !== -1 && currentIndex < chapters.length - 1) {
                const nextChapter = chapters[currentIndex + 1];
                if (!loadedChapters.some(c => c.id === nextChapter.id)) {
                    addLog(`Loading next chapter: ${nextChapter.title}`);
                    await loadChapter(nextChapter, 'append');
                }
            } else if (currentIndex === chapters.length - 1) {
                if (onFinish) {
                    // onFinish(); 
                }
            }
        }

        if (isNearTop) {
            const firstLoaded = loadedChapters[0];
            if (firstLoaded.status !== 'loaded') return;

            const currentIndex = chapters.findIndex(c => c.id === firstLoaded.id);
            if (currentIndex > 0) {
                const prevChapter = chapters[currentIndex - 1];
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
            const lastPageId = `page-${lastChapter.id}-${lastChapter.pages.length - 1}`;
            const lastPageEl = document.getElementById(lastPageId);
            if (lastPageEl) {
                const rect = lastPageEl.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();

                const isVisible = isRTL
                    ? (rect.right >= containerRect.left && rect.left <= containerRect.left + 100)
                    : (rect.left <= containerRect.right && rect.right >= containerRect.right - 100);

                if (isVisible) {
                    const currentIndex = chapters.findIndex(c => c.id === lastChapter.id);
                    if (currentIndex < chapters.length - 1) {
                        const nextChapter = chapters[currentIndex + 1];
                        if (!loadedChapters.some(c => c.id === nextChapter.id)) {
                            addLog(`Horizontal: Loading next chapter ${nextChapter.title}`);
                            await loadChapter(nextChapter, 'append');
                        }
                    } else if (onFinish) {
                        // onFinish();
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
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
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
                                {(() => {
                                    const activeChapter = loadedChapters.find(c => c.id === activeChapterId);
                                    const title = activeChapter?.title || '';
                                    const match = title.match(/Chapter\s*(\d+(\.\d+)?)/i) || title.match(/(\d+(\.\d+)?)/);
                                    const chapNum = match ? match[1] : '';
                                    const chapDisplay = chapNum ? `Chap. ${chapNum}` : (title.length > 10 ? title.substring(0, 10) + '...' : title);

                                    return `${chapDisplay} • Page: ${currentPage + 1} / ${activeChapter?.pages.length || '?'}`;
                                })()}
                            </div>

                            <button
                                onClick={() => setShowDebug(!showDebug)}
                                className={`p-2 rounded-full backdrop-blur-md ${showDebug ? 'bg-green-900/50 text-green-400' : 'bg-black/50 text-white'}`}
                            >
                                <Bug size={20} />
                            </button>

                            <div ref={settingsRef}>
                                <button
                                    onClick={() => setShowSettings(!showSettings)}
                                    className="p-2 bg-black/50 rounded-full text-white backdrop-blur-md"
                                >
                                    <Settings size={20} />
                                </button>

                                {showSettings && (
                                    <div className="absolute top-full right-0 mt-2 w-48 bg-[#1f1f1f] rounded-lg shadow-xl border border-gray-800 overflow-hidden">
                                        <div className="p-2">
                                            <div className="text-xs font-bold text-gray-500 px-2 py-1 mb-1">READING MODE</div>
                                            <button
                                                onClick={() => { setReadingMode('vertical'); setShowSettings(false); }}
                                                className={`w-full text-left px-2 py-2 rounded text-sm flex items-center gap-2 ${readingMode === 'vertical' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#333]'}`}
                                            >
                                                <ArrowDown size={16} /> Vertical
                                            </button>
                                            <button
                                                onClick={() => { setReadingMode('rtl'); setShowSettings(false); }}
                                                className={`w-full text-left px-2 py-2 rounded text-sm flex items-center gap-2 ${readingMode === 'rtl' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#333]'}`}
                                            >
                                                <ArrowLeft size={16} /> Right to Left
                                            </button>
                                            <button
                                                onClick={() => { setReadingMode('ltr'); setShowSettings(false); }}
                                                className={`w-full text-left px-2 py-2 rounded text-sm flex items-center gap-2 ${readingMode === 'ltr' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-[#333]'}`}
                                            >
                                                <ArrowRight size={16} /> Left to Right
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <div
                className="flex-1 relative w-full h-full"
                onClick={() => setShowControls(!showControls)}
            >
                {/* Error UI if no chapters loaded */}
                {loadedChapters.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black text-red-500 flex-col gap-4 z-40">
                        <div className="text-xl font-bold">Error: Chapter Not Found</div>
                        <div className="text-sm text-gray-400">ID: {currentChapterId}</div>
                        <div className="text-xs text-gray-500">
                            Check debug logs for more info.
                        </div>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
                        >
                            Close Reader
                        </button>
                    </div>
                )}

                {readingMode === 'vertical' ? (
                    <div
                        ref={verticalContainerRef}
                        className="w-full h-full overflow-y-auto overflow-x-hidden scroll-smooth"
                        onScroll={handleScroll}
                    >
                        {loadedChapters.map((chapter) => (
                            <div key={chapter.id} id={`chapter-${chapter.id}`} className="flex flex-col min-h-[50vh]">
                                {/* Chapter Divider */}
                                <div className="py-8 flex items-center justify-center gap-4 text-gray-500">
                                    <div className="h-px bg-gray-800 w-20"></div>
                                    <span className="text-xs font-bold uppercase tracking-widest">{chapter.title}</span>
                                    <div className="h-px bg-gray-800 w-20"></div>
                                </div>

                                {chapter.status === 'loading' && (
                                    <div className="h-96 flex items-center justify-center">
                                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                    </div>
                                )}

                                {chapter.status === 'error' && (
                                    <div className="h-96 flex items-center justify-center text-red-500">
                                        Failed to load chapter
                                    </div>
                                )}

                                {chapter.status === 'loaded' && chapter.pages.map((page, index) => (
                                    <img
                                        key={`${chapter.id}-${index}`}
                                        src={page}
                                        alt={`Page ${index + 1}`}
                                        className="w-full h-auto object-contain chapter-image"
                                        loading="lazy"
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                ) : (
                    // Single Page Mode (Horizontal Scroll with Zoom)
                    <div
                        ref={horizontalContainerRef}
                        className="w-full h-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory flex scroll-smooth"
                        style={{ direction: readingMode === 'rtl' ? 'rtl' : 'ltr' }}
                        onScroll={handleHorizontalScroll}
                    >
                        {loadedChapters.map((chapter) => (
                            <React.Fragment key={chapter.id}>
                                {chapter.status === 'loading' && (
                                    <div className="w-full h-full flex items-center justify-center min-w-full snap-center text-gray-500">
                                        <Loader2 className="animate-spin" size={40} />
                                    </div>
                                )}
                                {chapter.status === 'error' && (
                                    <div className="w-full h-full flex items-center justify-center min-w-full snap-center text-red-500">
                                        Failed to load chapter
                                    </div>
                                )}
                                {chapter.status === 'loaded' && chapter.pages.map((page, index) => (
                                    <div
                                        key={`${chapter.id}-${index}`}
                                        id={`page-${chapter.id}-${index}`}
                                        className="min-w-full h-full flex items-center justify-center snap-center snap-always relative page-container"
                                        data-chapter-id={chapter.id}
                                        data-page-index={index}
                                    >
                                        <ZoomableImage
                                            src={page}
                                            alt={`Page ${index + 1}`}
                                            onDoubleTap={() => {
                                                // Toggle controls on zoom reset? Or just zoom.
                                            }}
                                        />
                                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur px-3 py-1 rounded-full text-xs text-white pointer-events-none z-10">
                                            {chapter.title} • {index + 1} / {chapter.pages.length}
                                        </div>
                                    </div>
                                ))}
                            </React.Fragment>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
