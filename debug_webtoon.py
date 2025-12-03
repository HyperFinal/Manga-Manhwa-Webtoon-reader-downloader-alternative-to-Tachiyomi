import requests
from bs4 import BeautifulSoup

url = 'https://www.webtoons.com/en/search?keyword=The+Spark+in+Your+Eyes'
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

try:
    response = requests.get(url, headers=headers)
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Find the list of results
    # Based on previous knowledge, it might be in a ul with class 'card_lst'
    card_items = soup.select('.card_item')
    
    print(f"Found {len(card_items)} items with class .card_item")
    
    if len(card_items) > 0:
        item = card_items[0]
        print("First item HTML:")
        print(item.prettify())
    else:
        print("No .card_item found. Dumping potential candidates:")
        # Look for the title "The Spark in Your Eyes" and print its parent
        title = soup.find(string="The Spark in Your Eyes")
        if title:
            print("Found title text. Parent hierarchy:")
            parent = title.parent
            for i in range(5):
                print(f"Level {i}: {parent.name} class={parent.get('class')}")
                parent = parent.parent
                if not parent: break
                
except Exception as e:
    print(f"Error: {e}")
