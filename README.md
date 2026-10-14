# Kapadokya Beat Vadisi — 3D Desktop Edition

Profesyonel 3D masaüstü ritim/etkileşim oyunu. Referans konsept: gün batımında
Kapadokya'da dev bir festival — mağara evli peribacaları, balon filosu, lazer
ışınları, 1000+ kişilik arena ve DJ kürsüsü.

> Teknik tasarım belgesi: `Kapadokya_Beat_Vadisi_Geliştirici_Teslim.md`
> (TikTok LIVE şov sisteminin tam şartnamesi — bu 3B sürüm §5–§11 oyun
> sistemlerini birebir uygular.)

## Çalıştırma

```sh
npm install
npm run dev      # geliştirme (http://localhost:3000)
npm run build    # üretim çıktısı → dist/
```

`start.sh` çalışma ortamında otomatik kurulur: bağımlılıkları kurar, `vite build`
çalıştırır ve `dist/` klasörünü statik olarak sunar.

## Kontroller

| Girdi | Eylem |
|---|---|
| Sürükle (fare) | 360° döndür — yatay tam tur, dikey ±88° (gökyüzü dahil) |
| WASD / Q / E + tekerlek | Serbest uçuş (konum + hız), tekerlek hız ayarı |
| Çift tık | Serbest uçuş moduna geç |
| 1–7 | Hediye gönder (Gül → Efsane Taç; hype + puan + streak) |
| Space | DROP (hype ≥ 100 ise) |
| D | Dans düellosu |
| C | Kamera modu: Yörünge → Sinematik → Serbest (360°) |
| G | Gökyüzüne bak (balonları göster) |
| R | Sahneye dön |
| OBS 9:16 butonu | TikTok dikey yayın kadrajı (yan paneller gizlenir) |

## Mimari

```
src/
├── main.js        # motor: render döngüsü, oyun kuralları, HUD, ışık animasyonu
├── world.js       # festival dünyası: sahne, arena, kaya kaleleri, lazerler
├── rock.js        # jeolojik peribacası üreteci (aşınmış gövde, kask şapka, petek pencere)
├── textures.js    # prosedürel PBR doku fabrikası (albedo/normal/roughness/AO)
├── camera.js      # TourCamera: yörünge + sinematik + serbest uçuş
├── crowd-pack.js  # 100 rigged dansçı yöneticisi (bağımsız animasyon mikserleri)
├── particles.js   # havuzlanmış parçacık sistemi (konfeti/yıldız/ateş/rave)
├── assets.js      # GLB+FBX varlık hattı: PBR normalize, filigran temizliği, boy normalize
├── audio.js       # sentez müzik + SFX + TTS ducking
└── state.js       # spec §6–§9: config/giftmap, streak/repeatEnd, cooldown, AI-runner
config/
├── config.json    # tier eşikleri, hype/streak/cooldown, AI parametreleri
└── giftmap.json   # hediye ID → oyun etkisi eşlemesi
public/models/    # GLB/FBX varlıklar + attribution yan dosyaları
```

## Varlık hattı (GLB + FBX)

`public/models/` içine `.glb`, `.gltf` veya `.fbx` bırakmak yeterlidir:

1. **Yükle** — `GLTFLoader` / `FBXLoader` (`src/assets.js:loadAsset`)
2. **PBR'ya yükselt** — unlit/Phong materyaller `MeshStandardMaterial` olur
   (`finalizeAsset`); boy birimleri cm/metre karışıklığı `fitToHeight` ile
   gerçek metreye normalize edilir
3. **Temizle** — Sketchfab zemin/filigran plakaları `stripGroundPlanes` ile atılır
4. **Klonla** — rigli karakterler `SkeletonUtils.clone` ile kendi iskeletlerini
   alır (paylaşımlı iskelet çökmesini önler)
5. **Künye** — her modelin yanındaki `.glb.attribution.json` oyundaki
   "Künye / Lisans" panelinde gösterilir

Kayıtlı modeller (lisanslarıyla birlikte oyunun künye panelinde de görünür):

| Dosya | Kaynak | Lisans |
|---|---|---|
| `dj.glb` (DJ) | Christian Camelo | CC Attribution |
| `duellocu.glb` (düello) | Muhammad | CC Attribution |
| `balloon.glb` (balon) | Styro | CC Attribution |
| `dance_hype.glb`, `dance_river.glb`, `dance_african.glb`, `dance_floss.glb`, `dance_floss_m.glb`, `dance_salsa.glb` (6 dans klibi) | Denys Almaral | Free Standard |

Dansçılar donanımda **100**, yazılım render'da **26** gerçek rigli karakter
olarak sahnelenir; uzak kalabalık instancing ile binlerce kişiye genişletilir.

## Oyun sistemleri (şartname karşılığı)

| Şartname | Uygulama |
|---|---|
| §6 yapılandırma sözleşmesi | `config.json` + `giftmap.json`, tek kaynak (`state.js`) |
| 7 katmanlı sadakat merdiveni | `tierForScore` — puan → tier, plate hiyerarşisi + liderlik |
| §8 streak / repeatEnd | `StreakTracker` — 5 sn pencere, ×3/×5/×10 combo çarpanı |
| §8 cooldown | `CooldownManager` — DROP 30 sn, Yıldız 45 sn, Düello 60 sn… |
| §9 AI show-runner | `LocalShowRunner` — hype+cooldown+tekrarsızlık ile olay seçimi (çevrimdışı graceful degradation) |
| §9.7 TTS ducking | `AudioBus.duckSpeak` — müzik %30'a iner, konuşma bitince döner |
| §10 gizli anahtar yok | Hiçbir `.ts/.js` dosyasında API anahtarı yok; ses tamamen sentezlenir |
| §11 performans bütçesi | Otomatik kalite: yazılım render tespiti + FPS<25'te kademeli düşüş (parçacık → kalabalık → ışık) |

## Performans notları

- Gerçek GPU'larda: gölgeler, 4.000 parçacık, 15 kaya kalesi, 100 dansçı, bloom.
- Yazılım render'da (SwiftShader/llvmpipe): gölgeler kapalı, 900 parçacık,
  26 dansçı, ışıklar azaltılmış — sahne kararlı ~15–20 fps.
- Uzun oturumlarda WebGL bağlam kaybı olursa otomatik kurtarma dinleyicisi
  devrededir; oyun durumu (skor/tier) korunur.

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/kingggcinemaaa7-png/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/kingggcinemaaa7-png/PlayGround)

- 🎮 [Open the project](https://omgithub.com/kingggcinemaaa7-png/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=kingggcinemaaa7-png%2FPlayGround).
- 💻 [Explore the source](https://github.com/kingggcinemaaa7-png/PlayGround).
- 🛠️ [Check build runs](https://github.com/kingggcinemaaa7-png/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/kingggcinemaaa7-png/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/kingggcinemaaa7-png).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->
