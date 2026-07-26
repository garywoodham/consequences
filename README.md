# Consequences

An online multiplayer version of the classic **Consequences** parlour game. Players join a room, secretly fill in story prompts, then the app mixes everyone's answers into hilarious stories to read aloud.

## Features

- **Create or join** games with a 6-character room code
- **Profile photos** — upload a selfie when joining (optional)
- **4 story templates** — Classic, Short, Adventure, and Simple
- **Name picker** — choose a fellow player's name or type your own for name prompts
- **Real-time multiplayer** via PartyKit WebSockets
- **Story reveal** — navigate mixed-up stories with read-aloud mode
- **Comic strips** — turn any story into a comic strip. With `OPENAI_API_KEY`,
  uploaded photos become cartoon caricatures that star in AI-illustrated panels;
  without a key, a photo-based comic strip is rendered from player avatars.

## Quick start

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Environment variables

Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_PARTYKIT_HOST` | Build-time fallback | PartyKit host baked into the client (used on Vercel). |
| `PARTYKIT_HOST` | Runtime override | Read at request time by `/api/config`, so the host can change without rebuilding (handy for preview tunnels). |
| `BLOB_READ_WRITE_TOKEN` | Optional | Vercel Blob token for avatar uploads. Without it, avatars use base64 fallback. |
| `OPENAI_API_KEY` | Optional | Enables AI comic strips: caricatures of player photos + illustrated panels. Without it, a photo-based comic is rendered instead. |
| `FAL_KEY` | Optional | Enables the FLUX Pro image engine (via [fal.ai](https://fal.ai)) as an alternative to OpenAI for panel art — fewer content restrictions. When set, an "Image engine" toggle appears on the story reveal screen. |

The client resolves the PartyKit host in this order: it first uses
`NEXT_PUBLIC_PARTYKIT_HOST` (if set at build time), then overrides it with
whatever `/api/config` returns at runtime (`PARTYKIT_HOST`).

### Run locally

Starts both Next.js and PartyKit dev servers:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Run servers separately

```bash
npm run dev:next   # Next.js on :3000
npm run dev:party  # PartyKit on :1999
```

## How to play

1. **Host** creates a game, picks a template, uploads a photo, and shares the room code
2. **Players** join with the code, their name, and optional photo
3. **Host** starts when 2+ players are in the lobby
4. Everyone **fills in all prompts** without seeing others' answers
5. When all submitted, **stories are mixed** and revealed
6. **Read them aloud** — the mismatches are the fun part!

## Deploy

### Next.js (Vercel)

```bash
npm run build
```

Set environment variables in Vercel dashboard.

### PartyKit

```bash
npm run deploy:party
```

Set `NEXT_PUBLIC_PARTYKIT_HOST` to your deployed PartyKit host (e.g. `consequences.your-username.partykit.dev`).

## Comic strips (Phase 2)

After the reveal, tap **Generate comic strip** on any story:

1. The story is split into 3–6 panels (one beat per panel).
2. Each panel shows the contributing players and a caption.
3. With `OPENAI_API_KEY` set, each uploaded photo is first turned into a
   reusable cartoon **caricature**, then every panel is illustrated with those
   caricatures as the recurring characters (`lib/comic.ts`).
4. Without a key, the strip is rendered client-side from player avatars with a
   comic-book style (so the feature is fully usable offline/free).

Relevant files: `lib/comic.ts`, `app/api/generate-comic/route.ts`,
`app/api/caricature/route.ts`, `components/ComicStrip.tsx`.

## Tech stack

- **Next.js 16** — React frontend + API routes
- **PartyKit** — real-time multiplayer rooms
- **Tailwind CSS** — styling
- **Vercel Blob** — avatar image storage (optional)
- **OpenAI image API** — caricatures + comic panels (optional)

## Project structure

```
app/              Next.js pages and API routes
components/       UI components
hooks/            useGame real-time hook
lib/              Prompts, story builder, types
party/            PartyKit server
```

## License

MIT
