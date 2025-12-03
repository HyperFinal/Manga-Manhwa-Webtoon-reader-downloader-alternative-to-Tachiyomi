import { CapacitorHttp } from '@capacitor/core';

export interface ArenaScansManga {
    title: string;
    slug: string;
    coverUrl: string;
}

export interface ArenaScansChapter {
    id: string; // usually the URL or slug
    title: string;
    number: number;
    url: string;
}

export const ArenaScansService = {
    baseUrl: 'https://arenascan.com',

    async search(query: string): Promise<ArenaScansManga[]> {
        try {
            // ArenaScans search: /?s=query&post_type=wp-manga
            const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
            console.log(`[ArenaScans] Searching: ${url}`);
            const response = await CapacitorHttp.get({
                url,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': this.baseUrl,
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            });

            if (response.status !== 200) {
                throw new Error('Failed to search ArenaScans');
            }

            const html = response.data;
            console.log(`[ArenaScans] Response length: ${html.length}`);

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const results: ArenaScansManga[] = [];

            // Try multiple selectors for Madara themes
            let items = doc.querySelectorAll('.c-tabs-item__content');
            if (items.length === 0) items = doc.querySelectorAll('.post-item');
            if (items.length === 0) items = doc.querySelectorAll('.manga-item');
            if (items.length === 0) items = doc.querySelectorAll('.bsx');

            console.log(`[ArenaScans] Found ${items.length} items`);

            items.forEach((item) => {
                let titleElement = item.querySelector('.post-title a') || item.querySelector('.title a') || item.querySelector('h3 a');

                if (!titleElement && item.classList.contains('bsx')) {
                    titleElement = item.querySelector('a');
                }

                const imgElement = item.querySelector('img');

                if (titleElement) {
                    let title = titleElement.textContent?.trim() || '';
                    if (item.classList.contains('bsx')) {
                        title = item.querySelector('.tt')?.textContent?.trim() || titleElement.getAttribute('title') || title;
                    }
                    const href = titleElement.getAttribute('href') || '';
                    // Extract slug from URL: https://arenascan.com/manga/slug/
                    const slugMatch = href.match(/\/manga\/([^/]+)\//);
                    const slug = slugMatch ? slugMatch[1] : '';

                    // Handle lazy loading or src
                    const coverUrl = imgElement?.getAttribute('data-src') || imgElement?.getAttribute('src') || '';

                    if (slug) {
                        results.push({ title, slug, coverUrl });
                    }
                }
            });

            return results;
        } catch (error) {
            console.error('ArenaScans search error:', error);
            return [];
        }
    },

    async getChapters(slug: string): Promise<ArenaScansChapter[]> {
        try {
            const url = `${this.baseUrl}/manga/${slug}/`;
            // Some Madara sites load chapters via AJAX, but often they are in the HTML or available via POST
            // Let's try GET first. If empty, we might need the ajax endpoint.
            // ArenaScans often lists them directly or has an ajax load.

            // Strategy: Try GET. If no chapters, try the ajax endpoint.
            let response = await CapacitorHttp.get({
                url,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': this.baseUrl
                }
            });
            let html = response.data;

            let parser = new DOMParser();
            let doc = parser.parseFromString(html, 'text/html');
            let chapterElements = doc.querySelectorAll('.wp-manga-chapter');
            if (chapterElements.length === 0) chapterElements = doc.querySelectorAll('#chapterlist li');

            if (chapterElements.length === 0) {
                // Try AJAX method common in Madara themes
                // We need the manga ID (data-id) from the body or a specific element
                const mangaIdElement = doc.querySelector('#manga-chapters-holder');
                const mangaId = mangaIdElement?.getAttribute('data-id');

                if (mangaId) {
                    const ajaxUrl = `${this.baseUrl}/wp-admin/admin-ajax.php`;
                    const formData = new FormData();
                    formData.append('action', 'manga_get_chapters');
                    formData.append('manga', mangaId);

                    // CapacitorHttp doesn't support FormData well in all platforms, use URLSearchParams or raw string
                    // For 'application/x-www-form-urlencoded'
                    const body = `action=manga_get_chapters&manga=${mangaId}`;

                    response = await CapacitorHttp.post({
                        url: ajaxUrl,
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        data: body
                    });

                    html = response.data;
                    doc = parser.parseFromString(html, 'text/html');
                    chapterElements = doc.querySelectorAll('.wp-manga-chapter');
                }
            }

            const chapters: ArenaScansChapter[] = [];

            chapterElements.forEach((el) => {
                const link = el.querySelector('a');
                if (link) {
                    const chapterUrl = link.getAttribute('href') || '';
                    let title = link.textContent?.trim() || '';

                    // Handle .chapternum
                    const numSpan = el.querySelector('.chapternum');
                    if (numSpan) {
                        title = numSpan.textContent?.trim() || title;
                    }

                    // Extract number from title "Chapter 123"
                    const numMatch = title.match(/Chapter\s+(\d+(\.\d+)?)/i) || title.match(/Episode\s+(\d+(\.\d+)?)/i) || title.match(/(\d+(\.\d+)?)/);
                    const number = numMatch ? parseFloat(numMatch[1] || numMatch[0]) : 0;

                    chapters.push({
                        id: chapterUrl, // Use URL as ID
                        title,
                        number,
                        url: chapterUrl
                    });
                }
            });

            return chapters;
        } catch (error) {
            console.error('ArenaScans getChapters error:', error);
            return [];
        }
    },

    async getPages(chapterUrl: string): Promise<string[]> {
        try {
            const response = await CapacitorHttp.get({
                url: chapterUrl,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': this.baseUrl
                }
            });
            const html = response.data;
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const pages: string[] = [];
            // Madara usually has images in .reading-content img
            let images = doc.querySelectorAll('.reading-content img');
            if (images.length === 0) images = doc.querySelectorAll('.page-break img');
            if (images.length === 0) images = doc.querySelectorAll('#readerarea img');

            console.log(`[ArenaScans] Found ${images.length} pages`);

            images.forEach((img) => {
                let src = img.getAttribute('data-src') || img.getAttribute('src') || '';
                if (src) {
                    // Fix relative URLs or whitespace
                    src = src.trim();
                    if (src.startsWith('http')) {
                        pages.push(src);
                    }
                }
            });

            return pages;
        } catch (error) {
            console.error('ArenaScans getPages error:', error);
            return [];
        }
    }
};
