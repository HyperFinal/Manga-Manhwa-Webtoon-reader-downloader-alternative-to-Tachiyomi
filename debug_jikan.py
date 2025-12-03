import requests
import json

def check_jikan(query):
    print(f"Searching for: {query}")
    url = "https://api.jikan.moe/v4/manga"
    params = {'q': query, 'limit': 1}
    try:
        r = requests.get(url, params=params)
        r.raise_for_status()
        data = r.json()
        
        if 'data' in data and len(data['data']) > 0:
            manga = data['data'][0]
            print(f"Title: {manga.get('title')}")
            print(f"Titles: {json.dumps(manga.get('titles'), indent=2)}")
            print(f"Title Synonyms: {json.dumps(manga.get('title_synonyms'), indent=2)}")
            print(f"Title English: {manga.get('title_english')}")
        else:
            print("No results found.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_jikan("The Spark in Your Eyes")
