import axios from 'axios';

const JIKAN_API_URL = 'https://api.jikan.moe/v4';

export interface MangaMetadata {
    mal_id: number;
    title: string;
    synopsis: string;
    type: string;
    images: {
        jpg: {
            image_url: string;
            large_image_url: string;
        };
        webp?: {
            image_url: string;
            large_image_url: string;
        };
    };
    genres: {
        name: string;
    }[];
    status: string;
    chapters: number | null;
}

export interface Genre {
    mal_id: number;
    name: string;
    count: number;
}

export const MangaService = {
    getGenres: async (): Promise<Genre[]> => {
        try {
            const response = await axios.get(`${JIKAN_API_URL}/genres/manga`);
            return response.data.data;
        } catch (error) {
            console.error('Error fetching genres:', error);
            return [];
        }
    },

    // Simple in-memory cache
    searchCache: new Map<string, MangaMetadata[]>(),

    searchManga: async (query: string, genres?: string, page: number = 1, orderBy?: string, sort?: string): Promise<MangaMetadata[]> => {
        const cacheKey = `${query}|${genres}|${page}|${orderBy}|${sort}`;
        if (MangaService.searchCache.has(cacheKey)) {
            console.log(`[MangaService] Serving from cache: ${cacheKey}`);
            return MangaService.searchCache.get(cacheKey)!;
        }

        try {
            // Add delay to respect rate limits (3 requests per second)
            // Reduced delay since we have debounce now
            await new Promise(resolve => setTimeout(resolve, 100));

            const params: any = {
                q: query,
                sfw: true,
                page: page,
                limit: 20
            };

            if (orderBy) {
                params.order_by = orderBy;
            }
            if (sort) {
                params.sort = sort;
            }

            if (genres) {
                params.genres = genres;
            }

            const response = await axios.get(`${JIKAN_API_URL}/manga`, { params });
            const data = response.data.data;

            // Cache the results
            MangaService.searchCache.set(cacheKey, data);

            return data;
        } catch (error) {
            console.error('Error searching manga:', error);
            return [];
        }
    }
};
