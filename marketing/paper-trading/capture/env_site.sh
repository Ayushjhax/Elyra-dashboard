# Placeholder env for the scratch site; the real Pyth key is read from .env.local, never echoed.
export NEXT_PUBLIC_FAKE_AUTH=1
export ANTHROPIC_API_KEY=sk-ant-placeholder
export NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
export SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role
export NEXT_PUBLIC_PRIVY_APP_ID=abcdefghijklmnopqrstuvwxy
export PRIVY_APP_SECRET=placeholder-secret
export CREDENTIALS_ENC_KEY="$(openssl rand -base64 32)"
export PYTH_API_KEY="$(grep -E '^PYTH_API_KEY=' /Users/ayush/Desktop/Elyra-dashboard/.env.local | cut -d= -f2- | tr -d '"')"
export NEXT_TELEMETRY_DISABLED=1
