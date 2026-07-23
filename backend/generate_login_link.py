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
# Set LOGIN_LINK_EMAIL in .env (falls back to the founder account below).
login_email = os.environ.get("LOGIN_LINK_EMAIL", "ai.support@ecoste.in")
response = client.auth.admin.generate_link({
    "type": "magiclink",
    "email": login_email,
    "options": {"redirect_to": "http://localhost:3000/login"},
})

print("\n[OK] Open this link in your browser to sign in:\n")
print(response.properties.action_link)
print()
