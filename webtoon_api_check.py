import requests
import json

def test_mobile_api(title_id, type="webtoon"):
    url = f"https://m.webtoons.com/api/v1/{type}/{title_id}/episodes"
    params = {
        "pageSize": "99999"
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Referer": "https://m.webtoons.com/"
    }

    print(f"Fetching: {url}")
    try:
        response = requests.get(url, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        # Save to file for inspection
        with open(f"webtoon_{title_id}_api.json", "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            
        print(f"Success! Saved to webtoon_{title_id}_api.json")
        
        # Analyze the response
        if "result" in data and "episodeList" in data["result"]:
            episodes = data["result"]["episodeList"]
            print(f"Total Episodes Found: {len(episodes)}")
            if episodes:
                first = episodes[0]
                last = episodes[-1]
                print(f"First Episode: {first.get('episodeTitle')} (ID: {first.get('episodeNo')})")
                print(f"Last Episode: {last.get('episodeTitle')} (ID: {last.get('episodeNo')})")
                
                # Check for locked/special fields
                print("\nSample Episode Data:")
                print(json.dumps(first, indent=2))
        else:
            print("Unexpected JSON structure.")
            
    except Exception as e:
        print(f"Error: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Status Code: {e.response.status_code}")
            print(e.response.text)

# Test with Tower of God (95)
test_mobile_api(95)
