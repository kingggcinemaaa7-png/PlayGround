/**
 * 3D ÇAY OCAĞI KAOSU — Mahalle Meydanı
 * Express + Socket.IO + tiktok-live-connector backend.
 *
 * Serves the static game, proxies TikTok CDN avatars (CORS-safe), connects to
 * a TikTok live room and normalises chat / like / gift / member events into
 * gameplay events shared by the game and the admin dashboard.
 */
import express from 'express'
import { createServer } from 'node:http'
import { Server as SocketServer } from 'socket.io'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync, createReadStream, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_CATALOG,
  DEFAULT_SETTINGS,
  mergeMapping,
  normalizeMapping,
  normalizeSettings,
  resolveChatAction,
  resolveGiftAction
} from './public/js/shared/actions.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '0.0.0.0'
const CONFIG_PATH = join(__dirname, 'config', 'gifts_mapping.json')
const CACHE_DIR = join(__dirname, '.cache', 'avatars')
const CACHE_MAX_AGE = 6 * 60 * 60 * 1000
const MAX_AVATAR_BYTES = 3 * 1024 * 1024

mkdirSync(CACHE_DIR, { recursive: true })
mkdirSync(join(__dirname, 'config'), { recursive: true })

/* ------------------------------------------------------------------ config */

function readMapping() {
  try {
    return normalizeMapping(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')))
  } catch {
    return normalizeMapping({})
  }
}

function writeMapping(mapping) {
  const normalized = normalizeMapping(mapping)
  writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 2) + '\n')
  return normalized
}

let mapping = readMapping()
let settings = normalizeSettings(readConfigSettings())
let giftCatalog = DEFAULT_CATALOG.map((g) => ({ ...g, source: 'default' }))
let catalogSource = 'default'

function readConfigSettings() {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
    return raw.settings ?? {}
  } catch {
    return {}
  }
}

/* --------------------------------------------------------------- tiktok */

const tiktok = {
  state: 'idle',
  username: '',
  roomId: '',
  viewers: 0,
  likes: 0,
  message: '',
  connector: null,
  startedAt: 0,
  eventCount: 0
}

function publicTiktok() {
  return {
    state: tiktok.state,
    username: tiktok.username,
    roomId: tiktok.roomId,
    viewers: tiktok.viewers,
    likes: tiktok.likes,
    message: tiktok.message,
    startedAt: tiktok.startedAt,
    eventCount: tiktok.eventCount
  }
}

let io = null
let eventSeq = 0

function proxyAvatar(url, name = '') {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return ''
  return `/api/avatar?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`
}

function normalizeUser(raw, fallbackName = '') {
  if (!raw) return null
  const id = String(raw.uniqueId ?? raw.userId ?? raw.id ?? raw.secUid ?? fallbackName ?? 'viewer')
  const nickname = String(raw.nickname ?? raw.uniqueId ?? fallbackName ?? 'izleyici')
  const rawAvatar =
    raw.profilePictureUrl ??
    raw.avatarThumb?.urlList?.[0] ??
    raw.avatarMedium?.urlList?.[0] ??
    raw.avatarLarger?.urlList?.[0] ??
    ''
  return {
    id,
    nickname,
    avatar: proxyAvatar(rawAvatar, nickname),
    avatarRaw: rawAvatar,
    uniqueId: raw.uniqueId ?? id
  }
}

function normalizeGiftCatalog(raw) {
  const list = raw?.gifts ?? raw?.giftList ?? raw?.data?.gifts ?? raw?.data ?? []
  if (!Array.isArray(list)) return []
  return list
    .map((g) => {
      const coins = Number(
        g.diamond_count ?? g.diamondCount ?? g.coinCost ?? g.coins ?? g.cost ?? g.gift?.diamond_count ?? 0
      )
      const image =
        g.icon?.url_list?.[0] ??
        g.icon?.urlList?.[0] ??
        g.image?.url_list?.[0] ??
        g.image?.urlList?.[0] ??
        g.iconUrl ??
        ''
      return {
        id: String(g.id ?? g.gift_id ?? g.giftId ?? g.name ?? ''),
        name: String(g.name ?? g.gift_name ?? g.describe ?? 'Hediye'),
        coins: Number.isFinite(coins) ? coins : 1,
        image: proxyAvatar(image, g.name ?? ''),
        emoji: g.emoji ?? '🎁',
        source: 'tiktok'
      }
    })
    .filter((g) => g.id)
    .sort((a, b) => a.coins - b.coins)
}

function broadcastEvent(event) {
  const enriched = { ...event, seq: ++eventSeq, ts: Date.now() }
  tiktok.eventCount += 1
  io?.emit('game:event', enriched)
  return enriched
}

async function loadConnector() {
  const mod = await import('tiktok-live-connector')
  const Ctor = mod.TikTokLiveConnection ?? mod.WebcastPushConnection ?? mod.default
  if (!Ctor) throw new Error('tiktok-live-connector sınıfı bulunamadı')
  return Ctor
}

async function disconnectTikTok() {
  const connector = tiktok.connector
  tiktok.connector = null
  if (connector) {
    try {
      await connector.disconnect()
    } catch {
      /* ignore */
    }
  }
  if (tiktok.state !== 'error') tiktok.state = 'idle'
  tiktok.message = 'Bağlantı kapatıldı'
  tiktok.viewers = 0
  tiktok.roomId = ''
  io?.emit('tiktok:status', publicTiktok())
}

async function connectTikTok(usernameRaw) {
  const username = String(usernameRaw ?? '').trim().replace(/^@+/, '')
  if (!/^[\w.]{2,64}$/.test(username)) {
    tiktok.state = 'error'
    tiktok.message = 'Geçersiz TikTok kullanıcı adı.'
    io?.emit('tiktok:status', publicTiktok())
    return
  }
  await disconnectTikTok()
  tiktok.state = 'connecting'
  tiktok.username = username
  tiktok.message = `@${username} bağlanıyor…`
  tiktok.startedAt = Date.now()
  io?.emit('tiktok:status', publicTiktok())

  let Ctor
  try {
    Ctor = await loadConnector()
  } catch (error) {
    tiktok.state = 'error'
    tiktok.message = `tiktok-live-connector yüklenemedi: ${error.message}`
    io?.emit('tiktok:status', publicTiktok())
    return
  }

  const connector = new Ctor(username, {
    processInitialData: true,
    fetchRoomInfoOnConnect: true,
    enableExtendedGiftInfo: true,
    enableWebsocketUpgrade: true
  })
  tiktok.connector = connector

  connector.on('connected', (state) => {
    tiktok.state = 'connected'
    tiktok.roomId = String(state?.roomId ?? '')
    tiktok.viewers = Number(state?.roomInfo?.user_count ?? state?.roomInfo?.stats?.total_user ?? 0)
    tiktok.message = `@${username} canlı yayınına bağlandı`
    io?.emit('tiktok:status', publicTiktok())
    io?.emit('tiktok:log', { level: 'ok', message: tiktok.message })
    loadGiftCatalog(connector).catch(() => {})
  })
  connector.on('disconnected', () => {
    tiktok.state = 'idle'
    tiktok.message = 'Yayın bağlantısı kapandı'
    io?.emit('tiktok:status', publicTiktok())
  })
  connector.on('streamEnd', () => {
    tiktok.state = 'idle'
    tiktok.message = 'Yayın sona erdi'
    io?.emit('tiktok:status', publicTiktok())
  })
  connector.on('error', (error) => {
    tiktok.state = 'error'
    tiktok.message = error?.message ?? 'TikTok bağlantı hatası'
    io?.emit('tiktok:status', publicTiktok())
    io?.emit('tiktok:log', { level: 'error', message: tiktok.message })
  })
  connector.on('roomUser', (data) => {
    tiktok.viewers = Number(data?.viewerCount ?? tiktok.viewers) || tiktok.viewers
    io?.emit('tiktok:status', publicTiktok())
  })

  connector.on('chat', (data) => {
    const user = normalizeUser(data.user, data.uniqueId)
    const event = {
      type: 'chat',
      text: String(data.comment ?? ''),
      user,
      command: resolveChatAction(mapping, data.comment),
      source: 'tiktok'
    }
    broadcastEvent(event)
  })

  connector.on('like', (data) => {
    const user = normalizeUser(data.user, data.uniqueId)
    tiktok.likes += Number(data.likeCount ?? 1)
    broadcastEvent({
      type: 'like',
      user,
      count: Number(data.likeCount ?? 1),
      total: Number(data.totalLikeCount ?? tiktok.likes),
      source: 'tiktok'
    })
  })

  connector.on('gift', (data) => {
    const user = normalizeUser(data.user, data.uniqueId)
    const repeatEnd = data.repeatEnd !== false
    const gift = {
      id: String(data.giftId ?? data.gift?.id ?? ''),
      name: String(data.giftName ?? data.gift?.name ?? data.extendedGiftInfo?.name ?? 'Hediye'),
      coins: Number(data.diamondCount ?? data.extendedGiftInfo?.diamond_count ?? data.gift?.diamond_count ?? 0),
      count: Number(data.repeatCount ?? 1),
      repeatEnd
    }
    // Only resolve / broadcast on the final combo frame; intermediate frames
    // still update the counter but must not fire the action repeatedly.
    const action = resolveGiftAction(mapping, { giftId: gift.id, coins: gift.coins, name: gift.name })
    broadcastEvent({ type: 'gift', gift, user, action, comboOpen: !repeatEnd, source: 'tiktok' })
  })

  connector.on('member', (data) => {
    broadcastEvent({ type: 'member', user: normalizeUser(data.user, data.uniqueId), source: 'tiktok' })
  })
  connector.on('follow', (data) => {
    broadcastEvent({ type: 'follow', user: normalizeUser(data.user, data.uniqueId), source: 'tiktok' })
  })
  connector.on('share', (data) => {
    broadcastEvent({ type: 'share', user: normalizeUser(data.user, data.uniqueId), source: 'tiktok' })
  })

  try {
    const state = await connector.connect()
    tiktok.roomId = String(state?.roomId ?? tiktok.roomId ?? '')
    if (tiktok.state !== 'connected') {
      tiktok.state = 'connected'
      tiktok.message = `@${username} canlı yayınına bağlandı`
      io?.emit('tiktok:status', publicTiktok())
    }
    loadGiftCatalog(connector).catch(() => {})
  } catch (error) {
    tiktok.state = 'error'
    tiktok.message = error?.message ?? 'Bağlantı kurulamadı'
    io?.emit('tiktok:status', publicTiktok())
    io?.emit('tiktok:log', { level: 'error', message: `Bağlantı hatası: ${tiktok.message}` })
  }
}

async function loadGiftCatalog(connector) {
  try {
    const fetcher = connector.fetchAvailableGifts ?? connector.getAvailableGifts
    if (typeof fetcher !== 'function') return
    const raw = await fetcher.call(connector)
    const gifts = normalizeGiftCatalog(raw)
    if (!gifts.length) return
    giftCatalog = gifts
    catalogSource = 'tiktok'
    io?.emit('gift:catalog', { gifts: giftCatalog, source: catalogSource, fetchedAt: Date.now() })
    io?.emit('tiktok:log', { level: 'ok', message: `${gifts.length} hediye kataloğu yüklendi` })
  } catch (error) {
    io?.emit('tiktok:log', { level: 'warn', message: `Hediye kataloğu alınamadı: ${error.message}` })
  }
}

/* --------------------------------------------------------------- avatar */

const AVATAR_HOSTS = [
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokcdn-eu.com',
  'tiktokcdn.com.tr',
  'ibyteimg.com',
  'byteoversea.com',
  'muscdn.com',
  'ttwstatic.com',
  'tiktok.com',
  'tiktokv.com'
]

function allowedAvatarHost(hostname) {
  return AVATAR_HOSTS.some((host) => hostname === host || hostname.endsWith('.' + host))
}

function fallbackAvatar(name) {
  const safe = String(name || 'çay').slice(0, 2).toUpperCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="28" fill="#3a2415"/><circle cx="64" cy="48" r="22" fill="#f2c078"/><path d="M24 128c4-26 20-38 40-38s36 12 40 38z" fill="#f2c078"/><text x="64" y="56" text-anchor="middle" font-family="Verdana" font-size="20" font-weight="bold" fill="#3a2415">${safe}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function cachePathFor(url) {
  return join(CACHE_DIR, createHash('sha1').update(url).digest('hex'))
}

async function fetchAndCacheAvatar(url) {
  const target = new URL(url)
  if (!/^https?:$/.test(target.protocol) || !allowedAvatarHost(target.hostname)) {
    const error = new Error('İzin verilmeyen avatar adresi')
    error.status = 403
    throw error
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*'
      }
    })
    if (!response.ok) {
      const error = new Error(`Avatar kaynağı ${response.status}`)
      error.status = 502
      throw error
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!/^image\//i.test(contentType)) {
      const error = new Error('Kaynak bir görsel değil')
      error.status = 415
      throw error
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > MAX_AVATAR_BYTES) {
      const error = new Error('Avatar çok büyük')
      error.status = 413
      throw error
    }
    const path = cachePathFor(url)
    writeFileSync(path + '.meta', JSON.stringify({ contentType, at: Date.now() }))
    writeFileSync(path, buffer)
    return { path, contentType, buffer }
  } finally {
    clearTimeout(timer)
  }
}

/* ---------------------------------------------------------------- server */

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '256kb' }))
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  next()
})

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    name: '3D Çay Ocağı Kaosu',
    version: '3.0.0',
    tiktok: publicTiktok(),
    catalog: { count: giftCatalog.length, source: catalogSource },
    uptime: Math.round(process.uptime())
  })
})

app.get('/api/config', (req, res) => {
  res.json({ mapping, settings, catalog: giftCatalog, catalogSource, tiktok: publicTiktok() })
})

app.post('/api/config', (req, res) => {
  if (req.body?.mapping) {
    mapping = writeMapping(mergeMapping(mapping, req.body.mapping))
    io?.emit('mapping', { mapping })
  }
  if (req.body?.settings) {
    settings = normalizeSettings({ ...settings, ...req.body.settings })
    io?.emit('settings', settings)
  }
  res.json({ ok: true, mapping, settings })
})

app.get('/api/gifts', (req, res) => {
  res.json({ gifts: giftCatalog, source: catalogSource, mapping })
})

app.post('/api/gifts', (req, res) => {
  if (!req.body?.mapping) return res.status(400).json({ ok: false, error: 'mapping gerekli' })
  mapping = writeMapping(mergeMapping(mapping, req.body.mapping))
  io?.emit('mapping', { mapping })
  res.json({ ok: true, mapping })
})

app.post('/api/tiktok', async (req, res) => {
  const username = req.body?.username
  if (req.body?.disconnect) {
    await disconnectTikTok()
    return res.json({ ok: true, tiktok: publicTiktok() })
  }
  connectTikTok(username)
  res.json({ ok: true, tiktok: publicTiktok() })
})

app.post('/api/simulate', (req, res) => {
  const event = buildSimulatedEvent(req.body ?? {})
  const enriched = broadcastEvent(event)
  res.json({ ok: true, event: enriched })
})

app.get('/api/avatar', async (req, res) => {
  const url = String(req.query.url ?? '')
  const name = String(req.query.name ?? '')
  if (!url) return res.type('image/svg+xml').send(fallbackAvatar(name))
  let target
  try {
    target = new URL(url)
  } catch {
    return res.status(400).end()
  }
  if (!allowedAvatarHost(target.hostname)) return res.status(403).end()

  const cacheKey = cachePathFor(url)
  try {
    if (existsSync(cacheKey) && existsSync(cacheKey + '.meta')) {
      const meta = JSON.parse(readFileSync(cacheKey + '.meta', 'utf8'))
      const stat = statSync(cacheKey)
      if (Date.now() - meta.at < CACHE_MAX_AGE) {
        res.setHeader('Content-Type', meta.contentType || 'image/jpeg')
        res.setHeader('Cache-Control', 'public, max-age=21600')
        return createReadStream(cacheKey).pipe(res)
      }
    }
    const { buffer, contentType } = await fetchAndCacheAvatar(url)
    res.setHeader('Content-Type', contentType || 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=21600')
    res.end(buffer)
  } catch (error) {
    if (error.status === 403) return res.status(403).end()
    // Never break the 3D scene because a CDN avatar expired.
    res.setHeader('Cache-Control', 'public, max-age=60')
    return res.type('image/svg+xml').send(fallbackAvatar(name))
  }
})

app.use('/vendor', express.static(join(__dirname, 'public', 'vendor'), { maxAge: '30d', immutable: true }))
app.use(express.static(join(__dirname, 'public'), { extensions: ['html'], maxAge: 0 }))
app.get('/', (req, res) => res.sendFile(join(__dirname, 'public', 'index.html')))
app.get('/admin', (req, res) => res.sendFile(join(__dirname, 'public', 'admin.html')))
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'not found' })
  res.status(404).sendFile(join(__dirname, 'public', '404.html'), (err) => {
    if (err) res.type('text').send('Bulunamadı')
  })
})

/* ------------------------------------------------------- simulation events */

const demoPool = [
  ['ayse_teyzee', '#ff9f68'],
  ['mehmet_okeyci', '#7dd3fc'],
  ['zeynepcayci', '#f9a8d4'],
  ['hasan_38', '#a3e635'],
  ['fatma.bacı', '#fcd34d'],
  ['emre_kavga', '#c4b5fd'],
  ['elif_simsek', '#67e8f9'],
  ['murat_bakkal', '#fda4af'],
  ['burak_tost', '#fde68a'],
  ['selin_zabita', '#93c5fd']
]

function makeDemoUser(seed = Date.now()) {
  const [nickname, color] = demoPool[Math.abs(Number(seed) || Date.now()) % demoPool.length]
  return {
    id: `sim-${nickname}-${Math.floor(Math.random() * 9999)}`,
    nickname,
    avatar: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="26" fill="${color}"/><circle cx="64" cy="48" r="23" fill="#fff8eb"/><path d="M22 128c4-26 20-40 42-40s38 14 42 40z" fill="#fff8eb"/></svg>`
    )}`
  }
}

export function buildSimulatedEvent(input = {}) {
  const kind = String(input.kind ?? input.type ?? 'chat')
  const user = input.user ?? makeDemoUser(input.seed ?? Date.now())
  switch (kind) {
    case 'like': {
      const count = Math.max(1, Number(input.count) || Math.round(5 + Math.random() * 25))
      return { type: 'like', user, count, total: count, source: 'sim' }
    }
    case 'member':
      return { type: 'member', user, source: 'sim' }
    case 'gift': {
      const coins = Math.max(1, Number(input.coins) || 1)
      const giftId = String(input.giftId ?? `sim-${coins}`)
      const action =
        input.action ??
        resolveGiftAction(mapping, { giftId, coins, name: input.giftName }) ??
        'SPAWN_IMPATIENT'
      return {
        type: 'gift',
        user,
        action,
        gift: {
          id: giftId,
          name: input.giftName ?? 'Simülasyon Hediyesi',
          coins,
          count: Math.max(1, Number(input.count) || 1),
          repeatEnd: true
        },
        coins,
        source: 'sim'
      }
    }
    case 'join': {
      const command = input.command === '2' ? '2' : '1'
      return {
        type: 'chat',
        text: command,
        user,
        command: resolveChatAction(mapping, command),
        source: 'sim'
      }
    }
    default:
      return {
        type: 'chat',
        text: String(input.text ?? ['1', '2', 'çaycı koş!', 'maç başladı'][Math.floor(Math.random() * 4)]),
        user,
        command: resolveChatAction(mapping, input.text ?? '1'),
        source: 'sim'
      }
  }
}

/* --------------------------------------------------------------- socket */

const httpServer = createServer(app)
io = new SocketServer(httpServer, {
  cors: { origin: true, credentials: true },
  maxHttpBufferSize: 512 * 1024
})

let lastMetrics = {
  chaos: 0,
  timer: settings.roundSeconds,
  round: 1,
  state: 'idle',
  players: [],
  spectators: 0,
  customers: 0,
  apprentices: 0,
  fights: 0,
  gifts: 0,
  seats: 0,
  wins: { chat: 0, cayci: 0 },
  updatedAt: 0
}

io.on('connection', (socket) => {
  socket.emit('hello', {
    serverTime: Date.now(),
    mapping,
    settings,
    catalog: giftCatalog,
    catalogSource,
    tiktok: publicTiktok(),
    metrics: lastMetrics,
    clients: io.engine.clientsCount
  })

  socket.on('client:role', (role) => {
    socket.data.role = role
    io.emit('clients', { count: io.engine.clientsCount })
  })

  socket.on('admin:connect', ({ username } = {}) => {
    socket.data.role = 'admin'
    connectTikTok(username)
  })
  socket.on('admin:disconnect', () => disconnectTikTok())

  socket.on('admin:simulate', (payload = {}) => {
    broadcastEvent(buildSimulatedEvent(payload))
  })

  socket.on('admin:settings', (patch = {}) => {
    settings = normalizeSettings({ ...settings, ...patch })
    io.emit('settings', settings)
    io.emit('tiktok:log', { level: 'info', message: 'Atmosfer ayarları güncellendi' })
  })

  socket.on('admin:round', (payload = {}) => {
    io.emit('round:command', payload)
  })

  socket.on('admin:kick', (payload = {}) => {
    io.emit('player:kick', payload)
  })

  socket.on('admin:gifts', (payload = {}) => {
    const previous = mapping
    mapping = writeMapping(mergeMapping(mapping, payload.mapping ?? payload))
    io.emit('mapping', { mapping })
    if (JSON.stringify(previous) !== JSON.stringify(mapping)) {
      io.emit('tiktok:log', { level: 'info', message: 'Hediye eşleştirmesi kaydedildi' })
    }
  })

  socket.on('game:metrics', (metrics = {}) => {
    lastMetrics = { ...lastMetrics, ...metrics, updatedAt: Date.now() }
    socket.broadcast.emit('metrics', lastMetrics)
  })

  socket.on('game:event-local', (event = {}) => {
    // Game-originated actions (apprentice collected, tea served, round end)
    // are mirrored to the admin log without re-triggering gameplay.
    socket.broadcast.emit('game:trace', { ...event, ts: Date.now() })
  })

  socket.on('admin:request', () => {
    socket.emit('hello', {
      serverTime: Date.now(),
      mapping,
      settings,
      catalog: giftCatalog,
      catalogSource,
      tiktok: publicTiktok(),
      metrics: lastMetrics,
      clients: io.engine.clientsCount
    })
  })

  socket.on('disconnect', () => {
    io.emit('clients', { count: io.engine.clientsCount })
  })
})

httpServer.listen(PORT, HOST, () => {
  console.log(`\n  🫖  3D Çay Ocağı Kaosu — http://localhost:${PORT}`)
  console.log(`  🎛  Yönetim paneli     — http://localhost:${PORT}/admin.html`)
  console.log(`  📡  TikTok bağlantısı  — panelden @kullanıcıadı ile\n`)
})

/* Publish a static output declaration for the preview runtime when present. */
if (process.env.OPENCODE_WEB_DIR) {
  try {
    writeFileSync(
      join(process.env.OPENCODE_WEB_DIR, 'deployment-output.json'),
      JSON.stringify({ project: __dirname, directory: join(__dirname, 'public') })
    )
  } catch {
    /* ignore */
  }
}

process.on('SIGTERM', async () => {
  await disconnectTikTok()
  httpServer.close(() => process.exit(0))
})
