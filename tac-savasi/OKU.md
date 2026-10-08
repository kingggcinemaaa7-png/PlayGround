# Taç Savaşı — OKU (Türkçe)

1080×1920 dikey PixiJS oyunu. İzleyiciler otomatik dövüşçü olur; hediye/beğeni/yorum/takip oyunu sürükler.

## Hızlı başlat (Windows)

```bat
start.bat
```
- Bağımlılıkları kurar, köprüyü (`ws://localhost:8081`, deneme modu) + oyunu (`http://localhost:3002`) başlatır.
- Bu adresi tarayıcıda açıp **TikTok LIVE Studio** ile paylaş (dikey 1080×1920).

Test adresleri:
- `http://localhost:3002/?mock=1` — oyun içi deneme paneli (katılım, hediye yağmuru, boss, merhamet, gelgit)
- `http://localhost:3002/?duration=90&locale=tr-TR` — 90 sn Türkçe maç
- `http://localhost:3002/?duration=300&locale=es-MX` — 5 dk Meksika İspanyolcası

## Yönetim konsolu (F1)

Açılışta sağda açılır; **oyun tuvalinin dışındadır**, yani TikTok kaydına girmez.
`F1` ile aç/kapa, `?clean=1` ile tam ekran moduna geç.

- **Köprü:** TikTok WS adresi + Bağlan, bağlantı durumu noktası
- **Yayın:** Duraklat · Otomatik hediye · Dil (es-MX/es-ES/tr-TR/en) · Çift dil · Kamera şeridi (test deseni de var)
- **Ses:** Genel / Müzik / Efekt kaydırıcıları, Sessiz (**M**)
- **Maç:** 1:30 / 5:00 / 25:00 · Yeni maç · sahne atla (Oyun/Bitiş/Tablo/Ödüller/Podyum/İntro)
- **Olaylar:** BOSS · Gelgit · Fırtına · Altın Yağmur · **Güvenli bölge** (çakışma kontrolü) · HUD bilgi · +1/+10/+50 izleyici
- **Hediye:** T1..T5 enjeksiyonu ve hediye fırtınası
- **Komutlar:** !kalkan !fuego !responde · 10 beğeni · serbest yazı (Enter)
- **Veri:** Telemetri CSV indir · Sıralamayı sil · canlı FPS/bellek/izleyici bilgisi

## Komutlar (diller arası çalışır)

| komut | etki | bekleme |
|---|---|---|
| `!kalkan` / `!escudo` / `!shield` | 10 sn kalkan | 20 sn |
| `!ateş` / `!fuego` / `!fire` | 12 mermilik halka | 10 sn |
| `!cevap` / `!responde` / `!respond` | merhamette diriltir (veya hediye gönder) | — |
| `!deleteme` | verilerimi sil | — |

## Hediye kademeleri (elmas)

T1 1–4: +30 HP, +1 seri • T2 5–49: +5 seri, hız, rastgele güç • T3 50–199: kalkan, çift hasar, güç •
T4 200–999: METEOR (90px, 60 hasar) + kahraman kartı • T5 1000+: SU TORNADOSU + kahraman kartı.
10 sn içindeki hediyeler kombo çarplanı ×1/1.5/2/3 verir.

## Döngü

Giriş 3 sn → Maç (varsayılan 25:00; 1:30/5:00 hazır) → Bitiş 10 sn → Tablo → Ödüller 8 sn → Podyum 7 sn → yeni maç. Boş ekran yok.

## Terimler

MAÇ/PARTIDA • SERİ/RACHA • TAÇ/CORONA (Türkçede asla "korona" değil) • KALE/CASTILLO • ÖDÜLLER/PREMIOS • İLK 3/TOP 3.
