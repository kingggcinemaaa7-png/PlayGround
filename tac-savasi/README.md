# Taç Savaşı — TikTok LIVE Arena

Portrait 1080×1920 PixiJS game. Viewers become auto-fighters; gifts/likes/comments/follows drive gameplay.

## Quick start (Windows)

```bat
start.bat
```
- Installs deps, starts bridge (`ws://localhost:8081`, mock mode) + client (`http://localhost:3002`).
- Open the client URL in a browser, capture it with **TikTok LIVE Studio** (portrait 1080×1920).

Manual:
```bash
npm install
npm run build
# terminal 1: mock bridge with 60 viewers
MODE=mock MOCK=storm VIEWERS=60 npm run dev --workspace=server
# terminal 2: game client
npm run dev --workspace=client
```

Live TikTok (unofficial `tiktok-live-connector`, may break; isolated behind `server/src/adapter.ts`):
```bash
MODE=live TIKTOK_USERNAME=yourname npm start --workspace=server
```

## Streamer control console

Open `http://localhost:3002/` — a control panel opens on the right **outside the game
canvas**, so it is never captured by LIVE Studio. Toggle it with **F1** (or `Ctrl+Shift+C`).

| group | controls |
|---|---|
| Bridge | TikTok WS URL + **Bağlan** (reconnect), live connection dot |
| Yayın | Pause, auto-gift (idle filler), language (es-MX / es-ES / tr-TR / en), dual-language, **camera strip** (+ test pattern without a webcam) |
| Ses | master / music / SFX sliders, mute (**M**), test sound |
| Maç | duration presets 1:30 / 5:00 / 25:00, new match, force phase (Oyun/Bitiş/Tablo/Ödüller/Podyum/İntro) |
| Olaylar | spawn boss now, tide, storm, gold rain, **safe-zone overlay** (QA), HUD info, spawn +1/+10/+50 viewers |
| Hediye | inject T1..T5 and a 30-gift storm |
| Komutlar | `!kalkan` `!fuego` `!responde`, 10 likes, free-text chat (Enter) |
| Veri | download telemetry CSV, clear global ranking, live stats (FPS, frame ms, quality, phase, viewers, bullets, boss HP, heap, global top) |

URL flags: `?clean=1` (full-bleed canvas, no console), `?mock=1` (bottom mock panel),
`?duration=90`, `?locale=tr-TR`, `?bridge=ws://host:8081`.

## Scripts

| cmd | what |
|---|---|
| `npm test` | Vitest: shared (damage/streak/commands/gifts/layout/locale/sim + gameplay) + server (registry) |
| `npm run lint` | ESLint 9 (TypeScript-aware) |
| `npm run typecheck` | `tsc --noEmit` client + server |
| `npm run check` | lint + test + build |
| `npm run build` | build shared → server → client |
| `npm run mock --workspace=server -- storm` | one-shot mock generator |
| `node --expose-gc tools/soak.mjs 3600` | 1-hour soak (per-minute heap, verdict, exit code) |

## Config

`config.json` — every gameplay number; bridge hot-reloads it. Client reads `/config.json` at boot (copy it to `client/public/config.json` — done automatically by `start.bat`/build).

## Compliance

- No real-money prizes, no gambling-like random rewards copy, no pressure copy. Gift effects are fixed per tier (documented in `BALANCE.md`).
- Minors may gift on TikTok; we store only public profile info (name/pic/totals). `!deleteme` / `deleteMe` removes a viewer.
- `tiktok-live-connector` is unofficial and isolated behind `LiveAdapter`; swap it without touching game code.

## Project layout

```
shared/  pure sim + types + i18n + layout + tests (no DOM)
server/  bridge (adapter/registry/db/mock/telemetry) + tests
client/  PixiJS v8 game (sim interp, HUD, fx, synth audio, pics)
assets/  manifest + placeholders (replace files, no code change)
tools/   soak.mjs headless perf
```

## Verification status

See `PERFORMANCE.md` for the latest measured numbers. CI runs `npm test` + `vite build`.
