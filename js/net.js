/**
 * Small transport abstraction: Socket.IO when the Node backend is present,
 * BroadcastChannel + localStorage when the game is hosted statically (the
 * published build still plays, using the local demo director).
 */
import {
  DEFAULT_CATALOG,
  DEFAULT_MAPPING,
  DEFAULT_SETTINGS,
  demoAvatar,
  demoUsers,
  normalizeMapping,
  normalizeSettings,
  resolveChatAction,
  resolveGiftAction
} from './shared/actions.js'

const CHANNEL = 'cay-ocagi-kaosu-v3'
const LS = {
  mapping: 'cay-ocagi:mapping',
  settings: 'cay-ocagi:settings'
}

const readJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

let demoCounter = 0
export function makeDemoUser() {
  const user = demoUsers[demoCounter % demoUsers.length]
  demoCounter += 1
  return {
    id: `${user.id}-${demoCounter}`,
    nickname: user.nickname,
    avatar: demoAvatar(user)
  }
}

/** Build an event locally, mirroring the server's simulator. */
export function buildLocalEvent(payload = {}, mapping = DEFAULT_MAPPING) {
  const user = payload.user ?? makeDemoUser()
  const kind = payload.kind ?? payload.type ?? 'chat'
  if (kind === 'like') {
    const count = Math.max(1, Number(payload.count) || 12)
    return { type: 'like', user, count, total: count, source: 'sim' }
  }
  if (kind === 'gift') {
    const coins = Math.max(1, Number(payload.coins) || 1)
    const giftId = String(payload.giftId ?? `sim-${coins}`)
    return {
      type: 'gift',
      user,
      action:
        payload.action ??
        resolveGiftAction(mapping, { giftId, coins, name: payload.giftName }) ??
        'SPAWN_IMPATIENT',
      gift: {
        id: giftId,
        name: payload.giftName ?? 'Simülasyon Hediyesi',
        coins,
        count: Math.max(1, Number(payload.count) || 1),
        repeatEnd: true
      },
      coins,
      source: 'sim'
    }
  }
  if (kind === 'join') {
    const command = payload.command === '2' ? '2' : '1'
    return {
      type: 'chat',
      text: command,
      user,
      command: resolveChatAction(mapping, command),
      source: 'sim'
    }
  }
  if (kind === 'member') return { type: 'member', user, source: 'sim' }
  return {
    type: 'chat',
    text: String(payload.text ?? '1'),
    user,
    command: resolveChatAction(mapping, payload.text ?? '1'),
    source: 'sim'
  }
}

export class Net {
  constructor({ role }) {
    this.role = role
    this.mode = 'local'
    this.socket = null
    this.channel = null
    this.handlers = new Map()
    this.mapping = normalizeMapping(readJSON(LS.mapping, DEFAULT_MAPPING))
    this.settings = normalizeSettings(readJSON(LS.settings, DEFAULT_SETTINGS))
    this.catalog = DEFAULT_CATALOG.map((g) => ({ ...g, source: 'default' }))
    this.ready = this.init()
  }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event).add(fn)
    return () => this.handlers.get(event)?.delete(fn)
  }

  dispatch(event, payload) {
    for (const fn of this.handlers.get(event) ?? []) {
      try {
        fn(payload)
      } catch (error) {
        console.error(`[net] handler ${event}`, error)
      }
    }
    for (const fn of this.handlers.get('*') ?? []) {
      try {
        fn(event, payload)
      } catch (error) {
        console.error('[net] wildcard handler', error)
      }
    }
  }

  async init() {
    this.channel = new BroadcastChannel(CHANNEL)
    this.channel.onmessage = (message) => {
      const { event, payload } = message.data ?? {}
      if (!event) return
      if (event === 'request-state' && this.role === 'game') {
        this.dispatch('state-request', payload)
      }
      this.dispatch(event, payload)
    }
    try {
      const response = await fetch('/api/health', { signal: AbortSignal.timeout(1800) })
      const health = await response.json()
      if (!response.ok || !health?.ok) throw new Error('no backend')
      await this.loadSocketIo()
      this.connectSocket()
    } catch {
      this.mode = 'local'
      this.dispatch('mode', { mode: 'local' })
      this.dispatch('hello', {
        mapping: this.mapping,
        settings: this.settings,
        catalog: this.catalog,
        catalogSource: 'local',
        tiktok: { state: 'idle', username: '', viewers: 0, message: 'Statik demo modu' }
      })
    }
  }

  loadSocketIo() {
    return new Promise((resolve, reject) => {
      if (window.io) return resolve(window.io)
      const script = document.createElement('script')
      script.src = '/socket.io/socket.io.js'
      script.async = true
      script.onload = () => resolve(window.io)
      script.onerror = () => reject(new Error('socket.io client yüklenemedi'))
      document.head.appendChild(script)
    })
  }

  connectSocket() {
    const socket = window.io({ transports: ['websocket', 'polling'] })
    this.socket = socket
    this.mode = 'socket'
    socket.on('connect', () => {
      socket.emit('client:role', this.role)
      this.dispatch('mode', { mode: 'socket' })
    })
    socket.on('disconnect', () => this.dispatch('mode', { mode: 'offline' }))

    const forwarded = [
      'hello', 'settings', 'mapping', 'gift:catalog', 'tiktok:status', 'tiktok:log',
      'game:event', 'metrics', 'round:command', 'player:kick', 'game:trace', 'clients'
    ]
    for (const event of forwarded) {
      socket.on(event, (payload) => {
        if (event === 'hello') {
          this.mapping = normalizeMapping(payload.mapping)
          this.settings = normalizeSettings(payload.settings)
          if (Array.isArray(payload.catalog) && payload.catalog.length) this.catalog = payload.catalog
        }
        if (event === 'mapping' && payload?.mapping) {
          this.mapping = normalizeMapping(payload.mapping)
          localStorage.setItem(LS.mapping, JSON.stringify(this.mapping))
        }
        if (event === 'settings' && payload) {
          this.settings = normalizeSettings(payload)
          localStorage.setItem(LS.settings, JSON.stringify(this.settings))
        }
        if (event === 'gift:catalog' && Array.isArray(payload?.gifts)) this.catalog = payload.gifts
        this.dispatch(event, payload)
      })
    }
  }

  emit(event, payload) {
    if (this.socket?.connected) {
      this.socket.emit(event, payload)
      return
    }
    if (event.startsWith('admin:') && this.role === 'admin') {
      if (event === 'admin:simulate') {
        const evt = buildLocalEvent(payload, this.mapping)
        this.channel.postMessage({ event: 'game:event', payload: evt })
        this.dispatch('game:event', evt)
        return
      }
      if (event === 'admin:settings') {
        this.settings = normalizeSettings({ ...this.settings, ...payload })
        localStorage.setItem(LS.settings, JSON.stringify(this.settings))
        this.channel.postMessage({ event: 'settings', payload: this.settings })
        this.dispatch('settings', this.settings)
        return
      }
      if (event === 'admin:mapping' || event === 'admin:gifts') {
        this.mapping = normalizeMapping({ ...this.mapping, ...(payload.mapping ?? payload) })
        localStorage.setItem(LS.mapping, JSON.stringify(this.mapping))
        this.channel.postMessage({ event: 'mapping', payload: { mapping: this.mapping } })
        this.dispatch('mapping', { mapping: this.mapping })
        return
      }
      const map = {
        'admin:round': 'round:command',
        'admin:kick': 'player:kick'
      }
      const forward = map[event]
      if (forward) {
        this.channel.postMessage({ event: forward, payload })
        this.dispatch(forward, payload)
      }
      return
    }
    this.channel.postMessage({ event, payload })
  }

  /** Persist the assignment board (both transports ultimately reach the game). */
  saveMapping(mapping) {
    this.mapping = normalizeMapping(mapping)
    localStorage.setItem(LS.mapping, JSON.stringify(this.mapping))
    if (this.socket?.connected) {
      this.socket.emit('admin:gifts', { mapping: this.mapping })
    } else {
      this.channel.postMessage({ event: 'mapping', payload: { mapping: this.mapping } })
      this.dispatch('mapping', { mapping: this.mapping })
    }
  }

  saveSettings(patch) {
    this.settings = normalizeSettings({ ...this.settings, ...patch })
    localStorage.setItem(LS.settings, JSON.stringify(this.settings))
    if (this.socket?.connected) this.socket.emit('admin:settings', this.settings)
    else {
      this.channel.postMessage({ event: 'settings', payload: this.settings })
      this.dispatch('settings', this.settings)
    }
    return this.settings
  }

  requestState() {
    if (this.socket?.connected) this.socket.emit('admin:request')
    else this.channel.postMessage({ event: 'request-state', payload: { at: Date.now() } })
  }

  sendMetrics(metrics) {
    if (this.socket?.connected) this.socket.emit('game:metrics', metrics)
    else this.channel.postMessage({ event: 'metrics', payload: metrics })
  }

  trace(event) {
    if (this.socket?.connected) this.socket.emit('game:event-local', event)
    else this.channel.postMessage({ event: 'game:trace', payload: event })
  }
}
