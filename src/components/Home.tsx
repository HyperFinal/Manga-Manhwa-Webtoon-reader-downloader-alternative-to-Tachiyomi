import React, { useEffect, useState, useRef } from 'react';
import { StorageService } from '../services/StorageService';
import type { Manga } from '../services/StorageService';
import { MangaService } from '../services/MangaService';
import type { MangaMetadata } from '../services/MangaService';
import { Plus, X, ArrowLeft, Eye, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface HomeProps {
    onMangaSelect: (manga: Manga) => void;
    showAddModal: boolean;
    setShowAddModal: (show: boolean) => void;
}

export const Home: React.FC<HomeProps> = ({ onMangaSelect, showAddModal, setShowAddModal }) => {
    const [library, setLibrary] = useState<Manga[]>([]);

    // Add Manga State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<MangaMetadata[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [genres, setGenres] = useState<import('../services/MangaService').Genre[]>([]);
    const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
    const [showGenres, setShowGenres] = useState(false);

    // Sorting State
    type SortOption = 'popularity' | 'members' | 'score' | 'start_date';
    const [sortBy, setSortBy] = useState<SortOption>('popularity');

    // Pagination & Preview State
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [previewManga, setPreviewManga] = useState<MangaMetadata | null>(null);

    // Infinite Scroll Observer
    const observerTarget = useRef(null);

    useEffect(() => {
        loadLibrary();
        loadGenres();
    }, []);

    // Debounced Search
    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (searchQuery.trim()) {
                handleSearch();
            }
        }, 600);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery, selectedGenres, sortBy]);

    // Reset search when modal closes
    useEffect(() => {
        if (!showAddModal) {
            setSearchQuery('');
            setSearchResults([]);
            setSelectedGenres([]);
            setShowGenres(false);
            setPreviewManga(null);
            setSortBy('popularity');
        }
    }, [showAddModal]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !isSearching) {
                    loadMore();
                }
            },
            { threshold: 1.0 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => {
            if (observerTarget.current) {
                observer.unobserve(observerTarget.current);
            }
        };
    }, [observerTarget, hasMore, isSearching]);

    const loadLibrary = async () => {
        const data = await StorageService.loadLibrary();
        setLibrary(data);
    };

    const loadGenres = async () => {
        const data = await MangaService.getGenres();
        // Deduplicate by name (robust)
        const uniqueGenres = data.filter((genre, index, self) =>
            index === self.findIndex((t) => (
                t.name.trim().toLowerCase() === genre.name.trim().toLowerCase()
            ))
        );
        // Sort alphabetically
        uniqueGenres.sort((a, b) => a.name.localeCompare(b.name));
        setGenres(uniqueGenres);
    };

    const toggleGenre = (genreId: number) => {
        setSelectedGenres(prev => {
            if (prev.includes(genreId)) {
                return prev.filter(id => id !== genreId);
            } else {
                return [...prev, genreId];
            }
        });
    };

    const handleSearch = async () => {
        if (!searchQuery.trim() && selectedGenres.length === 0) return;
        setIsSearching(true);
        setPage(1);
        setHasMore(true);
        // Jikan API expects comma separated IDs for multiple genres
        const genreString = selectedGenres.join(',');

        let orderBy: string | undefined = undefined;
        let sort: string | undefined = undefined;

        if (sortBy === 'members') {
            orderBy = 'members';
            sort = 'desc';
        } else if (sortBy === 'score') {
            orderBy = 'score';
            sort = 'desc';
        } else if (sortBy === 'start_date') {
            orderBy = 'start_date';
            sort = 'desc';
        } else if (sortBy === 'popularity') {
            // If explicit popularity is requested OR it's default
            // BUT if we have a query, we usually want relevance (undefined orderBy)
            // If we have NO query (just browsing genres), we want popularity.

            if (!searchQuery.trim()) {
                orderBy = 'popularity';
                sort = 'desc';
            }
            // If there IS a query, leaving orderBy undefined uses Jikan's default (Relevance)
        }

        const results = await MangaService.searchManga(searchQuery, genreString, 1, orderBy, sort);
        setSearchResults(results);
        setIsSearching(false);
    };

    const loadMore = async () => {
        if (!hasMore || isSearching) return;
        setIsSearching(true);
        const nextPage = page + 1;
        const genreString = selectedGenres.join(',');

        let orderBy: string | undefined = undefined;
        let sort: string | undefined = undefined;

        if (sortBy === 'members') {
            orderBy = 'members';
            sort = 'desc';
        } else if (sortBy === 'score') {
            orderBy = 'score';
            sort = 'desc';
        } else if (sortBy === 'start_date') {
            orderBy = 'start_date';
            sort = 'desc';
        } else if (sortBy === 'popularity') {
            if (!searchQuery.trim()) {
                orderBy = 'popularity';
                sort = 'desc';
            }
        }

        const results = await MangaService.searchManga(searchQuery, genreString, nextPage, orderBy, sort);

        if (results.length === 0) {
            setHasMore(false);
        } else {
            setSearchResults(prev => [...prev, ...results]);
            setPage(nextPage);
        }
        setIsSearching(false);
    };

    const addMangaToLibrary = async (metadata: MangaMetadata) => {
        const newManga: Manga = {
            id: metadata.mal_id.toString(),
            title: metadata.title,
            coverUrl: metadata.images.webp?.large_image_url || metadata.images.jpg.large_image_url,
            description: metadata.synopsis,
            type: metadata.type,
            genres: metadata.genres?.map(g => g.name) || [],
            status: metadata.status,
            totalChapters: metadata.chapters,
            chapters: [],
            alternativeTitles: metadata.alternativeTitles || []
        };

        const updatedLibrary = [...library, newManga];
        await StorageService.saveLibrary(updatedLibrary);
        setLibrary(updatedLibrary);
        setShowAddModal(false);
        setSearchQuery('');
        setSearchResults([]);
        setSelectedGenres([]);
        setShowGenres(false);
        setPreviewManga(null);
    };

    return (
        <div className="min-h-screen bg-[#141414] pb-20">
            {/* Header / App Bar */}
            <div className="fixed top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] z-10 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <span className="text-red-600 font-bold text-2xl tracking-tighter">LIBRARY</span>
                </div>
            </div>

            {/* Library Grid */}
            {/* Library Grid */}
            <div className="p-4 pt-[calc(env(safe-area-inset-top)+8rem)] pb-24 flex flex-col gap-8">
                {(() => {
                    const webtoonList = library.filter(m =>
                        m.type === 'Manhwa' ||
                        m.type === 'Manhua' ||
                        m.genres?.some(g => g.toLowerCase() === 'webtoon')
                    );
                    const mangaList = library.filter(m => !webtoonList.includes(m));

                    if (library.length === 0) return null;

                    return (
                        <>
                            {mangaList.length > 0 && (
                                <div className="flex flex-col gap-3">
                                    <h2 className="text-white font-bold text-lg px-1 border-l-4 border-red-600 pl-2">Manga</h2>
                                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                        {mangaList.map((manga) => (
                                            <motion.div
                                                key={manga.id}
                                                className="relative aspect-[2/3] rounded-md overflow-hidden cursor-pointer group"
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => onMangaSelect(manga)}
                                            >
                                                <img src={manga.coverUrl} alt={manga.title} className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                                                    <h3 className="text-white text-xs font-bold line-clamp-2">{manga.title}</h3>
                                                    <p className="text-[10px] text-gray-400">{manga.chapters.length} eps</p>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {webtoonList.length > 0 && (
                                <div className="flex flex-col gap-3">
                                    <h2 className="text-white font-bold text-lg px-1 border-l-4 border-green-500 pl-2">Manhwa & Webtoons</h2>
                                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                        {webtoonList.map((manga) => (
                                            <motion.div
                                                key={manga.id}
                                                className="relative aspect-[2/3] rounded-md overflow-hidden cursor-pointer group"
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => onMangaSelect(manga)}
                                            >
                                                <img src={manga.coverUrl} alt={manga.title} className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                                                    <h3 className="text-white text-xs font-bold line-clamp-2">{manga.title}</h3>
                                                    <p className="text-[10px] text-gray-400">{manga.chapters.length} eps</p>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    );
                })()}
            </div>

            {library.length === 0 && (
                <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500">
                    <p className="mb-4">Your collection is empty</p>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="bg-[#333] text-white px-6 py-2 rounded-full text-sm font-bold hover:bg-[#444] transition-colors"
                    >
                        Start Collection
                    </button>
                </div>
            )}

            {/* Floating Action Button for Add */}
            {library.length > 0 && (
                <>
                    <motion.a
                        href="https://www.paypal.com/donate/?hosted_button_id=RYRGN9J2U3AYW"
                        target="_blank"
                        rel="noopener noreferrer"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="fixed bottom-6 left-6 bg-[#FF69B4] text-white px-4 py-3 rounded-full flex items-center gap-2 shadow-lg z-20 font-bold text-sm hover:bg-[#ff1493] transition-colors"
                    >
                        <Heart size={20} fill="white" />
                        <span>Support</span>
                    </motion.a>

                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setShowAddModal(true)}
                        className="fixed bottom-6 right-6 w-14 h-14 bg-[#E50914] rounded-full flex items-center justify-center shadow-lg z-20 text-white"
                    >
                        <Plus size={28} />
                    </motion.button>
                </>
            )}

            {/* Add Manga Modal */}
            <AnimatePresence>
                {showAddModal && (
                    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
                        <div className="p-4 pt-[calc(env(safe-area-inset-top)+1rem)] flex flex-col gap-4 border-b border-gray-800 bg-[#141414]">
                            <div className="flex items-center gap-4">
                                <button onClick={() => setShowAddModal(false)} className="text-gray-400"><ArrowLeft /></button>
                                <input
                                    type="text"
                                    placeholder="Search titles..."
                                    className="flex-1 bg-transparent border-none text-white text-lg focus:outline-none placeholder-gray-600"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    autoFocus
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="text-gray-500"><X size={20} /></button>
                                )}
                            </div>

                            {/* Genre Filter Toggle */}
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-center">
                                    <button
                                        onClick={() => setShowGenres(!showGenres)}
                                        className="text-xs text-gray-400 flex items-center gap-1 hover:text-white transition-colors"
                                    >
                                        Filter by Genres ({selectedGenres.length}) {showGenres ? '▲' : '▼'}
                                    </button>

                                    <button
                                        onClick={handleSearch}
                                        className="bg-[#E50914] text-white font-bold text-xs px-4 py-2 rounded hover:bg-[#b20710] transition-colors disabled:opacity-50"
                                        disabled={isSearching}
                                    >
                                        {isSearching ? '...' : 'SEARCH'}
                                    </button>
                                </div>

                                <AnimatePresence>
                                    {showGenres && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden"
                                        >
                                            {/* Sorting Options */}
                                            <div className="flex gap-2 mb-2 overflow-x-auto pb-2 custom-scrollbar">
                                                <button
                                                    onClick={() => setSortBy('popularity')}
                                                    className={`text-xs px-3 py-1 rounded-full border whitespace-nowrap transition-colors ${sortBy === 'popularity' ? 'bg-white text-black border-white' : 'border-gray-700 text-gray-400'}`}
                                                >
                                                    Default
                                                </button>
                                                <button
                                                    onClick={() => setSortBy('members')}
                                                    className={`text-xs px-3 py-1 rounded-full border whitespace-nowrap transition-colors ${sortBy === 'members' ? 'bg-white text-black border-white' : 'border-gray-700 text-gray-400'}`}
                                                >
                                                    Most Viewed
                                                </button>
                                                <button
                                                    onClick={() => setSortBy('score')}
                                                    className={`text-xs px-3 py-1 rounded-full border whitespace-nowrap transition-colors ${sortBy === 'score' ? 'bg-white text-black border-white' : 'border-gray-700 text-gray-400'}`}
                                                >
                                                    Top Rated
                                                </button>
                                                <button
                                                    onClick={() => setSortBy('start_date')}
                                                    className={`text-xs px-3 py-1 rounded-full border whitespace-nowrap transition-colors ${sortBy === 'start_date' ? 'bg-white text-black border-white' : 'border-gray-700 text-gray-400'}`}
                                                >
                                                    New
                                                </button>
                                            </div>

                                            <div className="flex flex-wrap gap-2 py-2 max-h-40 overflow-y-auto custom-scrollbar border-t border-gray-800 pt-2">
                                                {genres.map(g => {
                                                    const isSelected = selectedGenres.includes(g.mal_id);
                                                    return (
                                                        <button
                                                            key={g.mal_id}
                                                            onClick={() => toggleGenre(g.mal_id)}
                                                            className={`text-xs px-4 py-2 rounded-full border transition-all ${isSelected
                                                                ? 'bg-[#E50914] border-[#E50914] text-white font-bold'
                                                                : 'bg-transparent border-gray-700 text-gray-400 hover:border-gray-500'
                                                                }`}
                                                        >
                                                            {g.name}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            <div className="grid grid-cols-1 gap-4 max-w-3xl mx-auto">
                                {searchResults.map((manga) => (
                                    <div key={manga.mal_id} className="flex gap-4 bg-[#1f1f1f] p-3 rounded-lg">
                                        <img src={manga.images.webp?.image_url || manga.images.jpg.image_url} className="w-20 h-28 object-cover rounded shadow-md" />
                                        <div className="flex-1 flex flex-col">
                                            <div className="flex justify-between items-start">
                                                <h4 className="font-bold text-white text-base line-clamp-1">{manga.title}</h4>
                                                <span className="text-[10px] bg-[#333] text-gray-300 px-2 py-0.5 rounded uppercase font-bold tracking-wider">
                                                    {manga.type || 'Manga'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1 line-clamp-3 leading-relaxed font-light">
                                                {(manga.synopsis || 'No synopsis available.').replace('[Written by MAL Rewrite]', '').trim()}
                                            </p>
                                            <div className="mt-auto pt-3 flex justify-end gap-2">
                                                <button
                                                    onClick={() => setPreviewManga(manga)}
                                                    className="bg-[#333] hover:bg-[#444] text-white p-2 rounded transition-colors"
                                                >
                                                    <Eye size={14} />
                                                </button>
                                                <button
                                                    onClick={() => addMangaToLibrary(manga)}
                                                    className="bg-[#333] hover:bg-[#444] text-white text-xs font-bold px-4 py-2 rounded transition-colors flex items-center gap-2"
                                                >
                                                    <Plus size={14} /> ADD TO LIBRARY
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {searchResults.length > 0 && hasMore && (
                                    <div ref={observerTarget} className="w-full py-4 flex justify-center">
                                        {isSearching && <span className="text-gray-500 text-sm">Loading more...</span>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </AnimatePresence>

            {/* Manga Overview Modal */}
            <AnimatePresence>
                {previewManga && (
                    <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4">
                        <div className="bg-[#1f1f1f] rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto flex flex-col">
                            <div className="relative h-64">
                                <img
                                    src={previewManga.images.webp?.large_image_url || previewManga.images.jpg.large_image_url}
                                    className="w-full h-full object-cover opacity-50"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#1f1f1f] to-transparent" />
                                <button
                                    onClick={() => setPreviewManga(null)}
                                    className="absolute top-4 right-4 mt-[env(safe-area-inset-top)] bg-black/50 p-2 rounded-full text-white hover:bg-black/80"
                                >
                                    <X size={20} />
                                </button>
                                <div className="absolute bottom-4 left-4 right-4">
                                    <h2 className="text-2xl font-bold text-white mb-1">{previewManga.title}</h2>
                                    <div className="flex flex-wrap gap-2">
                                        {previewManga.genres.map(g => (
                                            <span key={g.name} className="text-[10px] bg-[#E50914] text-white px-2 py-0.5 rounded font-bold">
                                                {g.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 space-y-4">
                                <div className="flex justify-between text-sm text-gray-400 bg-[#141414] p-3 rounded">
                                    <div>
                                        <span className="block text-xs uppercase font-bold text-gray-500">Status</span>
                                        <span className="text-white">{previewManga.status}</span>
                                    </div>
                                    <div>
                                        <span className="block text-xs uppercase font-bold text-gray-500">Chapters</span>
                                        <span className="text-white">{previewManga.chapters || '?'}</span>
                                    </div>
                                    <div>
                                        <span className="block text-xs uppercase font-bold text-gray-500">Type</span>
                                        <span className="text-white">{previewManga.type}</span>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">Synopsis</h3>
                                    <p className="text-gray-300 text-sm leading-relaxed">
                                        {(previewManga.synopsis || 'No synopsis available.').replace('[Written by MAL Rewrite]', '').trim()}
                                    </p>
                                </div>

                                <button
                                    onClick={() => addMangaToLibrary(previewManga)}
                                    className="w-full bg-[#E50914] text-white font-bold py-3 rounded hover:bg-[#b20710] transition-colors flex items-center justify-center gap-2"
                                >
                                    <Plus size={18} /> ADD TO LIBRARY
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
