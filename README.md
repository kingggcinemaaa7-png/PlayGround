# 3D Çay Ocağı Kaosu: Mahalle Meydanı v3.0

TikTok Live etkinliklerini Three.js tabanlı mahalle meydanına bağlayan, 9:16 ve 16:9 oynanış modları destekleyen Türkçe interaktif oyun.

## Özellikler

- TikTok canlı bağlantısı: sohbet, beğeni, hediye, üye katılımı ve `repeatEnd` desteği
- Socket.IO canlı yayın akışı; bağlantı yokken BroadcastChannel/localStorage yedekleme
- 5 dakikalık tur, kaos seviyesi ve kazanma koşulları
- TikTok kullanıcı avatarı proxy/cache sistemi
- Karanlık Türkçe yönetim paneli
- Chat/hediye eylem eşlemeleri ve simülasyon araçları
- Prosedürel Web Audio ses motoru
- Blender 4.x/5.x ile üretilen GLB mahalle, karakter ve nesne varlıkları

## Kurulum

Node.js 20 veya üzeri gerekir:

```bash
npm install
npm start
```

Oyun: <http://localhost:3000/>  
Yönetim paneli: <http://localhost:3000/admin.html>

Geliştirme sırasında otomatik yeniden başlatma:

```bash
npm run dev
```

## TikTok Live kullanımı

1. `/admin.html` sayfasını açın.
2. **TikTok Bağlantısı** bölümüne kullanıcı adını girin.
3. **Bağlan** düğmesine basın.
4. Canlı yayına sohbet, beğeni veya hediye geldiğinde olaylar oyun ve panele aktarılır.

Ayarlar `config/settings.json` içinde saklanır. Sunucu çalışma dizini dışında taşınırsa dosyanın yazılabilir olduğundan emin olun.

### Hediye eşlemeleri

Varsayılan jeton aralıkları:

- 1–9: Sabırsız müşteri
- 10–29: Okey taşı kavgası
- 30–99: Tost/çay fırlatma
- 100–499: Zabıta baskını
- 500–999: Kaos yayılımı
- 1000+: Semaver mutinyası

Eşlemeler admin panelinden düzenlenebilir; özel hediye adı veya ID eşleşmeleri jeton aralıklarından önceliklidir.

## Oyun kontrolleri

- `A` / `Sol Ok`: Çaycıyı sola hareket ettirir
- `D` / `Sağ Ok`: Çaycıyı sağa hareket ettirir
- `W` / `Yukarı Ok`: Tezgâha yaklaşır
- `S` / `Aşağı Ok`: Tezgâhtan uzaklaşır
- `Boşluk`: Çay servis eder
- `P`: Oyun turunu başlatır/durdurur
- `1`: 16:9 mod
- `2`: 9:16 mod
- `M`: Sesi aç/kapat

## Blender varlıkları

Blender 4.x veya 5.x kurulu ve `blender` komutu PATH'te olmalıdır:

```bash
npm run blender
```

Alternatif olarak:

```bash
BLENDER=/absolute/path/to/blender npm run blender
```

Exporter dosyaları:

- `blender/export_models.py`: Eski semaver, bardak, masa ve sokak seti
- `blender/mahalle_meydani.py`: Meydan sahnesi
- `blender/karakterler.py`: Çaycı, müşteri, zabıta ve muhtar
- `blender/objeler.py`: Bardak, okey taşı, tost ve altın tepsi

Üretilen dosyalar `public/models/` altındadır. `public/models/manifest.json` dosya, boyut ve lisans bilgisini tutar. Tüm prosedürel varlıklar CC0-1.0 lisansına uygundur.

## Test ve doğrulama

```bash
npm test
node --check server.js
node --check public/js/game.js
node --check public/js/admin.js
node --check public/js/shared/actions.js
```

## API örnekleri

```text
GET  /api/status
GET  /api/settings
POST /api/settings
POST /api/tiktok/connect
POST /api/tiktok/disconnect
GET  /api/gifts
POST /api/simulate
GET  /api/avatar?url=<TikTok-CDN-URL>
```

## Mimari

- `server.js`: Express, Socket.IO ve TikTok Live bağlantısı
- `public/js/game.js`: Three.js oyun döngüsü
- `public/js/admin.js`: Yönetim paneli
- `public/js/shared/actions.js`: Sunucu ve istemci için ortak eylem kuralları
- `public/js/sound_engine.js`: Prosedürel Web Audio
- `blender/common.py`: Blender yardımcıları ve manifest üretimi
