# Fetih Korteji — TikTok Live 3D Yayın Oyunu

Express, Socket.IO, TikTok Live Connector ve Three.js ile çalışan 9:16 / 16:9 Osmanlı-Selçuklu canlı yayın sahnesi.

## Çalıştırma

```bash
npm install
npm start
```

- Oyun: `http://localhost:3000/`
- Yönetim paneli: `http://localhost:3000/admin.html`
- Varsayılan port `3000`, `PORT` ortam değişkeni ile değiştirilebilir.

## TikTok bağlantısı

Admin panelindeki kullanıcı adı alanına `@` olmadan yayıncı kullanıcı adını girin ve **Bağlan** düğmesine basın. Gerçek hediye kataloğu yayına bağlanınca `getAvailableGifts()` ile çekilir ve `data/tiktok_gifts_cache.json` dosyasına yazılır. Profil proxy endpoint'i:

`/api/avatar?url=<https://...>`

Server, gift olaylarında `giftType === 1` için `repeatEnd === false` durumlarını tekrar sayım olarak filtreler.

## Kontroller

- Oyun ekranında `F9`: 9:16 / 16:9 geçişi
- İlk kullanıcı tıklaması: Web Audio API'yi açar
- Admin: bağlantı, eşleştirme, ses, Safe-Zone, simülasyon ve sıralama

## Blender 4.x modelleri

```bash
npm run blender-assets
```

veya Blender'ta betiği çalıştırın:

```text
blender -b -P blender/build_all.py
```

Çıktılar `public/models/` klasöründedir: `fetih_yolu.glb`, `nefer.glb`, `at.glb`, `otag_taht.glb`, `mehter_davul.glb`, `mancinik.glb`, `sadrazam_muhur.glb`.

## Test

```bash
npm test
```

## Varsayım

TikTok'un 2026 gerçek kataloğu canlı oturum bağlandığında sunucu tarafından çekilir; oturum yokken admin, önbelleği veya varsayılan hediye akışını kullanır. Üç boyutlu sahne CDN Three.js üzerinden başlar ve ağ yoksa görsel önbelleğe alınmış boyutlarda kullanılabilir.
