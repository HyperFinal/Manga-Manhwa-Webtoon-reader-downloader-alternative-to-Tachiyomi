import requests
import re
from urllib.parse import quote

def check_mangapill(query):
    # 1. Search
    search_url = f"https://mangapill.com/search?q={quote(query)}"
    print(f"Searching MangaPill for: {query}")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        r = requests.get(search_url, headers=headers)
        r.raise_for_status()
        
        # Find first result link
        # <a href="/manga/3596/the-greatest-estate-developer" ...>
        match = re.search(r'<a href="(/manga/\d+/[\w-]+)"', r.text)
        if match:
            manga_path = match.group(1)
            manga_url = f"https://mangapill.com{manga_path}"
            print(f"Found Manga URL: {manga_url}")
            
            # 2. Fetch Chapter List
            r_manga = requests.get(manga_url, headers=headers)
            r_manga.raise_for_status()
            
            # Extract chapters
            # <a href="/chapters/3596-10206000/the-greatest-estate-developer-chapter-206" ...>Chapter 206</a>
            chapters = re.findall(r'Chapter (\d+)', r_manga.text)
            
            if chapters:
                # Convert to ints and sort
                chapter_nums = sorted([int(c) for c in chapters if c.isdigit()])
                print(f"Total Chapters on MangaPill: {len(chapter_nums)}")
                print(f"Latest Chapter: {chapter_nums[-1]}")
                
                if chapter_nums[-1] > 205:
                    print("SUCCESS: MangaPill has chapters beyond 205!")
                else:
                    print("FAIL: MangaPill does not have chapters beyond 205.")
            else:
                print("No chapters found on MangaPill page.")
                
        else:
            print("No search results found on MangaPill.")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_mangapill("Blinded by the Setting Sun")
