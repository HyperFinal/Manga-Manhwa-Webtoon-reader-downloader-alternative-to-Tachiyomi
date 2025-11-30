import urllib.request
import re
import sys

URL = "https://mangapill.com/chapters/2-10010000/one-piece-chapter-1"
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Referer': 'https://mangapill.com/'
}

def debug():
    print(f"Fetching {URL}...")
    req = urllib.request.Request(URL, headers=HEADERS)
    
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            print(f"✅ Status Code: {response.getcode()}")
            html = response.read().decode('utf-8')
            
            print(f"HTML Length: {len(html)}")
            
            # Check for Cloudflare
            if "Just a moment..." in html or "Enable JavaScript" in html:
                print("⚠️  POSSIBLE CLOUDFLARE BLOCK DETECTED")
            
            # Check for images
            img_tags = re.findall(r'<img[^>]+>', html)
            print(f"Found {len(img_tags)} <img> tags.")
            
            cdn_imgs = re.findall(r'src="(https://cdn\.mangapill\.com/[^"]+)"', html)
            print(f"Found {len(cdn_imgs)} CDN images (src).")
            
            data_src_imgs = re.findall(r'data-src="(https://cdn\.mangapill\.com/[^"]+)"', html)
            print(f"Found {len(data_src_imgs)} CDN images (data-src).")
            
            # Save to file
            with open('debug_output.html', 'w', encoding='utf-8') as f:
                f.write(html)
            print("Saved HTML to debug_output.html")
            
            # Print snippet
            print("\n--- HTML SNIPPET ---")
            print(html[:500])
            print("--------------------")

    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    debug()
