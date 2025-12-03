import requests
import re

def check_locked(title_no):
    # Try the specific list URL used in the service
    url = f"https://m.webtoons.com/en/fantasy/dummy/list?title_no={title_no}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    }
    
    print(f"Fetching: {url}")
    r = requests.get(url, headers=headers)
    
    if r.status_code != 200:
        print(f"Failed: {r.status_code}")
        return

    html = r.text
    print(f"HTML length: {len(html)}")
    
    # Check for specific phrases
    phrases = ["only on the app", "Read", "new episodes", "Preview"]
    for p in phrases:
        if p in html:
            print(f"Found phrase '{p}'")
            # Print context
            idx = html.find(p)
            start = max(0, idx - 100)
            end = min(len(html), idx + 100)
            print(f"Context: ...{html[start:end]}...")
        else:
            print(f"Phrase '{p}' NOT found")

    # Regex check
    match = re.search(r'Read\s*<em>(\d+)</em>\s*new episodes only on the app!', html)
    if match:
        print(f"Match found: {match.group(1)}")
    else:
        print("No regex match found.")

if __name__ == "__main__":
    # Hardcoded ID for "The Spark in Your Eyes"
    check_locked("3210")
