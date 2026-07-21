"""Run this once to get a sign-in link without needing email OTP."""
import os
from pathlib import Path

env_path = Path(__file__).parent / ".env"
print(f"Looking for .env at: {env_path}")
print(f".env exists: {env_path.exists()}")

# Read and set env vars manually
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            os.environ[key.strip()] = val.strip()

print(f"SUPABASE_URL loaded: {os.environ.get('SUPABASE_URL', 'NOT FOUND')}")

from supabase import create_client

client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
response = client.auth.admin.generate_link({
    "type": "magiclink",
    "email": "pankaj.exe9021@gmail.com",
})

print("\n✅ Open this link in your browser to sign in:\n")
print(response.properties.action_link)
print()
