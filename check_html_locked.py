import requests
import re

def check_html(title_id):
    urls = [
        ("Mobile", f"https://m.webtoons.com/en/fantasy/the-greatest-estate-developer/list?title_no={title_id}"),
        ("Desktop", f"https://www.webtoons.com/en/fantasy/the-greatest-estate-developer/list?title_no={title_id}")
    ]
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    for name, url in urls:
        print(f"\nFetching {name} HTML: {url}")
        try:
            r = requests.get(url, headers=headers)
            r.raise_for_status()
            
            filename = f"debug_{name.lower()}.html"
            with open(filename, "w", encoding="utf-8") as f:
                f.write(r.text)
            print(f"Saved to {filename} ({len(r.text)} bytes)")
            
            # Quick check for keywords
            if "preview" in r.text.lower():
                print(f"Found 'preview' in {name}")
            
            # Check for specific missing chapters
            missing_keywords = ["Episode 206", "Episode 207", "Episode 208"]
            for k in missing_keywords:
                if k in r.text:
                    print(f" [x] Found '{k}'")
                else:
                    print(f" [ ] Not found '{k}'")

        except Exception as e:
            print(f"Error fetching {name}: {e}")

if __name__ == "__main__":
    check_html(3596)
