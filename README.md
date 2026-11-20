# Fetih Korteji — TikTok Live 3D Projesi (v2.2)

Canlı TikTok yayın verilerini `tiktok-live-connector` ile alan, Socket.IO üzerinden Three.js sahneye ve yönetim paneline taşıyan 9:16 / 16:9 Osmanlı-Selçuklu kortej oyunudur.

## Çalıştırma

```bash
npm install
npm start
```

- Oyun: `http://localhost:3002/`
- Yönetim: `http://localhost:3002/admin.html`
- Varsayılan port: `3002` (`PORT` ortam değişkeni ile değiştirilebilir)

## TikTok Bağlantısı

Yönetim panelindeki kullanıcı adı alanına canlı yayın sahibi kullanıcı adını girip **Bağlan** düğmesine basın. Hediye kataloğu bağlantı başarılı olduğunda `data/tiktok_gifts_cache.json` dosyasına yazılır. Paket ve API sürümleri `tiktok-live-connector`'ın resmi etkin sürümüne göre çalışır.

## Kontroller

- Oyun ekranında `F9`: 9:16 ↔ 16:9
- İlk tıklama: tarayıcı autoplay kuralı için Web Audio API'yi açar
- Yönetim ekranından canlı bağlanma kesme, eşleme, ses, safe-zone ve simülasyon yapılabilir

## Harici dosya gerektirmeyen sesler

`public/js/sound_engine.js`, MP3/WAV yerine Web Audio API osilatörleri, noise bufferları, filtreler ve reverb benzeri metalik kuyruklar üretir.

## Blender 4.x modelleri

Python betikleri `public/models/*.glb` klasörünü üretir:

```bash
blender -b --python blender/fetih_yolu.py
blender -b --python blender/nefer.py
blender -b --python blender/at.py
blender -b --python blender/otag_taht.py
blender -b --python blender/mehter_mancinik.py
blender -b --python blender/sadrazam_muhur.py
```

Hepsi bir toplu üretim için `npm run generate-models` scriptini kullanır. Blender yüklü değilse geçici modeller sahnede prosedürel üçgen/geometri ile çalışmaya devam eder.

## Performans varsayımları

- 150 oyuncuya kadar sıra önbelleği ve sahne nesne sınırı uygulanır.
- Askerler paylaşılan geometri/malzeme ile prosedürel olarak oluşturulur.
- Kamera court/subject/catapult/mehter state machine kullanır ve lerp ile yumuşak geçiş yapar.
- TikTok CDN avatarları `/api/avatar?url=...` sunucu proxy cache'i üzerinden yüklenir.

## Test

```bash
npm test
```

## Notlar

TikTok canlı WebSocket teslimatı ve yayın oturumunun bulunabilirliği hesabın/odanın TikTok tarafındaki erişilebilirliğine bağlıdır. Geliştirme ortamında liste ve simülasyon akışı oturumlardan bağımsız çalışır.
