import urllib.request
import urllib.parse
from html.parser import HTMLParser

url = 'https://www.webtoons.com/en/search?keyword=The+Spark+in+Your+Eyes'
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

class MyHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_card_item = False
        self.found_items = 0
        self.recording = False
        self.content = ""

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        class_name = attrs_dict.get('class', '')
        
        if 'card_item' in class_name:
            self.in_card_item = True
            self.found_items += 1
            print(f"Found card_item {self.found_items}")
            self.recording = True
            
        if self.recording:
            self.content += f"<{tag} {attrs}>\n"

    def handle_endtag(self, tag):
        if self.recording:
            self.content += f"</{tag}>\n"
            if tag == 'li' and self.in_card_item: # Assuming card_item is an li
                self.in_card_item = False
                self.recording = False
                if self.found_items == 1:
                    print(self.content)

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        # print(html[:1000]) # Debug: print first 1000 chars
        
        if 'card_item' in html:
            print("String 'card_item' found in HTML")
        else:
            print("String 'card_item' NOT found in HTML")
            
        parser = MyHTMLParser()
        parser.feed(html)
        
except Exception as e:
    print(f"Error: {e}")
