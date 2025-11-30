import { CapacitorHttp } from '@capacitor/core';
import JSZip from 'jszip';
import { Filesystem, Directory } from '@capacitor/filesystem';

export const DownloadService = {
    downloadChapter: async (
        chapterTitle: string,
        mangaTitle: string,
        fetchPages: () => Promise<string[]>,
        headers: Record<string, string> = {},
        onProgress?: (progress: number) => void
    ): Promise<string> => {
        try {
            // 1. Get image URLs
            const imageUrls = await fetchPages();
            if (imageUrls.length === 0) throw new Error("No pages found");

            const zip = new JSZip();
            let completed = 0;

            // 2. Download each image
            // 2. Download each image in batches to avoid rate limiting and network congestion
            const BATCH_SIZE = 5;
            for (let i = 0; i < imageUrls.length; i += BATCH_SIZE) {
                const batch = imageUrls.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(async (url, batchIndex) => {
                    const index = i + batchIndex;
                    try {
                        let blob: Blob;

                        // Use CapacitorHttp if headers are needed (Webtoon), otherwise standard fetch (MangaDex)
                        if (Object.keys(headers).length > 0) {
                            const response = await CapacitorHttp.get({
                                url: url,
                                headers: headers,
                                responseType: 'blob'
                            });

                            const base64 = response.data;
                            const byteCharacters = atob(base64);
                            const byteNumbers = new Array(byteCharacters.length);
                            for (let k = 0; k < byteCharacters.length; k++) {
                                byteNumbers[k] = byteCharacters.charCodeAt(k);
                            }
                            const byteArray = new Uint8Array(byteNumbers);
                            blob = new Blob([byteArray], { type: 'image/jpeg' });
                        } else {
                            const response = await fetch(url);
                            blob = await response.blob();
                        }

                        let extension = 'jpg';
                        if (url.includes('.png')) extension = 'png';
                        if (url.includes('.webp')) extension = 'webp';

                        const filename = `${String(index + 1).padStart(3, '0')}.${extension}`;

                        zip.file(filename, blob);

                        completed++;
                        if (onProgress) {
                            onProgress((completed / imageUrls.length) * 0.8);
                        }
                    } catch (err) {
                        console.error(`Failed to download page ${index + 1}`, err);
                        throw err;
                    }
                }));
            }

            // 3. Generate ZIP file (Base64 directly to save memory)
            if (onProgress) onProgress(0.9);
            const base64Content = await zip.generateAsync({ type: 'base64' });

            // 4. Save to storage
            const safeTitle = chapterTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const fileName = `${Date.now()}_${mangaTitle}_${safeTitle}.cbz`;

            // Write directly using Filesystem to avoid File/Blob overhead
            await Filesystem.writeFile({
                path: fileName,
                data: base64Content,
                directory: Directory.Data,
            });

            if (onProgress) onProgress(1.0);
            return fileName;

        } catch (error) {
            console.error("Download failed:", error);
            throw error;
        }
    }
};
