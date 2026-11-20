const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

let TikTokLive;
try { ({ WebcastPushConnection: TikTokLive } = require('tiktok-live-connector')); }
catch (e) { console.warn('TikTok connector yüklenemedi:', e.message); }

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const ROOT = __dirname;
const PORT = process.env.PORT || 3002;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'public')));

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));

const giftsFile = path.join(ROOT, 'data/tiktok_gifts_cache.json');
const mappingFile = path.join(ROOT, 'config/gifts_mapping.json');
const leaderboardFile = path.join(ROOT, 'data/leaderboard.json');
for (const [file, value] of [[mappingFile, {}], [leaderboardFile, { players: [], stats: {} }]]) {
  if (!fs.existsSync(file)) writeJson(file, value);
}

let liveConnection = null;
let liveState = { status: 'Beklemede', username: null, viewerCount: 0, likes: 0, coins: 0 };

const avatarCache = new Map();
app.get('/api/avatar', async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https:\/\/(?:[^\s/]+\.)?(?:tiktokcdn\.com|tiktokcdn-us\.com)/i.test(url)) return res.status(400).end();
  if (avatarCache.has(url)) return res.type('png').send(avatarCache.get(url));
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Avatar HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    avatarCache.set(url, buffer);
    res.set('Cache-Control', 'public, max-age=86400').type(response.headers.get('content-type') || 'image/jpeg').send(buffer);
  } catch (error) { res.status(502).json({ error: 'Avatar indirilemedi' }); }
});

app.get('/api/status', (_, res) => res.json(liveState));
app.get('/api/gifts', (_, res) => res.json(readJson(giftsFile, [])));
app.get('/api/mappings', (_, res) => res.json(readJson(mappingFile, {})));
app.post('/api/mappings', (req, res) => {
  writeJson(mappingFile, req.body || {});
  io.emit('config:update', req.body);
  res.json({ ok: true });
});
app.get('/api/leaderboard', (_, res) => res.json(readJson(leaderboardFile, { players: [], stats: {} })));
app.post('/api/leaderboard', (req, res) => {
  writeJson(leaderboardFile, req.body);
  io.emit('leaderboard:update', req.body);
  res.json({ ok: true });
});

function setStatus(status, extra = {}) {
  liveState = { ...liveState, status, ...extra };
  io.emit('live:status', liveState);
  console.log('[TikTok Live]', liveState.status, liveState.username || '');
}

async function connectTikTok(username) {
  if (!TikTokLive) return setStatus('Hata', { error: 'tiktok-live-connector kurulu değil' });
  await disconnectTikTok(false);
  const clean = username.replace(/^@/, '').trim();
  if (!clean) return setStatus('Hata', { error: 'Kullanıcı adı gerekli' });
  liveState = { status: 'Bağlanıyor', username: clean, viewerCount: 0, likes: 0, coins: 0 };
  io.emit('live:status', liveState);

  liveConnection = new TikTokLive(clean, { processInitialData: false, enableExtendedGiftInfo: true, reconnectOnError: true, reconnectIntervalMs: 3000 });
  liveConnection.connect().then(async state => {
    setStatus('Bağlandı', { viewerCount: state?.roomInfo?.userCount || liveState.viewerCount });
    try {
      const gifts = await liveConnection.getAvailableGifts();
      const normalized = (gifts || []).map(g => ({ id: g.gift_id ?? g.id, name: g.name, diamond: g.diamond_count ?? g.diamondCost ?? g.diamond_count ?? 0, image: g.image?.url_list?.[0] || g.icon?.url_list?.[0] || g.image_url || g.icon_url || '' }));
      writeJson(giftsFile, normalized);
      io.emit('gifts:update', normalized);
      console.log(`[Hediye Kataloğu] ${normalized.length} hediye cache'lendi`);
    } catch (e) { console.warn('[Hediye Kataloğu]', e.message); }
  }).catch(error => setStatus('Hata/Yeniden Bağlanıyor', { error: error.message }));

  liveConnection.on('chat', data => io.emit('live:event', normalizeEvent('chat', data, data.comment)));
  liveConnection.on('like', data => {
    const count = data.likeCount || 1;
    liveState.likes += count;
    io.emit('live:stats', liveState);
    io.emit('live:event', normalizeEvent('like', data, `+${count} beğeni`));
  });
  liveConnection.on('member', data => io.emit('live:event', normalizeEvent('member', data, 'odaya katıldı')));
  liveConnection.on('gift', data => {
    if (data.giftType === 1 && data.repeatEnd === false) return;
    const coins = (data.repeatCount || 1) * (data.giftDiamondCount || data.diamondCount || data.gift?.diamond_count || 0);
    liveState.coins += coins;
    io.emit('live:stats', liveState);
    io.emit('live:event', normalizeEvent('gift', data, data.giftName || data.gift?.name || 'Hediye', coins));
  });
  liveConnection.on('roomUser', data => { liveState.viewerCount = data.viewerCount || data.userCount || liveState.viewerCount; io.emit('live:stats', liveState); });
  liveConnection.on('disconnected', () => setStatus('Bağlantı Kesildi'));
  liveConnection.on('error', error => setStatus('Hata/Yeniden Bağlanıyor', { error: error.message }));
}

function normalizeEvent(type, data, label, coins = 0) {
  const user = data.user || data.uniqueId || data.nickname || {};
  return {
    type, label, coins,
    uniqueId: data.uniqueId || user.uniqueId || user.unique_id || 'misafir',
    nickname: data.nickname || user.nickname || user.uniqueId || 'Misafir',
    profilePictureUrl: data.profilePictureUrl || user.profilePictureUrl || user.profile_picture?.url_list?.[0] || '',
    repeatCount: data.repeatCount || 1,
    timestamp: Date.now()
  };
}

async function disconnectTikTok(update = true) {
  if (liveConnection) { try { liveConnection.disconnect(); } catch {} liveConnection = null; }
  if (update) setStatus('Bağlantı Kesildi', { username: null });
}

io.on('connection', socket => {
  socket.emit('live:status', liveState);
  socket.emit('gifts:update', readJson(giftsFile, []));
  socket.emit('config:update', readJson(mappingFile, {}));
  socket.emit('leaderboard:update', readJson(leaderboardFile, { players: [], stats: {} }));
  socket.on('live:connect', ({ username }) => connectTikTok(username));
  socket.on('live:disconnect', () => disconnectTikTok());
  socket.on('live:test', event => io.emit('live:event', { ...event, type: event.type || 'gift', timestamp: Date.now(), profilePictureUrl: event.profilePictureUrl || '' }));
  socket.on('game:settings', settings => io.emit('game:settings', settings));
  socket.on('leaderboard:kick', ({ uniqueId }) => {
    const board = readJson(leaderboardFile, { players: [], stats: {} });
    board.players = (board.players || []).filter(p => p.uniqueId !== uniqueId);
    writeJson(leaderboardFile, board);
    io.emit('leaderboard:update', board);
  });
  socket.on('leaderboard:reset', () => {
    const board = { players: [], stats: { likes: 0, coins: 0 } };
    writeJson(leaderboardFile, board);
    io.emit('leaderboard:update', board);
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Fetih Korteji çalışıyor: http://0.0.0.0:${PORT}`));
