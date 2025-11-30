import axios from 'axios';

const MANGADEX_API_URL = 'https://api.mangadex.org';

export interface MangaDexManga {
    id: string;
    attributes: {
        title: {
            en?: string;
            [key: string]: string | undefined;
        };
        description: {
            en?: string;
            [key: string]: string | undefined;
        };
    };
}

export interface MangaDexChapter {
    id: string;
    attributes: {
        volume: string | null;
        chapter: string | null;
        title: string | null;
        externalUrl: string | null;
    };
}

export const MangaDexService = {
    // Search for a manga by title
    searchManga: async (title: string): Promise<MangaDexManga[]> => {
        try {
            const response = await axios.get(`${MANGADEX_API_URL}/manga`, {
                params: {
                    title: title,
                    limit: 5,
                    order: { relevance: 'desc' }
                }
            });
            return response.data.data;
        } catch (error) {
            console.error('Error searching MangaDex:', error);
            return [];
        }
    },

    // Get English chapters for a manga
    getChapters: async (mangaId: string): Promise<MangaDexChapter[]> => {
        let allChapters: MangaDexChapter[] = [];
        try {
            let offset = 0;
            const limit = 100;
            let total = 0;

            do {
                // Rate limit handling: wait a bit between requests
                if (offset > 0) await new Promise(resolve => setTimeout(resolve, 500));

                let retries = 3;
                let success = false;

                while (retries > 0 && !success) {
                    try {
                        console.log(`Fetching MangaDex chapters: offset ${offset}, limit ${limit}`);
                        const response = await axios.get(`${MANGADEX_API_URL}/manga/${mangaId}/feed`, {
                            params: {
                                translatedLanguage: ['en'],
                                order: { chapter: 'desc' },
                                limit: limit,
                                offset: offset
                            }
                        });

                        const data = response.data.data;
                        total = response.data.total;
                        allChapters = [...allChapters, ...data];
                        offset += limit;
                        console.log(`Fetched ${allChapters.length}/${total} chapters`);
                        success = true;
                    } catch (err) {
                        console.error(`Error fetching batch (offset ${offset}), retries left: ${retries - 1}`, err);
                        retries--;
                        if (retries > 0) await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
                    }
                }

                if (!success) {
                    console.error(`Failed to fetch batch at offset ${offset} after retries. Aborting.`);
                    break; // Stop trying to fetch more if we fail repeatedly
                }

            } while (offset < total);

            return allChapters;
        } catch (error) {
            console.error('Critical error fetching chapters from MangaDex:', error);
            return allChapters.length > 0 ? allChapters : [];
        }
    },

    // Get pages for a chapter
    getChapterPages: async (chapterId: string): Promise<string[]> => {
        try {
            const response = await axios.get(`${MANGADEX_API_URL}/at-home/server/${chapterId}`);
            const baseUrl = response.data.baseUrl;
            const hash = response.data.chapter.hash;
            const files = response.data.chapter.data;

            return files.map((file: string) => `${baseUrl}/data/${hash}/${file}`);
        } catch (error) {
            console.error('Error fetching chapter pages:', error);
            return [];
        }
    }
};
