#!/usr/bin/env bash
# Deploy Consequences permanently:
#   1) PartyKit lobby  →  *.partykit.dev
#   2) Next.js app     →  Vercel (if CLI is logged in)
#
# Run on your laptop (not the cloud agent):
#   bash scripts/deploy-permanent.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo ""
echo "=== 1. PartyKit lobby ==="
if ! npx partykit whoami >/dev/null 2>&1; then
  echo "Not logged into PartyKit. Opening login…"
  npx partykit login
fi
npx partykit whoami
echo "Deploying PartyKit…"
npx partykit deploy

# Best-effort: read host from partykit config / recent deploy output.
PARTY_HOST=""
if [ -f .partykit/config.json ]; then
  PARTY_HOST=$(node -e "
    try {
      const c = require('./.partykit/config.json');
      const name = c.name || 'consequences';
      const user = c.login || c.username || '';
      if (user) console.log(name + '.' + user + '.partykit.dev');
    } catch {}
  " 2>/dev/null || true)
fi

echo ""
echo "=== 2. Vercel (Next.js) ==="
if npx --yes vercel whoami >/dev/null 2>&1; then
  echo "Logged into Vercel as: $(npx --yes vercel whoami)"
  echo "Deploying production…"
  npx --yes vercel --prod --yes
else
  echo "Vercel CLI not logged in."
  echo "Easiest option: connect the GitHub repo in the Vercel dashboard"
  echo "(Import → garywoodham/consequences → Deploy)."
  echo "Or run:  npx vercel login && npx vercel --prod"
fi

echo ""
echo "============================================"
echo "REQUIRED Vercel environment variables"
echo "============================================"
echo "Set these in Vercel → Project → Settings → Environment Variables"
echo "(Production AND Preview), then Redeploy:"
echo ""
if [ -n "$PARTY_HOST" ]; then
  echo "  NEXT_PUBLIC_PARTYKIT_HOST = $PARTY_HOST"
  echo "  PARTYKIT_HOST             = $PARTY_HOST"
else
  echo "  NEXT_PUBLIC_PARTYKIT_HOST = consequences.<your-partykit-username>.partykit.dev"
  echo "  PARTYKIT_HOST             = (same as above)"
  echo ""
  echo "  (Copy the exact host from the PartyKit deploy output above —"
  echo "   it looks like consequences.YOURNAME.partykit.dev)"
fi
echo "  ACCESS_CODE               = 5075"
echo "  OPENAI_API_KEY            = (optional, for OpenAI comics)"
echo "  FAL_KEY                   = (optional, for FLUX comics)"
echo ""
echo "Quick check after deploy:"
echo "  open https://<your-vercel-app>.vercel.app/api/config"
echo "  partyHost must be your *.partykit.dev host — NOT *.vercel.app:1999"
echo "============================================"
