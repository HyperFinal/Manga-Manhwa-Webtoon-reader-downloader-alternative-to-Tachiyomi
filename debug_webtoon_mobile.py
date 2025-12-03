import urllib.request
import urllib.parse
import re
import sys

# Force UTF-8 encoding for output
sys.stdout.reconfigure(encoding='utf-8')

# MOBILE User-Agent
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
    'Referer': 'https://www.webtoons.com/'
}

def get_html(url):
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req) as response:
            return response.read().decode('utf-8'), response.geturl()
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None, None

def search_webtoon(query):
    url = f"https://www.webtoons.com/en/search?keyword={urllib.parse.quote(query)}"
    print(f"Searching: {url}")
    html, final_url = get_html(url)
    if not html: return None
    
    match = re.search(r'href="[^"]*title_no=(\d+)[^"]*"', html)
    if match:
        title_no = match.group(1)
        print(f"Found Webtoon ID: {title_no}")
        return title_no
    
    print("No webtoon found in search.")
    return None

def inspect_page(title_no, page_num):
    url = f"https://www.webtoons.com/en/genre/title/list?title_no={title_no}&page={page_num}"
    print(f"\n--- Inspecting Page {page_num} (MOBILE UA) ---")
    print(f"URL: {url}")
    
    html, final_url = get_html(url)
    if not html: return

    print(f"Final URL: {final_url}")
    
    episode_matches = re.findall(r'data-episode-no="(\d+)"', html)
    print(f"Chapters found on page: {len(episode_matches)}")
    
    if episode_matches:
        print(f"First Chapter ID: {episode_matches[0]}")
        print(f"Last Chapter ID:  {episode_matches[-1]}")
    else:
        print("NO CHAPTERS FOUND (or regex failed).")

    print("\nPagination Bar Analysis:")
    
    # Check for desktop-style pagination links
    page_matches = re.findall(r'[?&]page=(\d+)', html)
    
    max_p = 1
    if page_matches:
        for p_str in page_matches:
            try:
                p = int(p_str)
                if p > max_p: max_p = p
            except: pass
        print(f"Max Page detected from 'page=' links: {max_p}")
    else:
        print("No 'page=' links found.")

    # Check for Mobile 'More' button or similar
    print("\nMobile Pagination Analysis:")
    # Look for "Load more" button or link
    load_more = re.search(r'<a[^>]*id="[^"]*more[^"]*"[^>]*href="([^"]*)"', html, re.IGNORECASE)
    if load_more:
        print(f"Found 'Load More' link: {load_more.group(1)}")
    
    # Look for any link containing 'page='
    page_links = re.findall(r'<a[^>]*href="([^"]*page=\d+[^"]*)"', html)
    if page_links:
        print(f"Found {len(page_links)} links with 'page=' parameter:")
        for link in page_links[:3]: # Show first 3
            print(f" - {link}")
    
    # Look for 'next_episode' or similar
    next_ep = re.search(r'next_episode[^"]*"', html)
    if next_ep:
        print("Found 'next_episode' reference.")

    # Check for specific mobile pagination class
    pg_next = re.search(r'class="[^"]*pg_next[^"]*"[^>]*href="([^"]*)"', html)
    if pg_next:
        print(f"Found 'pg_next' link: {pg_next.group(1)}")

def main():
    query = "The Spark in Your Eyes"
    title_no = search_webtoon(query)
    
    if not title_no:
        return

    # Check Page 1
    inspect_page(title_no, 1)
    
    # Check Page 11 (Detected Max)
    inspect_page(title_no, 11)
    
    # Check Page 20 (Estimated Max for 195 eps)
    inspect_page(title_no, 20)

if __name__ == "__main__":
    main()
