import React, { useRef, useState, useEffect } from 'react';
import { StorageService } from '../services/StorageService';
import type { Manga, Chapter } from '../services/StorageService';
import { ArrowLeft, Plus, Play, Trash2, Check } from 'lucide-react';
import { OnlineChapterList } from './OnlineChapterList';

interface MangaDetailsProps {
    manga: Manga;
    onBack: () => void;
    onRead: (file: File | string, chapterId?: string, page?: number) => void;
    onUpdateManga: (updatedManga: Manga) => void;
    onRemove: () => void;
    // Download props
    downloadQueue: string[];
    activeDownloads: string[];
    downloadProgress: Record<string, number>;
    onQueueDownload: (chapter: any, mangaTitle: string, source: 'mangapill' | 'webtoon', mangaId?: string) => void;
}

export const MangaDetails: React.FC<MangaDetailsProps> = ({ manga, onBack, onRead, onUpdateManga, onRemove, downloadQueue, activeDownloads, downloadProgress, onQueueDownload }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [activeTab, setActiveTab] = useState<'local' | 'online'>('local');
    const [deleteConfirmation, setDeleteConfirmation] = useState<Chapter | null>(null);
    const [showRemoveConfirmation, setShowRemoveConfirmation] = useState(false);
    const [showBulkDeleteConfirmation, setShowBulkDeleteConfirmation] = useState(false);

    // Cache for online chapters to prevent reloading on tab switch
    const [cachedOnlineChapters, setCachedOnlineChapters] = useState<any[]>([]);

    // Reset cache and tab when manga changes
    useEffect(() => {
        setCachedOnlineChapters([]);
        setActiveTab('local');
    }, [manga.id]);

    // Multi-select state
    const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
    const isSelectionMode = selectedChapters.size > 0;
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);

    const handleLongPress = (chapterId: string) => {
        const newSelected = new Set(selectedChapters);
        newSelected.add(chapterId);
        setSelectedChapters(newSelected);
    };

    const toggleSelection = (chapterId: string) => {
        const newSelected = new Set(selectedChapters);
        if (newSelected.has(chapterId)) {
            newSelected.delete(chapterId);
        } else {
            newSelected.add(chapterId);
        }
        setSelectedChapters(newSelected);
    };

    const handleBulkDelete = async () => {
        if (selectedChapters.size === 0) return;
        setShowBulkDeleteConfirmation(true);
    };

    const confirmBulkDelete = async () => {
        const chaptersToDelete = manga.chapters.filter(c => selectedChapters.has(c.id));

        for (const chapter of chaptersToDelete) {
            await StorageService.deleteChapterFile(chapter.fileName);
        }

        const updatedChapters = manga.chapters.filter(c => !selectedChapters.has(c.id));
        const updatedManga = { ...manga, chapters: updatedChapters };

        const library = await StorageService.loadLibrary();
        const newLibrary = library.map(m => m.id === manga.id ? updatedManga : m);
        await StorageService.saveLibrary(newLibrary);

        onUpdateManga(updatedManga);
        setSelectedChapters(new Set());
        setShowBulkDeleteConfirmation(false);
    };

    const handleRemove = () => {
        setShowRemoveConfirmation(true);
    };

    const handleAddChapter = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        try {
            const fileName = await StorageService.saveChapterFile(file);

            const newChapter: Chapter = {
                id: Date.now().toString(),
                title: file.name.replace(/\.(cbz|zip)$/i, ''),
                fileName: fileName
            };

            const updatedManga = {
                ...manga,
                chapters: [...manga.chapters, newChapter]
            };

            const library = await StorageService.loadLibrary();
            const newLibrary = library.map(m => m.id === manga.id ? updatedManga : m);
            await StorageService.saveLibrary(newLibrary);

            onUpdateManga(updatedManga);
        } catch (error) {
            console.error("Failed to import chapter", error);
            alert("Failed to import chapter. Storage might be full.");
        } finally {
            setIsImporting(false);
        }
    };

    const handleReadChapter = async (chapter: Chapter) => {
        try {
            // Pass the filename directly, do not load content
            const page = (manga.lastReadChapterId === chapter.id) ? (manga.lastReadPage || 0) : 0;
            onRead(chapter.fileName, chapter.id, page);
        } catch (error) {
            console.error("Failed to load chapter", error);
            alert("Could not load chapter file.");
        }
    };

    const getChapterNumber = (title: string): number => {
        const match = title.match(/Chapter\s*(\d+(\.\d+)?)/i) || title.match(/(\d+(\.\d+)?)/);
        return match ? parseFloat(match[1] || match[0]) : 0;
    };

    const sortedChapters = [...manga.chapters].sort((a, b) => {
        return getChapterNumber(a.title) - getChapterNumber(b.title);
    });

    return (
        <div className="min-h-screen bg-[#141414] pb-20">
            {/* Header Image */}
            <div className="relative h-64 w-full">
                <div className="absolute inset-0">
                    <img src={manga.coverUrl} className="w-full h-full object-cover opacity-50 blur-sm" />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#141414]" />
                </div>
                <button onClick={onBack} className="absolute top-4 left-4 mt-[env(safe-area-inset-top)] p-2 bg-black/50 rounded-full text-white z-10 hover:bg-black/70 transition-colors">
                    <ArrowLeft size={24} />
                </button>
                <button onClick={handleRemove} className="absolute top-4 right-4 mt-[env(safe-area-inset-top)] p-2 bg-black/50 rounded-full text-red-500 z-10 hover:bg-black/70 transition-colors">
                    <Trash2 size={24} />
                </button>
            </div>

            {/* Content */}
            <div className="px-6 -mt-20 relative z-10">
                <div className="flex gap-4 items-end">
                    <img src={manga.coverUrl} className="w-32 rounded-lg shadow-2xl border-2 border-[#1f1f1f]" />
                    <div className="flex-1 pb-2">
                        <h1 className="text-2xl font-bold text-white leading-tight">{manga.title}</h1>
                        <div className="flex items-center gap-2 mt-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold ${manga.status === 'Finished' ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'
                                }`}>
                                {manga.status || 'Unknown'}
                            </span>
                            <span className="text-xs text-gray-300 font-medium">
                                {manga.totalChapters ? `${manga.totalChapters} Chapters` : 'Ongoing'}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{manga.chapters.length} downloaded</p>
                    </div>
                </div>

                {/* Synopsis & Tags */}
                <div className="mt-6">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        {manga.type && (
                            <span className="text-[10px] bg-[#E50914] text-white px-2 py-0.5 rounded uppercase font-bold tracking-wider">
                                {manga.type}
                            </span>
                        )}
                        {manga.genres?.map(genre => (
                            <span key={genre} className="text-[10px] bg-[#333] text-gray-300 px-2 py-0.5 rounded uppercase font-bold tracking-wider">
                                {genre}
                            </span>
                        ))}
                    </div>
                    <h3 className="text-sm font-bold text-gray-200 mb-2">Synopsis</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">
                        {(manga.description || "No description available.").replace('[Written by MAL Rewrite]', '').trim()}
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 mt-8 border-b border-gray-800 pb-2">
                    <button
                        onClick={() => setActiveTab('local')}
                        className={`text-sm font-bold pb-2 border-b-2 transition-colors ${activeTab === 'local' ? 'text-white border-red-600' : 'text-gray-500 border-transparent'}`}
                    >
                        MY CHAPTERS
                    </button>
                    <button
                        onClick={() => setActiveTab('online')}
                        className={`text-sm font-bold pb-2 border-b-2 transition-colors ${activeTab === 'online' ? 'text-white border-red-600' : 'text-gray-500 border-transparent'}`}
                    >
                        FIND ONLINE
                    </button>
                </div>

                {/* Chapters List */}
                <div className="mt-4">
                    {activeTab === 'local' ? (
                        <div className="flex flex-col gap-2">
                            {isSelectionMode ? (
                                <button
                                    onClick={handleBulkDelete}
                                    className="w-full bg-red-600 text-white font-bold py-3 rounded flex items-center justify-center gap-2 mb-4 hover:bg-red-700 transition-colors shadow-lg shadow-red-900/20"
                                >
                                    <Trash2 size={20} /> DELETE {selectedChapters.size} SELECTED
                                </button>
                            ) : (
                                <div className="flex gap-3 mb-4">
                                    <button
                                        onClick={() => {
                                            if (manga.lastReadChapterId) {
                                                const chapter = manga.chapters.find(c => c.id === manga.lastReadChapterId);
                                                if (chapter) {
                                                    handleReadChapter(chapter); // handleReadChapter now handles loading
                                                }
                                            } else if (sortedChapters.length > 0) {
                                                handleReadChapter(sortedChapters[0]);
                                            }
                                        }}
                                        className="flex-1 bg-white text-black py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors"
                                    >
                                        <Play size={20} fill="currentColor" />
                                        {manga.lastReadChapterId ? 'Resume' : 'Start Reading'}
                                    </button>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="px-4 bg-[#333] text-white rounded-xl font-bold hover:bg-[#444] transition-colors"
                                        disabled={isImporting}
                                    >
                                        <Plus size={24} />
                                    </button>
                                </div>
                            )}

                            {sortedChapters.map((chapter) => (
                                <div
                                    key={chapter.id}
                                    className={`flex items-center justify-between p-4 rounded transition-colors cursor-pointer group select-none
                                        ${selectedChapters.has(chapter.id) ? 'bg-red-900/20 border border-red-900/50' : 'bg-[#1f1f1f] active:bg-[#2f2f2f]'}`}
                                    onClick={() => {
                                        if (isSelectionMode) {
                                            toggleSelection(chapter.id);
                                        } else {
                                            handleReadChapter(chapter);
                                        }
                                    }}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        handleLongPress(chapter.id);
                                    }}
                                    onTouchStart={() => {
                                        longPressTimer.current = setTimeout(() => handleLongPress(chapter.id), 500);
                                    }}
                                    onTouchEnd={() => {
                                        if (longPressTimer.current) {
                                            clearTimeout(longPressTimer.current);
                                        }
                                    }}
                                >
                                    <div className="flex items-center gap-4">
                                        {isSelectionMode && (
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center
                                                ${selectedChapters.has(chapter.id) ? 'bg-red-600 border-red-600' : 'border-gray-600'}`}>
                                                {selectedChapters.has(chapter.id) && <Check size={14} className="text-white" />}
                                            </div>
                                        )}
                                        <div className="flex flex-col">
                                            <span className={`font-medium text-sm ${manga.lastReadChapterId === chapter.id ? 'text-blue-400' : 'text-gray-200'}`}>
                                                {chapter.title}
                                            </span>
                                            <div className="flex gap-2">
                                                {manga.readChapters?.includes(chapter.id) && (
                                                    <span className="text-[10px] text-green-500 font-bold uppercase tracking-wide">Read</span>
                                                )}
                                                {manga.lastReadChapterId === chapter.id && !manga.readChapters?.includes(chapter.id) && (
                                                    <span className="text-[10px] text-blue-400/80 font-bold uppercase tracking-wide">Last Read</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {!isSelectionMode && (
                                            <>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDeleteConfirmation(chapter);
                                                    }}
                                                    className="p-2 text-gray-500 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                                <Play size={14} className="text-gray-500" />
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {manga.chapters.length === 0 && (
                                <div className="text-center py-8 text-gray-500 text-sm bg-[#1f1f1f] rounded border border-dashed border-gray-800">
                                    No chapters yet.
                                </div>
                            )}
                        </div>
                    ) : (
                        <OnlineChapterList
                            mangaTitle={manga.title}
                            currentManga={manga}
                            cachedChapters={cachedOnlineChapters}
                            onCacheUpdate={setCachedOnlineChapters}
                            downloadQueue={downloadQueue}
                            activeDownloads={activeDownloads}
                            downloadProgress={downloadProgress}
                            onQueueDownload={onQueueDownload}
                        />
                    )}
                </div>
            </div>

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleAddChapter}
                accept=".cbz,.zip"
                className="hidden"
            />

            {/* Custom Confirmation Modal for Chapter Delete */}
            {deleteConfirmation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-[#1f1f1f] rounded-lg shadow-2xl max-w-sm w-full p-6 border border-[#333]">
                        <h3 className="text-lg font-bold text-white mb-2">Delete Chapter?</h3>
                        <p className="text-gray-400 mb-6">
                            Are you sure you want to delete <span className="text-white font-medium">"{deleteConfirmation.title}"</span>? This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setDeleteConfirmation(null)}
                                className="px-4 py-2 rounded text-gray-300 hover:text-white hover:bg-[#333] transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (deleteConfirmation) {
                                        StorageService.deleteChapterFile(deleteConfirmation.fileName).then(async () => {
                                            const updatedChapters = manga.chapters.filter(c => c.id !== deleteConfirmation.id);
                                            const updatedManga = { ...manga, chapters: updatedChapters };
                                            const library = await StorageService.loadLibrary();
                                            const newLibrary = library.map(m => m.id === manga.id ? updatedManga : m);
                                            await StorageService.saveLibrary(newLibrary);
                                            onUpdateManga(updatedManga);
                                            setDeleteConfirmation(null);
                                        });
                                    }
                                }}
                                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 transition-colors font-bold shadow-lg shadow-red-900/20"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Confirmation Modal for Manga Remove */}
            {showRemoveConfirmation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-[#1f1f1f] rounded-lg shadow-2xl max-w-sm w-full p-6 border border-[#333]">
                        <h3 className="text-lg font-bold text-white mb-2">Remove Manga?</h3>
                        <p className="text-gray-400 mb-6">
                            Are you sure you want to remove <span className="text-white font-medium">"{manga.title}"</span> from your library? All downloaded chapters will be deleted.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowRemoveConfirmation(false)}
                                className="px-4 py-2 rounded text-gray-300 hover:text-white hover:bg-[#333] transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    onRemove();
                                    setShowRemoveConfirmation(false);
                                }}
                                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 transition-colors font-bold shadow-lg shadow-red-900/20"
                            >
                                Remove
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Confirmation Modal for Bulk Delete */}
            {showBulkDeleteConfirmation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-[#1f1f1f] rounded-lg shadow-2xl max-w-sm w-full p-6 border border-[#333]">
                        <h3 className="text-lg font-bold text-white mb-2">Delete Chapters?</h3>
                        <p className="text-gray-400 mb-6">
                            Are you sure you want to delete <span className="text-white font-bold">{selectedChapters.size}</span> selected chapters? This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowBulkDeleteConfirmation(false)}
                                className="px-4 py-2 rounded text-gray-300 hover:text-white hover:bg-[#333] transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmBulkDelete}
                                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 transition-colors font-bold shadow-lg shadow-red-900/20"
                            >
                                Delete All
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
