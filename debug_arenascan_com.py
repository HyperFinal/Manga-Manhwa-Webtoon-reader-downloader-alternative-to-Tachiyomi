import requests
import re

def search_arenascan_com(query):
    print(f"Searching ArenaScan.com for: {query}")
    url = f"https://arenascan.com/?s={query}&post_type=wp-manga"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        r = requests.get(url, headers=headers)
        r.raise_for_status()
        
        print(f"Status Code: {r.status_code}")
        
        # Extract titles
        titles = re.findall(r'<div class="post-title">\s*<h3 class="h4">\s*<a href="([^"]+)">([^<]+)</a>', r.text)
        if titles:
            print("Results found:")
            for link, title in titles:
                print(f"Found: {title.strip()} -> {link}")
        else:
            print("No results found (or regex mismatch).")
            print("Response snippet:", r.text[:500])
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    search_arenascan_com("Blinded by the Setting Sun")
