import requests
import time

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
    limit = 500 # Try 500
    total = 0
    
    try:
        while True:
            print(f"Requesting offset {offset}, limit {limit}...")
            response = requests.get(
                f"{MANGADEX_API_URL}/manga/{manga_id}/feed",
                params={
                    'translatedLanguage[]': ['en'],
                    'order[chapter]': 'desc',
                    'limit': limit,
                    'offset': offset
                }
            )
            response.raise_for_status()
            data = response.json()
            
            batch = data['data']
            total = data['total']
            all_chapters.extend(batch)
            
            print(f"Got {len(batch)} chapters. Total so far: {len(all_chapters)}/{total}")
            
            offset += limit
            if offset >= total:
                break
            
            time.sleep(0.2) # Rate limit
            
        return all_chapters
    except Exception as e:
        print(f"Fetch error: {e}")
        return all_chapters

def main():
    manga_id = search_manga("One Piece")
    if manga_id:
        chapters = get_chapters(manga_id)
        print(f"Total chapters fetched: {len(chapters)}")
        
        # Analyze chapters
        chapter_nums = []
        for ch in chapters:
            attr = ch['attributes']
            if attr['chapter']:
                try:
                    chapter_nums.append(float(attr['chapter']))
                except:
                    pass
        
        chapter_nums.sort()
        print(f"First 5 chapters: {chapter_nums[:5]}")
        print(f"Last 5 chapters: {chapter_nums[-5:]}")
        print(f"Total unique chapters: {len(set(chapter_nums))}")

if __name__ == "__main__":
    main()
