import React, { useEffect, useState } from 'react';
import JSZip from 'jszip';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, Settings, ArrowDown, ArrowRight, ArrowLeft } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

interface ReaderProps {
    file: File | string;
    onClose: () => void;
}

type ReadingMode = 'ltr' | 'rtl' | 'vertical';

export const Reader: React.FC<ReaderProps> = ({ file, onClose }) => {
    const [pages, setPages] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [readingMode, setReadingMode] = useState<ReadingMode>('ltr');
    const [showSettings, setShowSettings] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [direction, setDirection] = useState(0);

    // Hide controls after 3 seconds of inactivity
    useEffect(() => {
        let timeout: NodeJS.Timeout;
        const resetTimer = () => {
            setShowControls(true);
            clearTimeout(timeout);
            timeout = setTimeout(() => setShowControls(false), 3000);
        };

        window.addEventListener('mousemove', resetTimer);
        window.addEventListener('touchstart', resetTimer);
        window.addEventListener('click', resetTimer);

        resetTimer();

        return () => {
            window.removeEventListener('mousemove', resetTimer);
            window.removeEventListener('touchstart', resetTimer);
            window.removeEventListener('click', resetTimer);
            clearTimeout(timeout);
        };
    }, []);

    useEffect(() => {
        const loadBook = async () => {
            try {
                setLoading(true);
                const zip = new JSZip();
                let content;

                if (typeof file === 'string') {
                    content = await zip.loadAsync(file, { base64: true });
                } else {
                    content = await zip.loadAsync(file);
                }

                const imageFiles: string[] = [];
                const entries = Object.values(content.files).filter(entry =>
                    !entry.dir && /\.(jpg|jpeg|png|gif|webp)$/i.test(entry.name)
                );

                // Sort files naturally (e.g. 1.jpg, 2.jpg, 10.jpg)
                entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

                for (const entry of entries) {
                    const blob = await entry.async('blob');
                    const url = URL.createObjectURL(blob);
                    imageFiles.push(url);
                }

                if (imageFiles.length === 0) {
                    throw new Error("No images found in this file!");
                }

                setPages(imageFiles);
                setLoading(false);
            } catch (err) {
                console.error(err);
                setError("Failed to open book. Is it a valid CBZ?");
                setLoading(false);
            }
        };

        loadBook();

        return () => {
            // Cleanup object URLs
            pages.forEach(url => URL.revokeObjectURL(url));
        };
    }, [file]);

    const variants = {
        enter: (direction: number) => {
            return {
                x: direction > 0 ? '100%' : '-100%',
                opacity: 0
            };
        },
        center: {
            zIndex: 1,
            x: 0,
            opacity: 1
        },
        exit: (direction: number) => {
            return {
                zIndex: 0,
                x: direction < 0 ? '100%' : '-100%',
                opacity: 0
            };
        }
    };

    const paginate = (newDirection: number) => {
        const newPage = currentPage + newDirection;
        if (newPage >= 0 && newPage < pages.length) {
            setDirection(newDirection);
            setCurrentPage(newPage);
        }
    };

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-black text-white">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="w-12 h-12 bg-gray-700 rounded-full mb-4"></div>
                    <p className="text-gray-400 font-medium">Opening book...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-screen flex items-center justify-center p-4 text-center bg-black text-white">
                <div>
                    <p className="text-red-400 mb-4">{error}</p>
                    <button onClick={onClose} className="px-4 py-2 bg-white text-black rounded-full font-bold">Go Back</button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-black flex flex-col relative overflow-hidden">
            {/* Top Bar */}
            <AnimatePresence>
                {showControls && (
                    <motion.div
                        initial={{ opacity: 0, y: -50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -50 }}
                        className="absolute top-0 left-0 right-0 p-4 pt-[calc(env(safe-area-inset-top)+1rem)] flex justify-between items-center z-50 bg-gradient-to-b from-black/80 to-transparent text-white"
                    >
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X size={24} />
                        </button>

                        <div className="flex items-center gap-4">
                            <span className="text-sm font-medium bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                                {readingMode === 'vertical' ? 'Vertical' : `${currentPage + 1} / ${pages.length}`}
                            </span>

                            <div className="relative">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }}
                                    className={`p-2 rounded-full transition-colors ${showSettings ? 'bg-white text-black' : 'hover:bg-white/10 text-white'}`}
                                >
                                    <Settings size={24} />
                                </button>

                                {showSettings && (
                                    <div className="absolute right-0 top-full mt-2 w-48 bg-[#1f1f1f] rounded-xl shadow-xl border border-gray-800 overflow-hidden">
                                        <div className="p-2 flex flex-col gap-1">
                                            <button
                                                onClick={() => { setReadingMode('ltr'); setShowSettings(false); }}
                                                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${readingMode === 'ltr' ? 'bg-white text-black' : 'text-gray-300 hover:bg-white/10'}`}
                                            >
                                                <ArrowRight size={16} /> Left to Right
                                            </button>
                                            <button
                                                onClick={() => { setReadingMode('rtl'); setShowSettings(false); }}
                                                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${readingMode === 'rtl' ? 'bg-white text-black' : 'text-gray-300 hover:bg-white/10'}`}
                                            >
                                                <ArrowLeft size={16} /> Right to Left
                                            </button>
                                            <button
                                                onClick={() => { setReadingMode('vertical'); setShowSettings(false); }}
                                                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${readingMode === 'vertical' ? 'bg-white text-black' : 'text-gray-300 hover:bg-white/10'}`}
                                            >
                                                <ArrowDown size={16} /> Vertical (Webtoon)
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
            <div className="flex-1 w-full h-full relative">
                {readingMode === 'vertical' ? (
                    // Vertical Scrolling Mode
                    <div className="w-full h-full overflow-y-auto custom-scrollbar bg-black">
                        <div className="max-w-3xl mx-auto flex flex-col">
                            {pages.map((page, index) => (
                                <img
                                    key={index}
                                    src={page}
                                    alt={`Page ${index + 1}`}
                                    className="w-full h-auto object-contain"
                                    loading="lazy"
                                />
                            ))}
                        </div>
                    </div>
                ) : (
                    // Single Page Mode (LTR / RTL) - WITH ZOOM
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

                            // Check if it's a horizontal swipe and not a vertical scroll
                            if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 50) {
                                if (readingMode === 'ltr') {
                                    if (deltaX < 0) paginate(1);
                                    else paginate(-1);
                                } else {
                                    // RTL
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
                    </div>
                )}
            </div>

            {/* Navigation Hints (Desktop - Only for non-vertical modes) */}
            {readingMode !== 'vertical' && showControls && (
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
    );
};
