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
            // 1. Get image URLs with timeout
            const fetchPagesWithTimeout = async () => {
                let timeoutHandle: NodeJS.Timeout;
                const timeoutPromise = new Promise<never>((_, reject) => {
                    timeoutHandle = setTimeout(() => reject(new Error('Page fetch timed out')), 10000); // 10s timeout for fetching list
                });
                return Promise.race([fetchPages(), timeoutPromise]).then(res => {
                    clearTimeout(timeoutHandle);
                    return res;
                });
            };

            const imageUrls = await fetchPagesWithTimeout();
            if (imageUrls.length === 0) throw new Error("No pages found");

            const zip = new JSZip();
            let completed = 0;

            // 2. Download each image
            // 2. Download each image in batches to avoid rate limiting and network congestion
            const BATCH_SIZE = 10; // Increased from 6
            for (let i = 0; i < imageUrls.length; i += BATCH_SIZE) {
                const batch = imageUrls.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(async (url, batchIndex) => {
                    const index = i + batchIndex;
                    let retries = 3;
                    while (retries > 0) {
                        try {
                            let data: Blob | string;
                            let isBase64 = false;

                            // Use CapacitorHttp if headers are needed (Webtoon), otherwise standard fetch (MangaDex)
                            if (Object.keys(headers).length > 0) {
                                // CapacitorHttp doesn't support AbortSignal yet, so we rely on its internal timeout
                                const response = await CapacitorHttp.get({
                                    url: url,
                                    headers: headers,
                                    responseType: 'blob', // Actually returns base64 string in 'data' field for 'blob' responseType in some versions, but let's verify. 
                                    // Wait, CapacitorHttp documentation says responseType: 'blob' returns base64 string in data.
                                    connectTimeout: 10000, // Increased to 10s
                                    readTimeout: 10000
                                });

                                // Optimization: Pass base64 directly to JSZip
                                data = response.data;
                                isBase64 = true;
                            } else {
                                // Standard fetch with AbortController
                                const controller = new AbortController();
                                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

                                try {
                                    const response = await fetch(url, { signal: controller.signal });
                                    clearTimeout(timeoutId);
                                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                                    data = await response.blob();
                                    isBase64 = false;
                                } catch (fetchErr) {
                                    clearTimeout(timeoutId);
                                    throw fetchErr;
                                }
                            }

                            let extension = 'jpg';
                            if (url.includes('.png')) extension = 'png';
                            if (url.includes('.webp')) extension = 'webp';

                            const filename = `${String(index + 1).padStart(3, '0')}.${extension}`;

                            if (isBase64) {
                                zip.file(filename, data as string, { base64: true });
                            } else {
                                zip.file(filename, data as Blob);
                            }

                            completed++;
                            if (onProgress) {
                                onProgress((completed / imageUrls.length) * 0.8);
                            }
                            break; // Success, exit retry loop
                        } catch (err) {
                            console.error(`Failed to download page ${index + 1}, retries left: ${retries - 1}`, err);
                            retries--;
                            if (retries === 0) throw err;
                            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
                        }
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
