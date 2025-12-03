import requests
import re
from bs4 import BeautifulSoup

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

def debug_arenascan():
    # 1. Search
    query = "Blinded by the Setting Sun"
    url = f"https://arenascan.com/?s={query.replace(' ', '+')}&post_type=wp-manga"
    print(f"Searching: {url}")
    
    try:
        r = requests.get(url, headers=HEADERS)
        print(f"Search Status: {r.status_code}")
        
        # Save HTML
        with open('debug_search.html', 'w', encoding='utf-8') as f:
            f.write(r.text)
        print("Saved search HTML to debug_search.html")
        
        soup = BeautifulSoup(r.text, 'html.parser')
        print(f"Page Title: {soup.title.string if soup.title else 'No Title'}")
        
        # Try selectors from Service
        items = soup.select('.c-tabs-item__content')
        if not items:
            items = soup.select('.post-item')
        if not items:
            items = soup.select('.manga-item')
            
        print(f"Found {len(items)} items")
        
        manga_url = None
        for item in items:
            title_el = item.select_one('.post-title a') or item.select_one('.title a') or item.select_one('h3 a')
            if title_el:
                print(f"Found Title: {title_el.text.strip()}")
                manga_url = title_el['href']
                print(f"URL: {manga_url}")
                break
        
        if not manga_url:
            print("No manga found in search results.")
            # Fallback to direct URL for testing chapter parsing
            manga_url = "https://arenascan.com/manga/blinded-by-the-setting-sun/"
            print(f"Using direct URL: {manga_url}")

        # 2. Get Chapters
        print(f"Fetching Chapters from: {manga_url}")
        r2 = requests.get(manga_url, headers=HEADERS)
        
        # Save HTML
        with open('debug_manga.html', 'w', encoding='utf-8') as f:
            f.write(r2.text)
        print("Saved manga HTML to debug_manga.html")

        soup2 = BeautifulSoup(r2.text, 'html.parser')
        print(f"Manga Page Title: {soup2.title.string if soup2.title else 'No Title'}")
        
        chapters = soup2.select('.wp-manga-chapter a')
        print(f"Found {len(chapters)} chapters via HTML")
        
        if len(chapters) == 0:
            print("Checking for AJAX load...")
            holder = soup2.select_one('#manga-chapters-holder')
            if holder:
                manga_id = holder.get('data-id')
                print(f"Manga ID: {manga_id}")
                if manga_id:
                    ajax_url = "https://arenascan.com/wp-admin/admin-ajax.php"
                    data = {
                        'action': 'manga_get_chapters',
                        'manga': manga_id
                    }
                    print("Requesting AJAX chapters...")
                    r3 = requests.post(ajax_url, data=data, headers=HEADERS)
                    soup3 = BeautifulSoup(r3.text, 'html.parser')
                    chapters = soup3.select('.wp-manga-chapter a')
                    print(f"Found {len(chapters)} chapters via AJAX")
            else:
                print("No #manga-chapters-holder found.")

        # 3. List first few chapters to verify numbering
        print("Sample Chapters:")
        for ch in chapters[:5]:
            title = ch.text.strip()
            link = ch['href']
            # Parse number
            match = re.search(r'Chapter\s+(\d+(\.\d+)?)', title, re.IGNORECASE)
            num = float(match.group(1)) if match else 0
            print(f"  {title} -> Num: {num} (Link: {link})")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug_arenascan()
