
import axios from 'axios';

const JIKAN_API_URL = 'https://api.jikan.moe/v4';

async function getGenres() {
    try {
        const response = await axios.get(`${JIKAN_API_URL}/genres/manga`);
        const data = response.data.data;
        console.log(`Total genres: ${data.length}`);

        const names = data.map((g: any) => g.name);
        const uniqueNames = new Set(names);

        if (names.length !== uniqueNames.size) {
            console.log("Duplicates found!");
            const counts: any = {};
            names.forEach((x: any) => { counts[x] = (counts[x] || 0) + 1; });
            for (const name in counts) {
                if (counts[name] > 1) {
                    console.log(`${name}: ${counts[name]}`);
                }
            }
        } else {
            console.log("No duplicates found by name.");
        }

        // Check IDs
        const ids = data.map((g: any) => g.mal_id);
        const uniqueIds = new Set(ids);
        if (ids.length !== uniqueIds.size) {
            console.log("Duplicate IDs found!");
        } else {
            console.log("No duplicate IDs found.");
        }

    } catch (error) {
        console.error('Error fetching genres:', error);
    }
}

getGenres();
