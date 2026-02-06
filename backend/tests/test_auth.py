# backend/test_auth.py (Create this for easy demo)
import requests

BASE_URL = "http://localhost:5000/api/v1"

# 1. Register
print("1. Registering user...")
response = requests.post(f"{BASE_URL}/auth/register", json={
    "username": "demo_user",
    "email": "demo@example.com",
    "password": "password123",
    "full_name": "Demo User"
})
print(response.json())
token = response.json()['access_token']

# 2. Login
print("\n2. Logging in...")
response = requests.post(f"{BASE_URL}/auth/login", json={
    "username": "demo_user",
    "password": "password123"
})
print(response.json())

# 3. Analyze code
print("\n3. Analyzing code...")
response = requests.post(f"{BASE_URL}/analyze", 
    headers={"Authorization": f"Bearer {token}"},
    json={
        "code": "def test(): pass",
        "language": "python"
    })
print(response.json())

# 4. Get history
print("\n4. Getting history...")
response = requests.get(f"{BASE_URL}/auth/history",
    headers={"Authorization": f"Bearer {token}"})
print(response.json())