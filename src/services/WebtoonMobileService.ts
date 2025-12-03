import { CapacitorHttp } from '@capacitor/core';

const MOBILE_BASE_URL = 'https://m.webtoons.com';

export interface WebtoonEpisode {
    episodeNo: number;
    episodeTitle: string;
    viewerLink: string;
    thumbnail: string;
    exposureDateMillis: number;
    displayUp: boolean;
    hasBgm: boolean;
    serviceStatus: string; // e.g., "SERVICE"
}

interface WebtoonApiResponse {
    result: {
        episodeList: WebtoonEpisode[];
        nextCursor: number;
    };
    success: boolean;
    code?: number;
    message?: string;
}

async function fetchEpisodes(titleId: string, type: string): Promise<WebtoonEpisode[]> {
    try {
        const url = `${MOBILE_BASE_URL}/api/v1/${type}/${titleId}/episodes`;
        const response = await CapacitorHttp.get({
            url: url,
            params: { pageSize: '99999' }, // Fetch all
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Referer': 'https://m.webtoons.com/'
            }
        });

        const data = response.data as WebtoonApiResponse;

        if (response.status === 200 && data && data.success && data.result && data.result.episodeList) {
            return data.result.episodeList;
        }
        return [];
    } catch (e) {
        console.warn(`[WebtoonMobileService] Failed to fetch for type ${type}:`, e);
        return [];
    }
}

export const WebtoonMobileService = {
    // Get all chapters for a webtoon using the mobile API
    getChapters: async (mangaId: string): Promise<WebtoonEpisode[]> => {
        try {
            // Try 'webtoon' type first (standard originals)
            let chapters = await fetchEpisodes(mangaId, 'webtoon');

            // If empty, try 'canvas' (Canvas/Challenge series)
            if (chapters.length === 0) {
                console.log(`[WebtoonMobileService] No chapters found for type 'webtoon', trying 'canvas'...`);
                chapters = await fetchEpisodes(mangaId, 'canvas');
            }

            // If still empty, maybe it's 'bestChallenge'? (less common)
            if (chapters.length === 0) {
                console.log(`[WebtoonMobileService] No chapters found for type 'canvas', trying 'bestChallenge'...`);
                chapters = await fetchEpisodes(mangaId, 'bestChallenge');
            }

            return chapters;
        } catch (error) {
            console.error('[WebtoonMobileService] Error fetching chapters:', error);
            return [];
        }
    },

    getLockedChapterCount: async (titleId: string): Promise<number> => {
        try {
            // Fetch the mobile list page to check for "App Only" message
            // We use a dummy list URL or the main title URL
            // https://m.webtoons.com/en/fantasy/dummy/list?title_no=123
            const url = `https://m.webtoons.com/en/fantasy/dummy/list?title_no=${titleId}`;
            const response = await CapacitorHttp.get({
                url,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
                }
            });

            if (response.status !== 200) {
                console.warn('Failed to fetch Webtoon HTML for locked check');
                return 0;
            }

            const html = response.data;
            // Regex to find "Read X new episodes only on the app!"
            // Handles both with and without <em> tags
            const match = html.match(/Read\s*(?:<em>)?(\d+)(?:<\/em>)?\s*new episodes only on the app!/i);

            if (match && match[1]) {
                return parseInt(match[1], 10);
            }

            return 0;
        } catch (error) {
            console.error('Error checking locked chapters:', error);
            return 0;
        }
    }
};
