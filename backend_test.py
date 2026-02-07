import requests
import json
import uuid

url = 'http://localhost:5000/api/sync'

# Create a dummy image file
with open('test_image.jpg', 'wb') as f:
    f.write(b'\xFF\xD8\xFF\xE0\x00\x10\x4A\x46\x49\x46\x00\x01') # JPEG Magic Bytes

dummy_id = str(uuid.uuid4())
metadata = {
    "id": dummy_id,
    "data": {"text": "Test Upload via Python Script"},
    "createdAt": "2023-01-01T00:00:00Z",
    "status": "queued"
}

files = {
    'image': ('test_image.jpg', open('test_image.jpg', 'rb'), 'image/jpeg')
}
data = {
    'submission': json.dumps(metadata)
}

print(f"Sending upload for ID: {dummy_id}")
try:
    response = requests.post(url, files=files, data=data)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
