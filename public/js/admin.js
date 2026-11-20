/**
 * Çay Ocağı Kaosu — admin dashboard controller.
 *
 * Talks to the same Socket.IO backend as the game through the shared Net
 * transport. When the backend is absent it still renders a usable local demo
 * and mirrors changes over BroadcastChannel.
 */
import { Net } from './net.js'
import {
  ACTIONS,
  ACTION_ORDER,
  DEFAULT_CATALOG,
  DEFAULT_MAPPING,
  DEFAULT_SETTINGS,
  demoAvatar,
  normalizeMapping,
  normalizeSettings
} from './shared/actions.js'

const $ = (id) => document.getElementById(id)
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const clone = (value) => JSON.parse(JSON.stringify(value))
const pad = (n) => String(n).padStart(2, '0')
const formatClock = (date = new Date()) => `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
const formatTimer = (seconds) => {
  const total = Math.max(0, Math.ceil(Number(seconds) || 0))
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}
const compact = (n) => {
  const num = Number(n) || 0
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 10_000) return `${Math.round(num / 1000)}B`
  return new Intl.NumberFormat('tr-TR').format(Math.round(num))
}

const COMMAND_ACTIONS = ['JOIN_CUSTOMER', 'JOIN_APPRENTICE']
const GIFT_ACTIONS = ACTION_ORDER
const ALL_ACTIONS = [...ACTION_ORDER, 'JOIN_CUSTOMER', 'JOIN_APPRENTICE']
const SLIDERS = [
  { key: 'roundSeconds', label: 'Tur süresi', min: 60, max: 1800, step: 10, unit: 'sn' },
  { key: 'chaosTarget', label: 'Kaos hedefi', min: 50, max: 200, step: 5, unit: '%' },
  { key: 'lightIntensity', label: 'Işık şiddeti', min: 0.2, max: 2, step: 0.05, unit: '×' },
  { key: 'bloom', label: 'Bloom', min: 0, max: 2.5, step: 0.05, unit: '' },
  { key: 'fog', label: 'Sis', min: 0, max: 1, step: 0.05, unit: '' },
  { key: 'volume', label: 'Ses seviyesi', min: 0, max: 1, step: 0.05, unit: '' }
]

const net = new Net({ role: 'admin' })

let savedMapping = normalizeMapping(net.mapping)
let draft = clone(savedMapping)
let settings = normalizeSettings(net.settings)
let catalog = Array.isArray(net.catalog) && net.catalog.length ? net.catalog : DEFAULT_CATALOG
let metrics = null
let tiktok = { state: 'idle', username: '', roomId: '', viewers: 0, message: '', eventCount: 0 }
let clients = 0
let dirty = false
let settingsEchoUntil = 0
let giftFilter = ''
let logPaused = false
let logCount = 0
let settingsTimer = 0

/* ------------------------------------------------------------------ init */

renderActionSelects()
renderRanges()
renderGiftTable()
renderSliders()
renderSettings()
renderMetrics()
renderConnection()
startClock()

net.on('hello', (hello = {}) => {
  if (hello.mapping && !dirty) {
    savedMapping = normalizeMapping(hello.mapping)
    draft = clone(savedMapping)
    renderActionSelects()
    renderRanges()
    renderGiftTable()
  }
  if (hello.settings && Date.now() >= settingsEchoUntil) {
    settings = normalizeSettings(hello.settings)
    renderSliders()
    renderSettings()
  }
  if (Array.isArray(hello.catalog) && hello.catalog.length) {
    catalog = hello.catalog
    renderGiftTable()
  }
  if (hello.tiktok) {
    tiktok = hello.tiktok
    renderConnection()
  }
  if (Number.isFinite(hello.clients)) {
    clients = hello.clients
    renderClients()
  }
  if (hello.metrics) {
    metrics = hello.metrics
    renderMetrics()
  }
})

net.on('mode', ({ mode } = {}) => {
  const local = mode === 'local'
  $('side-dot').className = `dot ${local ? 'warn' : mode === 'offline' ? 'bad' : 'ok'}`
  $('side-mode').textContent = local ? 'Yerel demo modu' : mode === 'offline' ? 'Sunucu bağlantısı kesildi' : 'Sunucuya bağlı'
})

net.on('mapping', ({ mapping } = {}) => {
  if (!mapping) return
  if (dirty) {
    setSaveNote('Sunucudan yeni kurallar geldi — senin taslağın korunuyor.', true)
    return
  }
  savedMapping = normalizeMapping(mapping)
  draft = clone(savedMapping)
  renderActionSelects()
  renderRanges()
  renderGiftTable()
  setSaveNote('Kurallar güncellendi.')
})

net.on('settings', (incoming) => {
  if (!incoming || Date.now() < settingsEchoUntil) return
  settings = normalizeSettings(incoming)
  renderSliders()
  renderSettings()
})

net.on('gift:catalog', (payload = {}) => {
  if (Array.isArray(payload.gifts) && payload.gifts.length) {
    catalog = payload.gifts
    renderGiftTable()
  }
})

net.on('metrics', (incoming) => {
  metrics = incoming
  renderMetrics()
})

net.on('clients', ({ count } = {}) => {
  clients = Number(count) || 0
  renderClients()
})

net.on('tiktok:status', (status) => {
  tiktok = status ?? tiktok
  renderConnection()
})

net.on('tiktok:log', ({ level, message } = {}) => {
  addLog(level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'ok', 'bağlantı', message)
})

net.on('game:event', (event = {}) => logGameEvent(event))
net.on('game:trace', (event = {}) => {
  const action = event.action ? ACTIONS[event.action]?.title : null
  addLog('trace', event.type ?? 'oyun', [event.user?.nickname, action ?? event.message ?? event.text].filter(Boolean).join(' · '))
})

/* ------------------------------------------------------------------ clock */

function startClock() {
  const tick = () => {
    $('pill-clock').textContent = formatClock()
  }
  tick()
  setInterval(tick, 1000)
}

/* ------------------------------------------------------------- connection */

function renderConnection() {
  const state = tiktok?.state ?? 'idle'
  const labels = { idle: 'BEKLEMEDE', connecting: 'BAĞLANIYOR', connected: 'CANLI', error: 'HATA' }
  const el = $('tiktok-state')
  el.textContent = labels[state] ?? String(state).toUpperCase()
  el.className = `status ${state}`

  $('room-id').textContent = tiktok?.roomId ? String(tiktok.roomId).slice(-12) : '—'
  $('event-count').textContent = compact(tiktok?.eventCount ?? 0)
  $('tiktok-message').textContent = tiktok?.message || 'Hazır'
  $('username').value = tiktok?.username || $('username').value
  $('connect-btn').disabled = state === 'connecting' || state === 'connected'
  $('disconnect-btn').disabled = state === 'idle'

  const live = state === 'connected'
  const pill = $('pill-live')
  pill.classList.toggle('on', live)
  pill.innerHTML = `<i></i> ${live ? 'TIKTOK CANLI' : state === 'connecting' ? 'BAĞLANIYOR' : 'DEMO'}`

  $('side-dot').className = `dot ${state === 'connected' ? 'ok' : state === 'error' ? 'bad' : state === 'connecting' ? 'warn' : ''}`
  $('side-mode').textContent = state === 'connected'
    ? `@${tiktok.username || 'yayıncı'} bağlı`
    : state === 'connecting'
      ? 'Bağlanıyor…'
      : state === 'error'
        ? 'Bağlantı hatası'
        : net.mode === 'socket'
          ? 'Sunucuya bağlı · demo'
          : 'Yerel demo modu'

  if (live) {
    $('kpi-viewers-sub').textContent = `@${tiktok.username || 'tiktok'}`
  }
}

function renderClients() {
  $('pill-clients').innerHTML = `👥 <b>${clients}</b> istemci`
}

/* ------------------------------------------------------------------ metrics */

function renderMetrics() {
  const m = metrics ?? {}
  const players = Array.isArray(m.players) ? m.players : []
  $('kpi-viewers').textContent = compact(tiktok?.viewers || m.viewers || 0)
  $('kpi-viewers-sub').textContent = tiktok?.state === 'connected' ? `@${tiktok.username}` : 'demo yayın'
  const chaos = Math.max(0, Math.min(100, Number(m.chaos) || 0))
  $('kpi-chaos').textContent = `${Math.round(chaos)}%`
  $('kpi-chaos-bar').style.width = `${chaos}%`
  $('kpi-timer').textContent = formatTimer(m.timer ?? settings.roundSeconds)
  $('kpi-state').textContent = m.state === 'paused' ? 'duraklatıldı' : m.state === 'ended' ? 'tur bitti' : 'oyun sürüyor'
  $('kpi-round').textContent = String(m.round ?? 1)
  $('round-tag').textContent = `TUR ${m.round ?? 1}`
  const wins = m.wins ?? {}
  $('kpi-wins').textContent = `Chat ${wins.chat ?? 0} · Çaycı ${wins.cayci ?? 0}`
  const customers = Number(m.customers) || players.filter((p) => p.role === 'musteri').length
  const apprentices = Number(m.apprentices) || players.filter((p) => p.role === 'apprentice').length
  $('kpi-players').textContent = `${customers}/${apprentices}`
  $('kpi-seats').textContent = `${Number(m.seats) || 0}/${Number(m.totalSeats) || 0} masa dolu`
  $('kpi-gifts').textContent = `${compact(m.gifts ?? 0)}/${compact(m.likes ?? 0)}`
  $('kpi-fights').textContent = `${Number(m.fights) || 0} kavga · ${Number(m.spectators) || 0} izleyici`
  renderPlayers(players)
}

function playerStatusLabel(player) {
  const role = player.role
  if (role === 'cayci') return 'Çaycı'
  if (role === 'zabita') return 'Zabıta'
  if (role === 'muhtar') return 'Muhtar'
  if (role === 'apprentice') return `Çırak · ${player.status ?? ''}`
  return player.table != null ? `Masa ${Number(player.table) + 1} · ${player.status ?? ''}` : player.status ?? 'Müşteri'
}

function renderPlayers(players) {
  const list = Array.isArray(players) ? players : []
  const box = $('players')
  $('player-tag').textContent = `${list.length} kişi`
  if (!list.length) {
    box.innerHTML = '<p class="empty">Henüz oyuncu yok. Simülatörden bir olay gönder.</p>'
    return
  }
  box.innerHTML = list.map((p) => {
    const role = String(p.role ?? 'musteri')
    const builtIn = ['cayci', 'zabita', 'muhtar'].includes(role)
    const avatar = p.avatar
      ? `<img src="${esc(p.avatar)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph',textContent:'👤'}))" />`
      : `<span class="ph">${role === 'cayci' ? '🫖' : role === 'zabita' ? '🚨' : role === 'muhtar' ? '🎩' : '👤'}</span>`
    const kick = builtIn
      ? ''
      : `<button class="btn danger" data-kick="${esc(p.id)}" title="Meydandan çıkar">Çıkar</button>`
    return `<div class="player">
      ${avatar}
      <div class="player-meta">
        <div class="player-name">${esc(p.nickname || 'izleyici')}</div>
        <div class="player-sub">${esc(playerStatusLabel(p))}</div>
      </div>
      ${kick}
    </div>`
  }).join('')
}

/* ----------------------------------------------------------------- mapping */

function actionOptions(selected, list = ALL_ACTIONS) {
  return list
    .map((id) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${esc(ACTIONS[id]?.title ?? id)}</option>`)
    .join('')
}

function renderActionSelects() {
  $('likes-action').innerHTML = actionOptions(draft.likes, GIFT_ACTIONS)
  $('command-1').innerHTML = actionOptions(draft.commands['1'], COMMAND_ACTIONS)
  $('command-2').innerHTML = actionOptions(draft.commands['2'], COMMAND_ACTIONS)
}

function renderRanges() {
  const box = $('ranges')
  box.innerHTML = draft.ranges.map((range, index) => `
    <div class="range-row" data-index="${index}">
      <input type="number" min="1" max="9999999" value="${range.min}" data-range="min" aria-label="En az jeton" />
      <span class="range-sep">–</span>
      <input type="number" min="1" max="9999999" value="${range.max}" data-range="max" aria-label="En çok jeton" />
      <select data-range="action" aria-label="Aralık aksiyonu">${actionOptions(range.action, GIFT_ACTIONS)}</select>
    </div>
  `).join('')
}

function catalogRows() {
  const byId = new Map()
  for (const gift of catalog) {
    const id = String(gift.id ?? gift.name ?? '')
    if (!id) continue
    byId.set(id, {
      id,
      name: gift.name ?? 'Hediye',
      coins: Number(gift.coins ?? 0),
      emoji: gift.emoji || '🎁',
      image: gift.image || ''
    })
  }
  // Keep overrides that are not in the live catalogue visible.
  for (const id of Object.keys(draft.overrides)) {
    if (!byId.has(id)) byId.set(id, { id, name: `Özel hediye #${id}`, coins: 0, emoji: '🎁', image: '' })
  }
  return [...byId.values()].sort((a, b) => a.coins - b.coins || a.name.localeCompare(b.name, 'tr'))
}

function renderGiftTable() {
  const needle = giftFilter.trim().toLowerCase()
  const rows = catalogRows().filter((gift) =>
    !needle || gift.name.toLowerCase().includes(needle) || String(gift.id).includes(needle)
  )
  const box = $('gift-table')
  if (!rows.length) {
    box.innerHTML = '<p class="empty">Eşleşen hediye yok.</p>'
    return
  }
  box.innerHTML = rows.map((gift) => {
    const override = draft.overrides[gift.id] ?? ''
    const icon = gift.image
      ? `<img src="${esc(gift.image)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${esc(gift.emoji)}'}))" />`
      : esc(gift.emoji)
    return `<div class="gift-row" data-gift-id="${esc(gift.id)}">
      <span class="gift-icon">${icon}</span>
      <span class="gift-name" title="${esc(gift.name)}">${esc(gift.name)}</span>
      <span class="gift-coins">${gift.coins ? `${compact(gift.coins)} ⬤` : '—'}</span>
      <select data-override="${esc(gift.id)}" class="${override ? 'changed' : ''}" aria-label="${esc(gift.name)} aksiyonu">
        <option value="">Aralık kuralı</option>
        ${actionOptions(override, GIFT_ACTIONS)}
      </select>
    </div>`
  }).join('')
}

function setDirty(value = true) {
  dirty = value
  const tag = $('mapping-tag')
  tag.textContent = dirty ? 'KAYDEDİLMEDİ' : 'TEMİZ'
  tag.className = `tag ${dirty ? 'warn' : 'ok'}`
  if (dirty) setSaveNote('Kaydedilmemiş değişiklikler var.', true)
}

function setSaveNote(text, warn = false) {
  const el = $('save-note')
  el.textContent = text
  el.className = `save-note ${warn ? 'warn' : ''}`
  if (text) {
    clearTimeout(setSaveNote.timer)
    setSaveNote.timer = setTimeout(() => {
      if (dirty) return
      el.textContent = ''
    }, 4200)
  }
}

$('likes-action').addEventListener('change', (e) => {
  draft.likes = e.target.value
  setDirty()
})

$('command-1').addEventListener('change', (e) => {
  draft.commands['1'] = e.target.value
  setDirty()
})

$('command-2').addEventListener('change', (e) => {
  draft.commands['2'] = e.target.value
  setDirty()
})

$('ranges').addEventListener('input', (e) => {
  const row = e.target.closest('.range-row')
  if (!row) return
  const range = draft.ranges[Number(row.dataset.index)]
  if (!range) return
  if (e.target.dataset.range === 'min') range.min = Math.max(0, Math.round(Number(e.target.value) || 0))
  if (e.target.dataset.range === 'max') range.max = Math.max(0, Math.round(Number(e.target.value) || 0))
  setDirty()
})

$('ranges').addEventListener('change', (e) => {
  const row = e.target.closest('.range-row')
  if (!row || e.target.dataset.range !== 'action') return
  const range = draft.ranges[Number(row.dataset.index)]
  if (range) range.action = e.target.value
  setDirty()
})

$('gift-table').addEventListener('change', (e) => {
  const id = e.target.dataset.override
  if (!id) return
  if (e.target.value) draft.overrides[id] = e.target.value
  else delete draft.overrides[id]
  e.target.classList.toggle('changed', Boolean(e.target.value))
  setDirty()
})

$('gift-search').addEventListener('input', (e) => {
  giftFilter = e.target.value
  renderGiftTable()
})

$('save-mapping').addEventListener('click', () => {
  const normalized = normalizeMapping(draft)
  savedMapping = normalized
  draft = clone(normalized)
  net.saveMapping(normalized)
  setDirty(false)
  renderActionSelects()
  renderRanges()
  renderGiftTable()
  setSaveNote(net.mode === 'socket' ? 'Kurallar sunucuya kaydedildi.' : 'Kurallar bu tarayıcıya kaydedildi.')
  toast('Hediye kuralları güncellendi.', 'ok')
})

$('reset-mapping').addEventListener('click', () => {
  draft = clone(normalizeMapping(DEFAULT_MAPPING))
  savedMapping = clone(draft)
  net.saveMapping(draft)
  setDirty(false)
  renderActionSelects()
  renderRanges()
  renderGiftTable()
  setSaveNote('Varsayılan kurallar yüklendi.')
  toast('Varsayılan hediye kuralları yüklendi.', 'ok')
})

/* ---------------------------------------------------------------- settings */

function renderSliders() {
  $('sliders').innerHTML = SLIDERS.map((s) => {
    const value = Number(settings[s.key] ?? DEFAULT_SETTINGS[s.key])
    const pct = ((value - s.min) / (s.max - s.min)) * 100
    return `<div class="slider">
      <label for="slider-${s.key}"><span>${s.label}</span><output id="out-${s.key}">${value}${s.unit}</output></label>
      <input id="slider-${s.key}" type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${value}"
        data-setting="${s.key}" style="--fill:${pct}%" />
    </div>`
  }).join('')
}

function renderSettings() {
  $('time-of-day').value = settings.timeOfDay
  $('aspect').value = settings.aspect
  $('auto-demo').checked = Boolean(settings.autoDemo)
}

$('sliders').addEventListener('input', (e) => {
  const key = e.target.dataset.setting
  if (!key) return
  const spec = SLIDERS.find((s) => s.key === key)
  const value = Number(e.target.value)
  settings[key] = value
  const pct = spec ? ((value - spec.min) / (spec.max - spec.min)) * 100 : 50
  e.target.style.setProperty('--fill', `${pct}%`)
  const out = $(`out-${key}`)
  if (out) out.textContent = `${value}${spec?.unit ?? ''}`
  queueSettings({ [key]: value })
})

function queueSettings(patch) {
  settingsEchoUntil = Date.now() + 900
  clearTimeout(settingsTimer)
  settingsTimer = setTimeout(() => {
    settings = net.saveSettings(patch)
    toast('Atmosfer ayarı uygulandı.', 'ok')
  }, 160)
}

$('time-of-day').addEventListener('change', (e) => {
  settings.timeOfDay = e.target.value
  queueSettings({ timeOfDay: e.target.value })
})

$('aspect').addEventListener('change', (e) => {
  settings.aspect = e.target.value
  queueSettings({ aspect: e.target.value })
})

$('auto-demo').addEventListener('change', (e) => {
  settings.autoDemo = e.target.checked
  queueSettings({ autoDemo: e.target.checked })
})

/* ------------------------------------------------------------- connection */

$('connect-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const username = $('username').value.trim().replace(/^@+/, '')
  if (!/^[\w.]{2,64}$/.test(username)) {
    toast('Geçerli bir TikTok kullanıcı adı gir.', 'bad')
    return
  }
  if (net.mode !== 'socket') {
    toast('TikTok bağlantısı için Node sunucusu gerekli. `npm start` ile aç.', 'bad')
    return
  }
  net.emit('admin:connect', { username })
  toast(`@${username} için bağlantı isteniyor…`)
})

$('disconnect-btn').addEventListener('click', () => {
  net.emit('admin:disconnect')
  toast('TikTok bağlantısı kapatılıyor.')
})

/* ----------------------------------------------------------------- rounds */

document.querySelectorAll('[data-round]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.round
    net.emit('admin:round', { action })
    toast(`Tur komutu: ${button.textContent.trim()}`)
  })
})

$('kick-all').addEventListener('click', () => {
  const players = (metrics?.players ?? []).filter((p) => !['cayci', 'zabita', 'muhtar'].includes(p.role))
  if (!players.length) {
    toast('Meydanda çıkarılacak oyuncu yok.')
    return
  }
  for (const player of players) net.emit('admin:kick', { id: player.id })
  toast(`${players.length} oyuncu meydandan çıkarıldı.`, 'ok')
})

$('players').addEventListener('click', (e) => {
  const id = e.target.closest('[data-kick]')?.dataset.kick
  if (!id) return
  net.emit('admin:kick', { id })
  toast('Oyuncu meydandan çıkarıldı.')
})

/* --------------------------------------------------------------- simulator */

const RANDOM_CHATS = ['1', '2', 'çaycı koş!', 'maç başladı', 'çay lütfen', 'bu ne kaos', 'masa boş mu?']

document.querySelectorAll('[data-sim]').forEach((button) => {
  button.addEventListener('click', () => {
    const kind = button.dataset.sim
    const payload = { kind }
    if (kind === 'join') payload.command = button.dataset.command === '2' ? '2' : '1'
    if (kind === 'gift') payload.coins = Number(button.dataset.coins) || 1
    if (kind === 'chat') payload.text = RANDOM_CHATS[Math.floor(Math.random() * RANDOM_CHATS.length)]
    net.emit('admin:simulate', payload)
    toast(`Simülasyon: ${button.textContent.trim()}`, 'ok')
  })
})

$('sim-random').addEventListener('click', () => {
  const roll = Math.random()
  let payload
  if (roll < 0.25) payload = { kind: 'chat', text: RANDOM_CHATS[Math.floor(Math.random() * RANDOM_CHATS.length)] }
  else if (roll < 0.45) payload = { kind: 'like', count: 5 + Math.floor(Math.random() * 40) }
  else if (roll < 0.55) payload = { kind: 'member' }
  else {
    const coins = [1, 5, 10, 20, 30, 49, 100, 249, 300, 1000][Math.floor(Math.random() * 10)]
    payload = { kind: 'gift', coins }
  }
  net.emit('admin:simulate', payload)
  toast(`Rastgele olay: ${payload.kind}`, 'ok')
})

/* -------------------------------------------------------------------- log */

function addLog(kind, label, message, level = '') {
  logCount += 1
  $('log-count').textContent = `${logCount} olay`
  if (logPaused || !message) return
  const li = document.createElement('li')
  li.className = `${kind} ${level}`.trim()
  li.innerHTML = `<time>${formatClock()}</time><span class="kind">${esc(label)}</span><span class="msg">${message}</span>`
  const log = $('log')
  log.prepend(li)
  while (log.children.length > 220) log.lastElementChild.remove()
}

function logGameEvent(event) {
  const user = event.user?.nickname ? `<b>${esc(event.user.nickname)}</b>` : ''
  switch (event.type) {
    case 'chat': {
      const action = event.command ? ACTIONS[event.command]?.title : null
      addLog('chat', 'sohbet', `${user} ${esc(String(event.text ?? '').slice(0, 70))}${action ? ` <em>→ ${esc(action)}</em>` : ''}`)
      break
    }
    case 'gift': {
      const gift = event.gift ?? {}
      const action = event.action ? ACTIONS[event.action]?.title : '—'
      addLog('gift', 'hediye', `${user} <b>${esc(gift.name ?? 'Hediye')}</b> ×${Number(gift.count) || 1} · ${compact(gift.coins ?? 0)} ⬤ <em>→ ${esc(action)}</em>`)
      break
    }
    case 'like':
      addLog('like', 'beğeni', `${user} +${compact(event.count ?? 1)} beğeni${event.total ? ` · toplam ${compact(event.total)}` : ''}`)
      break
    case 'member':
      addLog('member', 'üye', `${user} yayına katıldı`)
      break
    case 'follow':
      addLog('member', 'takip', `${user} takip etti`)
      break
    case 'share':
      addLog('member', 'paylaşım', `${user} yayını paylaştı`)
      break
    default:
      addLog('trace', String(event.type ?? 'olay'), `${user} ${esc(event.text ?? '')}`.trim())
  }
}

$('log-clear').addEventListener('click', () => {
  $('log').innerHTML = ''
  logCount = 0
  $('log-count').textContent = '0 olay'
})

$('log-pause').addEventListener('click', () => {
  logPaused = !logPaused
  $('log-pause').textContent = logPaused ? 'Devam et' : 'Duraklat'
})

/* ------------------------------------------------------------------ toast */

function toast(message, kind = '') {
  const stack = $('toasts')
  const el = document.createElement('div')
  el.className = `toast ${kind}`
  el.textContent = message
  stack.appendChild(el)
  while (stack.children.length > 4) stack.firstElementChild.remove()
  setTimeout(() => el.remove(), 3200)
}

/* ------------------------------------------------------------------- nav */

const sections = [...document.querySelectorAll('main section[id]')]
const links = [...document.querySelectorAll('.nav a')]
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      links.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`))
    }
  }, { rootMargin: '-20% 0px -65% 0px' })
  sections.forEach((section) => observer.observe(section))
}

/* ------------------------------------------------------------- initial sync */

renderClients()
setDirty(false)
net.ready.then(() => {
  if (net.socket) requestStateSoon()
})

function requestStateSoon() {
  // The server sends `hello` on connect; ask again after the socket settles so
  // an admin opened after the game still receives the latest metrics.
  setTimeout(() => net.requestState(), 400)
}

window.addEventListener('beforeunload', (event) => {
  if (!dirty) return
  event.preventDefault()
  event.returnValue = ''
})
