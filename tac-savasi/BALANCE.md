# Balance sheet (all from config.json)

| system | value |
|---|---|
| Avatar | 100 HP, 10 dmg, 55 px/s, fire 0.55s, range 190px, bullet 260 px/s; each fighter orbits the castle on its own ring (r 120-420) so 60 avatars stay readable |
| Respawn | 3s, 50% HP, 2s shield |
| Damage mult cap | x3 (streak 5+1.1 / 15+1.25 / 30+1.5 / 50+1.6; FUERZA x1.5; DOBLE x2; mutator x2) |
| Scores | kill +10, monster +3, boss +50; **x2 during Gold Rain**; the `goldrain` mutator additionally **doubles monster points** (4x combined). Live table = score, then kills, then damage |
| Streaks | 5 ÇİFT/DOBLE, 15 DURDURULAMAZ/IMPARABLE, 30 EFSANE/LEYENDA, 50 MİTİK/MÍTICO; 20+ every kill shows RACHA xN |
| Cut streak ≥4 | announce + DOBLE 15s to killer |
| Power-ups 15s | FUERZA +50% dmg, VELOCIDAD x1.7, **AURA DE VENENO 8 dmg / 0.5s within 26px**, CURACIÓN +10HP/s, DOBLE x2 |
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

Telemetry CSV per match:
`match,viewers,gifts(T1/..T5),goalFillSec,mercyRevives,bossKillSec,avgWatchSec`
(localStorage `tac-telemetry`; console button downloads it; server writes `data/telemetry.csv`).
`avgWatchSec` counts a viewer for every second they are within 90s of their last event —
a close proxy for TikTok's own engagement window.
