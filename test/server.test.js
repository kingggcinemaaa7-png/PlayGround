const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');

test('konfigurasyon dosyalari mevcut', () => {
  for (const p of ['config/gifts_mapping.json','data/leaderboard.json','data/tiktok_gifts_cache.json']) {
    assert.ok(fs.existsSync(p), p);
  }
});

test('temel public dosyalari mevcut', () => {
  for (const p of ['public/index.html','public/admin.html','public/js/game.js','public/js/sound_engine.js','public/js/admin.js']) {
    assert.ok(fs.existsSync(p), p);
  }
});

test('blender betikleri mevcut', () => {
  for (const p of ['fetih_yolu','nefer','at','otag_taht','mehter_mancinik','sadrazam_muhur']) {
    assert.ok(fs.existsSync(`blender/${p}.py`), p);
  }
});
