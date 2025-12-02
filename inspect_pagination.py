import requests
from bs4 import BeautifulSoup

def inspect_pagination_with_canonical(manga_id, target_page):
    # 1. Fetch Page 1 to get Canonical URL
    url = "https://www.webtoons.com/en/genre/title/list"
    params = {
        "title_no": manga_id,
        "page": 1
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Referer": "https://www.webtoons.com/"
    }

    print(f"Fetching Page 1 from {url}...")
    try:
        response = requests.get(url, params=params, headers=headers)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Extract Canonical URL
        canonical_link = soup.find('link', rel='canonical')
        og_url = soup.find('meta', property='og:url')
        
        canonical_url = ""
        if canonical_link:
            canonical_url = canonical_link.get('href')
            print(f"Found canonical link: {canonical_url}")
        elif og_url:
            canonical_url = og_url.get('content')
            print(f"Found og:url: {canonical_url}")
            
        if not canonical_url:
            print("Could not find canonical URL!")
            return

        # 2. Use Canonical URL to fetch Target Page
        print(f"\nFetching Page {target_page} using Canonical URL: {canonical_url}...")
        
        # Ensure we append/replace the page parameter correctly
        # Canonical usually looks like: https://www.webtoons.com/en/genre/title/list?title_no=123
        # We need to add &page=11
        
        if '?' in canonical_url:
            target_url = f"{canonical_url}&page={target_page}"
        else:
            target_url = f"{canonical_url}?page={target_page}"
            
        print(f"Target URL: {target_url}")
        
        response = requests.get(target_url, headers=headers)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Check active page
        paginate_div = soup.select_one('.paginate')
        if paginate_div:
            active = paginate_div.select_one('.on')
            if active:
                print(f"Active Page Element: '{active.get_text(strip=True)}'")
                if active.get_text(strip=True) == str(target_page):
                    print("SUCCESS: Successfully reached target page!")
                else:
                    print("FAILURE: Still on wrong page.")
            else:
                print("No active page element found")
        else:
            print("No .paginate div found!")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Test with ID 3210 (Tower of God?) at Page 11
    inspect_pagination_with_canonical("3210", 11)
