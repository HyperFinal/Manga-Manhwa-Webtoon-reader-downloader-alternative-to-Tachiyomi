import { useState, useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Home } from './components/Home';
import { MangaDetails } from './components/MangaDetails';
import { Reader } from './components/Reader';
import { StorageService } from './services/StorageService';
import type { Manga } from './services/StorageService';
import './styles/theme.css';

function App() {
  const [view, setView] = useState<'home' | 'details' | 'reader'>('home');
  const [selectedManga, setSelectedManga] = useState<Manga | null>(null);
  const [readingFile, setReadingFile] = useState<File | string | null>(null);
  const [showSearch, setShowSearch] = useState(false);

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

  const handleRead = (file: File | string) => {
    setReadingFile(file);
    setView('reader');
  };

  const handleCloseReader = () => {
    setReadingFile(null);
    setView('details');
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

      {view === 'details' && selectedManga && (
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
        />
      )}

      {view === 'reader' && readingFile && (
        <Reader
          file={readingFile}
          onClose={handleCloseReader}
        />
      )}
    </div>
  );
}

export default App;
