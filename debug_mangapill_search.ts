
import { MangaPillService } from './src/services/MangaPillService.ts';

async function debugSearch() {
    const query = "One Piece";
    console.log(`Searching for: "${query}"`);

    try {
        const results = await MangaPillService.searchManga(query);
        console.log(`Found ${results.length} results:`);

        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const levenshtein = (a: string, b: string): number => {
            const matrix = [];
            for (let i = 0; i <= b.length; i++) matrix[i] = [i];
            for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
            for (let i = 1; i <= b.length; i++) {
                for (let j = 1; j <= a.length; j++) {
                    if (b.charAt(i - 1) === a.charAt(j - 1)) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = Math.min(
                            matrix[i - 1][j - 1] + 1,
                            matrix[i][j - 1] + 1,
                            matrix[i - 1][j] + 1
                        );
                    }
                }
            }
            return matrix[b.length][a.length];
        };

        const target = normalize(query);
        let bestMatch = results[0];
        let minDistance = Infinity;

        results.forEach((result, index) => {
            const source = normalize(result.title);
            const dist = levenshtein(source, target);
            const maxLen = Math.max(target.length, source.length);
            const ratio = maxLen > 0 ? dist / maxLen : 1;

            console.log(`[${index}] "${result.title}" (ID: ${result.id}, URL: ${result.url})`);
            console.log(`    Norm: "${source}" | Dist: ${dist} | Ratio: ${ratio.toFixed(2)}`);

            if (dist < minDistance) {
                minDistance = dist;
                bestMatch = result;
            }
        });

        // Search for the content the user is seeing to identify the manga
        // Search for Vivre Card
        const mysteryQuery = "Vivre Card";
        console.log(`\nSearching for mystery content: "${mysteryQuery}"`);
        const mysteryResults = await MangaPillService.searchManga(mysteryQuery);
        console.log(`Found ${mysteryResults.length} results.`);

        for (const m of mysteryResults) {
            console.log(`- ${m.title} (ID: ${m.id})`);
            try {
                const slug = m.url.split('/').pop() || '';
                const ch = await MangaPillService.getChapters(m.id, slug);
                console.log(`  Chapters: ${ch.length}`);
                if (ch.length > 0) {
                    ch.slice(0, 3).forEach(c => console.log(`  - ${c.title}`));
                }
            } catch (e) { }
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

debugSearch();
