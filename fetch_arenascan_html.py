import requests

url = "https://arenascan.com/?s=Blinded+by+the+Setting+Sun&post_type=wp-manga"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

try:
    r = requests.get(url, headers=headers)
    with open('debug_arenascan_search.html', 'w', encoding='utf-8') as f:
        f.write(r.text)
    print("Saved HTML to debug_arenascan_search.html")
except Exception as e:
    print(f"Error: {e}")
