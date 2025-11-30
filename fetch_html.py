import urllib.request

url = "https://mangapill.com/chapters/2-10010000/one-piece-chapter-1"
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        with open('test.html', 'w', encoding='utf-8') as f:
            f.write(html)
        print("✅ HTML saved to test.html")
except Exception as e:
    print(f"❌ Error: {e}")
