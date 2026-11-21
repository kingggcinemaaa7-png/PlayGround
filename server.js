const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
let TikTokLiveConnection;
try { ({ WebcastPushConnection: TikTokLiveConnection } = require('tiktok-live-connector')); } catch (e) {}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA = path.join(__dirname, 'data');
const CONFIG = path.join(__dirname, 'config/gifts_mapping.json');
const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
const writeJson = (p, value) => fs.writeFileSync(p, JSON.stringify(value, null, 2));

let live = null;
let liveStatus = { state: 'Yayın bekleniyor', message: 'Hazır' };
let totals = { likes: 0, gifts: 0, viewers: 0 };
let settings = { volume: 70, muted: false, safeZones: false, aspect: '16:9' };

/* ---------- 2026 katalog tohumu (canlı bağlantı gelince TikTok listesiyle değişir) ---------- */
const SEED_GIFTS = [
  ['Gül', 1, '#d94f6a', '🌹'], ['Kalp', 5, '#e5484d', '♥'], ['Şapka', 10, '#b07a3a', '🎩'],
  ['Davul', 30, '#9c5b2a', '🥁'], ['Donut', 50, '#d98c4a', '🍩'], ['Corgi', 100, '#b98a5c', '🐕'],
  ['Aslan', 500, '#d8a53a', '🦁'], ['Evren', 1000, '#5b7bd9', '🌌'], ['Gül Demeti', 20, '#c9496b', '💐'],
  ['Kale', 299, '#8a8375', '🏰'], ['Taç', 199, '#d8b45a', '👑'], ['Uçan Kalp', 99, '#d94f6a', '💗'],
  ['Ayna', 149, '#7fa8c9', '🪞'], ['Kılıç', 349, '#9aa6b0', '⚔'], ['At Nalı', 75, '#b08a4a', '🧲'],
  ['Mücevher', 888, '#6ad0c0', '💎']
].map(([name, diamonds, color, glyph]) => ({
  id: String(name.toLowerCase().replace(/[^a-z0-9]+/g, '_')),
  name, diamonds,
  image: 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><radialGradient id="g"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#1a1410"/></radialGradient></defs><circle cx="32" cy="32" r="30" fill="url(#g)" stroke="#d8ad5a" stroke-width="2"/><text x="32" y="43" font-size="30" text-anchor="middle">${glyph}</text></svg>`
  )
}));
function seedGifts() {
  const p = path.join(DATA, 'tiktok_gifts_cache.json');
  const current = readJson(p, []);
  if (!Array.isArray(current) || current.length === 0) writeJson(p, SEED_GIFTS);
}
seedGifts();

/* ---------- API ---------- */
app.get('/api/state', (req, res) => res.json({
  status: liveStatus, totals, settings,
  leaderboard: readJson(path.join(DATA, 'leaderboard.json'), []),
  mapping: readJson(CONFIG, {})
}));
app.get('/api/gifts', (req, res) => res.json(readJson(path.join(DATA, 'tiktok_gifts_cache.json'), [])));
app.post('/api/connect', (req, res) => { connect(req.body?.username); res.json({ ok: true }); });
app.post('/api/disconnect', (req, res) => {
  try { live?.disconnect?.(); } catch {}
  live = null; setStatus('Yayın bekleniyor', 'Bağlantı kesildi'); res.json({ ok: true });
});
app.post('/api/mapping', (req, res) => {
  const mapping = req.body && typeof req.body === 'object' ? req.body : {};
  writeJson(CONFIG, mapping); io.emit('mapping', mapping); res.json({ ok: true });
});
app.post('/api/settings', (req, res) => {
  settings = { ...settings, ...(req.body || {}) };
  io.emit('settings', settings); res.json({ ok: true, settings });
});
app.post('/api/simulate', (req, res) => {
  const body = req.body || {};
  if (body.action === 'RESET_TURN') { resetTurn(); return res.json({ ok: true }); }
  handleAction({ ...body, type: 'simulate' }, true);
  res.json({ ok: true });
});
app.post('/api/reset', (req, res) => { resetTurn(); res.json({ ok: true }); });

/* ---------- Profil resmi proxy + bellek içi önbellek ---------- */
const avatarCache = new Map();
app.get('/api/avatar', async (req, res) => {
  const url = String(req.query.url || '');
  if (!/^https:\/\//.test(url)) return res.status(400).json({ error: 'invalid url' });
  const hit = avatarCache.get(url);
  if (hit && Date.now() - hit.at < 3600_000) {
    res.set('Content-Type', hit.type); res.set('Cache-Control', 'public,max-age=86400'); return res.end(hit.buf);
  }
  try {
    const upstream = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) return res.sendStatus(404);
    const buf = Buffer.from(await upstream.arrayBuffer());
    const type = upstream.headers.get('content-type') || 'image/jpeg';
    avatarCache.set(url, { buf, type, at: Date.now() });
    if (avatarCache.size > 120) avatarCache.delete(avatarCache.keys().next().value);
    res.set('Content-Type', type); res.set('Cache-Control', 'public,max-age=86400'); res.end(buf);
  } catch { res.sendStatus(502); }
});

/* ---------- TikTok bağlantısı ---------- */
function setStatus(state, message) {
  liveStatus = { state, message };
  io.emit('status', liveStatus);
  console.log(`[TikTok] ${state}: ${message}`);
}
async function connect(username) {
  if (!TikTokLiveConnection) return setStatus('Hata', 'tiktok-live-connector yüklenemedi');
  try { live?.disconnect?.(); } catch {}
  const clean = String(username || '').replace(/^@/, '').trim();
  if (!clean) return setStatus('Hata', 'Kullanıcı adı gerekli');
  setStatus('Yeniden bağlanıyor', `@${clean} aranıyor`);
  try {
    live = new TikTokLiveConnection(clean, { processInitialData: true, enableExtendedGiftInfo: true });
    live.connect().then(async () => {
      setStatus('Bağlandı', `@${clean} canlı yayına bağlandı`);
      try {
        const gifts = await live.getAvailableGifts();
        const arr = (gifts || []).map(g => ({
          id: String(g.giftId ?? g.id ?? ''),
          name: g.name || g.giftName || 'Hediye',
          diamonds: g.diamondCount ?? g.diamond ?? g.cost ?? 0,
          image: g.imageUrl || g.icon?.url || g.image?.url || ''
        })).filter(g => g.id);
        if (arr.length) {
          writeJson(path.join(DATA, 'tiktok_gifts_cache.json'), arr);
          io.emit('gifts', arr);
        }
      } catch (e) { console.error('[Katalog]', e.message); }
    }).catch(e => setStatus('Hata', e.message || 'Bağlantı başarısız'));

    live.on('chat', d => handleAction({ type: 'chat', uniqueId: d.uniqueId, nickname: d.nickname, profilePictureUrl: d.profilePictureUrl, comment: d.comment }));
    live.on('like', d => {
      totals.likes += d.likeCount || 1; io.emit('stats', totals);
      if (d.likeCount > 0) handleAction({ type: 'like', uniqueId: d.uniqueId, nickname: d.nickname, profilePictureUrl: d.profilePictureUrl });
    });
    live.on('member', d => handleAction({ type: 'member', uniqueId: d.uniqueId, nickname: d.nickname, profilePictureUrl: d.profilePictureUrl }));
    live.on('roomUser', d => { totals.viewers = d.viewerCount || 0; io.emit('stats', totals); });
    live.on('gift', d => {
      // Kombo hediyelerde yalnızca seri bittiğinde tek olay üret (çift sayımı önler).
      if (d.giftType === 1 && d.repeatEnd === false) return;
      const repeat = Math.max(1, d.repeatCount || 1);
      const diamonds = (d.diamondCount || d.gift?.diamondCount || 1) * repeat;
      totals.gifts += diamonds; io.emit('stats', totals);
      handleAction({
        type: 'gift', giftId: String(d.giftId || d.gift?.giftId || ''), repeatCount: repeat,
        uniqueId: d.uniqueId, nickname: d.nickname, profilePictureUrl: d.profilePictureUrl, diamonds
      });
    });
    live.on('disconnected', () => setStatus('Yayını bekliyor', 'Yayın kapandı; yeniden bağlanmayı bekliyor'));
  } catch (e) { setStatus('Hata', e.message); }
}

/* ---------- Aksiyon yönlendirme ---------- */
const RANK_BY_ACTION = {
  RANK_SIPAHI: 'Sipahi', RANK_SANCAKTAR: 'Sancaktar', RANK_CAVALRY: 'Akıncı', RANK_VIZIER: 'Vezir'
};
function handleAction(d, simulation = false) {
  const mapping = readJson(CONFIG, {});
  let action = d.action || null;
  if (!action) {
    if (d.type === 'chat' && /^\s*!kat[iı]l/i.test(d.comment || '')) action = 'JOIN_MARCH';
    else if (d.type === 'like') action = mapping.likeAction || 'JOIN_MARCH';
    else if (d.type === 'member') action = 'JOIN_MARCH';
    else if (d.type === 'gift') {
      action = mapping[d.giftId];
      if (!action) {
        const gems = d.diamonds || 0;
        action = gems >= 500 ? 'RANK_VIZIER' : gems >= 300 ? 'EVENT_SEAL' : gems >= 100 ? 'RANK_CAVALRY'
          : gems >= 50 ? 'EVENT_CATAPULT' : gems >= 30 ? 'EVENT_MEHTER' : gems >= 10 ? 'RANK_SANCAKTAR'
            : gems >= 1 ? 'RANK_SIPAHI' : 'JOIN_MARCH';
      }
    }
  }
  if (!action || action === 'RESET_TURN') return;
  const event = {
    ...d, action,
    nickname: d.nickname || d.uniqueId || 'Misafir',
    uniqueId: String(d.uniqueId || d.nickname || `guest-${Date.now()}`),
    avatar: d.profilePictureUrl || d.avatar || ''
  };
  io.emit('gameAction', event);
  console.log('[Oyun]', event.action, event.nickname);
  if (d.type === 'chat' || d.type === 'member' || d.type === 'gift' || simulation) savePlayer(event);
}
function savePlayer(e) {
  const p = path.join(DATA, 'leaderboard.json');
  let list = readJson(p, []);
  if (!Array.isArray(list)) list = [];
  let rec = list.find(v => v.uniqueId === e.uniqueId);
  if (!rec) { rec = { uniqueId: e.uniqueId, nickname: e.nickname, avatar: e.avatar, rank: 'Nefer', score: 0 }; list.push(rec); }
  rec.nickname = e.nickname || rec.nickname;
  rec.avatar = e.avatar || rec.avatar;
  if (RANK_BY_ACTION[e.action]) rec.rank = RANK_BY_ACTION[e.action];
  if (e.action?.startsWith('EVENT') || e.action?.startsWith('RANK')) rec.score += e.diamonds || 100;
  else rec.score += 1;
  list = list.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 200);
  writeJson(p, list);
  io.emit('leaderboard', list);
}
function resetTurn() {
  writeJson(path.join(DATA, 'leaderboard.json'), []);
  totals = { likes: 0, gifts: 0, viewers: totals.viewers };
  io.emit('leaderboard', []);
  io.emit('stats', totals);
  io.emit('resetTurn');
  console.log('[Tur] Yeni tur başlatıldı');
}

/* ---------- Socket.IO ---------- */
io.on('connection', socket => {
  socket.emit('status', liveStatus);
  socket.emit('stats', totals);
  socket.emit('settings', settings);
  socket.emit('leaderboard', readJson(path.join(DATA, 'leaderboard.json'), []));
  socket.emit('mapping', readJson(CONFIG, {}));
  socket.emit('gifts', readJson(path.join(DATA, 'tiktok_gifts_cache.json'), []));
  socket.on('settings', s => { settings = { ...settings, ...(s || {}) }; io.emit('settings', settings); });
  socket.on('aspect', a => { settings.aspect = a === '9:16' ? '9:16' : '16:9'; io.emit('settings', { aspect: settings.aspect }); });
});

setStatus('Yayın bekleniyor', 'Hazır');
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Fetih Korteji http://localhost:${PORT}`));
