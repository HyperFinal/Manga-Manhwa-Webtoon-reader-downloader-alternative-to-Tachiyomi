import requests
import re
from urllib.parse import quote

def check_arenascans(query):
    # ArenaScans uses a standard WordPress-like search or specific path
    # Usually ?s=query or /?s=query&post_type=wp-manga
    
    search_url = f"https://arenascans.com/?s={quote(query)}&post_type=wp-manga"
    print(f"Searching ArenaScans for: {query}")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        r = requests.get(search_url, headers=headers)
        r.raise_for_status()
        
        # Look for manga links in search results
        # Usually <div class="post-title"> ... <a href="...">
        
        # Simple regex to find links that look like manga pages
        # https://arenascans.com/manga/title-slug/ or similar
        # Adjust regex based on actual structure if needed
        
        links = re.findall(r'href="(https://arenascans.com/manga/[^"]+)"', r.text)
        unique_links = list(set(links))
        
        if unique_links:
            print(f"Found {len(unique_links)} potential matches:")
            for link in unique_links:
                print(f" - {link}")
                
            # Pick the first one to check chapters
            manga_url = unique_links[0]
            print(f"Checking chapters for: {manga_url}")
            
            r_manga = requests.get(manga_url, headers=headers)
            r_manga.raise_for_status()
            
            # Look for chapters
            # ArenaScans (Madara theme) usually lists chapters in <li> tags with class "wp-manga-chapter"
            # <li class="wp-manga-chapter"> <a href="...">Chapter 123</a>
            
            chapters = re.findall(r'Chapter (\d+)', r_manga.text)
            
            if chapters:
                chapter_nums = sorted([int(c) for c in chapters if c.isdigit()])
                print(f"Total Chapters found: {len(chapter_nums)}")
                if chapter_nums:
                    print(f"Latest Chapter: {chapter_nums[-1]}")
            else:
                print("No chapters found on page (might be loaded via AJAX).")
                # If AJAX, we might need to hit admin-ajax.php
                
        else:
            print("No search results found.")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    print("--- Checking 'The Greatest Estate Developer' ---")
    check_arenascans("The Greatest Estate Developer")
    print("\n--- Checking 'Blinded by the Setting Sun' ---")
    check_arenascans("Blinded by the Setting Sun")
