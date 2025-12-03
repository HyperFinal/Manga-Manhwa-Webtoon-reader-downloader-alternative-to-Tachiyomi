import requests
from bs4 import BeautifulSoup

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://arenascan.com/'
}

def debug_pages():
    # Use a known chapter URL from previous debug
    url = "https://arenascan.com/blinded-by-the-setting-sun-219/"
    print(f"Fetching pages from: {url}")
    
    try:
        r = requests.get(url, headers=HEADERS)
        print(f"Status: {r.status_code}")
        
        # Save HTML
        with open('debug_chapter.html', 'w', encoding='utf-8') as f:
            f.write(r.text)
        print("Saved chapter HTML to debug_chapter.html")
        
        soup = BeautifulSoup(r.text, 'html.parser')
        
        # Try standard Madara selectors
        images = soup.select('.reading-content img')
        print(f"Found {len(images)} images via .reading-content img")
        
        if not images:
            images = soup.select('.page-break img')
            print(f"Found {len(images)} images via .page-break img")
            
        if not images:
            # Try finding any large images
            all_imgs = soup.select('img')
            print(f"Total images on page: {len(all_imgs)}")
            for img in all_imgs[:5]:
                print(f"  Img: {img.get('src')} Class: {img.get('class')}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug_pages()
