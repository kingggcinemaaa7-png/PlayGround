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

Boot is hardened: a splash screen covers the page until the first frame renders;
every network step has a timeout; failures show an error + environment diagnostics
instead of a silent blue screen. `?safemode=1` disables audio + camera for debugging.

URL flags: `?clean=1` (full-bleed canvas, no console), `?mock=1` (bottom mock panel), `?safemode=1` (no audio/camera),
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

## Music and announcer files (exact paths)

Put files in `tac-savasi/assets/audio/`. You do **not** need to rename anything — the game accepts `.ogg`, `.wav`, `.mp3` or `.m4a` for every slot.

| file you drop in | what the game does with it |
|---|---|
| `assets/audio/music-calm.ogg` (or `.wav`/`.mp3`) | loops during normal play |
| `assets/audio/music-intense.ogg` | fades in on boss / gold rain / big streaks. **If missing, calm keeps playing — the stream never goes silent.** |
| `assets/audio/sfx-<name>.wav` (`shot`, `hit`, `kill`, `meteor`, `tornado`, `thunder`, `roar`, `tick`, `fanfare`, `tide`, `gift-t1..t5`, `streak-5/15/30/50`) | replaces the built-in synth sound |
| `assets/audio/announcer/<es-MX\|es-ES\|tr-TR>/<match.start\|match.end\|goldrain\|mercy\|boss\|streak>.wav` | replaces the announcer line for that event + locale |

After adding files, run `node tools/sync-assets.mjs` (or just `npm run build` — the client build syncs automatically). The console's `Varlıklar` row shows what was found (e.g. `1/11 yuva · 3 ses dosyası`). An `assets/examples/` folder contains a copy-in test file.

**What is the "announcer"?** Not AI — the game's hype-man voice. On 7 events (match start/end, gold rain, mercy, boss, streak) it plays a short voice line together with the big on-screen text, for the currently active locale. Right now those slots hold short generated beeps I made; when you drop your own recordings in, those play instead. Recommended: your own voice (a phone mic is fine, 16-bit 44.1 kHz mono WAV) — your audience connects with *you*, and you own the rights. AI voices work too, but check the tool's commercial license, since this is a monetized stream.

Loudness: mix for a **-16 LUFS** integrated target (music bed ~-22, SFX ~-18, announcer ~-15; the music ducks ~6 dB under the announcer). Watch the live **Ses** meter in the console (≈ -16 dBFS) and trim the three sliders until it sits there during fights. Verify the real output with `ffmpeg -i out.mkv -af ebur128`.

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
