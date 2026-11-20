/**
 * Shared, dependency-free rules for the Çay Ocağı Kaosu game.
 * Imported by the Node server, both browser pages and the unit tests, so the
 * admin dashboard and the game can never disagree about a gift action.
 */

export const ACTIONS = {
  BOOST_STOVE: {
    id: 'BOOST_STOVE',
    title: 'Semaver Harlansın',
    short: 'SemAVER BOOST',
    icon: '🔥',
    tag: 'Beğeni / Tap',
    hint: 'Beğeniler ocağı harlar, çaycı 2× hızlanır.',
    color: '#ff8a3d',
    duration: 8
  },
  SPAWN_IMPATIENT: {
    id: 'SPAWN_IMPATIENT',
    title: 'Sabırsız Müşteri',
    short: 'SABIRSIZ',
    icon: '🌹',
    tag: '1–9 jeton',
    hint: 'Meydana sinirli bir müşteri girer, masaya vurur.',
    color: '#ffb020',
    duration: 10
  },
  OKEY_FIGHT: {
    id: 'OKEY_FIGHT',
    title: 'Okey Taşı Kavgası',
    short: 'OKEY KAVGASI',
    icon: '🀄',
    tag: '10–29 jeton',
    hint: 'Masadakiler ayaklanır, okey taşları havada uçar.',
    color: '#f05252',
    duration: 12
  },
  THROW_TOST_CAY: {
    id: 'THROW_TOST_CAY',
    title: 'Çay & Tost Yağmuru',
    short: 'ÇAY-TOST',
    icon: '🫖',
    tag: '30–99 jeton',
    hint: 'Altın tepsiyle tüm masalara çay ve kaşarlı tost yağar.',
    color: '#43c98b',
    duration: 7
  },
  ZABITA_RAID: {
    id: 'ZABITA_RAID',
    title: 'Zabıta Baskını',
    short: 'ZABITA',
    icon: '🚨',
    tag: '100–299 jeton',
    hint: 'Zabıta gelir; ışıklar kırmızı-mavi olur, çaycı saklanır.',
    color: '#4d8dff',
    duration: 15
  },
  MUHTAR_VIP: {
    id: 'MUHTAR_VIP',
    title: 'Muhtar Ziyareti',
    short: 'MUHTAR',
    icon: '🎩',
    tag: '300+ jeton',
    hint: 'Muhtar kavgaları durdurur, 45 sn dokunulmazlık verir.',
    color: '#ffd166',
    duration: 45
  },
  JOIN_CUSTOMER: {
    id: 'JOIN_CUSTOMER',
    title: 'Müşteri Olarak Gel',
    short: 'MÜŞTERİ',
    icon: '💬',
    tag: 'Yorum: 1',
    hint: 'Profil fotoğrafınla masaya oturur, kaosu artırırsın.',
    color: '#a78bfa',
    duration: 0
  },
  JOIN_APPRENTICE: {
    id: 'JOIN_APPRENTICE',
    title: 'Çırak Ol',
    short: 'ÇIRAK',
    icon: '🧹',
    tag: 'Yorum: 2',
    hint: 'Boş bardakları toplar, kaosu düşürürsün.',
    color: '#38bdf8',
    duration: 0
  }
}

export const ACTION_ORDER = [
  'BOOST_STOVE',
  'SPAWN_IMPATIENT',
  'OKEY_FIGHT',
  'THROW_TOST_CAY',
  'ZABITA_RAID',
  'MUHTAR_VIP'
]

export const DEFAULT_MAPPING = {
  version: 3,
  likes: 'BOOST_STOVE',
  commands: { 1: 'JOIN_CUSTOMER', 2: 'JOIN_APPRENTICE' },
  ranges: [
    { min: 1, max: 9, action: 'SPAWN_IMPATIENT' },
    { min: 10, max: 29, action: 'OKEY_FIGHT' },
    { min: 30, max: 99, action: 'THROW_TOST_CAY' },
    { min: 100, max: 299, action: 'ZABITA_RAID' },
    { min: 300, max: 999999, action: 'MUHTAR_VIP' }
  ],
  overrides: {}
}

export const DEFAULT_SETTINGS = {
  roundSeconds: 300,
  chaosTarget: 100,
  timeOfDay: 'dusk',
  lightIntensity: 1,
  bloom: 0.85,
  fog: 0.45,
  volume: 0.65,
  muted: false,
  aspect: 'auto',
  autoDemo: true
}

/**
 * Offline catalogue used for the admin drag & drop board and whenever the
 * TikTok gift list cannot be fetched. Values mirror the 2026 live catalogue
 * ranges (coin value, icon emoji). Real values replace these on connect.
 */
export const DEFAULT_CATALOG = [
  { id: '5655', name: 'Gül', coins: 1, emoji: '🌹', image: '' },
  { id: '5827', name: 'TikTok', coins: 1, emoji: '🎵', image: '' },
  { id: '5386', name: 'Parmak Kalbi', coins: 5, emoji: '🫰', image: '' },
  { id: '6408', name: 'Buzlu Çay', coins: 5, emoji: '🧋', image: '' },
  { id: '6410', name: 'Kalp', coins: 10, emoji: '❤️', image: '' },
  { id: '6638', name: 'Şapka', coins: 20, emoji: '🎩', image: '' },
  { id: '6104', name: 'Donut', coins: 30, emoji: '🍩', image: '' },
  { id: '6429', name: 'Corgi', coins: 100, emoji: '🐕', image: '' },
  { id: '6120', name: 'Aslan', coins: 300, emoji: '🦁', image: '' },
  { id: '6093', name: 'Evren', coins: 1000, emoji: '🌌', image: '' },
  { id: '5994', name: 'Kale', coins: 5000, emoji: '🏰', image: '' },
  { id: '5824', name: 'Uzay Gemisi', coins: 19999, emoji: '🚀', image: '' },
  { id: '6195', name: 'Melek Kanadı', coins: 299, emoji: '🪽', image: '' },
  { id: '6288', name: 'Çay Bardağı', coins: 49, emoji: '🫖', image: '' },
  { id: '6324', name: 'Okey Masası', coins: 249, emoji: '🀄', image: '' },
  { id: '5881', name: 'Davul', coins: 199, emoji: '🥁', image: '' }
]

const cleanAction = (action) => (ACTIONS[action] ? action : null)

/** Resolve a gift to an action. Explicit gift-id overrides win over ranges. */
export function resolveGiftAction(mapping, { giftId, coins, name } = {}) {
  const map = normalizeMapping(mapping)
  if (giftId != null && map.overrides[String(giftId)]) {
    return cleanAction(map.overrides[String(giftId)])
  }
  const cost = Number(coins)
  if (Number.isFinite(cost) && cost > 0) {
    const range = map.ranges.find((r) => cost >= r.min && cost <= r.max)
    if (range) return cleanAction(range.action)
  }
  // Last resort: partial name match from the board (e.g. "Rose" -> Gül).
  if (name) {
    const hit = Object.entries(map.overrides).find(([key, action]) =>
      key.toLowerCase() === String(name).toLowerCase() && ACTIONS[action]
    )
    if (hit) return hit[1]
  }
  return 'SPAWN_IMPATIENT'
}

/** "1", " 1 ", "1️⃣", "BİR" -> JOIN_CUSTOMER */
export function resolveChatAction(mapping, text) {
  const map = normalizeMapping(mapping)
  const raw = String(text ?? '')
    .replace(/[\uFE0F\u20E3]/g, '')
    .trim()
    .toLowerCase()
  const key = raw.match(/^[12]/)?.[0]
  if (!key) return null
  return cleanAction(map.commands[key]) ?? null
}

export function normalizeMapping(input) {
  const source = input && typeof input === 'object' ? input : {}
  const ranges = Array.isArray(source.ranges) && source.ranges.length
    ? source.ranges
        .map((r) => ({
          min: Math.max(0, Math.round(Number(r.min) || 0)),
          max: Math.max(0, Math.round(Number(r.max) || 0)),
          action: cleanAction(r.action) ?? 'SPAWN_IMPATIENT'
        }))
        .sort((a, b) => a.min - b.min)
    : structuredClone(DEFAULT_MAPPING.ranges)
  const overrides = {}
  for (const [id, action] of Object.entries(source.overrides ?? {})) {
    if (ACTIONS[action]) overrides[String(id)] = action
  }
  return {
    version: 3,
    likes: cleanAction(source.likes) ?? 'BOOST_STOVE',
    commands: {
      1: cleanAction(source.commands?.[1]) ?? 'JOIN_CUSTOMER',
      2: cleanAction(source.commands?.[2]) ?? 'JOIN_APPRENTICE'
    },
    ranges,
    overrides
  }
}

export function mergeMapping(base, patch = {}) {
  const merged = normalizeMapping(base)
  if (patch.likes) merged.likes = cleanAction(patch.likes) ?? merged.likes
  if (patch.commands) {
    if (patch.commands[1]) merged.commands[1] = cleanAction(patch.commands[1]) ?? merged.commands[1]
    if (patch.commands[2]) merged.commands[2] = cleanAction(patch.commands[2]) ?? merged.commands[2]
  }
  if (Array.isArray(patch.ranges)) merged.ranges = normalizeMapping({ ranges: patch.ranges }).ranges
  if (patch.overrides && typeof patch.overrides === 'object') {
    for (const [id, action] of Object.entries(patch.overrides)) {
      if (action === null) delete merged.overrides[String(id)]
      else if (ACTIONS[action]) merged.overrides[String(id)] = action
    }
  }
  return merged
}

export function normalizeSettings(input = {}) {
  const s = { ...DEFAULT_SETTINGS, ...(input && typeof input === 'object' ? input : {}) }
  const clamp = (v, lo, hi, fallback) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
  }
  return {
    roundSeconds: Math.round(clamp(s.roundSeconds, 60, 1800, 300)),
    chaosTarget: Math.round(clamp(s.chaosTarget, 50, 200, 100)),
    timeOfDay: ['dusk', 'night', 'golden'].includes(s.timeOfDay) ? s.timeOfDay : 'dusk',
    lightIntensity: clamp(s.lightIntensity, 0.2, 2, 1),
    bloom: clamp(s.bloom, 0, 2.5, 0.85),
    fog: clamp(s.fog, 0, 1, 0.45),
    volume: clamp(s.volume, 0, 1, 0.65),
    muted: Boolean(s.muted),
    aspect: ['auto', '9:16', '16:9'].includes(s.aspect) ? s.aspect : 'auto',
    autoDemo: Boolean(s.autoDemo)
  }
}

export const CHAOS_RULES = {
  base: 0.12,
  customer: 0.055,
  apprenticeRelief: 0.08,
  teaRelief: 0.75,
  impatientAdd: 12,
  fightAdd: 18,
  zabitaRate: 1.9,
  muhtarRelief: 30,
  tostRelief: 16
}

/** Pure chaos integration step, used by the game and unit tests. */
export function stepChaos(state, dt, context) {
  const {
    customers = 0,
    apprentices = 0,
    fights = 0,
    impatient = 0,
    zabita = false,
    muhtar = false,
    stoves = 0
  } = context ?? {}
  const rules = CHAOS_RULES
  let rate = rules.base + customers * rules.customer
  rate += impatient * 1.4
  rate += fights * 1.7
  rate += zabita ? rules.zabitaRate : 0
  rate -= apprentices * rules.apprenticeRelief
  rate -= stoves * 0.05
  if (muhtar) rate -= 1.4
  const chaos = Math.min(100, Math.max(0, state.chaos + rate * dt))
  return { chaos, rate, target: rules.chaosTarget }
}

export const demoUsers = [
  { id: 'demo-ayse', nickname: 'ayse_teyzee', color: '#ff9f68' },
  { id: 'demo-mehmet', nickname: 'mehmet_okeyci', color: '#7dd3fc' },
  { id: 'demo-zeynep', nickname: 'zeynepcayci', color: '#f9a8d4' },
  { id: 'demo-hasan', nickname: 'hasan_38', color: '#a3e635' },
  { id: 'demo-fatma', nickname: 'fatma.bacı', color: '#fcd34d' },
  { id: 'demo-emre', nickname: 'emre_kavga', color: '#c4b5fd' },
  { id: 'demo-elif', nickname: 'elif_simsek', color: '#67e8f9' },
  { id: 'demo-murat', nickname: 'murat_bakkal', color: '#fda4af' },
  { id: 'demo-gul', nickname: 'gul_çay', color: '#fde68a' },
  { id: 'demo-ali', nickname: 'ali_zabita', color: '#93c5fd' }
]

/** Deterministic SVG avatar for demo viewers (no network needed). */
export function demoAvatar(user) {
  const name = String(user?.nickname ?? 'izleyici')
  const color = user?.color ?? '#f59e0b'
  const initials = name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || 'Ç'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#3b1d0e"/></linearGradient></defs>
  <rect width="128" height="128" rx="26" fill="url(#g)"/>
  <circle cx="64" cy="49" r="23" fill="rgba(255,248,235,.92)"/>
  <path d="M22 128c4-26 20-40 42-40s38 14 42 40z" fill="rgba(255,248,235,.92)"/>
  <text x="64" y="58" text-anchor="middle" font-family="Verdana,sans-serif" font-size="21" font-weight="bold" fill="#3b1d0e">${initials}</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
