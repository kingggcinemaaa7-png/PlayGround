# Kapadokya Beat Vadisi — FAZ 0 Teslim

Master Plan 2.0 §12 FAZ 0: monorepo iskeleti, olay/komut/config şemaları, simülatör,
lisans kontrol listesi, varsayılan config.

## Çalıştırma (tek tık)

```bash
npm install
BRIDGE_PORT=8081 npm run bridge      # köprü + oyun + panel
# oyun (OBS tarayıcı kaynağı): http://127.0.0.1:8081/game  (1080x1920)
# panel:                       http://127.0.0.1:8081/admin
npm run sim                      # sahte yayın (3 dk senaryosu)
npm test                         # birim testleri
node scripts/e2e-faz0.mjs        # kabul: simülatör hattan geçiyor mu
```

## Kabul ölçütü (FAZ 0)
- [x] `node scripts/e2e-faz0.mjs` yeşil: ingest → state/leaderboard/moon/dansçı deltası.
- [x] `npm test` yeşil: eşleştirme/normalizasyon, eşik, streak, satır kırma.
- [x] Köprü kapalıyken oyun "sabit ama yaşayan" kalır, kopunca otomatik bağlanır.

## Notlar
- Zip/BeatStage varlıkları bu depoda YOKTU; FAZ 0 varlık gerektirmez.
  Gerçek peri bacası/DJ/mocap modelleri FAZ 2'de `packages/assets/` altına inecek.
- Kalıcılık: `data/vadi.sqlite` (node:sqlite, harici derleme yok).
- Anahtarlar: sadece `config/.env` (örnek: `config/.env.example`). Koda gömme YOK.
