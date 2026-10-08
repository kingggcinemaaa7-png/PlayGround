# Performance report

Target: 60 FPS, 100 avatars / 300 bullets / 500 particles on a mid-range laptop; 4h memory-stable.

## How to reproduce

```bash
npm run build
node tools/soak.mjs 60     # headless sim: 100 avatars + boss + gift churn
npm test                    # unit tests incl. layout overlap + determinism
```

- Browser: open `http://localhost:3002/?mock=1`, press **gift storm**, watch FPS (Pixi auto-quality lowers particle budget when frame EMA > 18ms).
- Soak: leave mock bridge + client running; heap sampled in soak output; client uses pooled sprites/texts (no per-frame allocation except HUD strings).

## Visual/animation architecture (v2)

| layer | content |
|---|---|
| `gfx/textures.ts` | procedural sprite factory (canvas-drawn, cached): palms, crabs, gulls, torches+flame, rocks, castle, kraken + tentacles, crab + claws, crown, coins, blades, bolts, spike rings, glossy avatar frames, 9-slice panels, sky/water/sand gradients, vignette, sun-ray watermark |
| `gfx/world.ts` | living arena: gradient sky, animated ocean + wave lines, **island-masked sand** with wet rim, swaying palms, flickering torches, scuttling crabs, gliding gulls, castle with damage tint + smoke, **persistent sand splat decals**, tide surface with animated foam, rain, color grading |
| `gfx/entities.ts` | avatar views with **interpolated movement**, squash/stretch from velocity, hit flash, respawn ring, rotating streak spike rings, trap dashes, boss composed from head + 6 tentacles / 2 claws with idle animation |
| `fx.ts` | pooled particles in two layers (additive blurred glow + normal), shockwave rings, meteor, orbiting tornado blades, coin rain, lightning bolts, confetti, damage numbers with variance, float texts, hit-stop, camera shake, zoom punch, auto quality |
| `gfx/hud.ts` | top-3 ranked bar (2-1-3, crown on #1), goal meter with shine sweep, event ticker, gifters list, join feed, gift menu strip, mercy banner with VS portraits, hero card, castle HP (world-space), scenes: end / table+global ranking / awards / podium |

## Quality tooling

| command | what |
|---|---|
| `npm run lint` | ESLint 9 flat config, TypeScript-aware, zero runtime deps (`eslint.config.js`) |
| `npm run typecheck` | `tsc --noEmit` for client + server |
| `npm test` | 33 Vitest cases (damage, streak, commands incl. tr ı/İ, gift tiers, layout zones, locale formatting, determinism, **poison, scoring, castle fall, boss trap, respawn queue**) |
| `npm run check` | lint + test + build (CI gate) |
| `node --expose-gc tools/soak.mjs 3600` | 1-hour soak with per-minute heap samples, verdict + non-zero exit on regression |

Soak measures the pure simulation (no renderer), which is the part that must never
drift: tick cost, bullet/monster caps, heap flatness across simulated minutes.

## Loudness

Target **-16 LUFS**. The WebAudio graph is `master -> analyser -> destination`, so the
analyser sits on the final mix and `AudioBus.measureLevel()` returns the integrated
RMS in dBFS. Mix guidance lives in `assets/assets.manifest.json` under `mix`:
music bed -22, SFX -18, announcer -15 LUFS, music ducked ~6 dB under the announcer.
Measure the final render (OBS/LIVE Studio) with `ffmpeg -i out.mkv -af ebur128` — the
browser RMS proxy is a guide, not a compliance measurement.

## Streamer console (`admin/console.ts`)

DOM panel outside the canvas (never captured). Owns: bridge URL/reconnect, pause,
auto-gifts, locale, dual-language, facecam strip, 3 volume sliders + mute, duration
presets, phase forcing, event forcing, safe-zone QA overlay, HUD info, viewer spawning,
gift/command injection, telemetry CSV download, ranking reset, 4 Hz stats readout.
Hotkey **F1**; `?clean=1` for full-bleed capture mode.

Performance note: the full-screen additive `BlurFilter` on the glow layer was the single
heaviest pass at 1080x1920. Now `quality:1, resolution:0.5`, and it is removed entirely
when the auto quality scaler drops below 0.55. Ocean/foam `Graphics` rebuild is throttled
to every other frame. Measured effect in software rendering: 10 -> 25 FPS with the debug
overlay off. A real GPU is far above this, but verify >=55 FPS on the streaming machine.

## Bugs found and fixed during the v2 upgrade (all verified in-browser)

1. **Production boot deadlock** — top-level `await` in the entry + Rollup chunk cycle hung `pixi.init()` forever in `vite build` output while `vite dev` worked. Removed all top-level awaits (`main()` wrapper).
2. **Render crash on gift storm** — `announce()` mutated Pixi's live `children` array with `shift()/splice()`, desyncing the render-group cache → `updateLocalTransform(): Cannot read properties of null`. Now only `destroy()` (which detaches safely).
3. **Render crash on confetti/star** — two tweens wrote to a sprite destroyed by the first one. `Tweener` now skips destroyed targets and `setPath` guards null intermediates.
4. **HUD double offset** — `setFacecam()` re-positioned the goal label that was already inside a positioned box.
5. **Invisible castle** — `propsFront.removeChildren()` dropped it and it was never re-added.
6. **Layer order** — `addChild()` of an already-parented container re-appended it above the sand.
7. **Empty awards/podium** — results were computed only when leaving the podium (after the scenes that needed them). Moved to match end.
8. **Scene/zone overlaps** — result scenes drew under the top bar and castle HP bar conflicted with the announcement zone; castle HP moved to world space, zone table updated, and the facecam variant got adaptive row counts.
9. **Console "BOSS" did nothing** — `forceBoss()` marked every spawn slot as used instead of spawning; refactored into a shared `spawnBossNow()`.
10. **Asset slot counter always read 0/11** — `report()` used `Object.keys()` on a `Map` (always empty). The loader was actually working; only the counter lied. Also made the audio presence check reject `text/html`, because dev/preview servers answer unknown paths with `index.html` and a 200.
11. **Uğultu: iki müzik katmanı üst üste çalıyordu.** Sentetik pad, gerçek dosya yüklenince kendini kapatmıyordu; üstüne 1.2 sn'lik bas notalar 420 ms arayla üst üste yığılıyordu. Şimdi: gerçek dosya gelince pad zinciri durur, sentetik yedek çakışmayan pentatonik tınılara indirgendi, katman geçişi eksik dosyada sessizliğe düşmez.
12. **Test müziğinin döngü noktası bozuktu** (tam sayı çevrim olmayan frekanslar → her 4 sn'de tıklama). `tools/gen-music.mjs` ile 8 sn'lik, döngü-güvenli iki parça üretildi (A-majör sakin, A-minör yoğun); sınır örnekleri kendini test eder.
13. **Fighters collapsed onto the castle centre at 60 avatars** — everyone steered at the same point, so names and HP bars overlapped into an unreadable pile. Fighters now orbit the castle on a personal ring (`orbitR`/`orbitPhase` per avatar), which spreads them and reads like an actual arena.
12. **Blank canvas after re-enabling the camera** — the previous facecam sprite was left in the display list after its texture was destroyed, so the renderer hit `null.alphaMode` and the whole render loop died. Facecam now tears down in order, and `Game.frame()` is wrapped in a try/catch that pauses the match after 240 consecutive errors instead of going black.

## Measured results

### 60-minute soak — `node --expose-gc tools/soak.mjs 3600 --json` (100 fighters)

| metric | result |
|---|---|
| simulated | 3600 s, 216,000 ticks, 60 heap samples |
| tick cost | **avg 0.568 ms**, max 17.89 ms vs 16.67 ms frame budget → **29x headroom** |
| throughput | 29.3x realtime (the sim alone finishes an hour in 2 minutes) |
| load held | 100 avatars · 187 bullets · 60 monsters · boss alive |
| heap | 4.0 MB at minute 0 → **3.5 MB at minute 59** — flat, no drift, no leak |
| verdict | **PASS**, exit 0 (regressions exit non-zero) |

An earlier run with the churn bug let avatars grow to **580** (well past the 60-fighter
cap) and still passed at avg 2.37 ms/tick, 7x headroom — recorded as the overload result.
With churn fixed to use the same LRU replacement the client uses, the cap holds at 100.

Per-minute samples (`samples` in the JSON output) make drift visible immediately:
`4.0 → 4.2 → 4.1 → 3.8 → ... → 3.5 MB`.

### Browser FPS

Not measurable here: CI renders in **software (SwiftShader)**, which yields ~25 FPS for
this scene. The 60 FPS bar is a property of the GPU on the streaming machine — verify it
there before going live. The renderer is pooled and the auto quality scaler reacts above
18 ms.

## Latest measured (2026-10-08, CI container)

- Unit tests: shared 18/18, server 4/4 pass (`npm test`).
- Headless sim soak, 100 avatars + boss + gift churn, 30 sim-seconds
  (`node tools/soak.mjs 30`): **1801 ticks in 1.4 s wall = 1279 ticks/s
  (21× realtime), avg 0.78 ms/tick, max tick 12.3 ms.**
- GC leak check (5 × 60 sim-seconds, forced GC between rounds): heap
  **3.7–4.4 MB stable**, bullets/monsters capped — no leak.
- Client production build (`vite build`) boots in headless Chromium
  (SwiftShader): canvas renders, 8-button mock panel works; gift-storm,
  T5, boss spawn, cut-streak, gold-rain + coin particles exercised and
  screenshot-verified. No console errors except expected WS reconnect
  (no bridge) and favicon 404.
- Zero runtime exceptions across: 3x gift storms + T5 tornado + likes +
  forced boss, storm+tide overlap, and the full match flow
  (play → end → table → awards → podium → next match) driven end to end.
- Browser FPS on a real mid-range laptop is NOT yet measured here (CI renders
  in software). Auto quality scaler drops particle budget (520→) when frame
  EMA > 18 ms; verify >=55 FPS on target hardware before streaming.

### Vizyon profesyonelleştirme sonrası (4 faz)

- Per-component CPU cost, 48 avatars, software rasterizer (ms per call):
  `sim.update` **0.623** · `renderWorld` **0.752** · `world.update` **0.092** ·
  `fx.update` **0.056** · `hud.update` **0.001** → ~1.4 ms of game logic per
  frame. The remaining frame time is GPU/software rasterization of 1080x1920.
- New per-frame Graphics rebuilds are deliberately minimal: the arena rim
  stones are **static** (`rimStatic`, drawn once in `buildRim`); only the
  pulsing rim, mood tint, light pool and the heat vignette are redrawn.
  Keeping the stones static held `world.update` at 0.092 ms.
- 30 s soak at 60 avatars + boss: **0 frame errors**, hits keep accumulating,
  bullet count stable. Heap oscillates 37–71 MB between GCs (no monotonic
  growth), so no leak from the new hero-card / name-strip / hit-spark paths.
- Gift-path leak check: 60 hero cards in 27 s → `centerLayer` children drained
  back to baseline 1 after the cards expired. The tweener `id` option is what
  makes the entry/exit animation pair safe (see below).

### Fixed bug: tweener killed its own entry animation

`Tweener.to()` replaced any tween on the same object+path. Every
fade-in + delayed fade-out pair (e.g. the hero card) therefore had its
**entry tween deleted at creation time of the exit tween**, leaving alpha at
0 — the hero card had never actually been visible. `to()` now only replaces
tweens that share the same `id`; id-less tweens keep the old replace
behaviour, so existing call sites are unaffected.

## Notes

- Entity pooling: avatars/bullets/particles/damage numbers reused; bullets capped at 600 (render 300).
- Spatial hash grid (120px cells) rebuilt per tick for neighbor queries.
- Fixed 60Hz sim decoupled from render; hit-stop implemented as sim freeze, not clock change.

## Denetim turu (2026-10-08) — bulunan ve düzeltilen gerçek hatalar

Tarama sonucu bulunan, kanıtı doğrulanmış ve düzeltilmiş hatalar:

| # | Hata | Etki |
|---|---|---|
| H1 | `World.build()` gökyüzü/okyanus/gece sprite'larını **yeniden atıyordu** (`this.sky = new Sprite(...)`) | Sahneye eklenmedikleri için **gökyüzü, okyanus ve gece geçişi hiç çizilmiyordu**. Üç ölü 1×1 beyaz sprite sahnede duruyordu. |
| H2 | Merhamet penceresi `onKill` **sonrasında** kuruluyordu | İstemci `onKill` içinde bannerı okuyordu → **banner hiç görünmedi**. Ayrıca otomatik dirilme pencereyi 3sn'de kapatıyordu (doküman 10sn diyor). |
| H3 | `sim.goldRain` bir kez `true` olup hiç sıfırlanmıyordu | İlk altın yağmurdan sonra **tüm maç boyunca tüm puanlar 2x**. |
| H4 | 60 kişi doluyken yeni izleyicinin hediyesi haritanın **ilk** avatarına yazılıyordu | Ölü bir yabancının kuyruğuna gidiyordu. |
| H5 | `!takim` bekleme süresi yoktu + takım ayrıştırma her sohbet cümlesinde deneniyordu | `"azul"`, `"vamos bien b"` gibi normal mesajlar bedava kalkan+hasar veriyordu; spam sınırsızdı. |
| H6 | Hortum `setInterval(300ms)` ile 5sn çalışıyordu | ~17 darbe (doküman 3) + sim durumu sabit adımın dışından değişiyordu. |
| H8 | `buildCastleHpBar()` hiç çağrılmıyordu | Kale can barı hiç görünmüyordu; `setCastleHp` ekran dışına çiziyordu. |
| H12 | Köprüden gelen veri doğrulanmıyordu | `diamonds:"abc"` → hedef barı kalıcı `NaN`; isimsiz hediye 240 kare sonra oyunu sessizce durduruyordu. `sanitizeEvent()` eklendi. |
| M7 | `setTicker` `setArenaHudVisible(false)` yok sayıyordu | Sonuç ekranlarının üstüne gelgit/fırtına şeridi geri dönüyordu. |
| M10 | Synth döngüsü müzik kapatılınca yeniden zamanlanmıyordu | Müziği bir kez kapatmak **yayını kalıcı susturuyordu**. |
| M11 | `duck()` müzik kazancını mutlak `0.35`'e sabitliyordu | Konsoldaki müzik kaydırıcısı ilk spikerden sonra ölüydü. |
| M22 | `castleDamage(pct)` oranı `castleMaxHp` ile karşılaştırıyordu (`0..1 < 480`) | Kale **her zaman** hasarlı ve dumanlı görünüyordu. |
| M24 | `updateSlots` içinde ölü `if` ve aynı metnin iki kez atanması | Her kare yeniden metin ölçümü. |
| M15 | `?bridge=` değeri konsol `innerHTML`'ine yazılıyordu | `?bridge="><img onerror=…>` sayfada script çalıştırabilirdi. |
| M8 | `en` tablosu 95 anahtardan 31'i eksikti (+5 İspanyolca kopyası) | İngilizce seçilince ham anahtar adları görünüyordu. Artık **parity testi** var. |
| H7 | Güç hapları her karede `Container`+`Graphics`+`Text` olarak yeniden kuruluyordu | 60 oyuncu × 2 güç = kare başına ~360 Graphics. Havuzlanıp yalnızca değişince güncelleniyor. |

Ek olarak **yörünge silahı** eklendi (bkz. BALANCE.md) ve ayrışma kuvveti yarıçapla
tutarlı hale getirildi: ayrışma 52px < yarıçap 74px, aksi halde silah hiçbir rakibe
ulaşamıyordu (test bunu yakaladı).

### Bumerang turu (görsel şölen): havuzlanan her şey, kare başına sıfır tahsis

- Mermi kuyrukları havuzdan: mermi başına 2 iz parçası oyun başında üretilir,
  `syncBullets` içinde yalnızca konum/boy/alpha güncellenir.
- Namlu parlaması teleport tespitiyle çalışır: havuz yuvası >240px "ışınlanırsa"
  taze mermi demektir, tek bir `fx.burst(3 partikül)` çıkar.
- Can halkası + rozetler her karede yeniden çizilir ama nesne üretilmez
  (`hpRing.clear()` + yay; rozetlerde metin yalnızca değişince atanır).
- Hediye kuyruğu: fırtınada kartlar 3,6sn arayla sırayla; kuyruk en fazla 8,
  fazlası düşer (boss kartı öne geçer). Kart + isim şeridi sayısı sınırlı kalır.
