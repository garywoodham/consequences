#!/bin/bash
set -e
cd /workspace

# Kill existing servers
pkill -f "next start" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "partykit" 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 2

# Start PartyKit
npm run dev:party > /tmp/partykit.log 2>&1 &
sleep 3

# Start cloudflared tunnels
/tmp/cloudflared tunnel --url http://localhost:1999 > /tmp/cf-party.log 2>&1 &
/tmp/cloudflared tunnel --url http://localhost:3000 > /tmp/cf-next.log 2>&1 &
sleep 6

PARTY_HOST=$(rg -o '[a-z0-9-]+\.trycloudflare\.com' /tmp/cf-party.log | head -1)
NEXT_HOST=$(rg -o '[a-z0-9-]+\.trycloudflare\.com' /tmp/cf-next.log | head -1)

echo "NEXT_PUBLIC_PARTYKIT_HOST=$PARTY_HOST" > /workspace/.env.local
echo "PartyKit tunnel: https://$PARTY_HOST"
echo "App tunnel: https://$NEXT_HOST"

# Build with correct PartyKit host
npm run build

# Start production Next.js server
npm start > /tmp/next.log 2>&1 &
sleep 3

echo ""
echo "============================================"
echo "App ready: https://$NEXT_HOST"
echo "============================================"
