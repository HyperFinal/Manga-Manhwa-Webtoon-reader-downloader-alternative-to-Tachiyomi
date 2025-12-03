import urllib.request
import urllib.parse
import re
import sys

# Force UTF-8 encoding
sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "https://www.webtoons.com/en/fantasy/the-spark-in-your-eyes/list?title_no=3210"

TEST_CASES = [
    {
        "name": "Desktop UA",
        "headers": {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://www.webtoons.com/'
        }
    },
    {
        "name": "Mobile UA",
        "headers": {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
            'Referer': 'https://www.webtoons.com/'
        }
    },
    {
        "name": "Mobile UA + AJAX",
        "headers": {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
            'Referer': 'https://www.webtoons.com/',
            'X-Requested-With': 'XMLHttpRequest'
        }
    },
    {
        "name": "Generic UA",
        "headers": {
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://www.webtoons.com/'
        }
    }
]

def test_pagination(case, page_num):
    print(f"\n--- Testing: {case['name']} (Page {page_num}) ---")
    url = f"{BASE_URL}&page={page_num}"
    
    try:
        req = urllib.request.Request(url, headers=case['headers'])
        with urllib.request.urlopen(req) as response:
            final_url = response.geturl()
            html = response.read().decode('utf-8')
            
            # Check for redirect
            if f"page={page_num}" not in final_url and page_num > 1:
                print(f"FAILED: Redirected to {final_url}")
                return

            # Extract first chapter to verify content
            episode_matches = re.findall(r'data-episode-no="(\d+)"', html)
            if episode_matches:
                print(f"SUCCESS? First Chapter ID: {episode_matches[0]}")
                # Page 1 usually starts with ~206. Page 2 should be lower (~196).
                if int(episode_matches[0]) < 200:
                    print(">>> CONFIRMED: Got older chapters!")
                else:
                    print(">>> FAILED: Still seeing latest chapters.")
            else:
                print("FAILED: No chapters found in HTML.")

    except Exception as e:
        print(f"ERROR: {e}")

def main():
    print("Starting Deep Analysis of Webtoon Pagination...")
    
    # Test Page 2 for all cases
    for case in TEST_CASES:
        test_pagination(case, 2)

if __name__ == "__main__":
    main()
