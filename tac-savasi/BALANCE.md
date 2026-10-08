# Balance sheet (all from config.json)

| system | value |
|---|---|
| Avatar | 100 HP, 10 dmg, 55 px/s, fire 0.55s, range 190px, bullet 260 px/s; each fighter orbits the castle on its own ring (r 120-420) so 60 avatars stay readable |
| Clone | 50 HP, follows owner at 70px orbit, fires every 0.7s at 70% owner damage, 12s or until owner dies; untargetable; max 24 |
| Respawn | 3s, 50% HP, 2s shield |
| Damage mult cap | x3 (streak 5+1.1 / 15+1.25 / 30+1.5 / 50+1.6; FUERZA x1.5; DOBLE x2; mutator x2) |
| Scores | kill +10, monster +3, boss +50; **x2 during Gold Rain**; the `goldrain` mutator additionally **doubles monster points** (4x combined). Live table = score, then kills, then damage |
| Streaks | 5 ÇİFT/DOBLE, 15 DURDURULAMAZ/IMPARABLE, 30 EFSANE/LEYENDA, 50 MİTİK/MÍTICO; 20+ every kill shows RACHA xN |
| Cut streak ≥4 | announce + DOBLE 15s to killer |
| Power-ups 15s | FUERZA +50% dmg, VELOCIDAD x1.7, AURA DE VENENO 8 dmg / 0.5s within 26px, CURACIÓN +10HP/s, DOBLE x2 |
| NEW powers | **ÖFKE/FURIA 8s**: x2 damage, +25% speed · **HAYALET/FANTASMA 4s**: untargetable (bullets pass through), +40% speed · **VAMPİR/VAMPIRO 10s**: heals 35% of damage dealt · **DEV/GIGANTE 8s**: 1.6x size, +100 temp HP, x1.5 damage · **YANSITMA/ESPEJO 6s**: reflects bullets back at +20% (max 2 bounces) · **ZİNCİR/CADENA 10s**: kills zap 3 nearest enemies for 60% · **DONMA/HELADA**: instant frost nova, freezes 130px for 3s · **GÖLGE KLON**: 12s mirror fighter at 70% damage, kills credit the owner |
| Damage cap | still **x3** — rage/giant/streak stack into the cap, never past it |
| Gift changes | T2 pool now draws from all 12 powers · T3 has 50% DONMA · T4 also grants ÖFKE 8s · T5 also grants HAYALET 4s + spawns a GÖLGE KLON · cut-the-streak now gives DOBLE **+ YANSITMA 6s** · boss 40% drops draw from the full pool · lightning strikes grant a random power 30% of the time |
| Free command | `!güç` / `!poder` / `!power` (works in every language, 1-letter typo tolerance, Turkish ı/İ aware): random T2-pool power, **30s cooldown**, alive only |
| Mercy | death with streak≥10 → 10s `!responde`/gift → 50% HP else 25% HP; dead gifts queued |
| Gifts | T1 1–4 / T2 5–49 / T3 50–199 / T4 200–999 meteor 90px 60dmg / T5 1000+ tornado 75px 15dmg×3 ticks; combo ×1/1.5/2/3 in 10s |
| Likes | every 10 → 5s speed boost |
| Follow | +1 streak + badge |
| Boss | Kraken/Cangrejo alternate @10/30/50/70/88%; HP 1200+60/fighter (crab x1.25); special 7s **ATRAPADA** trap 4s (announced, shake, hit-stop 90ms); contact 15dps; 40% fighters get power on death; death = +50 score, hero card |
| Monsters | 6 every 20s → castle 800HP; **castle falls → shake + flash + announcement, HP reset, wave cleared** |
| Tide 48s/14s | top half water, avatars ×0.55 |
| Storm 55s/9s | lightning 0.7s, monsters dmg, random speed gift, flash |
| Mutators | double / goldrain (monster pts x2) / speed (×1.3), one per match |
| Goal meter | start 500, ×1.5 each fill → 10s GOLD RAIN (kill score x2) |
| Commands CD | shield 10s dur/20s cd; fire-ring 12 bullets/10s cd |
| Level | LEVEL UP +1/+2 (max 5): kalıcı +25 maxHp, seviye başına +%12 hasar; tavan x3 dahil |
| Absorb | ABSORB 10s: gelen hasar ×0.5, diğer yarısı cana dönüşür |
| Skill banners | her isimli skill büyük çizgi-roman başlığı + sinematik (JOIN 6sn kısma) |

Telemetry CSV per match:
`match,viewers,gifts(T1/..T5),goalFillSec,mercyRevives,bossKillSec,avgWatchSec`
(localStorage `tac-telemetry`; console button downloads it; server writes `data/telemetry.csv`).
`avgWatchSec` counts a viewer for every second they are within 90s of their last event —
a close proxy for TikTok's own engagement window.


## Yörünge silahı (2026-10, bumerang + zincir)

Profil fotoğrafının etrafında dönen bumerang paletleri + her paletin arkasında
9 toplu ışık zinciri. Varsayılan: **2 palet, 74px yarıçap, 6 hasar, 0.75sn bekleme**
(config: `orbit`).

- Dönüş hızı: öfkede ×1.5, devde ×1.35 ve yarıçap ×1.5.
- Bekleme süresi oyuncu başına: her palet için ayrı değil, oyuncu başına tek sayaç.
- Paletler **hasar tavanına (x3) tabidir**.
- 30+ hasar veren her vuruş arenada **BOOM!** yazısı + şok dalgası çıkarır.
- ÖNEMLİ: oyuncuların ayrışma mesafesi (52px) yarıçaptan (74px) **küçük olmalıdır**;
  aksi halde ayrışma kuvveti rakibi paletlerin ulaşamayacağı uzağa iter ve silah işlemez.
- Hediye kartları kuyrukludur: fırtınada en fazla 8 kart bekler, 3,6sn arayla sırayla
  görünür; boss kartı öne geçer.
