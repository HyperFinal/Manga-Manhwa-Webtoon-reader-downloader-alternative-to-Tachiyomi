import { CapacitorHttp } from '@capacitor/core';

const WEBTOON_BASE_URL = 'https://www.webtoons.com/en';

export interface WebtoonManga {
    id: string; // title_no
    title: string;
    coverUrl: string;
    author: string;
    url: string; // Canonical URL
}



export interface WebtoonChapter {
    id: string; // episode_no
    title: string;
    date: string;
    url: string;
}

export const WebtoonService = {
    // Search for a webtoon by title
    searchManga: async (query: string): Promise<WebtoonManga[]> => {
        try {
            const response = await CapacitorHttp.get({
                url: `${WEBTOON_BASE_URL}/search`,
                params: { keyword: query },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://www.webtoons.com/'
                }
            });

            const html = response.data;
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const results: WebtoonManga[] = [];

            // 1. Try specific class selectors first
            let items = doc.querySelectorAll('li .card_item, li ._card_item, a._card_item');

            // 2. Fallback: Find ANY link with title_no (very robust)
            if (items.length === 0) {
                console.warn('WebtoonService: No items found with class selectors, trying generic href selector');
                items = doc.querySelectorAll('a[href*="title_no="]');
            }

            items.forEach(item => {
                // The item itself might be the link (a tag) or contain it
                const link = item.tagName === 'A' ? item : item.querySelector('a');
                if (!link) return;

                const href = link.getAttribute('href');
                if (!href || !href.includes('title_no=')) return;

                const img = item.querySelector('img');

                // Title extraction
                let titleText = '';
                const titleEl = item.querySelector('strong') || item.querySelector('.subj');
                if (titleEl) {
                    titleText = titleEl.textContent?.trim() || '';
                } else {
                    // Fallback: Check for text inside the link if no title element found
                    const divs = item.querySelectorAll('div');
                    for (let i = 0; i < divs.length; i++) {
                        const t = divs[i].textContent?.trim();
                        if (t && t.length > 2 && t !== 'UP' && t !== 'NEW') {
                            titleText = t;
                            break;
                        }
                    }
                }

                if (!titleText) titleText = 'Unknown Title';

                // Author extraction
                let authorText = 'Unknown Author';
                const authorEl = item.querySelector('.author');
                if (authorEl) {
                    authorText = authorEl.textContent?.trim() || '';
                } else if (titleEl && titleEl.parentElement) {
                    // Fallback: Look for sibling divs
                    const siblings = titleEl.parentElement.querySelectorAll('div');
                    if (siblings.length > 0) {
                        authorText = siblings[0].textContent?.trim() || '';
                    }
                }

                const urlParams = new URLSearchParams(href.split('?')[1]);
                const id = urlParams.get('title_no');

                if (id) {
                    // Avoid duplicates
                    if (!results.some(r => r.id === id)) {
                        results.push({
                            id: id,
                            title: titleText,
                            coverUrl: img?.getAttribute('src') || '',
                            author: authorText,
                            url: href // Store the full canonical URL
                        });
                    }
                }
            });

            return results;
        } catch (error) {
            console.error('Error searching Webtoon:', error);
            return [];
        }
    },

    // Get chapters for a webtoon
    getChapters: async (mangaId: string, page: number = 1, mangaUrl?: string): Promise<{ chapters: WebtoonChapter[], maxPage: number, currentPage: number }> => {
        try {
            // Use canonical URL if available to avoid redirects dropping params
            let requestUrl = `${WEBTOON_BASE_URL}/genre/title/list`;
            if (mangaUrl) {
                // Remove query params from canonical URL to let params object handle them cleanly
                requestUrl = mangaUrl.split('?')[0];
            }

            const response = await CapacitorHttp.get({
                url: requestUrl,
                params: { title_no: mangaId, page: page.toString() },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://www.webtoons.com/'
                }
            });

            const html = response.data;
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const chapters: WebtoonChapter[] = [];
            // Select all list items within the chapter list
            const items = doc.querySelectorAll('#_listUl li');

            items.forEach(item => {
                const link = item.querySelector('a');
                // Title is often in a span with class 'subj' -> span
                const titleSpan = item.querySelector('.subj span');
                const dateSpan = item.querySelector('.date');

                if (link) {
                    const href = link.getAttribute('href') || '';
                    const urlParams = new URLSearchParams(href.split('?')[1]);
                    const episodeNo = urlParams.get('episode_no');

                    const titleText = titleSpan?.textContent?.trim() || link.querySelector('.subj')?.textContent?.trim() || `Episode ${episodeNo}`;

                    if (episodeNo) {
                        chapters.push({
                            id: episodeNo,
                            title: titleText,
                            date: dateSpan?.textContent?.trim() || '',
                            url: href
                        });
                    }
                }
            });

            // Parse pagination to find max page and current page
            let maxPage = 1;
            let currentPage = page;

            // 1. DOM Method (Try first)
            const paginateLinks = doc.querySelectorAll('.paginate a');
            paginateLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href && href.includes('page=')) {
                    const pageNum = parseInt(href.split('page=')[1]);
                    if (!isNaN(pageNum) && pageNum > maxPage) {
                        maxPage = pageNum;
                    }
                }
                const textNum = parseInt(link.textContent || '');
                if (!isNaN(textNum) && textNum > maxPage) {
                    maxPage = textNum;
                }
            });

            // 2. Regex Method (Fallback/Robustness)
            // Look for page=X in the entire HTML
            const pageMatches = html.match(/[?&]page=(\d+)/g);
            if (pageMatches) {
                pageMatches.forEach((match: string) => {
                    const num = parseInt(match.split('=')[1]);
                    if (!isNaN(num) && num > maxPage) maxPage = num;
                });
            }

            // Find active page (current page)
            const activePageEl = doc.querySelector('.paginate .on');
            if (activePageEl) {
                const activeVal = parseInt(activePageEl.textContent || '');
                if (!isNaN(activeVal)) {
                    currentPage = activeVal;
                }
            } else {
                // Regex fallback for active page? Harder, but maybe we can infer from what's NOT a link?
                // Usually unnecessary if we requested 'page' and got it.
                // But if we got redirected, we need to know.
                // Let's assume if we requested page X and maxPage is < X, we might be on maxPage.
            }

            if (currentPage > maxPage) maxPage = currentPage;

            return { chapters, maxPage, currentPage };
        } catch (error) {
            console.error('Error fetching Webtoon chapters:', error);
            return { chapters: [], maxPage: 1, currentPage: 1 };
        }
    },

    // Get pages for a chapter
    getChapterPages: async (mangaId: string, chapterId: string): Promise<string[]> => {
        try {
            const response = await CapacitorHttp.get({
                url: `${WEBTOON_BASE_URL}/genre/title/episode/viewer`,
                params: { title_no: mangaId, episode_no: chapterId },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://www.webtoons.com/'
                }
            });

            const html = response.data;
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const imageUrls: string[] = [];
            const images = doc.querySelectorAll('.viewer_img img');

            images.forEach(img => {
                const src = img.getAttribute('data-url'); // Webtoon often uses data-url for lazy loading
                if (src) {
                    imageUrls.push(src);
                }
            });

            return imageUrls;
        } catch (error) {
            console.error('Error fetching Webtoon pages:', error);
            return [];
        }
    }
};
