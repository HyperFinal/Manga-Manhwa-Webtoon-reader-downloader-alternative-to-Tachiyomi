import { useState, useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Home } from './components/Home';
import { MangaDetails } from './components/MangaDetails';
import { Reader } from './components/Reader';
import { StorageService } from './services/StorageService';
import type { Manga, Chapter } from './services/StorageService';
import { MangaPillService } from './services/MangaPillService';
import type { MangaPillChapter } from './services/MangaPillService';
import { WebtoonService } from './services/WebtoonService';
import type { WebtoonChapter } from './services/WebtoonService';
import { DownloadService } from './services/DownloadService';
import './styles/theme.css';

function App() {
  const [view, setView] = useState<'home' | 'details' | 'reader'>('home');
  const [selectedManga, setSelectedManga] = useState<Manga | null>(null);
  const [readingChapter, setReadingChapter] = useState<{ fileName: string, id?: string } | null>(null);
  const [currentChapterId, setCurrentChapterId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [initialPage, setInitialPage] = useState<number | 'last'>(0);

  // Download State
  const [downloadQueue, setDownloadQueue] = useState<{ chapter: MangaPillChapter | WebtoonChapter, mangaTitle: string, source: 'mangapill' | 'webtoon', mangaId?: string }[]>([]);
  const [activeDownloads, setActiveDownloads] = useState<string[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const MAX_CONCURRENT_DOWNLOADS = 3;

  // Process Download Queue
  useEffect(() => {
    const processQueue = async () => {
      if (activeDownloads.length >= MAX_CONCURRENT_DOWNLOADS || downloadQueue.length === 0) return;

      const item = downloadQueue[0];
      const { chapter, mangaTitle, source, mangaId } = item;

      // Move to active
      setDownloadQueue(prev => prev.slice(1));
      setActiveDownloads(prev => [...prev, chapter.id]);
      setDownloadProgress(prev => ({ ...prev, [chapter.id]: 0 }));

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
            (p: number) => setDownloadProgress(prev => ({ ...prev, [chapter.id]: p }))
          );
        } else {
          const c = chapter as WebtoonChapter;
          chapterTitle = c.title;
          // Webtoon needs mangaId. If not provided (should be), we might fail or need to search.
          // Assuming it's provided for now as we pass it from OnlineChapterList
          if (!mangaId) throw new Error("Manga ID required for Webtoon download");

          fileName = await DownloadService.downloadChapter(
            chapterTitle,
            mangaTitle,
            () => WebtoonService.getChapterPages(mangaId, c.id),
            { 'Referer': 'https://www.webtoons.com/' },
            (p: number) => setDownloadProgress(prev => ({ ...prev, [chapter.id]: p }))
          );
        }

        const newChapter: Chapter = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          title: chapterTitle,
          fileName: fileName
        };

        // Update Storage
        const library = await StorageService.loadLibrary();
        // Find the manga in library by title (since we might not have the ID if it was just added or if we are in background)
        // Actually, we should probably pass the local manga ID if we have it.
        // But for now, let's find by ID if selectedManga matches, or find by title.
        // Wait, `mangaTitle` is passed.
        // Let's assume we can find it.

        // Better: Find by ID if we can. But we only stored mangaTitle in queue.
        // Let's rely on finding by title or ID if we add it to queue item.
        // For now, let's look up by title as it's unique enough for this app context usually?
        // Actually, let's just use the current selectedManga if it matches, otherwise load from library.

        const targetManga = library.find(m => m.title === mangaTitle);
        if (targetManga) {
          const updatedManga = {
            ...targetManga,
            chapters: [...targetManga.chapters, newChapter]
          };
          const newLibrary = library.map(m => m.id === targetManga.id ? updatedManga : m);
          await StorageService.saveLibrary(newLibrary);

          // If this is the currently selected manga, update the UI
          if (selectedManga && selectedManga.id === targetManga.id) {
            setSelectedManga(updatedManga);
          }
        }

      } catch (err) {
        console.error("Download failed", err);
      } finally {
        setActiveDownloads(prev => prev.filter(id => id !== chapter.id));
        setDownloadProgress(prev => {
          const newMap = { ...prev };
          delete newMap[chapter.id];
          return newMap;
        });
      }
    };

    processQueue();
  }, [downloadQueue, activeDownloads, selectedManga]);

  const addToDownloadQueue = (chapter: MangaPillChapter | WebtoonChapter, mangaTitle: string, source: 'mangapill' | 'webtoon', mangaId?: string) => {
    // Check if already queued or downloading
    if (downloadQueue.some(item => item.chapter.id === chapter.id) || activeDownloads.includes(chapter.id)) return;

    setDownloadQueue(prev => [...prev, { chapter, mangaTitle, source, mangaId }]);
  };

  // Handle Hardware Back Button
  useEffect(() => {
    const handleBackButton = async () => {
      if (view === 'reader') {
        handleCloseReader();
      } else if (view === 'details') {
        setView('home');
      } else if (view === 'home' && showSearch) {
        setShowSearch(false);
      } else {
        // Exit app if on home screen
        CapacitorApp.exitApp();
      }
    };

    const listener = CapacitorApp.addListener('backButton', handleBackButton);

    return () => {
      listener.then(l => l.remove());
    };
  }, [view, showSearch]);

  const handleMangaSelect = (manga: Manga) => {
    setSelectedManga(manga);
    setView('details');
  };



  // ... (rest of the code)

  const scrollPositionRef = useRef(0);

  const handleRead = async (file: File | string, chapterId?: string, page: number = 0) => {
    // Save scroll position
    console.log('[App] Saving scroll position:', window.scrollY);
    scrollPositionRef.current = window.scrollY;

    let fileName: string;
    if (file instanceof File) {
      fileName = await StorageService.saveChapterFile(file);
    } else {
      fileName = file;
    }

    setReadingChapter({ fileName, id: chapterId });
    if (chapterId) setCurrentChapterId(chapterId);
    setInitialPage(page);
    setView('reader');
  };

  const handleCloseReader = () => {
    console.log('[App] Closing reader, restoring scroll to:', scrollPositionRef.current);
    setReadingChapter(null);
    setCurrentChapterId(null);
    setView('details');
    // Restore scroll position after a brief delay to allow rendering
    setTimeout(() => {
      console.log('[App] Executing scroll restore');
      window.scrollTo(0, scrollPositionRef.current);
    }, 50);
  };

  const handleNextChapter = async (): Promise<boolean> => {
    if (!selectedManga || !currentChapterId) return false;

    // Sort chapters to ensure correct order
    const getChapterNumber = (title: string): number => {
      const match = title.match(/Chapter\s*(\d+(\.\d+)?)/i) || title.match(/(\d+(\.\d+)?)/);
      return match ? parseFloat(match[1] || match[0]) : 0;
    };

    const sortedChapters = [...selectedManga.chapters].sort((a, b) => {
      return getChapterNumber(a.title) - getChapterNumber(b.title);
    });

    const currentIndex = sortedChapters.findIndex(c => c.id === currentChapterId);
    if (currentIndex === -1 || currentIndex === sortedChapters.length - 1) return false;

    const nextChapter = sortedChapters[currentIndex + 1];
    try {
      // No need to read file content anymore!
      setInitialPage(0);
      setReadingChapter({ fileName: nextChapter.fileName, id: nextChapter.id });
      setCurrentChapterId(nextChapter.id);
      return true;
    } catch (error) {
      console.error("Failed to load next chapter", error);
      return false;
    }
  };

  const handlePrevChapter = async (): Promise<boolean> => {
    if (!selectedManga || !currentChapterId) return false;

    const getChapterNumber = (title: string): number => {
      const match = title.match(/Chapter\s*(\d+(\.\d+)?)/i) || title.match(/(\d+(\.\d+)?)/);
      return match ? parseFloat(match[1] || match[0]) : 0;
    };

    const sortedChapters = [...selectedManga.chapters].sort((a, b) => {
      return getChapterNumber(a.title) - getChapterNumber(b.title);
    });

    const currentIndex = sortedChapters.findIndex(c => c.id === currentChapterId);
    if (currentIndex === -1 || currentIndex === 0) return false;

    const prevChapter = sortedChapters[currentIndex - 1];
    try {
      // No need to read file content anymore!
      setInitialPage('last');
      setReadingChapter({ fileName: prevChapter.fileName, id: prevChapter.id });
      setCurrentChapterId(prevChapter.id);
      return true;
    } catch (error) {
      console.error("Failed to load prev chapter", error);
      return false;
    }
  };

  const handleProgress = async (page: number, _total: number) => {
    if (!selectedManga || !currentChapterId) return;

    // Update progress
    if (selectedManga.lastReadChapterId !== currentChapterId || selectedManga.lastReadPage !== page) {
      const updatedManga = {
        ...selectedManga,
        lastReadChapterId: currentChapterId,
        lastReadPage: page,
        // readChapters is NOT updated here anymore, only in handleFinish
      };
      setSelectedManga(updatedManga);
      await StorageService.saveManga(updatedManga);
    }
  };

  const handleFinish = async () => {
    if (!selectedManga || !currentChapterId) return;

    let readChapters = selectedManga.readChapters || [];
    if (!readChapters.includes(currentChapterId)) {
      const updatedReadChapters = [...readChapters, currentChapterId];
      const updatedManga = { ...selectedManga, readChapters: updatedReadChapters };

      setSelectedManga(updatedManga);

      const library = await StorageService.loadLibrary();
      const newLibrary = library.map(m => m.id === selectedManga.id ? updatedManga : m);
      await StorageService.saveLibrary(newLibrary);
    }
  };

  return (
    <div className="app-container">
      {view === 'home' && (
        <Home
          onMangaSelect={handleMangaSelect}
          showAddModal={showSearch}
          setShowAddModal={setShowSearch}
        />
      )}

      {/* Keep MangaDetails mounted to preserve scroll position */}
      {selectedManga && (
        <div style={{ display: view === 'details' ? 'block' : 'none' }}>
          <MangaDetails
            manga={selectedManga}
            onBack={() => setView('home')}
            onRead={handleRead}

            onUpdateManga={setSelectedManga}
            onRemove={async () => {
              await StorageService.removeManga(selectedManga);
              setView('home');
              setSelectedManga(null);
            }}
            downloadQueue={downloadQueue.map(i => i.chapter.id)}
            activeDownloads={activeDownloads}
            downloadProgress={downloadProgress}
            onQueueDownload={addToDownloadQueue}
          />
        </div>
      )}

      {view === 'reader' && readingChapter && (
        <Reader
          chapterFileName={readingChapter.fileName}
          onClose={handleCloseReader}
          onNextChapter={handleNextChapter}
          onPrevChapter={handlePrevChapter}
          initialPage={initialPage}
          onProgress={handleProgress}
          onFinish={handleFinish}
          mangaType={selectedManga?.type}
        />
      )}
    </div>
  );
}

export default App;
