#!/usr/bin/env bash
# Ekran yakalama: CAPTURE_URL + CAPTURE_DIR ile masaüstü/mobile çekim.
# Kendi tarayıcısını açıp kapatır; uygulamayı çalışır durumda bırakır.
# Çıkış: 0 ok; 75 geçici gezinme/tarayıcı altyapı hatası; 1 betik/render hatası.
set -euo pipefail
cd "$(dirname "$0")"

/usr/bin/time -p node scripts/capture-app.mjs
