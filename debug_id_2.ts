import { MangaPillService } from './src/services/MangaPillService';

async function debugId2() {
    console.log('=== DEBUGGING MANGAPILL ID 2 ===\n');

    // Search for One Piece
    console.log('1. Searching for "One Piece"...');
    const searchResults = await MangaPillService.searchManga('One Piece');

    console.log(`Found ${searchResults.length} results:\n`);
    searchResults.slice(0, 5).forEach((result, i) => {
        console.log(`${i + 1}. ${result.title}`);
        console.log(`   ID: ${result.id}`);
        console.log(`   URL: ${result.url}`);
        console.log('');
    });

    // Get chapters for ID 2
    console.log('\n2. Fetching chapters for ID: 2...');
    const firstResult = searchResults[0];
    const slug = firstResult.url.split('/').pop() || '';
    console.log(`   Using slug: "${slug}"`);

    const chapters = await MangaPillService.getChapters('2', slug);

    console.log(`\nGot ${chapters.length} chapters:`);
    chapters.slice(0, 10).forEach((ch, i) => {
        console.log(`${i + 1}. ${ch.title}`);
    });
}

debugId2().catch(console.error);
