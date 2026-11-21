'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

let WebcastPushConnection = null;
try {
  ({ WebcastPushConnection } = require('tiktok-live-connector'));
} catch (err) {
  console.warn('[TikTok] connector yüklenemedi:', err.message);
}

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const CONFIG = path.join(ROOT, 'config', 'gifts_mapping.json');
const LEADERBOARD = path.join(DATA, 'leaderboard.json');
const GIFTS_CACHE = path.join(DATA, 'tiktok_gifts_cache.json');
const SETTINGS_FILE = path.join(DATA, 'settings.json');
const MODELS = path.join(PUBLIC, 'models');

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(path.dirname(CONFIG), { recursive: true });

const FALLBACK_GIFTS = [
  { id: '5655', name: 'Gül', diamonds: 1, emoji: '🌹' },
  { id: '3588', name: 'TikTok', diamonds: 1, emoji: '🎵' },
  { id: '5659', name: 'Parmak Kalbi', diamonds: 5, emoji: '🫰' },
  { id: '5658', name: 'Dondurma', diamonds: 10, emoji: '🍦' },
  { id: '5657', name: 'Kalp Elleri', diamonds: 20, emoji: '🫶' },
  { id: '5660', name: 'Şapka ve Bıyık', diamonds: 30, emoji: '🎩' },
  { id: '5661', name: 'Donut', diamonds: 30, emoji: '🍩' },
  { id: '5662', name: 'Davul', diamonds: 50, emoji: '🥁' },
  { id: '5663', name: 'Corgi', diamonds: 100, emoji: '🐕' },
  { id: '5664', name: 'Aslan', diamonds: 500, emoji: '🦁' },
  { id: '5665', name: 'Evren', diamonds: 1000, emoji: '🌌' },
  { id: '5666', name: 'Kale', diamonds: 1500, emoji: '🏰' },
  { id: '5667', name: 'Roket', diamonds: 500, emoji: '🚀' },
  { id: '5668', name: 'Güneş Gözlüğü', diamonds: 100, emoji: '🕶️' },
  { id: '5669', name: 'Parfüm', diamonds: 20, emoji: '🧴' },
  { id: '5670', name: 'Çiçek Buketi', diamonds: 10, emoji: '💐' }
];

const DEFAULT_SETTINGS = {
  volume: 70,
  muted: false,
  safeZones: false,
  aspect: '16:9',
  theme: 'fetih',
  demoCrowd: true
};

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
};

let settings = { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_FILE, {}) };
let mapping = readJson(CONFIG, {});
let leaderboard = readJson(LEADERBOARD, []);
let totals = { likes: 0, gifts: 0, viewers: 0 };
let turn = readJson(path.join(DATA, 'turn.json'), { number: 1 });
let actionLog = [];
let live = null;
let liveStatus = { state: 'Yayını bekliyor', message: 'Hazır' };

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(express.static(PUBLIC, { extensions: ['html'] }));

const setStatus = (state, message) => {
  liveStatus = { state, message, at: Date.now() };
  io.emit('status', liveStatus);
  console.log(`[TikTok] ${state}: ${message}`);
};

const addLog = (kind, text) => {
  actionLog.unshift({ kind, text, at: Date.now() });
  actionLog = actionLog.slice(0, 40);
  io.emit('log', actionLog);
};

const emitSnapshot = (socket) => {
  socket.emit('status', liveStatus);
  socket.emit('stats', totals);
  socket.emit('leaderboard', leaderboard);
  socket.emit('mapping', mapping);
  socket.emit('gifts', giftsForClient());
  socket.emit('settings', settings);
  socket.emit('log', actionLog);
  socket.emit('turn', turn);
};

const giftsForClient = () => {
  const cached = readJson(GIFTS_CACHE, []);
  const list = Array.isArray(cached) && cached.length ? cached : FALLBACK_GIFTS;
  return list.map((g) => ({ ...g, diamonds: Number(g.diamonds) || 0 }));
};

const normalizeGift = (g) => ({
  id: String(g.giftId ?? g.id ?? ''),
  name: g.name ?? g.giftName ?? `Hediye ${g.giftId ?? g.id ?? ''}`,
  diamonds: Number(g.diamondCount ?? g.diamond ?? g.cost ?? 0),
  image: g.imageUrl ?? g.icon?.url ?? g.image?.url ?? '',
  emoji: '🎁'
});

const rankForAction = (action) =>
  ({
    RANK_SIPAHI: 'Sipahi',
    RANK_SANCAKTAR: 'Sancaktar',
    RANK_CAVALRY: 'Akıncı',
    RANK_VIZIER: 'Vezir'
  }[action] || null);

const scoreForAction = (action, diamonds) => {
  if (action === 'EVENT_CATAPULT') return 100;
  if (action === 'EVENT_SEAL') return 300;
  if (action === 'RANK_VIZIER') return Math.max(500, diamonds || 0);
  if (action?.startsWith('RANK')) return Math.max(10, diamonds || 0);
  return 0;
};

const upsertPlayer = (event) => {
  if (!event.uniqueId) return;
  let player = leaderboard.find((p) => p.uniqueId === event.uniqueId);
  if (!player) {
    player = {
      uniqueId: event.uniqueId,
      nickname: event.nickname || event.uniqueId,
      avatar: event.avatar || '',
      rank: 'Nefer',
      score: 0,
      joinedAt: Date.now()
    };
    leaderboard.push(player);
  }
  if (event.nickname) player.nickname = event.nickname;
  if (event.avatar) player.avatar = event.avatar;
  const rank = rankForAction(event.action);
  if (rank) player.rank = rank;
  player.score = (player.score || 0) + scoreForAction(event.action, event.diamonds);
  player.lastAction = event.action;
  player.lastSeen = Date.now();
  writeJson(LEADERBOARD, leaderboard);
  io.emit('leaderboard', leaderboard);
};

const persist = () => {
  writeJson(LEADERBOARD, leaderboard);
  writeJson(CONFIG, mapping);
  writeJson(SETTINGS_FILE, settings);
  writeJson(path.join(DATA, 'turn.json'), turn);
};

const broadcastSettings = () => {
  writeJson(SETTINGS_FILE, settings);
  io.emit('settings', settings);
};

function handleAction(input, options = {}) {
  if (!input || input.action === 'RESET_TURN') return;
  const mappingNow = mapping || {};
  let action = null;

  if (input.action) {
    action = input.action;
  } else if (input.type === 'chat') {
    if (/^\s*!(katil|katıl|join)\b/i.test(input.comment || '')) action = 'JOIN_MARCH';
  } else if (input.type === 'like') {
    action = mappingNow.likeAction || 'JOIN_MARCH';
  } else if (input.type === 'member') {
    action = 'JOIN_MARCH';
  } else if (input.type === 'gift') {
    action = mappingNow[String(input.giftId)] || null;
    if (!action) {
      const d = Number(input.diamonds) || 0;
      action =
        d >= 500 ? 'RANK_VIZIER'
          : d >= 300 ? 'EVENT_SEAL'
            : d >= 100 ? 'RANK_CAVALRY'
              : d >= 50 ? 'EVENT_CATAPULT'
                : d >= 30 ? 'EVENT_MEHTER'
                  : d >= 10 ? 'RANK_SANCAKTAR'
                    : d >= 1 ? 'RANK_SIPAHI'
                      : 'JOIN_MARCH';
    }
  }

  if (!action) return null;

  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    type: input.type || 'simulate',
    uniqueId: String(input.uniqueId || input.nickname || `misafir-${Date.now()}`),
    nickname: input.nickname || input.uniqueId || 'Misafir',
    avatar: input.avatar || input.profilePictureUrl || '',
    diamonds: Number(input.diamonds) || 0,
    giftId: input.giftId ? String(input.giftId) : '',
    simulated: !!options.simulate
  };

  io.emit('gameAction', event);
  upsertPlayer(event);
  addLog(action, `${event.nickname} → ${action}`);
  return event;
}

async function connect(username) {
  if (!WebcastPushConnection) {
    setStatus('Hata', 'tiktok-live-connector yüklenemedi');
    return;
  }
  const clean = String(username || '').replace(/^@/, '').trim();
  if (!clean) {
    setStatus('Hata', 'Kullanıcı adı gerekli');
    return;
  }

  if (live?.disconnect) {
    try { live.disconnect(); } catch { /* ignore */ }
  }
  live = null;
  setStatus('Yeniden bağlanıyor', `@${clean} aranıyor`);

  try {
    live = new WebcastPushConnection(clean, {
      processInitialData: true,
      enableExtendedGiftInfo: true,
      enableWebsocketUpgrade: true
    });

    live.on('connected', () => setStatus('Bağlandı', `@${clean} canlı yayına bağlandı`));
    live.on('disconnected', () => setStatus('Yayını bekliyor', 'Yayın kapandı, yeniden bağlanmayı bekliyor'));
    live.on('streamEnd', () => setStatus('Yayını bekliyor', 'Yayın sona erdi'));

    live.on('chat', (d) => handleAction({
      type: 'chat', uniqueId: d.uniqueId, nickname: d.nickname,
      profilePictureUrl: d.profilePictureUrl, comment: d.comment
    }));

    live.on('like', (d) => {
      totals.likes += Number(d.likeCount) || 1;
      io.emit('stats', totals);
      if ((Number(d.likeCount) || 0) > 0) {
        handleAction({
          type: 'like', uniqueId: d.uniqueId, nickname: d.nickname,
          profilePictureUrl: d.profilePictureUrl
        });
      }
    });

    live.on('member', (d) => handleAction({
      type: 'member', uniqueId: d.uniqueId, nickname: d.nickname,
      profilePictureUrl: d.profilePictureUrl
    }));

    live.on('roomUser', (d) => {
      totals.viewers = Number(d.viewerCount) || 0;
      io.emit('stats', totals);
    });

    live.on('gift', (d) => {
      if (d.giftType === 1 && d.repeatEnd === false) return;
      const diamonds = Number(d.diamondCount ?? d.gift?.diamondCount ?? 0) || 0;
      const count = Number(d.repeatCount) || 1;
      totals.gifts += diamonds * count;
      io.emit('stats', totals);
      handleAction({
        type: 'gift',
        giftId: d.giftId ?? d.gift?.giftId,
        diamonds: diamonds * count,
        repeatCount: count,
        uniqueId: d.uniqueId,
        nickname: d.nickname,
        profilePictureUrl: d.profilePictureUrl
      });
    });

    const state = await live.connect();
    setStatus('Bağlandı', `@${clean} canlı yayına bağlandı`);
    addLog('CONNECT', `@${clean} bağlandı`);
    try {
      const gifts = await live.getAvailableGifts();
      const list = (gifts || []).map(normalizeGift).filter((g) => g.id);
      if (list.length) {
        writeJson(GIFTS_CACHE, list);
        io.emit('gifts', giftsForClient());
        addLog('GIFTS', `${list.length} hediye kataloğa eklendi`);
      }
    } catch (err) {
      console.error('[TikTok] hediye kataloğu:', err.message);
    }
    return state;
  } catch (err) {
    setStatus('Hata', err.message || 'Bağlantı başarısız');
    addLog('ERROR', err.message || 'Bağlantı başarısız');
  }
}

/* ---------- REST ---------- */

app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.get('/api/state', (req, res) => res.json({
  status: liveStatus, totals, leaderboard, mapping, settings,
  turn, log: actionLog, gifts: giftsForClient()
}));

app.post('/api/connect', async (req, res) => {
  connect(req.body?.username);
  res.json({ ok: true });
});

app.post('/api/disconnect', (req, res) => {
  try { live?.disconnect?.(); } catch { /* ignore */ }
  live = null;
  setStatus('Yayını bekliyor', 'Bağlantı kesildi');
  addLog('DISCONNECT', 'Yayın bağlantısı kesildi');
  res.json({ ok: true });
});

app.post('/api/mapping', (req, res) => {
  mapping = req.body && typeof req.body === 'object' ? req.body : {};
  writeJson(CONFIG, mapping);
  io.emit('mapping', mapping);
  res.json({ ok: true, mapping });
});

app.post('/api/settings', (req, res) => {
  const next = req.body || {};
  settings = {
    ...settings,
    ...(next.volume !== undefined ? { volume: Math.max(0, Math.min(100, Number(next.volume))) } : {}),
    ...(next.muted !== undefined ? { muted: !!next.muted } : {}),
    ...(next.safeZones !== undefined ? { safeZones: !!next.safeZones } : {}),
    ...(next.aspect !== undefined ? { aspect: next.aspect === '9:16' ? '9:16' : '16:9' } : {}),
    ...(next.theme !== undefined ? { theme: String(next.theme) } : {}),
    ...(next.demoCrowd !== undefined ? { demoCrowd: !!next.demoCrowd } : {})
  };
  broadcastSettings();
  res.json({ ok: true, settings });
});

app.post('/api/simulate', (req, res) => {
  const body = req.body || {};
  const event = handleAction({ ...body, type: 'simulate' }, { simulate: true });
  res.json({ ok: true, event });
});

app.post('/api/kick', (req, res) => {
  const uniqueId = String(req.body?.uniqueId || '');
  leaderboard = leaderboard.filter((p) => p.uniqueId !== uniqueId);
  writeJson(LEADERBOARD, leaderboard);
  io.emit('leaderboard', leaderboard);
  io.emit('kick', { uniqueId });
  addLog('KICK', `${uniqueId} sahneden çıkarıldı`);
  res.json({ ok: true });
});

app.post('/api/reset', (req, res) => {
  leaderboard = [];
  writeJson(LEADERBOARD, leaderboard);
  turn = { number: (turn.number || 1) + 1, at: Date.now() };
  writeJson(path.join(DATA, 'turn.json'), turn);
  io.emit('leaderboard', leaderboard);
  io.emit('reset', turn);
  io.emit('turn', turn);
  addLog('TURN', `Tur ${turn.number} başladı`);
  res.json({ ok: true, turn });
});

app.get('/api/gifts', (req, res) => res.json(giftsForClient()));

app.get('/api/assets', (req, res) => {
  let files = [];
  try { files = fs.readdirSync(MODELS).filter((f) => f.endsWith('.glb')); } catch { /* no models yet */ }
  res.json({ models: files });
});

app.get('/api/avatar', async (req, res) => {
  const url = String(req.query.url || '');
  if (!/^https:\/\//i.test(url)) return res.status(400).json({ error: 'invalid url' });
  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 FetihLive/3.0', Accept: 'image/*' },
      signal: AbortSignal.timeout(8000)
    });
    if (!upstream.ok) return res.sendStatus(upstream.status);
    const type = upstream.headers.get('content-type') || 'image/jpeg';
    if (!type.startsWith('image/')) return res.status(415).end();
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.set('Content-Type', type);
    res.set('Cache-Control', 'public, max-age=86400, immutable');
    res.set('Access-Control-Allow-Origin', '*');
    res.end(buffer);
  } catch {
    res.sendStatus(502);
  }
});

/* ---------- Socket ---------- */

io.on('connection', (socket) => {
  emitSnapshot(socket);

  socket.on('aspect', (aspect) => {
    settings.aspect = aspect === '9:16' ? '9:16' : '16:9';
    broadcastSettings();
  });

  socket.on('theme', (theme) => {
    settings.theme = String(theme);
    broadcastSettings();
  });

  socket.on('camera', (mode) => io.emit('cameraMode', String(mode)));

  socket.on('kick', (uniqueId) => {
    leaderboard = leaderboard.filter((p) => p.uniqueId !== uniqueId);
    writeJson(LEADERBOARD, leaderboard);
    io.emit('leaderboard', leaderboard);
    io.emit('kick', { uniqueId });
  });

  socket.on('reset', () => {
    leaderboard = [];
    turn = { number: (turn.number || 1) + 1, at: Date.now() };
    persist();
    io.emit('leaderboard', leaderboard);
    io.emit('reset', turn);
    io.emit('turn', turn);
  });
});

process.on('SIGINT', () => {
  persist();
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  persist();
  server.close(() => process.exit(0));
});

const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Fetih Korteji v3 → http://localhost:${PORT}`);
    console.log(`Yönetim paneli → http://localhost:${PORT}/admin.html`);
  });
}

module.exports = { app, server, io, handleAction, rankForAction, scoreForAction, FALLBACK_GIFTS };
