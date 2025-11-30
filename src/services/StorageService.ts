import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';

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
    }
};
