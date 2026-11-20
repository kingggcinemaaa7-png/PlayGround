#!/usr/bin/env bash
# Regenerate every procedural GLB asset used by the project.
# Requires Blender 4.x or newer on PATH (or BLENDER=/path/to/blender).
set -euo pipefail
cd "$(dirname "$0")/.."

BLENDER_BIN="${BLENDER:-blender}"
if ! command -v "$BLENDER_BIN" >/dev/null 2>&1; then
  echo "Blender bulunamadı. Kur: https://www.blender.org/download/ veya BLENDER=/yol/blender npm run blender" >&2
  exit 1
fi

mkdir -p public/models
"$BLENDER_BIN" --background --factory-startup --python blender/export_models.py
"$BLENDER_BIN" --background --factory-startup --python blender/mahalle_meydani.py
"$BLENDER_BIN" --background --factory-startup --python blender/karakterler.py
"$BLENDER_BIN" --background --factory-startup --python blender/objeler.py

missing=0
for model in mahalle_meydani cayci musteri zabita muhtar cay_bardagi okey_tasi tost altin_tepsi semaver okey_masasi uyuyan_kedi cay_tepsisi sokak_lambasi; do
  if [[ ! -s "public/models/$model.glb" ]]; then
    echo "Eksik model: public/models/$model.glb" >&2
    missing=1
  fi
done
if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

echo "✅ public/models içinde $(find public/models -name '*.glb' | wc -l | tr -d ' ') GLB hazır."
