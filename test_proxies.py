import requests
import time

PROXIES = [
    "https://api.allorigins.win/raw?url=",
    "https://corsproxy.io/?",
    "https://thingproxy.freeboard.io/fetch/"
]

TARGET_URL = "https://mangapill.com/chapters/2-10010000/one-piece-chapter-1"
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

def test_proxies():
    for proxy in PROXIES:
        print(f"Testing Proxy: {proxy}")
        full_url = f"{proxy}{requests.utils.quote(TARGET_URL)}"
        try:
            start = time.time()
            resp = requests.get(full_url, headers=HEADERS, timeout=10)
            elapsed = time.time() - start
            
            if resp.status_code == 200:
                print(f"✅ Success! Time: {elapsed:.2f}s, Length: {len(resp.text)}")
                if "cdn.mangapill.com" in resp.text:
                    print("   Found CDN links in response.")
                else:
                    print("   WARNING: No CDN links found in response.")
            else:
                print(f"❌ Failed. Status: {resp.status_code}")
                
        except Exception as e:
            print(f"❌ Error: {e}")
        print("-" * 30)

if __name__ == "__main__":
    test_proxies()
