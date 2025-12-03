import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import JSZip from 'jszip';

export interface Chapter {
    id: string;
    title: string;
    fileName: string; // Name of file in app storage
}

export interface Manga {
    id: string;
    title: string;
    coverUrl: string;
    description: string;
    type?: string;
    genres?: string[];
    status?: string;
    totalChapters?: number | null;
    chapters: Chapter[];
    lastReadChapterId?: string;
    lastReadPage?: number;
    readChapters?: string[]; // IDs of read chapters
    source?: 'mangapill' | 'webtoon' | 'arenascans';
    sourceMangaId?: string;
    preferredBatchSize?: number;
    alternativeTitles?: string[];
}

const MANGA_KEY = 'manga_library';

export const StorageService = {
    // Save entire library metadata
    saveLibrary: async (library: Manga[]) => {
        await Preferences.set({
            key: MANGA_KEY,
            value: JSON.stringify(library),
        });
    },

    // Update a single manga in the library (Upsert)
    saveManga: async (manga: Manga) => {
        const library = await StorageService.loadLibrary();
        const index = library.findIndex(m => m.id === manga.id);

        let newLibrary;
        if (index !== -1) {
            // Update existing
            newLibrary = [...library];
            newLibrary[index] = manga;
        } else {
            // Insert new
            newLibrary = [manga, ...library];
        }

        await StorageService.saveLibrary(newLibrary);
    },

    // Load library metadata
    loadLibrary: async (): Promise<Manga[]> => {
        const { value } = await Preferences.get({ key: MANGA_KEY });
        return value ? JSON.parse(value) : [];
    },

    // Save a CBZ file to app storage
    saveChapterFile: async (file: File): Promise<string> => {
        const fileName = `${Date.now()}_${file.name}`;

        // Convert File to base64
        const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
        });

        // Remove header (data:application/zip;base64,)
        const base64Content = base64Data.split(',')[1];

        await Filesystem.writeFile({
            path: fileName,
            data: base64Content,
            directory: Directory.Data,
        });

        return fileName;
    },

    // Read a chapter file
    readChapterFile: async (fileName: string): Promise<string> => {
        const file = await Filesystem.readFile({
            path: fileName,
            directory: Directory.Data,
        });

        // Return the base64 data directly
        return file.data as string;
    },

    // Remove a manga and its chapter files
    removeManga: async (manga: Manga) => {
        // Delete chapter files first
        for (const chapter of manga.chapters) {
            try {
                await Filesystem.deleteFile({
                    path: chapter.fileName,
                    directory: Directory.Data
                });
            } catch (e) {
                console.warn(`Failed to delete chapter file: ${chapter.fileName}`, e);
            }
        }

        // Update library
        const library = await StorageService.loadLibrary();
        const newLibrary = library.filter(m => m.id !== manga.id);
        await StorageService.saveLibrary(newLibrary);
    },

    // Delete a single chapter file
    deleteChapterFile: async (fileName: string) => {
        try {
            await Filesystem.deleteFile({
                path: fileName,
                directory: Directory.Data
            });
        } catch (e) {
            console.warn(`Failed to delete chapter file: ${fileName}`, e);
        }
    },

    // Extract a chapter zip to cache and return image paths
    extractZipToCache: async (fileName: string): Promise<string[]> => {
        const cacheDir = `cache/${fileName.replace(/\.[^/.]+$/, "")}`; // Remove extension

        // 1. Check if already cached
        try {
            const cachedFiles = await Filesystem.readdir({
                path: cacheDir,
                directory: Directory.Cache
            });

            if (cachedFiles.files.length > 0) {
                // Return cached paths
                // Sort them naturally
                const sortedFiles = cachedFiles.files.sort((a, b) =>
                    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
                );

                return sortedFiles.map(f => Capacitor.convertFileSrc(f.uri));
            }
        } catch (e) {
            // Not cached, proceed to extract
        }

        // 2. Read the zip file
        let fileData;
        try {
            fileData = await Filesystem.readFile({
                path: fileName,
                directory: Directory.Data
            });
        } catch (readError) {
            console.error(`Failed to read file: ${fileName}`, readError);

            // Debug: List files in directory to see what's there
            try {
                const files = await Filesystem.readdir({
                    path: '',
                    directory: Directory.Data
                });
                console.log('Files in Directory.Data:', files.files.map(f => f.name));
            } catch (e) {
                console.error('Failed to list files', e);
            }

            throw new Error(`File not found: ${fileName}`);
        }

        const zip = new JSZip();
        // fileData.data is base64 string
        const zipContent = await zip.loadAsync(fileData.data as string, { base64: true });

        // 3. Extract images
        const imageEntries = Object.values(zipContent.files).filter((entry: any) =>
            !entry.dir && /\.(jpg|jpeg|png|gif|webp)$/i.test(entry.name)
        );

        // Sort
        imageEntries.sort((a: any, b: any) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        const imagePaths: string[] = [];

        // Create cache directory
        try {
            await Filesystem.mkdir({
                path: cacheDir,
                directory: Directory.Cache,
                recursive: true
            });
        } catch (e) {
            // Ignore if exists
        }

        // Write files in batches to speed up
        const BATCH_SIZE = 10;
        for (let i = 0; i < imageEntries.length; i += BATCH_SIZE) {
            const batch = imageEntries.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(batch.map(async (entry) => {
                // Get base64 directly from JSZip
                const base64Image = await (entry as any).async('base64');

                // Sanitize filename
                const safeName = (entry as any).name.replace(/[^a-zA-Z0-9.-]/g, '_');
                const imagePath = `${cacheDir}/${safeName}`;

                await Filesystem.writeFile({
                    path: imagePath,
                    data: base64Image,
                    directory: Directory.Cache
                });

                const uri = await Filesystem.getUri({
                    path: imagePath,
                    directory: Directory.Cache
                });

                return Capacitor.convertFileSrc(uri.uri);
            }));

            imagePaths.push(...batchResults);

            // Yield to main thread between batches
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        return imagePaths;
    },

    // Clear cache
    clearCache: async () => {
        try {
            await Filesystem.rmdir({
                path: 'cache',
                directory: Directory.Cache,
                recursive: true
            });
        } catch (e) {
            // Ignore
        }
    }
};
