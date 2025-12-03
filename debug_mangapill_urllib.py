import urllib.request
import urllib.parse
import re

PROXY_URL = "https://api.allorigins.win/raw?url="
TARGET_URL = "https://mangapill.com/chapters/2-10010000/one-piece-chapter-1"

def test_fetch():
    full_url = PROXY_URL + urllib.parse.quote(TARGET_URL)
    print(f"Fetching: {full_url}")
    
    try:
        with urllib.request.urlopen(full_url, timeout=10) as response:
            html = response.read().decode('utf-8')
            print("✅ Fetch successful!")
            print(f"HTML Length: {len(html)}")
            
            # Look for images
            # <img src="https://cdn.mangapill.com/..."
            # or <chapter-page>
            
            print("Searching for images...")
            images = re.findall(r'src="(https://cdn\.mangapill\.com/[^"]+)"', html)
            if images:
                print(f"✅ Found {len(images)} images matching CDN regex.")
                print(f"Sample: {images[0]}")
            else:
                print("❌ No images found with CDN regex.")
                print("Scanning for data-src...")
                data_srcs = re.findall(r'data-src="([^"]+)"', html)
                if data_srcs:
                     print(f"✅ Found {len(data_srcs)} data-src images.")
                     print(f"Sample: {data_srcs[0]}")
                else:
                    print("❌ No data-src found either.")
                    print("Dumping first 500 chars of HTML:")
                    print(html[:500])

    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_fetch()
