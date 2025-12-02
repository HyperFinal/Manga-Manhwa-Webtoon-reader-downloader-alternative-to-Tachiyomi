import { useState, useEffect, useRef, useMemo } from 'react';
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
        console.log(`[App] 📥 Starting download for chapter:`, chapter);
        console.log(`[App] Download params: mangaTitle="${mangaTitle}", source="${source}", mangaId="${mangaId}"`);

        let fileName: string;
        let chapterTitle: string;

        if (source === 'mangapill') {
          const c = chapter as MangaPillChapter;
          chapterTitle = c.title;
          console.log(`[App] MangaPill download: ${chapterTitle}`);
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
          console.log(`[App] Webtoon download: ${chapterTitle}, episode_no: ${c.id}`);
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
        const targetManga = library.find(m => m.title === mangaTitle);

        if (targetManga) {
          // Check if this chapter already exists with fileName: 'online'
          // If so, update it instead of creating a duplicate
          // Use trim() and normalized comparison for robust matching
          const normalizedTitle = chapterTitle.trim().toLowerCase();
          const existingOnlineIndex = targetManga.chapters.findIndex(
            ch => ch.fileName === 'online' && ch.title.trim().toLowerCase() === normalizedTitle
          );

          console.log(`[App] Searching for existing chapter: "${chapterTitle}" (normalized: "${normalizedTitle}")`);
          console.log(`[App] Existing chapters:`, targetManga.chapters.map(c => `"${c.title}" (${c.fileName})`));
          console.log(`[App] Found existing at index: ${existingOnlineIndex}`);

          let updatedChapters;
          if (existingOnlineIndex !== -1) {
            // Update existing online chapter with the downloaded file
            console.log(`[App] ✅ Updating online chapter "${chapterTitle}" with downloaded file: ${fileName}`);
            updatedChapters = [...targetManga.chapters];
            updatedChapters[existingOnlineIndex] = {
              ...updatedChapters[existingOnlineIndex],
              fileName: fileName
            };
          } else {
            // Add as new chapter
            console.log(`[App] ➕ Adding new downloaded chapter: ${chapterTitle}`);
            updatedChapters = [...targetManga.chapters, newChapter];
          }

          const updatedManga = {
            ...targetManga,
            chapters: updatedChapters
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

    // Update manga source info if missing
    if (selectedManga && (!selectedManga.source || !selectedManga.sourceMangaId)) {
      console.log(`[App] Saving source info for ${mangaTitle}: ${source} / ${mangaId}`);
      setSelectedManga(prev => prev ? ({
        ...prev,
        source,
        sourceMangaId: mangaId || prev.sourceMangaId
      }) : null);
    }

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



  const handleProgress = (page: number, _total: number, chapterId?: string) => {
    const targetChapterId = chapterId || currentChapterId;

    setSelectedManga(prevManga => {
      if (!prevManga || !targetChapterId) return prevManga;

      // Only update if changed
      if (prevManga.lastReadChapterId !== targetChapterId || prevManga.lastReadPage !== page) {
        return {
          ...prevManga,
          lastReadChapterId: targetChapterId,
          lastReadPage: page,
        };
      }
      return prevManga;
    });
  };

  const handleFinish = async () => {
    if (!selectedManga || !currentChapterId) return;
    await markChapterAsRead(currentChapterId);
  };
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Persist selectedManga changes
  useEffect(() => {
    if (selectedManga) {
      StorageService.saveManga(selectedManga).catch(err => console.error("Failed to save manga", err));
    }
  }, [selectedManga]);

  const markChapterAsRead = (chapterId: string) => {
    console.log(`[App] markChapterAsRead called for: ${chapterId}`);

    setSelectedManga(prevManga => {
      if (!prevManga) return null;

      // Avoid duplicates
      if (prevManga.readChapters?.includes(chapterId)) {
        return prevManga;
      }

      const newReadChapters = [...(prevManga.readChapters || []), chapterId];
      showToast(`Marked Read: ${chapterId.slice(-4)}`);

      return { ...prevManga, readChapters: newReadChapters };
    });
  };

  const sortedChapters = useMemo(() => {
    if (!selectedManga) return [];
    return [...selectedManga.chapters].sort((a, b) => {
      const getNum = (t: string) => {
        const m = t.match(/Chapter\s*(\d+(\.\d+)?)/i) || t.match(/(\d+(\.\d+)?)/);
        return m ? parseFloat(m[1] || m[0]) : 0;
      };
      return getNum(a.title) - getNum(b.title);
    });
  }, [selectedManga?.chapters]);

  return (
    <div className="App h-screen w-screen bg-[#121212] text-white overflow-hidden flex flex-col">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-10 left-1/2 transform -translate-x-1/2 z-[100] bg-green-600 text-white px-4 py-2 rounded shadow-lg font-bold animate-in fade-in slide-in-from-top-5">
          {toastMsg}
        </div>
      )}

      <div className="flex-1 overflow-hidden relative flex flex-col">
        {view === 'home' && (
          <Home
            onMangaSelect={handleMangaSelect}
            showAddModal={showSearch}
            setShowAddModal={setShowSearch}
          />
        )}

        {/* Keep MangaDetails mounted to preserve scroll position */}
        {selectedManga && (
          <div style={{ display: view === 'details' ? 'block' : 'none', height: '100%' }}>
            <MangaDetails
              manga={selectedManga}
              onBack={() => setView('home')}
              onUpdateManga={setSelectedManga}
              onRead={handleRead}
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
            currentChapterId={currentChapterId || ''}
            chapters={sortedChapters}
            manga={selectedManga || undefined} // Pass selectedManga
            onClose={handleCloseReader}
            onChapterChange={(newChapterId) => {
              console.log(`[App] Chapter changed to: ${newChapterId}`);
              setCurrentChapterId(newChapterId);
            }}
            getChapterContent={async (fileName) => {
              return await StorageService.extractZipToCache(fileName);
            }}
            initialPage={initialPage}
            onProgress={handleProgress}
            onFinish={handleFinish}
            onChapterComplete={markChapterAsRead}
            onUpdateManga={setSelectedManga} // Pass state updater
            mangaType={selectedManga?.type}
          />
        )}
      </div>
    </div>
  );
}

export default App;
