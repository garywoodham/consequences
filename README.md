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

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `ACCESS_CODE` | Optional | Party login code for `/login` (default `5075`). |
| `NEXT_PUBLIC_PARTYKIT_HOST` | **Required on Vercel** | PartyKit host baked into the client (e.g. `consequences.you.partykit.dev`). |
| `PARTYKIT_HOST` | Runtime override | Read at request time by `/api/config`, so the host can change without rebuilding (handy for preview tunnels). |
| `BLOB_READ_WRITE_TOKEN` | Optional | Vercel Blob token for avatar uploads. Without it, avatars use base64 fallback. |
| `OPENAI_API_KEY` | Optional | Enables AI comic strips: caricatures of player photos + illustrated panels. Without it, a photo-based comic is rendered instead. |
| `FAL_KEY` | Optional | Enables the FLUX.2 image engine (via [fal.ai](https://fal.ai)) as an alternative to OpenAI for panel art — fewer content restrictions, per-character reference images. |
| `COMFYUI_URL` | Optional | Enables **Local** — full self-hosted comic pipeline via [ComfyUI](https://github.com/comfyanonymous/ComfyUI): caricatures, lookalikes, and panels with no cloud moderation. Not reachable from Vercel unless you tunnel. |
| `COMFYUI_WORKFLOW` | Optional | txt2img workflow for panels/lookalikes without a reference image. Default: `comfy/workflows/panel-txt2img.json`. |
| `COMFYUI_PANEL_IMG2IMG_WORKFLOW` | Optional | img2img workflow for panels anchored to a caricature. Default: `comfy/workflows/panel-img2img.json`. |
| `COMFYUI_CARICATURE_WORKFLOW` | Optional | img2img workflow for photo → caricature. Default: `comfy/workflows/caricature-img2img.json`. |
| `COMFYUI_TIMEOUT_MS` | Optional | Max wait per ComfyUI job in ms (default `300000`). |
| `COMFYUI_SKIP_CARICATURE` | Optional | `1` = skip photo→caricature pass; panels img2img from player photos (much faster on CPU). |
| `COMFYUI_PANEL_DENOISE` | Optional | Panel img2img denoise when skipping caricatures (default workflow `0.68`; try `0.78`). |
| `COMFYUI_UPLOAD_MAX_PX` | Optional | Max edge length for images uploaded to ComfyUI (default `768`). |
| `COMFYUI_STEPS` / `CFG` / `WIDTH` / `HEIGHT` | Optional | Override sampler steps, CFG, and txt2img resolution at runtime. |

When two or more image engines are configured, an **Image engine** toggle appears on the story reveal screen (OpenAI / FLUX / Local).

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

The app is **two services**:

1. **Next.js** (Vercel) — UI + API routes  
2. **PartyKit** (partykit.dev) — live lobby / WebSocket game rooms  

Vercel alone cannot host the lobby. If `NEXT_PUBLIC_PARTYKIT_HOST` is missing, the game stays on **Connecting...** forever.

### 1. Deploy PartyKit

```bash
npx partykit login
npm run deploy:party
```

Note the host printed at the end (e.g. `consequences.<you>.partykit.dev`).

### 2. Deploy Next.js on Vercel

Set these environment variables in the Vercel project (**Production** and **Preview**), then redeploy:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_PARTYKIT_HOST` | `consequences.<you>.partykit.dev` (no `https://`) |
| `PARTYKIT_HOST` | same as above (optional runtime override) |
| `ACCESS_CODE` | `5075` (party login code; this is the default if unset) |
| `OPENAI_API_KEY` | optional, for comics |
| `FAL_KEY` | optional, for FLUX comics |

```bash
npm run build
```

### 3. Party login code

Visitors hit `/login` and must enter **`5075`** (or whatever you set in `ACCESS_CODE`) before creating or joining a game. The cookie lasts 90 days.

### Quick check

Open `https://<your-vercel-app>/api/config` after deploying.  
`partyHost` must be your `*.partykit.dev` host — **not** `*.vercel.app:1999`.

## Comic strips (Phase 2)

After the reveal, tap **Generate comic strip** on any story:

1. The story is split into 3–6 panels (one beat per panel).
2. Each panel shows the contributing players and a caption.
3. With `OPENAI_API_KEY` set, each uploaded photo is first turned into a
   reusable cartoon **caricature**, then every panel is illustrated with those
   caricatures as the recurring characters (`lib/comic.ts`).
4. Without a key, the strip is rendered client-side from player avatars with a
   comic-book style (so the feature is fully usable offline/free).

Relevant files: `lib/comic.ts`, `lib/providers/comfy.ts`, `app/api/generate-comic/route.ts`,
`app/api/caricature/route.ts`, `components/ComicStrip.tsx`.

### Local ComfyUI engine (uncensored full pipeline)

When you pick **Local**, the entire comic pipeline bypasses cloud moderation — caricatures from player photos, lookalike portraits for named characters, and panel art all go through ComfyUI on your machine. No OpenAI key required.

1. **Install and start ComfyUI** — default API is [http://127.0.0.1:8188](http://127.0.0.1:8188).
2. **Load your checkpoint** — Flux, SDXL, or any uncensored model you prefer. Put it in `ComfyUI/models/checkpoints/`.
3. **Configure the three workflow templates** in `comfy/workflows/` (or point the env vars at your own exports):
   - `caricature-img2img.json` — photo → cartoon caricature (`__PROMPT__` + `__IMAGE__` placeholders)
   - `panel-img2img.json` — panel art anchored to a caricature reference
   - `panel-txt2img.json` — panel art when no reference image exists
   Open each in ComfyUI, set your checkpoint, Save (API Format), overwrite the template.
4. **Configure env** — in `.env.local`:
   ```bash
   COMFYUI_URL=http://127.0.0.1:8188
   ```
5. **`npm run dev`** — pick **Local** on the story reveal screen. Spicy stories auto-recommend it.

**Deploy note:** Vercel cannot reach `127.0.0.1`. Local is for laptop/dev use unless you expose ComfyUI via VPN or tunnel.

#### Local speed (CPU / no NVIDIA GPU)

On a laptop without CUDA, generation is slow by default. These changes are already wired in:

1. **Start ComfyUI with `--fast`** — run `.\scripts\start-comfyui.ps1` (CPU + experimental speed opts). Only one ComfyUI process should run on `:8188`.
2. **Faster workflows** — bundled templates use 768×768, ~12–14 steps, lower CFG (override via `COMFYUI_STEPS`, `COMFYUI_WIDTH`, etc. in `.env.local`).
3. **Skip caricatures** — `COMFYUI_SKIP_CARICATURE=1` uses player photos directly for panel img2img (one fewer SDXL run per player). Set `COMFYUI_PANEL_DENOISE=0.78` so panels still stylise from the photo.
4. **Smaller uploads** — reference images are downscaled to `COMFYUI_UPLOAD_MAX_PX` (default 768) before ComfyUI sees them.

**NVIDIA GPU:** install CUDA PyTorch in ComfyUI, drop `--cpu`, and omit `COMFYUI_SKIP_CARICATURE` for best quality. **AMD integrated GPUs** are not supported well on Python 3.13 (DirectML unavailable).

## Tech stack

- **Next.js 16** — React frontend + API routes
- **PartyKit** — real-time multiplayer rooms
- **Tailwind CSS** — styling
- **Vercel Blob** — avatar image storage (optional)
- **OpenAI image API** — caricatures + comic panels (optional)
- **fal.ai / FLUX** — alternative panel engine (optional)
- **ComfyUI** — self-hosted local panel engine (optional)

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
