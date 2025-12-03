import requests

url = "https://mangapill.com/chapters/2-11167000/one-piece-chapter-1167"
try:
    response = requests.get(url)
    print(response.text[:5000]) # Print first 5000 chars to check for image data
except Exception as e:
    print(e)
