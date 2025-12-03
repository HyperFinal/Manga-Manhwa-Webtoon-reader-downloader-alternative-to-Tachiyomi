import requests
import re

# Test URL for a One Piece chapter (example)
# We need to find a valid chapter URL first.
# Let's search for One Piece first to get a valid ID/Slug
SEARCH_URL = "https://mangapill.com/search?q=one+piece"
PROXY_URL = "https://api.allorigins.win/raw?url="

def test_mangapill():
    print("1. Searching for One Piece...")
    try:
        # Search
        resp = requests.get(f"{PROXY_URL}{requests.utils.quote(SEARCH_URL)}")
        html = resp.text
        
        # Extract first manga
        match = re.search(r'href="/manga/(\d+)/([^"]+)"', html)
        if not match:
            print("❌ Could not find manga in search results")
            return

        manga_id = match.group(1)
        slug = match.group(2)
        print(f"✅ Found Manga: ID={manga_id}, Slug={slug}")

        # Get Chapters
        print(f"2. Fetching chapters for {slug}...")
        manga_url = f"https://mangapill.com/manga/{manga_id}/{slug}"
        resp = requests.get(f"{PROXY_URL}{requests.utils.quote(manga_url)}")
        html = resp.text

        # Extract first chapter
        # href="/chapters/2-10010000/one-piece-chapter-1"
        chap_match = re.search(r'href="/chapters/(\d+)-(\d+)/([^"]+)"', html)
        if not chap_match:
            print("❌ Could not find any chapters")
            return

        chap_id = chap_match.group(2) # The second group is usually the chapter ID in the URL structure used in service
        # Wait, the service regex is: href="\/chapters\/(\d+)-(\d+)\/([^"]+)"
        # Group 1 is manga ID, Group 2 is chapter ID?
        # Let's verify the URL structure from the service: /chapters/${mangaId}-${chapterId}/${slug}
        
        full_chap_url = chap_match.group(0).replace('href="', '').replace('"', '')
        print(f"✅ Found Chapter URL: {full_chap_url}")

        # Get Pages
        print(f"3. Fetching pages from {full_chap_url}...")
        chapter_page_url = f"https://mangapill.com{full_chap_url}"
        resp = requests.get(f"{PROXY_URL}{requests.utils.quote(chapter_page_url)}")
        html = resp.text

        # Test Regex
        print("4. Testing Image Regex...")
        cdn_regex = r'src="(https://cdn\.mangapill\.com/[^"]+)"'
        matches = re.findall(cdn_regex, html)

        if matches:
            print(f"✅ Found {len(matches)} images!")
            print(f"Sample: {matches[0]}")
        else:
            print("❌ No images found with current regex.")
            print("Dumping part of HTML for inspection:")
            print(html[:1000]) # First 1000 chars
            
            # Try to find ANY img src
            all_imgs = re.findall(r'<img[^>]+src="([^"]+)"', html)
            print(f"Found {len(all_imgs)} total img tags.")
            if all_imgs:
                print(f"Sample img src: {all_imgs[0]}")

    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_mangapill()
