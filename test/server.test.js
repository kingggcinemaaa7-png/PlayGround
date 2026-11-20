const assert=require('assert');const fs=require('fs');
assert(fs.existsSync('server.js'));assert(fs.existsSync('public/index.html'));assert(fs.existsSync('public/admin.html'));assert(fs.existsSync('public/js/game.js'));assert(fs.existsSync('public/js/sound_engine.js'));assert(fs.existsSync('config/gifts_mapping.json'));
const mapping=JSON.parse(fs.readFileSync('config/gifts_mapping.json','utf8'));assert(mapping.lion.action==='RANK_VIZIER');
for(const f of fs.readdirSync('blender').filter(f=>f.endsWith('.py'))) assert(fs.statSync(`blender/${f}`).isFile());
console.log('Temel proje testleri geçti');
