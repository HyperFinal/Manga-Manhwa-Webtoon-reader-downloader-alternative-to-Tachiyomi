import requests
import re

def search_arenascans(query):
    print(f"Searching ArenaScans for: {query}")
    url = f"https://arenascans.net/?s={query}&post_type=wp-manga"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        r = requests.get(url, headers=headers)
        r.raise_for_status()
        
        # Simple check for results
        if 'c-tabs-item__content' in r.text:
            print("Results found!")
            # Extract titles
            titles = re.findall(r'<div class="post-title">\s*<h3 class="h4">\s*<a href="[^"]+">([^<]+)</a>', r.text)
            for t in titles:
                print(f"Found: {t.strip()}")
        else:
            print("No results found.")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    search_arenascans("Blinded by the Setting Sun")
