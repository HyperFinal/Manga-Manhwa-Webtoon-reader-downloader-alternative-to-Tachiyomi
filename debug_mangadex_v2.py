import requests
import time
import json

MANGADEX_API_URL = 'https://api.mangadex.org'

def search_manga(title):
    print(f"Searching for: {title}")
    try:
        response = requests.get(
            f"{MANGADEX_API_URL}/manga",
            params={
                'title': title,
                'limit': 5,
                'order[relevance]': 'desc'
            }
        )
        response.raise_for_status()
        data = response.json()['data']
        if not data:
            print("No manga found.")
            return None
        
        first_match = data[0]
        print(f"Found: {first_match['attributes']['title']['en']} (ID: {first_match['id']})")
        return first_match['id']
    except Exception as e:
        print(f"Search error: {e}")
        return None

def get_chapters(manga_id):
    print(f"Fetching chapters for ID: {manga_id}")
    all_chapters = []
    offset = 0
    limit = 100
    total = 0
    
    try:
        while True:
            # Rate limit handling
            if offset > 0:
                time.sleep(0.5)

            retries = 3
            success = False
            batch_data = []

            while retries > 0 and not success:
                try:
                    print(f"Requesting offset {offset}, limit {limit}...")
                    response = requests.get(
                        f"{MANGADEX_API_URL}/manga/{manga_id}/feed",
                        params={
                            'translatedLanguage[]': ['it', 'en'],
                            'order[chapter]': 'desc',
                            'limit': limit,
                            'offset': offset
                        },
                        timeout=10
                    )
                    response.raise_for_status()
                    data = response.json()
                    
                    batch_data = data['data']
                    total = data['total']
                    success = True
                except Exception as e:
                    print(f"Error fetching batch: {e}")
                    retries -= 1
                    if retries > 0:
                        print("Retrying in 2s...")
                        time.sleep(2)
            
            if not success:
                print("Failed to fetch batch after retries. Aborting loop.")
                break

            all_chapters.extend(batch_data)
            print(f"Got {len(batch_data)} chapters. Total so far: {len(all_chapters)}/{total}")
            
            offset += limit
            if offset >= total:
                break
            
        return all_chapters
    except Exception as e:
        print(f"Critical Fetch error: {e}")
        return all_chapters

def main():
    manga_id = search_manga("One Piece")
    if manga_id:
        chapters = get_chapters(manga_id)
        print(f"Total raw chapters fetched: {len(chapters)}")
        
        # Deduplication logic (same as TS)
        unique_chapters = []
        seen_numbers = set()
        
        # Sort raw list by chapter number first (simulating the TS logic I added)
        # Note: In TS I sorted by parseFloat(chapter)
        
        def get_chap_num(ch):
            try:
                return float(ch['attributes']['chapter'])
            except:
                return -1

        chapters.sort(key=get_chap_num)

        for ch in chapters:
            num = ch['attributes']['chapter']
            if num:
                if num not in seen_numbers:
                    seen_numbers.add(num)
                    unique_chapters.append(ch)
            else:
                unique_chapters.append(ch)
        
        print(f"Total unique chapters: {len(unique_chapters)}")
        
        # Sort ascending
        unique_chapters.sort(key=get_chap_num)
        
        print("First 10 chapters:")
        for ch in unique_chapters[:10]:
            print(f"Ch. {ch['attributes']['chapter']} - {ch['attributes']['title']}")
            
        print("Last 10 chapters:")
        for ch in unique_chapters[-10:]:
            print(f"Ch. {ch['attributes']['chapter']} - {ch['attributes']['title']}")

if __name__ == "__main__":
    main()
