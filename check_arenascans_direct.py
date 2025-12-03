import requests
import re

def check_arenascans_direct(url):
    print(f"Checking ArenaScans URL: {url}")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        r = requests.get(url, headers=headers)
        r.raise_for_status()
        
        # Look for chapters
        # ArenaScans (Madara theme) usually lists chapters in <li> tags with class "wp-manga-chapter"
        # <li class="wp-manga-chapter"> <a href="...">Chapter 123</a>
        
        # Regex to find chapter links and numbers
        # <a href="https://arenascan.com/chapter/blinded-by-the-setting-sun-chapter-123/">Chapter 123</a>
        
        chapters = re.findall(r'Chapter (\d+)', r.text)
        
        if chapters:
            chapter_nums = sorted([int(c) for c in chapters if c.isdigit()])
            print(f"Total Chapters found: {len(chapter_nums)}")
            if chapter_nums:
                print(f"Latest Chapter: {chapter_nums[-1]}")
                
            if chapter_nums[-1] > 178:
                 print("SUCCESS: ArenaScans has chapters beyond 178!")
            else:
                 print("FAIL: ArenaScans does not have chapters beyond 178.")
        else:
            print("No chapters found on page (might be loaded via AJAX).")
            # Check for data-id to see if we need to call admin-ajax
            if "data-id" in r.text:
                 print("Page might use AJAX for chapters. Need to implement AJAX fetching.")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_arenascans_direct("https://arenascan.com/manga/blinded-by-the-setting-sun/")
