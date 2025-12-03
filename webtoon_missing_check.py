import requests
import json
from urllib.parse import quote
import re

def search_and_debug(query):
    # 1. Search
    search_url = f"https://www.webtoons.com/en/search?keyword={quote(query)}"
    print(f"Searching for: {query}")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    try:
        r = requests.get(search_url, headers=headers)
        # Simple regex to find title_no
        match = re.search(r'title_no=(\d+)', r.text)
        if match:
            title_id = match.group(1)
            print(f"Found Title ID: {title_id}")
            test_mobile_api(title_id)
        else:
            print("No title_no found in search results.")
    except Exception as e:
        print(f"Search failed: {e}")

def test_mobile_api(title_id, type="webtoon"):
    url = f"https://m.webtoons.com/api/v1/{type}/{title_id}/episodes"
    params = {
        "pageSize": "99999"
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Referer": "https://m.webtoons.com/"
    }

    print(f"Fetching Episodes for ID {title_id}...")
    try:
        response = requests.get(url, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        if "result" in data and "episodeList" in data["result"]:
            episodes = data["result"]["episodeList"]
            print(f"Total Episodes Found: {len(episodes)}")
            if episodes:
                print("\nLast 15 Episodes:")
                for ep in episodes[-15:]:
                    print(f"No: {ep.get('episodeNo')} | Title: {ep.get('episodeTitle')} | Date: {ep.get('exposureDateMillis')}")
        else:
            print("Unexpected JSON structure.")
            
    except Exception as e:
        print(f"Error: {e}")

def test_variations(title_id):
    variations = [
        {
            "name": "App UA + Platform=ANDROID",
            "headers": {
                "User-Agent": "naverwebtoon/2.10.0 (Android; 10; K)",
            },
            "params": {
                "pageSize": "99999",
                "platform": "ANDROID",
                "serviceZone": "GLOBAL"
            }
        },
        {
            "name": "App UA + Platform=APP (Retry)",
            "headers": {
                "User-Agent": "naverwebtoon/2.10.0 (Android; 10; K)",
            },
            "params": {
                "pageSize": "99999",
                "platform": "APP",
                "serviceZone": "GLOBAL"
            }
        },
        {
            "name": "Cookies: locale=en, ageGatePass=true",
            "headers": {
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
                "Referer": "https://m.webtoons.com/"
            },
            "params": {"pageSize": "99999"},
            "cookies": {"locale": "en", "ageGatePass": "true", "needGDPR": "false"}
        }
    ]

    for v in variations:
        print(f"\nTesting: {v['name']}")
        try:
            url = f"https://m.webtoons.com/api/v1/webtoon/{title_id}/episodes"
            cookies = v.get('cookies', {})
            response = requests.get(url, params=v['params'], headers=v['headers'], cookies=cookies)
            
            if response.status_code == 200:
                data = response.json()
                if "result" in data and "episodeList" in data["result"]:
                    episodes = data["result"]["episodeList"]
                    print(f"Total Episodes: {len(episodes)}")
                    if episodes:
                        last = episodes[-1]
                        print(f"Last Ep: {last.get('episodeTitle')} (No: {last.get('episodeNo')})")
                else:
                    print("Invalid JSON structure")
            else:
                print(f"Status Code: {response.status_code}")
                print(f"Response Body: {response.text[:500]}") # Print first 500 chars
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    # The Greatest Estate Developer
    test_variations(3596)
