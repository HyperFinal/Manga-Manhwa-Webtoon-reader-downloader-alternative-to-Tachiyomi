import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, ArrowDown, ArrowRight, ArrowLeft, ArrowUp, Settings } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { StorageService } from '../services/StorageService';

interface ReaderProps {
    chapterFileName: string;
    onClose: () => void;
    onNextChapter?: () => Promise<boolean>;
    onPrevChapter?: () => Promise<boolean>;
    initialPage?: number | 'last';
    onProgress?: (page: number, total: number) => void;
    onFinish?: () => void;
    mangaType?: string;
}

export const Reader: React.FC<ReaderProps> = ({
    chapterFileName,
    onClose,
    onNextChapter,
    onPrevChapter,
    initialPage = 0,
    onProgress,
    onFinish,
    mangaType
}) => {
    const [pages, setPages] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [readingMode, setReadingMode] = useState<'vertical' | 'ltr' | 'rtl'>('vertical');
    const [currentPage, setCurrentPage] = useState(0);
    const [showControls, setShowControls] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [changingChapter, setChangingChapter] = useState(false);

    // Pull to load state
    const [pullY, setPullY] = useState(0); // Positive = Pull Down (Prev), Negative = Pull Up (Next)
    const isDraggingRef = useRef(false);
    const startYRef = useRef(0);
    const verticalContainerRef = useRef<HTMLDivElement>(null);
    const hasScrolledUpRef = useRef(false);
    const pageOffsetRef = useRef(0);
    const settingsRef = useRef<HTMLDivElement>(null);

    // Determine default reading mode
    useEffect(() => {
        if (mangaType === 'Manhwa' || mangaType === 'Manhua' || mangaType === 'Webtoon') {
            setReadingMode('vertical');
        } else {
            setReadingMode('rtl'); // Default for Manga
        }
    }, [mangaType]);

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

    // Load Chapter
    useEffect(() => {
        const loadBook = async () => {
            setLoading(true);
            setError(null);
            setPages([]);
            setPullY(0);
            hasScrolledUpRef.current = false;
            pageOffsetRef.current = 0;

            try {
                const imagePaths = await StorageService.extractZipToCache(chapterFileName);
                if (imagePaths.length === 0) {
                    throw new Error("No images found in chapter archive.");
                }

                // Always load ALL pages
                setPages(imagePaths);

                // Handle initial page logic
                if (initialPage === 'last') {
                    setCurrentPage(imagePaths.length - 1);
                    // Scroll to bottom logic for vertical mode is handled in another effect
                } else if (typeof initialPage === 'number') {
                    setCurrentPage(initialPage);
                }

            } catch (err) {
                console.error("Failed to load chapter:", err);
                setError("Failed to load chapter. File might be corrupt.");
            } finally {
                setLoading(false);
            }
        };

        loadBook();
    }, [chapterFileName]);

    // Vertical Scroll Position & Intersection Observer
    useEffect(() => {
        if (loading || readingMode !== 'vertical' || pages.length === 0) return;

        // Scroll to initial position
        if (initialPage === 'last') {
            // Scroll to bottom
            setTimeout(() => {
                if (verticalContainerRef.current) {
                    const container = verticalContainerRef.current;
                    // Scroll to slightly above bottom to show we are at the end
                    container.scrollTop = container.scrollHeight - container.clientHeight - 50;
                }
            }, 100);
        } else if (typeof initialPage === 'number' && initialPage > 0) {
            setTimeout(() => {
                const pageElement = document.getElementById(`page-${initialPage}`);
                if (pageElement && verticalContainerRef.current) {
                    verticalContainerRef.current.scrollTop = pageElement.offsetTop;
                }
            }, 100);
        }

        // Intersection Observer for Page Tracking
        const observer = new IntersectionObserver(
            (entries) => {
                let maxRatio = 0;
                let bestPage = -1;

                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const index = parseInt(entry.target.getAttribute('data-index') || '0');
                        if (entry.intersectionRatio > maxRatio) {
                            maxRatio = entry.intersectionRatio;
                            bestPage = index;
                        }
                    }
                });

                if (bestPage !== -1) {
                    setCurrentPage(bestPage);
                }
            },
            {
                threshold: [0, 0.25, 0.5, 0.75, 1.0],
                root: verticalContainerRef.current
            }
        );

        const images = document.querySelectorAll('.chapter-image');
        images.forEach(img => observer.observe(img));

        return () => observer.disconnect();
    }, [loading, readingMode, pages.length, initialPage]);

    // Progress Reporting
    useEffect(() => {
        if (pages.length > 0) {
            onProgress?.(currentPage, pages.length);
        }
    }, [currentPage, pages.length]);

    // Check for Finish (Read Status)
    const handleScroll = () => {
        if (readingMode !== 'vertical' || !verticalContainerRef.current) return;

        const container = verticalContainerRef.current;
        const isBottom = Math.abs(container.scrollHeight - container.scrollTop - container.clientHeight) < 50; // 50px threshold

        if (isBottom && onFinish) {
            onFinish();
        }
    };

    // For non-vertical modes, check finish when reaching last page
    useEffect(() => {
        if (readingMode !== 'vertical' && currentPage === pages.length - 1 && onFinish) {
            onFinish();
        }
    }, [currentPage, readingMode, pages.length]);

    // Pull to Load Logic (Vertical)
    const handleTouchStart = (e: React.TouchEvent) => {
        if (readingMode !== 'vertical' || !verticalContainerRef.current) return;
        const container = verticalContainerRef.current;
        const isTop = container.scrollTop <= 0;
        const isBottom = Math.abs(container.scrollHeight - container.scrollTop - container.clientHeight) < 10;

        if (isTop || isBottom) {
            isDraggingRef.current = true;
            startYRef.current = e.touches[0].clientY;
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDraggingRef.current || !verticalContainerRef.current) return;
        const currentY = e.touches[0].clientY;
        const diff = currentY - startYRef.current;
        const container = verticalContainerRef.current;

        // Pull Down (Prev Chapter) - only if at top
        if (diff > 0 && container.scrollTop <= 0) {
            const newPullY = Math.pow(diff, 0.8);
            setPullY(newPullY);
            if (e.cancelable) e.preventDefault();
        }
        // Pull Up (Next Chapter) - only if at bottom
        else if (diff < 0 && Math.abs(container.scrollHeight - container.scrollTop - container.clientHeight) < 10) {
            const newPullY = -Math.pow(Math.abs(diff), 0.8);
            setPullY(newPullY);
            if (e.cancelable) e.preventDefault();
        } else {
            setPullY(0);
        }
    };

    const handleTouchEnd = async () => {
        isDraggingRef.current = false;

        if (pullY > 80) {
            // Trigger Prev Chapter
            if (onPrevChapter) {
                setChangingChapter(true);
                const success = await onPrevChapter();
                if (!success) setChangingChapter(false);
            }
        } else if (pullY < -80) {
            // Trigger Next Chapter
            if (onNextChapter) {
                setChangingChapter(true);
                const success = await onNextChapter();
                if (!success) setChangingChapter(false);
            }
        }
        setPullY(0);
    };

    // Pagination for Single Page Mode
    const paginate = (newDirection: number) => {
        const newPage = currentPage + newDirection;
        if (newPage >= 0 && newPage < pages.length) {
            setCurrentPage(newPage);
        } else if (newPage >= pages.length && onNextChapter) {
            // Next Chapter
            setChangingChapter(true);
            onNextChapter().then(success => {
                if (!success) setChangingChapter(false);
            });
        } else if (newPage < 0 && onPrevChapter) {
            // Prev Chapter
            setChangingChapter(true);
            onPrevChapter().then(success => {
                if (!success) setChangingChapter(false);
            });
        }
    };

    const variants = {
        enter: (direction: number) => ({
            x: direction > 0 ? 1000 : -1000,
            opacity: 0
        }),
        center: {
            zIndex: 1,
            x: 0,
            opacity: 1
        },
        exit: (direction: number) => ({
            zIndex: 0,
            x: direction < 0 ? 1000 : -1000,
            opacity: 0
        })
    };

    const direction = 0; // Simplified for now

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <span className="text-white font-medium">Loading Chapter...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-6 text-center">
                <div className="text-red-500 mb-4 text-xl">⚠️</div>
                <p className="text-white mb-6">{error}</p>
                <button onClick={onClose} className="px-6 py-2 bg-white text-black rounded-full font-bold">
                    Close
                </button>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
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
                                {currentPage + 1} / {pages.length}
                            </div>

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
                {readingMode === 'vertical' ? (
                    <div
                        ref={verticalContainerRef}
                        className="w-full h-full overflow-y-auto overflow-x-hidden scroll-smooth"
                        onScroll={handleScroll}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                    >
                        {/* Pull Indicator (Top) */}
                        <div
                            className="absolute top-0 left-0 right-0 flex justify-center items-center pointer-events-none z-10"
                            style={{
                                height: '100px',
                                transform: `translateY(${Math.max(0, pullY) - 100}px)`,
                                opacity: Math.min(Math.max(0, pullY) / 80, 1)
                            }}
                        >
                            <div className="flex flex-col items-center text-gray-400 gap-2">
                                <ArrowUp size={24} className={`transition-transform duration-200 ${pullY > 80 ? 'rotate-180' : ''}`} />
                                <span className="text-xs font-medium">
                                    {pullY > 80 ? "Release for prev chapter" : "Pull to load previous"}
                                </span>
                            </div>
                        </div>

                        <motion.div
                            className="max-w-3xl mx-auto flex flex-col"
                            style={{
                                transform: `translateY(${pullY}px)`,
                                transition: isDraggingRef.current ? 'none' : 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                            }}
                        >
                            {pages.map((page, index) => {
                                // Eager load logic
                                const targetPage = typeof initialPage === 'number' ? initialPage : 0;
                                const isNearTarget = Math.abs(index - targetPage) < 3;
                                const isNearEnd = index > pages.length - 4;
                                const shouldEagerLoad = (initialPage === 'last' && isNearEnd) || (initialPage !== 'last' && isNearTarget);

                                return (
                                    <img
                                        key={index}
                                        id={`page-${index}`}
                                        data-index={index}
                                        src={page}
                                        alt={`Page ${index + 1}`}
                                        className="w-full h-auto object-contain chapter-image"
                                        loading={shouldEagerLoad ? "eager" : "lazy"}
                                    />
                                );
                            })}

                            {/* Next Chapter Loading Indicator / Button */}
                            <div className="p-16 flex justify-center flex-col items-center gap-4 min-h-[200px] relative">
                                {changingChapter ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-8 h-8 border-4 border-gray-600 border-t-white rounded-full animate-spin"></div>
                                        <span className="text-gray-400 text-sm">Loading next chapter...</span>
                                    </div>
                                ) : onNextChapter && (
                                    <>
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                setChangingChapter(true);
                                                const success = await onNextChapter();
                                                if (!success) setChangingChapter(false);
                                            }}
                                            className="px-8 py-4 bg-[#333] text-white rounded-full font-bold hover:bg-[#444] transition-colors flex items-center gap-2 z-10"
                                        >
                                            Next Chapter <ArrowRight size={20} />
                                        </button>

                                        {/* Pull Up Indicator */}
                                        <div
                                            className="absolute bottom-0 left-0 right-0 flex justify-center items-center pointer-events-none"
                                            style={{
                                                opacity: Math.min(Math.abs(Math.min(0, pullY)) / 80, 1),
                                                transform: `translateY(${Math.abs(Math.min(0, pullY))}px)`
                                            }}
                                        >
                                            <span className="text-xs text-gray-500 font-medium mb-4">
                                                {pullY < -80 ? "Release for next chapter" : "Pull up for next chapter"}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </div>
                ) : (
                    // Single Page Mode
                    <div
                        className="w-full h-full relative overflow-hidden touch-pan-y"
                        onTouchStart={(e) => {
                            const touch = e.touches[0];
                            (window as any).swipeStart = { x: touch.clientX, y: touch.clientY };
                        }}
                        onTouchEnd={(e) => {
                            const start = (window as any).swipeStart;
                            if (!start) return;

                            const touch = e.changedTouches[0];
                            const deltaX = touch.clientX - start.x;
                            const deltaY = touch.clientY - start.y;

                            if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 50) {
                                if (readingMode === 'ltr') {
                                    if (deltaX < 0) paginate(1);
                                    else paginate(-1);
                                } else {
                                    if (deltaX < 0) paginate(-1);
                                    else paginate(1);
                                }
                            }
                            (window as any).swipeStart = null;
                        }}
                    >
                        <AnimatePresence initial={false} custom={direction} mode="popLayout">
                            <motion.div
                                key={currentPage}
                                custom={direction}
                                variants={variants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{
                                    x: { type: "spring", stiffness: 300, damping: 30 },
                                    opacity: { duration: 0.2 }
                                }}
                                className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-black"
                            >
                                <TransformWrapper
                                    initialScale={1}
                                    minScale={1}
                                    maxScale={4}
                                    centerOnInit
                                    doubleClick={{ mode: 'toggle' }}
                                >
                                    <TransformComponent wrapperClass="w-full h-full" contentClass="w-full h-full flex items-center justify-center">
                                        <img
                                            src={pages[currentPage]}
                                            alt={`Page ${currentPage + 1}`}
                                            className="max-h-full max-w-full object-contain select-none shadow-2xl"
                                        />
                                    </TransformComponent>
                                </TransformWrapper>
                            </motion.div>
                        </AnimatePresence>

                        {/* Navigation Hints */}
                        {showControls && (
                            <>
                                <button
                                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/30 p-3 rounded-full text-white hover:bg-black/50 hidden md:flex backdrop-blur-sm transition-opacity z-50"
                                    onClick={(e) => { e.stopPropagation(); readingMode === 'rtl' ? paginate(1) : paginate(-1); }}
                                >
                                    <ChevronLeft size={24} />
                                </button>
                                <button
                                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/30 p-3 rounded-full text-white hover:bg-black/50 hidden md:flex backdrop-blur-sm transition-opacity z-50"
                                    onClick={(e) => { e.stopPropagation(); readingMode === 'rtl' ? paginate(-1) : paginate(1); }}
                                >
                                    <ChevronRight size={24} />
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
