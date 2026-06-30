#!/bin/bash
# Starts the Consequences app with a public preview URL via Cloudflare quick tunnels.
# The PartyKit host is provided to the running Next.js server at RUNTIME (via the
# PARTYKIT_HOST env var, read by /api/config), so the tunnel URL can change
# without rebuilding the app.
set -e
cd "$(dirname "$0")/.."

CLOUDFLARED=${CLOUDFLARED:-/tmp/cloudflared}

echo "Stopping any previous servers/tunnels..."
pkill -f "next-server" 2>/dev/null || true
pkill -f "next start" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "partykit" 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
pkill -f "workerd" 2>/dev/null || true
# Make sure nothing is still bound to our ports.
for port in 3000 1999; do
  pids=$(lsof -ti tcp:$port 2>/dev/null || true)
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
done
sleep 2

echo "Starting PartyKit..."
npm run dev:party > /tmp/partykit.log 2>&1 &
sleep 4

echo "Opening Cloudflare tunnels..."
"$CLOUDFLARED" tunnel --url http://localhost:1999 > /tmp/cf-party.log 2>&1 &
"$CLOUDFLARED" tunnel --url http://localhost:3000 > /tmp/cf-next.log 2>&1 &

# Wait for both tunnel URLs to appear.
PARTY_HOST=""
NEXT_HOST=""
for _ in $(seq 1 30); do
  PARTY_HOST=$(rg -o '[a-z0-9-]+\.trycloudflare\.com' /tmp/cf-party.log 2>/dev/null | head -1 || true)
  NEXT_HOST=$(rg -o '[a-z0-9-]+\.trycloudflare\.com' /tmp/cf-next.log 2>/dev/null | head -1 || true)
  [ -n "$PARTY_HOST" ] && [ -n "$NEXT_HOST" ] && break
  sleep 1
done

if [ -z "$PARTY_HOST" ] || [ -z "$NEXT_HOST" ]; then
  echo "ERROR: tunnels did not come up. See /tmp/cf-party.log and /tmp/cf-next.log"
  exit 1
fi

echo "PartyKit tunnel: https://$PARTY_HOST"
echo "App tunnel:      https://$NEXT_HOST"

# Clean build so chunk hashes always match what we serve.
echo "Building (clean)..."
rm -rf .next
npm run build

echo "Starting Next.js (production) with runtime PartyKit host..."
PARTYKIT_HOST="$PARTY_HOST" npm start > /tmp/next.log 2>&1 &

# Wait until the server is reachable.
for _ in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ || true)
  [ "$code" = "200" ] && break
  sleep 1
done

echo ""
echo "============================================"
echo "App ready: https://$NEXT_HOST"
echo "PartyKit:  https://$PARTY_HOST"
echo "============================================"
