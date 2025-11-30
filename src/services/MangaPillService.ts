import { CapacitorHttp } from '@capacitor/core';

const BASE_URL = 'https://mangapill.com';

export interface MangaPillManga {
    id: string;
    title: string;
    coverUrl: string;
    url: string;
}

export interface MangaPillChapter {
    id: string;
    title: string;
    url: string;
    number: string;
}

export const MangaPillService = {
    searchManga: async (query: string): Promise<MangaPillManga[]> => {
        try {
            const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(query)}`;
            const response = await CapacitorHttp.get({
                url: searchUrl,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            const html = response.data;
            const results: MangaPillManga[] = [];

            // Split by "relative block" to find entries
            const blocks = html.split('href="/manga/');

            for (let i = 1; i < blocks.length; i++) {
                const block = blocks[i];
                // 1234/one-piece
                const urlMatch = block.match(/^(\d+)\/([^"]+)"/);
                if (!urlMatch) continue;

                const id = urlMatch[1];
                const slug = urlMatch[2];
                const url = `/manga/${id}/${slug}`;

                // Title
                const titleMatch = block.match(/<div[^>]*class="[^"]*mt-3[^"]*"[^>]*>([^<]+)<\/div>/);
                const title = titleMatch ? titleMatch[1].trim() : slug.replace(/-/g, ' ');

                // Cover
                const coverMatch = block.match(/src="([^"]+)"/);
                const coverUrl = coverMatch ? coverMatch[1] : '';

                results.push({ id, title, coverUrl, url });

                if (results.length >= 10) break;
            }

            return results;
        } catch (error) {
            console.error('MangaPill search error:', error);
            return [];
        }
    },

    getChapters: async (mangaId: string, mangaSlug: string): Promise<MangaPillChapter[]> => {
        try {
            const url = `${BASE_URL}/manga/${mangaId}/${mangaSlug}`;
            const response = await CapacitorHttp.get({
                url: url,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            const html = response.data;

            const chapters: MangaPillChapter[] = [];

            // Look for <a href="/chapters/ID-CHAPID/slug" ...>Chapter 123</a>
            const linkRegex = /href="\/chapters\/(\d+)-(\d+)\/([^"]+)"[^>]*>(.*?)<\/a>/g;
            let match;

            while ((match = linkRegex.exec(html)) !== null) {
                const chapterId = match[2];
                const slug = match[3];
                const rawTitle = match[4].trim();

                // Extract number
                const numberMatch = rawTitle.match(/Chapter\s+([\d.]+)/);
                const number = numberMatch ? numberMatch[1] : '0';

                chapters.push({
                    id: chapterId,
                    title: rawTitle,
                    url: `/chapters/${mangaId}-${chapterId}/${slug}`,
                    number
                });
            }

            return chapters;
        } catch (error) {
            console.error('MangaPill chapters error:', error);
            return [];
        }
    },

    getChapterPages: async (chapterUrl: string): Promise<string[]> => {
        try {
            const fullUrl = `${BASE_URL}${chapterUrl}`;
            const response = await CapacitorHttp.get({
                url: fullUrl,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            const html = response.data;
            const pages: string[] = [];

            // Robust Regex for Images
            // Robust Regex for Images
            // Found structure: <img class="js-page" data-src="https://cdn.readdetectiveconan.com/..." ...>
            const imgTagRegex = /<img[^>]+class="[^"]*js-page[^"]*"[^>]+>/g;
            const srcRegex = /(?:src|data-src)="([^"]+)"/g;

            const imgTags = html.match(imgTagRegex) || [];

            for (const tag of imgTags) {
                let srcMatch;
                while ((srcMatch = srcRegex.exec(tag)) !== null) {
                    const url = srcMatch[1];
                    // Accept any URL found in a js-page image
                    if (url.startsWith('http')) {
                        pages.push(url);
                    }
                }
            }

            return [...new Set(pages)];

        } catch (error) {
            console.error('MangaPill pages error:', error);
            return [];
        }
    }
};
