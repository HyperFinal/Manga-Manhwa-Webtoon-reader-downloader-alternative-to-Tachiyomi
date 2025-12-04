giàimport urllib.request
import urllib.parse
import re
import sys

# Force UTF-8 encoding for output
sys.stdout.reconfigure(encoding='utf-8')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
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
    
    # Regex to find title_no
    # Pattern: href="/en/.../list?title_no=12345"
    match = re.search(r'href="[^"]*title_no=(\d+)[^"]*"', html)
    if match:
        title_no = match.group(1)
        print(f"Found Webtoon ID: {title_no}")
        return title_no
    
    print("No webtoon found in search.")
    return None

def inspect_page(title_no, page_num):
    url = f"https://www.webtoons.com/en/genre/title/list?title_no={title_no}&page={page_num}"
    print(f"\n--- Inspecting Page {page_num} ---")
    print(f"URL: {url}")
    
    html, final_url = get_html(url)
    if not html: return

    print(f"Final URL: {final_url}")
    
    # Check for chapters
    # Look for list items with data-episode-no or just links with episode_no
    # <li class="_episodeItem" data-episode-no="195">
    episode_matches = re.findall(r'data-episode-no="(\d+)"', html)
    print(f"Chapters found on page: {len(episode_matches)}")
    
    if episode_matches:
        print(f"First Chapter ID: {episode_matches[0]}")
        print(f"Last Chapter ID:  {episode_matches[-1]}")
    else:
        print("NO CHAPTERS FOUND (or regex failed).")

    # Check Pagination
    print("\nPagination Bar Analysis:")
    
    # Look for page links
    # <a href="#" onclick="return false;" class="on">1</a>
    # <a href="/en/.../list?title_no=...&page=2" ...>2</a>
    
    # We look for ?page=X or &page=X
    page_links = re.findall(r'[?&]page=(\d+)', html)
    
    max_p = 0
    if page_links:
        for p_str in page_links:
            try:
                p = int(p_str)
                if p > max_p: max_p = p
            except: pass
        print(f"Max Page detected from links: {max_p}")
    else:
        print("No 'page=' links found.")

def main():
    query = "The Spark in Your Eyes"
    title_no = search_webtoon(query)
    
    if not title_no:
        return

    # Check Page 1 (Newest)
    inspect_page(title_no, 1)
    
    # Check Page 9999 (Should be Oldest/First Episodes)
    inspect_page(title_no, 9999)

if __name__ == "__main__":
    main()
