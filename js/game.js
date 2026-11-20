/**
 * 3D ÇAY OCAĞI KAOSU — Mahalle Meydanı
 * Three.js scene + live game director + admin bridge.
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

import { buildWorld } from './game/world.js'
import { Character } from './game/characters.js'
import { Effects } from './game/effects.js'
import { sound } from './sound_engine.js'
import { Net, makeDemoUser } from './net.js'
import {
  ACTIONS,
  CHAOS_RULES,
  DEFAULT_CATALOG,
  DEFAULT_MAPPING,
  DEFAULT_SETTINGS,
  demoAvatar,
  demoUsers,
  normalizeSettings,
  resolveGiftAction,
  stepChaos
} from './shared/actions.js'

const $ = (id) => document.getElementById(id)
const dom = {
  app: $('app'),
  stage: $('stage'),
  canvas: $('scene'),
  boot: $('boot'),
  fatal: $('fatal'),
  fatalMessage: $('fatal-message'),
  timer: $('timer'),
  roundNum: $('round-num'),
  roundState: $('round-state'),
  chaosFill: $('chaos-fill'),
  chaosPct: $('chaos-pct'),
  chaosTrack: document.querySelector('.chaos-track'),
  scoreChat: $('score-chat'),
  scoreCayci: $('score-cayci'),
  viewers: $('viewer-count'),
  toasts: $('toasts'),
  ticker: $('ticker-text'),
  demoBadge: $('demo-badge'),
  cinematic: $('cinematic'),
  cineAvatar: $('cine-avatar'),
  cineKicker: $('cine-kicker'),
  cineName: $('cine-name'),
  cineSub: $('cine-sub'),
  cineIcon: $('cine-icon'),
  overlay: $('round-overlay'),
  verdictKicker: $('verdict-kicker'),
  verdictTitle: $('verdict-title'),
  verdictSub: $('verdict-sub'),
  verdictChaos: $('verdict-chaos'),
  verdictRound: $('verdict-round'),
  verdictNext: $('verdict-next'),
  confetti: $('confetti'),
  soundBtn: $('sound-btn'),
  soundLabel: $('sound-label'),
  soundWave: $('sound-wave'),
  aspectBtn: $('aspect-btn'),
  aspectLabel: $('aspect-label'),
  soundHint: $('sound-hint')
}

const MAX_CUSTOMERS = 15
const MAX_APPRENTICES = 4

const settings = { ...DEFAULT_SETTINGS }
let mapping = { ...DEFAULT_MAPPING }

let scene
let camera
let renderer
let composer
let bloom
let world
let effects
let net
let softwareRenderer = false
let portrait = false
let visualTime = 0
let introTime = 0
let lastFrame = performance.now()

const sim = {
  time: 0,
  remaining: 300,
  chaos: 16,
  round: 1,
  running: true,
  paused: false,
  endedAt: 0,
  win: null,
  wins: { chat: 0, cayci: 0 },
  gifts: 0,
  likes: 0,
  spectators: 0,
  resetAt: 0,
  zabitaUntil: 0,
  muhtarUntil: 0,
  boostUntil: 0,
  immunityUntil: 0,
  demoNext: 0,
  metricsAt: 0
}

const chars = {
  cayci: null,
  customers: [],
  apprentices: [],
  zabita: null,
  muhtar: null
}
let seats = []
const seenUsers = new Map()
const tickerQueue = []
const cameraState = {
  pos: new THREE.Vector3(),
  look: new THREE.Vector3(),
  fov: 34,
  shake: 0,
  focus: null,
  base: null
}
let cayciState = null
let toastLock = 0
let viewerFake = 1248
let lastRatio = ''

/* --------------------------------------------------------------- setup */

function showFatal(message) {
  dom.fatal.hidden = false
  dom.fatalMessage.textContent = message
  dom.boot.classList.add('hide')
}

function createRenderer() {
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: dom.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false
    })
  } catch (error) {
    showFatal('WebGL başlatılamadı: ' + error.message)
    throw error
  }
  renderer.setClearColor(0x0a0710, 1)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const gl = renderer.getContext()
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : ''
  softwareRenderer = /swiftshader|llvmpipe|software|mesa offscreen/i.test(gpu)
  if (softwareRenderer) {
    renderer.shadowMap.enabled = false
    renderer.setPixelRatio(1)
  } else {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  }
}

function setupScene() {
  scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x1a1020, 0.012)
  camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 220)
  camera.position.set(16, 14, 22)

  world = buildWorld(scene, renderer)
  effects = new Effects(scene, world)
  applyAtmosphere()

  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  bloom = new UnrealBloomPass(new THREE.Vector2(640, 360), settings.bloom, 0.62, 0.68)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
}

function setupCharacters() {
  chairs: {
    const seatList = []
    world.tables.forEach((table, ti) => {
      table.seats.forEach((seat, si) => {
        seatList.push({ ...seat, tableIndex: ti, seatIndex: si, occupied: null, empty: 0, claimed: null, fightUntil: 0 })
      })
    })
    seats = seatList
  }

  chars.cayci = new Character({
    role: 'cayci',
    user: { id: 'cayci-riza', nickname: 'Çaycı Rıza' },
    x: -2.4,
    z: -8.6,
    ry: 0.4
  })
  chars.cayci.name = 'Çaycı Rıza'
  scene.add(chars.cayci.group)
  setupCayci()
}

function setupCayci() {
  cayciState = { phase: 'idle', timer: 0, tray: 0, hiding: false, busy: false, target: null, lastTable: null }
  chars.cayci.showTray(false)
  chars.cayci.setPose('idle')
}

function applyAtmosphere() {
  if (!scene) return
  const preset = {
    dusk: {
      top: 0x120b26, mid: 0x3a2043, bottom: 0xd06a3a, sun: 0xffb066,
      sunDir: new THREE.Vector3(-0.55, 0.07, 0.83), fog: 0x1a1020, density: 0.0125,
      hemiSky: 0x5b4b86, hemiGround: 0x23160f, hemi: 0.9,
      key: 0xffc08a, keyIntensity: 2.4, rim: 0.55, exposure: 1.06, stars: 0.65
    },
    night: {
      top: 0x040615, mid: 0x131a3a, bottom: 0x2a2a45, sun: 0x8ea0ff,
      sunDir: new THREE.Vector3(0.35, 0.55, -0.55), fog: 0x090b1a, density: 0.017,
      hemiSky: 0x3b4a7a, hemiGround: 0x171019, hemi: 0.7,
      key: 0x9fb4ff, keyIntensity: 1.25, rim: 0.8, exposure: 0.95, stars: 1
    },
    golden: {
      top: 0x2a1e4a, mid: 0xa05a4a, bottom: 0xffb36b, sun: 0xffd27a,
      sunDir: new THREE.Vector3(-0.8, 0.13, 0.55), fog: 0x2a1a1e, density: 0.0105,
      hemiSky: 0x8a6a6a, hemiGround: 0x2a1a10, hemi: 1.0,
      key: 0xffb066, keyIntensity: 2.9, rim: 0.45, exposure: 1.12, stars: 0.25
    }
  }[settings.timeOfDay] ?? null
  if (!preset) return
  const u = world.skyUniforms
  u.topColor.value.setHex(preset.top)
  u.midColor.value.setHex(preset.mid)
  u.bottomColor.value.setHex(preset.bottom)
  u.sunColor.value.setHex(preset.sun)
  u.sunDir.value.copy(preset.sunDir).normalize()
  scene.fog.color.setHex(preset.fog)
  scene.fog.density = preset.density * (0.4 + settings.fog * 1.55)
  world.hemi.color.setHex(preset.hemiSky)
  world.hemi.groundColor.setHex(preset.hemiGround)
  world.hemi.intensity = preset.hemi * settings.lightIntensity
  world.keyLight.color.setHex(preset.key)
  world.keyLight.intensity = preset.keyIntensity * settings.lightIntensity
  world.rimLight.intensity = preset.rim * settings.lightIntensity
  world.houseLight.intensity = 24 * settings.lightIntensity
  world.bulbLight.intensity = 19 * settings.lightIntensity
  world.terraceLight.intensity = 13 * settings.lightIntensity
  if (world.bulbs?.length) {
    world.bulbs[0].mesh.material.emissiveIntensity = settings.timeOfDay === 'night' ? 3.8 : 3.1
  }
  world.stars.material.opacity = preset.stars
  world.stars.visible = preset.stars > 0.05
  world.moon.material.emissiveIntensity = settings.timeOfDay === 'night' ? 1.2 : 0.6
  renderer.toneMappingExposure = preset.exposure
  if (bloom) bloom.strength = settings.bloom
}

/* ---------------------------------------------------------- characters */

function pickSeat(vipPrefer = false, specific = null) {
  if (specific) {
    const seat = seats[specific]
    if (seat && !seat.occupied) return seat
  }
  const free = seats.filter((s) => !s.occupied)
  if (!free.length) return null
  const vip = free.filter((s) => s.vip)
  if (vipPrefer && vip.length) return vip[Math.floor(Math.random() * vip.length)]
  const normal = free.filter((s) => !s.vip)
  const pool = normal.length ? normal : free
  return pool[Math.floor(Math.random() * pool.length)]
}

function followPath(character, points, speed, done) {
  let i = 0
  const step = () => {
    if (i >= points.length) {
      done?.()
      return
    }
    const p = points[i++]
    character.walkTo(p, speed, step)
  }
  step()
}

function pathToSeat(seat) {
  const entrance = world.entrance
  if (seat.vip) {
    return [
      { x: entrance.x, z: entrance.z },
      { x: 9.5, z: 9.4 },
      { x: 6.4, z: 2.2 },
      { x: 4.9, z: -3.0 },
      { x: seat.x, z: seat.z }
    ]
  }
  return [
    { x: entrance.x, z: entrance.z },
    { x: 10.4, z: 10.2 },
    { x: 8.8, z: 7.4 },
    { x: seat.x, z: seat.z }
  ]
}

function registerUser(user) {
  if (!user?.id) return
  if (!seenUsers.has(user.id)) seenUsers.set(user.id, user)
}

function spawnCustomer(user, { seat = null, impatient = false, instant = false, tableIndex = null } = {}) {
  registerUser(user)
  const existing = chars.customers.find((c) => c.user?.id === user.id && !c.leaving)
  if (existing) {
    existing.waitTimer = Math.max(0, existing.waitTimer - 10)
    if (impatient && !existing.impatient) {
      existing.impatient = true
      existing.impatientUntil = sim.time + 10
      existing.character.setPose('angry')
      addAlertRing(existing.character)
    }
    return existing
  }
  if (chars.customers.length >= MAX_CUSTOMERS) {
    spawnExtraAngry(user)
    return null
  }
  const chosen = seat ?? pickSeat(impatient)
  if (!chosen) {
    spawnExtraAngry(user)
    return null
  }
  chosen.occupied = user.id
  const character = new Character({
    role: 'musteri',
    user,
    x: world.entrance.x,
    z: world.entrance.z,
    ry: Math.PI,
    scale: impatient ? 1.04 : 0.94 + (user.id.length % 4) * 0.018
  })
  scene.add(character.group)
  const customer = {
    id: user.id,
    user,
    character,
    seat: chosen,
    table: world.tables[chosen.tableIndex],
    tableIndex: chosen.tableIndex,
    seated: false,
    teaServed: false,
    empty: false,
    waitTimer: 0,
    patience: 42 + Math.random() * 30,
    drinkTimer: 0,
    emptyAt: 0,
    impatient,
    impatientUntil: impatient ? sim.time + 10 : 0,
    angryUntil: 0,
    fightUntil: 0,
    leaving: false,
    joinedAt: sim.time,
    ring: null
  }
  chars.customers.push(customer)
  chosen.occupied = customer

  const finishSeat = () => {
    customer.seated = true
    character.group.position.set(chosen.x, chosen.y, chosen.z)
    character.faceTowards(chosen.table.x, chosen.table.z)
    character.setSeated(true)
    if (impatient) {
      character.setPose('angry')
      customer.ring = addAlertRing(character)
      sim.chaos = Math.min(100, sim.chaos + 4)
    }
    sound.playTeaSpoon((chosen.x / 12), 0)
  }

  if (instant) {
    finishSeat()
  } else {
    followPath(character, pathToSeat(chosen), 1.25 + Math.random() * 0.3, finishSeat)
  }
  return customer
}

function addAlertRing(character) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 26), mat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.03
  character.group.add(ring)
  return ring
}

function spawnExtraAngry(user) {
  // Meydan doluysa hediye sahibi ayakta sinirlenir.
  const character = new Character({ role: 'musteri', user, x: 4.2 + Math.random() * 2, z: 8.4, ry: Math.PI })
  scene.add(character.group)
  character.setPose('angry')
  const customer = {
    id: user.id, user, character, seat: null, table: null, tableIndex: -1,
    seated: false, teaServed: false, waitTimer: 0, patience: 999, drinkTimer: 0,
    impatient: true, impatientUntil: sim.time + 8, angryUntil: 0, fightUntil: 0,
    leaving: false, joinedAt: sim.time, ring: addAlertRing(character), extra: true
  }
  chars.customers.push(customer)
  sim.chaos = Math.min(100, sim.chaos + 3)
  setTimeout(() => {
    if (customer.leaving) return
    customer.leaving = true
    character.walkTo({ x: world.entrance.x, z: world.entrance.z }, 1.6, () => removeCustomer(customer))
  }, 9000)
  return customer
}

function removeCustomer(customer) {
  const idx = chars.customers.indexOf(customer)
  if (idx >= 0) chars.customers.splice(idx, 1)
  if (customer.seat) customer.seat.occupied = null
  customer.character.dispose()
}

function leaveCustomer(customer, { ejected = false } = {}) {
  if (!customer || customer.leaving) return
  customer.leaving = true
  if (customer.seat) {
    customer.seat.occupied = null
    customer.seat = null
  }
  const c = customer.character
  c.setSeated(false)
  c.showTea(false)
  c.setPose('walk')
  c.stop()
  followPath(c, [
    { x: 8.6, z: 7.2 },
    { x: 10.4, z: 10.2 },
    { x: world.entrance.x, z: world.entrance.z }
  ], 1.5, () => removeCustomer(customer))
  if (ejected) pushToast(customer.user, `${customer.user.nickname} meydandan atıldı`, 'Yönetici işlemi', '🥾', '#ef5b5b')
}

function spawnApprentice(user) {
  registerUser(user)
  const existing = chars.apprentices.find((a) => a.user?.id === user.id && !a.leaving)
  if (existing) {
    existing.nextWander = sim.time + 3
    return existing
  }
  if (chars.apprentices.length >= MAX_APPRENTICES) return null
  const character = new Character({
    role: 'apprentice',
    user,
    x: world.entrance.x,
    z: world.entrance.z,
    ry: Math.PI,
    scale: 0.82
  })
  scene.add(character.group)
  const apprentice = {
    id: user.id, user, character, ready: false, busy: false, leaving: false,
    workUntil: 0, workTable: null, nextWander: sim.time + 6, collected: 0
  }
  chars.apprentices.push(apprentice)
  followPath(character, [
    { x: world.entrance.x, z: world.entrance.z },
    { x: 10.4, z: 10.2 },
    { x: 6.8, z: 6.4 },
    { x: 1.2, z: 1.6 },
    { x: -3.0, z: -2.6 },
    { x: -2.6, z: -6.6 }
  ], 1.5, () => {
    apprentice.ready = true
    character.setPose('idle')
    pushToast(user, `${user.nickname} çırak oldu`, 'Boş bardak topluyor', '🧹', '#38bdf8')
  })
  return apprentice
}

function spawnZabita(user, coins = 100) {
  registerUser(user)
  if (sim.time < sim.immunityUntil) {
    pushToast(user, 'Muhtar izin vermedi!', 'Dokunulmazlık süresince zabıta giremez', '🛡️', '#ffd166')
    return
  }
  if (chars.zabita && !chars.zabita.leaving) {
    chars.zabita.until = Math.max(chars.zabita.until, sim.time + 15)
    sim.zabitaUntil = chars.zabita.until
    return
  }
  const character = new Character({
    role: 'zabita',
    user: user ?? { id: 'zabita', nickname: 'Zabıta Kemal' },
    x: world.entrance.x,
    z: world.entrance.z,
    ry: Math.PI,
    scale: 1.04
  })
  scene.add(character.group)
  const zabita = { character, until: sim.time + 15, leaving: false, user }
  chars.zabita = zabita
  sim.zabitaUntil = zabita.until
  sim.chaos = Math.min(100, sim.chaos + 7)
  sound.startSiren()
  pushToast(user, 'ZABITA BASKINI!', 'Işıklar kırmızı-mavi, çaycı saklandı', '🚨', '#4d8dff')
  showCinematic(user, { name: 'Zabıta Baskını', icon: '🚨', sub: 'Mahalle karıştı — çaycı tezgah altında' })
  cameraState.shake = Math.max(cameraState.shake, 0.22)
  cayciHide(true)
  followPath(character, [
    { x: world.entrance.x, z: world.entrance.z },
    { x: 10.6, z: 9.6 },
    { x: 6.6, z: 6.2 },
    { x: 3.4, z: 4.4 }
  ], 2.0, () => {
    character.faceTowards(0, 0)
    character.setPose('idle')
  })
  // düdük vuruşları
  for (let i = 0; i < 3; i++) setTimeout(() => sound.tone({ freq: 2100, type: 'sine', dur: 0.22, gain: 0.08, glide: 1700 }), 420 + i * 520)
}

function spawnMuhtar(user, coins = 300) {
  registerUser(user)
  if (chars.muhtar && !chars.muhtar.leaving) {
    chars.muhtar.until = sim.time + 45
    sim.muhtarUntil = chars.muhtar.until
    sim.immunityUntil = Math.max(sim.immunityUntil, sim.time + 45)
    return
  }
  const character = new Character({
    role: 'muhtar',
    user: user ?? { id: 'muhtar', nickname: 'Muhtar Hüsnü' },
    x: world.entrance.x,
    z: world.entrance.z,
    ry: Math.PI,
    scale: 1.06
  })
  scene.add(character.group)
  const muhtar = { character, until: sim.time + 45, leaving: false, user, arrived: false }
  chars.muhtar = muhtar
  sim.muhtarUntil = muhtar.until
  sim.immunityUntil = sim.time + 45
  pushToast(user, 'MUHTAR ZİYARETİ!', 'Kavgalar durdu, meydan altın sarısı', '🎩', '#ffd166')
  followPath(character, [
    { x: world.entrance.x, z: world.entrance.z },
    { x: 10.4, z: 10.0 },
    { x: 6.2, z: 6.4 },
    { x: 1.2, z: 4.2 }
  ], 1.55, () => {
    muhtar.arrived = true
    character.faceTowards(0, 0)
    character.setPose('vip')
    activateMuhtar(muhtar, user)
  })
  cameraState.focus = { type: 'muhtar', until: sim.time + 6 }
}

function activateMuhtar(muhtar, user) {
  muhtar.until = sim.time + 45
  sim.muhtarUntil = muhtar.until
  sim.chaos = Math.max(0, sim.chaos - CHAOS_RULES.muhtarRelief)
  sim.immunityUntil = Math.max(sim.immunityUntil, sim.time + 45)
  // stop all fights
  for (const c of chars.customers) {
    c.fightUntil = 0
    if (c.character.seated) c.character.setPose('sit')
  }
  world.tables.forEach((t) => { t.fightUntil = 0 })
  // chase zabita away
  if (chars.zabita && !chars.zabita.leaving) {
    dismissZabita(true)
    pushToast(user, 'Muhtar zabıtayı kovaladı', 'Sokak girişine doğru kaçtı', '🏃', '#ffd166')
  }
  sound.playMuhtarFanfare()
  cameraState.focus = { type: 'muhtar', until: sim.time + 5 }
  showCinematic(user, {
    name: 'Muhtar Hüsnü',
    icon: '🎩',
    sub: `${user?.nickname ?? 'izleyici'} tarafından gönderildi · 45 sn dokunulmazlık`
  }, 7000)
  pushToast(user, 'Meydan altın sarısına büründü', 'Çaycıya 45 saniye dokunulmazlık', '🎩', '#ffd166')
}

function dismissZabita(instant = false) {
  const z = chars.zabita
  if (!z || z.leaving) return
  z.leaving = true
  sound.stopSiren()
  if (instant) {
    z.character.dispose()
    chars.zabita = null
    cayciHide(false)
    return
  }
  z.character.setPose('walk')
  followPath(z.character, [
    { x: 6.4, z: 6.2 },
    { x: 10.2, z: 9.8 },
    { x: world.entrance.x, z: world.entrance.z }
  ], 1.8, () => {
    z.character.dispose()
    if (chars.zabita === z) chars.zabita = null
    cayciHide(false)
  })
}

function cayciHide(hide) {
  if (!cayciState) return
  if (hide) {
    if (cayciState.hiding) return
    cayciState.hiding = true
    cayciState.phase = 'idle'
    cayciState.tray = 0
    cayciState.target = null
    chars.cayci.stop()
    chars.cayci.showTray(false)
    chars.cayci.walkTo({ x: 1.5, z: -9.0 }, 3.2, () => {
      chars.cayci.faceTowards(0, 0)
      chars.cayci.setPose('hide')
    })
    pushToast(null, 'Çaycı tezgah altına saklandı', 'Zabıta gidene kadar servis yok', '🫣', '#4d8dff')
  } else {
    if (!cayciState.hiding) return
    cayciState.hiding = false
    chars.cayci.setPose('idle')
    chars.cayci.walkTo({ x: -2.4, z: -8.6 }, 2.4)
    if (chars.cayci.parts.tray) chars.cayci.showTray(false)
  }
}

/* ----------------------------------------------------------- gift moves */

function boostStove(user, likes = 8) {
  sim.likes += likes
  const seconds = Math.min(12, 3 + likes * 0.12)
  sim.boostUntil = Math.max(sim.boostUntil, sim.time + seconds)
  effects.setBoost(true)
  if (world) world.flameBoost = sim.time < sim.boostUntil ? 1.9 : 1
  if (sim.time - (sim.lastStoveSound ?? 0) > 1.4) {
    sim.lastStoveSound = sim.time
    sound.playStoveIgnite()
  }
  if (sim.time - (sim.lastLikeToast ?? 0) > 7) {
    sim.lastLikeToast = sim.time
    pushToast(user, 'Semaver harlanıyor!', `${likes} beğeni · çaycı 2× hızlı`, '🔥', '#ff8a3d')
  }
}

function okeyFight(user) {
  sim.gifts += 1
  sim.chaos = Math.min(100, sim.chaos + 6)
  const occupiedTables = [...new Set(chars.customers.filter((c) => c.seated && c.table && !c.leaving).map((c) => c.tableIndex))]
  const chosen = occupiedTables.sort(() => Math.random() - 0.5).slice(0, Math.min(2, occupiedTables.length))
  if (!chosen.length) chosen.push(Math.floor(Math.random() * 6))
  for (const ti of chosen) {
    const table = world.tables[ti]
    table.fightUntil = sim.time + 11
    for (const c of chars.customers) {
      if (c.tableIndex === ti && c.seated && !c.leaving) {
        c.fightUntil = sim.time + 11
        c.character.setPose('fight')
        c.character.showTea(false)
      }
    }
    effects.throwOkey(table, new THREE.Vector3(table.x, table.y + 1.1, table.z), 6)
    if (sim.time - (sim.lastSlamSound ?? 0) > 0.6) {
      sim.lastSlamSound = sim.time
      sound.playOkeySlam(table.x / 12)
    }
  }
  cameraState.shake = Math.max(cameraState.shake, 0.34)
  pushToast(user, 'OKEY KAVGASI!', 'Okey taşları havada uçuyor', '🀄', '#f05252')
  showCinematic(user, { name: 'Okey Taşı Kavgası', icon: '🀄', sub: `${user?.nickname ?? 'izleyici'} masayı karıştırdı` }, 4500)
}

function throwTost(user) {
  sim.gifts += 1
  sim.chaos = Math.max(0, sim.chaos - CHAOS_RULES.tostRelief)
  effects.goldTrayRain(world.tables)
  sound.playWhoosh()
  setTimeout(() => sound.playTost(), 700)
  setTimeout(() => sound.playTeaPour(), 900)
  for (const c of chars.customers) {
    if (c.leaving) continue
    c.waitTimer = 0
    if (!c.teaServed && c.seated) {
      c.teaServed = true
      c.drinkTimer = 0
      c.character.setPose('sit')
      c.character.showTea(true)
    }
    if (c.impatient) {
      c.impatient = false
      c.impatientUntil = 0
      if (c.ring) { c.character.group.remove(c.ring); c.ring.geometry.dispose(); c.ring.material.dispose(); c.ring = null }
    }
  }
  for (const table of world.tables) table.fightUntil = 0
  for (const c of chars.customers) if (c.fightUntil) { c.fightUntil = 0; if (c.character.seated) c.character.setPose('sit') }
  pushToast(user, 'ÇAY & TOST YAĞMURU!', 'Altın tepsi tüm masalara indi', '🫖', '#43c98b')
  showCinematic(user, { name: 'Altın Tepsi', icon: '🫖', sub: `${user?.nickname ?? 'izleyici'} tüm meydanı doyurdu` }, 4500)
}

function spawnImpatientGift(user) {
  sim.gifts += 1
  if (chars.customers.filter((c) => !c.leaving).length >= MAX_CUSTOMERS) {
    spawnExtraAngry(user)
    return
  }
  spawnCustomer(user, { impatient: true })
  sim.chaos = Math.min(100, sim.chaos + CHAOS_RULES.impatientAdd * 0.45)
  pushToast(user, 'Sabırsız müşteri geldi', 'Masaya vuruyor, kaos hızla artıyor', '🌹', '#ffb020')
}

function handleGift(event) {
  const action = event.action ?? resolveGiftAction(mapping, {
    giftId: event.gift?.id,
    coins: event.gift?.coins,
    name: event.gift?.name
  })
  const user = event.user
  const gift = event.gift ?? { name: 'Hediye', coins: 0, count: 1 }
  const label = gift.count > 1 ? `${gift.name} ×${gift.count}` : gift.name
  sound.playGiftChime(gift.coins ?? 1)
  switch (action) {
    case 'BOOST_STOVE':
      boostStove(user, 12)
      break
    case 'SPAWN_IMPATIENT':
      spawnImpatientGift(user)
      break
    case 'OKEY_FIGHT':
      okeyFight(user)
      break
    case 'THROW_TOST_CAY':
      throwTost(user)
      break
    case 'ZABITA_RAID':
      sim.gifts += 1
      spawnZabita(user, gift.coins)
      break
    case 'MUHTAR_VIP':
      sim.gifts += 1
      spawnMuhtar(user, gift.coins)
      break
    default:
      spawnImpatientGift(user)
  }
}

function handleEvent(event) {
  if (!event) return
  registerUser(event.user)
  const user = event.user ?? makeDemoUser()
  switch (event.type) {
    case 'chat': {
      const command = event.command ?? resolveChatActionSafe(event.text)
      if (command === 'JOIN_CUSTOMER') {
        if (chars.customers.filter((c) => !c.leaving).length >= MAX_CUSTOMERS) {
          pushToast(user, `${user.nickname}: meydan dolu!`, 'Birinin kalkmasını bekliyor', '💬', '#a78bfa')
          return
        }
        spawnCustomer(user)
        sound.playChatBlip()
        pushToast(user, `${user.nickname} masaya oturdu`, `"${(event.text ?? '1').slice(0, 22)}" · kaos +${CHAOS_RULES.impatientAdd / 3 | 0}`, '💬', '#a78bfa')
        sim.chaos = Math.min(100, sim.chaos + 1.1)
        appendTicker(`💬 <b>${user.nickname}</b> meydana geldi, masaya oturdu`)
      } else if (command === 'JOIN_APPRENTICE') {
        const a = spawnApprentice(user)
        if (a) {
          sound.playChatBlip()
          appendTicker(`🧹 <b>${user.nickname}</b> çırak oldu, bardak topluyor`)
          sim.chaos = Math.max(0, sim.chaos - 0.8)
        }
      } else if (event.text) {
        pushToast(user, user.nickname, String(event.text).slice(0, 48), '💬', '#a78bfa')
        appendTicker(`💬 <b>${user.nickname}</b>: ${String(event.text).slice(0, 46)}`)
      }
      break
    }
    case 'like': {
      boostStove(user, event.count ?? 1)
      break
    }
    case 'gift': {
      if (event.comboOpen || event.gift?.repeatEnd === false) return
      handleGift(event)
      break
    }
    case 'member': {
      pushToast(user, `${user.nickname} yayına katıldı`, 'Hoş geldin!', '👋', '#67e8f9')
      break
    }
    case 'follow': {
      pushToast(user, `${user.nickname} takip etti`, 'Teşekkürler!', '💛', '#ffd166')
      break
    }
    case 'share': {
      pushToast(user, `${user.nickname} yayını paylaştı`, 'Meydan büyüyor', '🔗', '#93c5fd')
      break
    }
    default:
      break
  }
}

function resolveChatActionSafe(text) {
  const raw = String(text ?? '').trim().toLowerCase()
  if (/^[1]/.test(raw)) return 'JOIN_CUSTOMER'
  if (/^[2]/.test(raw)) return 'JOIN_APPRENTICE'
  if (mapping.commands) {
    const key = raw[0]
    if (key && mapping.commands[key] === 'JOIN_CUSTOMER') return 'JOIN_CUSTOMER'
    if (key && mapping.commands[key] === 'JOIN_APPRENTICE') return 'JOIN_APPRENTICE'
  }
  return null
}

/* ---------------------------------------------------------- simulation */

function customerAtTable(ti) {
  return chars.customers.filter((c) => c.tableIndex === ti && c.seated && !c.leaving)
}

function chooseServiceTable() {
  let best = null
  let bestScore = 0
  for (let ti = 0; ti < world.tables.length; ti++) {
    const table = world.tables[ti]
    if (table.fightUntil > sim.time) continue
    const waiting = customerAtTable(ti).filter((c) => !c.teaServed && (!c.fightUntil || c.fightUntil <= sim.time))
    if (waiting.length > bestScore) {
      bestScore = waiting.length
      best = { table, ti, waiting }
    }
  }
  return best
}

function updateCayci(dt) {
  const c = chars.cayci
  if (!c) return
  const boosted = sim.time < sim.boostUntil
  world.flameBoost = boosted ? 1.9 : 1
  if (!boosted) effects.setBoost(false)
  const speed = boosted ? 3.9 : 1.85

  if (cayciState.hiding) {
    if (!sim.running) return
    return
  }

  if (sim.chaos >= 100 || !sim.running) {
    if (cayciState.phase !== 'idle') {
      c.stop()
      cayciState.phase = 'idle'
    }
    c.setPose('idle')
    return
  }

  if (cayciState.phase === 'idle') {
    if (cayciState.busy) return
    if (cayciState.tray > 0) {
      const target = chooseServiceTable()
      if (target) {
        cayciState.phase = 'toTable'
        cayciState.target = target
        cayciState.busy = true
        const approach = { x: target.table.x, z: target.table.z + (target.table.vip ? 1.55 : 1.95) }
        c.walkTo(approach, speed, () => {
          c.faceTowards(target.table.x, target.table.z)
          c.setPose('serve')
          cayciState.phase = 'serving'
          cayciState.timer = 1.05
          const waiting = target.waiting.slice(0, cayciState.tray)
          for (const cust of waiting) {
            if (cust.leaving || cust.teaServed) continue
            cust.teaServed = true
            cust.drinkTimer = 0
            cust.character.setSeated(true)
            cust.character.showTea(true)
            cust.character.setPose('sit')
            sim.chaos = Math.max(0, sim.chaos - 1.55)
            cayciState.tray = Math.max(0, cayciState.tray - 1)
          }
          sound.playTeaSpoon(target.table.x / 14)
          c.showTray(cayciState.tray > 0)
        })
        return
      }
      // tray still has tea but nobody waiting -> return it
      cayciState.phase = 'toCounter'
      cayciState.busy = true
      c.showTray(true)
      c.setPose('carry')
      c.walkTo({ x: -2.4, z: -8.6 }, speed, () => {
        cayciState.tray = 0
        c.showTray(false)
        c.setPose('idle')
        cayciState.phase = 'idle'
        cayciState.busy = false
      })
      return
    }
    cayciState.phase = 'toCounter'
    cayciState.busy = true
    c.setPose('walk')
    c.walkTo({ x: -2.4, z: -8.6 }, speed, () => {
      cayciState.phase = 'loading'
      cayciState.timer = 0.85
      c.faceTowards(-1.1, -9.5)
      c.setPose('serve')
      c.showTray(false)
    })
    return
  }

  if (cayciState.phase === 'loading') {
    cayciState.timer -= dt
    if (cayciState.timer <= 0) {
      cayciState.tray = 4
      cayciState.phase = 'idle'
      cayciState.busy = false
      c.showTray(true)
      c.setPose('carry')
      sound.playTeaSpoon(-0.2)
    }
    return
  }

  if (cayciState.phase === 'serving') {
    cayciState.timer -= dt
    if (cayciState.timer <= 0) {
      cayciState.phase = 'idle'
      cayciState.busy = false
      c.setPose(cayciState.tray > 0 ? 'carry' : 'walk')
      if (cayciState.tray <= 0) c.showTray(false)
    }
  }
}

function updateCustomers(dt) {
  for (let i = chars.customers.length - 1; i >= 0; i--) {
    const c = chars.customers[i]
    const ch = c.character
    ch.update(dt, visualTime + c.joinedAt * 0.1)

    if (c.ring) {
      const s = 1 + Math.sin(visualTime * 6) * 0.12
      c.ring.scale.set(s, s, s)
      c.ring.material.opacity = 0.4 + Math.sin(visualTime * 6) * 0.2
    }
    if (c.leaving) continue

    if (!c.seated && !c.extra) continue

    if (c.fightUntil && sim.time >= c.fightUntil) {
      c.fightUntil = 0
      if (c.seated) ch.setPose('sit')
    }

    if (c.impatient && c.impatientUntil && sim.time >= c.impatientUntil) {
      c.impatient = false
      if (c.ring) {
        ch.group.remove(c.ring)
        c.ring.geometry.dispose()
        c.ring.material.dispose()
        c.ring = null
      }
      if (c.seated) ch.setPose('sit')
    } else if (c.impatient) {
      if (ch.pose !== 'angry') ch.setPose('angry')
      continue
    }

    if (c.seated && !c.teaServed) {
      c.waitTimer += dt
      if (c.waitTimer > c.patience) {
        c.waitTimer = 0
        c.patience = 30 + Math.random() * 25
        ch.setPose('angry')
        c.angryUntil = sim.time + 4.2
        sim.chaos = Math.min(100, sim.chaos + 2.2)
        cameraState.shake = Math.max(cameraState.shake, 0.1)
        sound.playOkeySlam(c.table.x / 14)
        if (Math.random() < 0.22) appendTicker(`😤 <b>${c.user.nickname}</b> çayı bekliyor, masaya vurdu`)
      } else if (c.angryUntil && sim.time > c.angryUntil && ch.pose === 'angry') {
        ch.setPose('sit')
        c.angryUntil = 0
      }
    }

    if (c.seated && c.teaServed) {
      c.drinkTimer += dt
      if (c.drinkTimer > 26 && !c.empty) {
        c.empty = true
        c.emptyAt = sim.time
        ch.showTea(false)
        if (c.table) c.table.empty = (c.table.empty ?? 0) + 1
      }
      if (c.empty && sim.time - c.emptyAt > 14) {
        leaveCustomer(c)
      }
    }
  }
}

function updateApprentices(dt) {
  for (const a of chars.apprentices) {
    a.character.update(dt, visualTime + a.user.id.length)
    if (!a.ready || a.leaving) continue
    if (a.workUntil) {
      if (sim.time >= a.workUntil) {
        const t = a.workTable
        if (t) {
          const n = t.empty ?? 0
          if (n > 0) {
            sim.chaos = Math.max(0, sim.chaos - 0.85 * n)
            t.empty = 0
            a.collected += n
            sound.playTeaSpoon(t.x / 16)
            if (a.collected >= 6) {
              appendTicker(`🧹 <b>${a.user.nickname}</b> ${a.collected} bardak topladı, meydan sakinleşti`)
              a.collected = 0
            }
          }
          t.claimed = null
        }
        a.workUntil = 0
        a.workTable = null
        a.busy = false
        a.character.setPose('idle')
        a.nextWander = sim.time + 0.6
      } else {
        continue
      }
    }
    if (a.busy) continue
    if (!a.workTable) {
      const table = world.tables.find((t) => (t.empty ?? 0) > 0 && !t.claimed)
      if (table) {
        table.claimed = a
        a.workTable = table
        a.busy = true
        a.character.setPose('sweep')
        a.character.walkTo({ x: table.x, z: table.z + 1.8 }, 1.65, () => {
          a.character.faceTowards(table.x, table.z)
          a.character.setPose('sweep')
          a.workUntil = sim.time + 0.95
        })
      } else if (sim.time >= a.nextWander) {
        a.nextWander = sim.time + 5 + Math.random() * 3
        const spot = [
          { x: 2.2, z: 3.2 }, { x: -4.2, z: 3.4 }, { x: 4.6, z: 8.2 }, { x: -1.2, z: -5.4 }, { x: 7.2, z: 2.4 }
        ][Math.floor(Math.random() * 5)]
        a.character.walkTo(spot, 1.15)
      }
    } else if (!a.workUntil) {
      // heading to table
    }
  }
}

function updateSpecials(dt) {
  if (chars.zabita) {
    const z = chars.zabita
    z.character.update(dt, visualTime)
    if (!z.leaving && sim.time >= z.until) {
      dismissZabita()
      sim.zabitaUntil = 0
    }
  }
  if (chars.muhtar) {
    const m = chars.muhtar
    m.character.update(dt, visualTime)
    if (!m.leaving && sim.time >= m.until) {
      m.leaving = true
      m.character.setPose('walk')
      followPath(m.character, [
        { x: 6.2, z: 6.4 },
        { x: 10.2, z: 9.8 },
        { x: world.entrance.x, z: world.entrance.z }
      ], 1.45, () => {
        m.character.dispose()
        if (chars.muhtar === m) chars.muhtar = null
        sim.muhtarUntil = 0
      })
    }
  }
  if (chars.zabita && !chars.zabita.leaving) {
    const phase = (visualTime * 2.4) % 2
    world.sirenRed.intensity = phase < 1 ? 34 : 1
    world.sirenBlue.intensity = phase < 1 ? 1 : 34
    world.houseLight.color.setHex(phase < 1 ? 0xff5a4a : 0x5a86ff)
  } else {
    world.sirenRed.intensity *= 0.9
    world.sirenBlue.intensity *= 0.9
    world.houseLight.color.lerp(new THREE.Color(0xffb060), 0.08)
  }

  const muhtarActive = chars.muhtar && !chars.muhtar.leaving
  world.goldLight.intensity += ((muhtarActive ? 42 : 0) - world.goldLight.intensity) * Math.min(1, dt * 2.2)
  const chaosHot = sim.chaos > 62 && sim.running
  const chaosTarget = chaosHot ? (sim.chaos - 60) * 0.9 + Math.sin(visualTime * 3) * 4 : 0
  world.chaosLight.intensity += (Math.max(0, chaosTarget) - world.chaosLight.intensity) * Math.min(1, dt * 3)
}

function updateRound(dt) {
  if (!sim.running || sim.paused) return
  sim.remaining = Math.max(0, sim.remaining - dt)
  const context = {
    customers: chars.customers.filter((c) => c.seated && !c.leaving).length,
    apprentices: chars.apprentices.filter((a) => a.ready && !a.leaving).length,
    fights: world.tables.filter((t) => t.fightUntil > sim.time).length,
    impatient: chars.customers.filter((c) => c.impatient && !c.leaving).length,
    zabita: Boolean(chars.zabita && !chars.zabita.leaving),
    muhtar: Boolean(chars.muhtar && !chars.muhtar.leaving),
    stoves: sim.time < sim.boostUntil ? 1 : 0
  }
  const stepped = stepChaos({ chaos: sim.chaos }, dt, context)
  sim.chaos = stepped.chaos
  if (sim.chaos >= settings.chaosTarget) endRound('chat')
  else if (sim.remaining <= 0) endRound('cayci')

  if (sim.chaos > 78) {
    world.chaosLight.color.setHex(0xff3a1e)
  } else {
    world.chaosLight.color.setHex(0xffa060)
  }
}

function endRound(winner) {
  if (!sim.running) return
  sim.running = false
  sim.win = winner
  sim.wins[winner] += 1
  sim.resetAt = sim.time + 7
  sim.remaining = winner === 'chat' ? sim.remaining : 0
  cayciState.busy = false
  cayciState.phase = 'idle'
  chars.cayci.stop()
  if (winner === 'chat') {
    chars.cayci.setPose('hide')
    for (const c of chars.customers) if (c.character.seated) c.character.setPose('cheer')
    sound.playWin('chat')
  } else {
    chars.cayci.setPose('cheer')
    for (const c of chars.customers) if (c.character.seated) c.character.setPose('sit')
    sound.playLose()
  }
  dom.verdictKicker.textContent = winner === 'chat' ? 'SÜRE DOLMADAN' : 'SÜRE DOLDU'
  dom.verdictTitle.textContent = winner === 'chat' ? 'CHAT KAZANDI!' : 'ÇAYCI KAZANDI!'
  dom.verdictSub.textContent = winner === 'chat'
    ? 'Meydan kaosa teslim oldu, çaycı yetişemedi.'
    : 'Çaycı Rıza meydanı ayakta tuttu. Helal olsun!'
  dom.verdictChaos.textContent = `%${Math.round(sim.chaos)}`
  dom.verdictRound.textContent = String(sim.round)
  dom.overlay.hidden = false
  confetti(winner)
  pushToast(winner === 'chat' ? { nickname: 'CHAT' } : { nickname: 'ÇAYCI RIZA' },
    winner === 'chat' ? 'CHAT KAZANDI!' : 'ÇAYCI KAZANDI!',
    `Tur ${sim.round} · kaos %${Math.round(sim.chaos)}`, winner === 'chat' ? '💥' : '🫖',
    winner === 'chat' ? '#ef5b5b' : '#43c98b')
}

function resetRound(manual = false) {
  for (const c of chars.customers) {
    if (c.ring) { c.ring.geometry.dispose(); c.ring.material.dispose() }
    c.character.dispose()
  }
  for (const a of chars.apprentices) a.character.dispose()
  chars.customers = []
  chars.apprentices = []
  if (chars.zabita) { chars.zabita.character.dispose(); chars.zabita = null }
  if (chars.muhtar) { chars.muhtar.character.dispose(); chars.muhtar = null }
  sound.stopSiren()
  world.tables.forEach((t) => { t.empty = 0; t.fightUntil = 0; t.claimed = null })
  seats.forEach((s) => { s.occupied = null })
  sim.chaos = 8
  sim.remaining = settings.roundSeconds
  sim.running = true
  sim.paused = false
  sim.win = null
  sim.endedAt = 0
  sim.zabitaUntil = 0
  sim.muhtarUntil = 0
  sim.immunityUntil = 0
  sim.boostUntil = 0
  sim.gifts = 0
  sim.likes = 0
  if (!manual) sim.round += 1
  dom.overlay.hidden = true
  setupCayci()
  chars.cayci.group.position.set(-2.4, 0.9, -8.6)
  chars.cayci.group.rotation.y = 0.4
  chars.cayci.setPose('idle')
  seedInitial(3, { seatsOnly: true })
  appendTicker('🫖 Yeni tur başladı — meydan yine karışmaya hazır')
}

function seedInitial(count = 3, { seatsOnly = false } = {}) {
  const chosen = seats.filter((s) => !s.vip).sort(() => Math.random() - 0.5).slice(0, count)
  chosen.forEach((seat, i) => {
    const base = demoUsers[(i + 1) % demoUsers.length]
    const user = { id: `${base.id}-seed-${sim.round}-${i}`, nickname: base.nickname, avatar: demoAvatar(base) }
    if (seat.occupied) return
    const cust = spawnCustomer(user, { seat, instant: true })
    if (!cust) return
    if (i % 3 === 0) {
      cust.teaServed = true
      cust.character.showTea(true)
      cust.drinkTimer = 12
    }
    if (i === 1) {
      cust.character.setPose('angry')
      cust.angryUntil = sim.time + 2 + Math.random() * 2
      cust.waitTimer = cust.patience - 1.2
    }
  })
  if (!seatsOnly) {
    spawnCustomer({ id: `walkin-${sim.round}`, nickname: 'yeni_gelen', avatar: demoAvatar({ nickname: 'yeni_gelen', color: '#7dd3fc' }) })
    const ap = demoUsers[4]
    spawnApprentice({ id: `${ap.id}-seed`, nickname: ap.nickname, avatar: demoAvatar(ap) })
  }
}

/* ------------------------------------------------------------- director */

function demoTick(dt) {
  if (!settings.autoDemo) return
  if (eventIsLive()) return
  if (!sim.running) return
  if (sim.time < sim.demoNext) return
  sim.demoNext = sim.time + 2.6 + Math.random() * 3.4
  if (sim.time < 2.5) return
  const roll = Math.random()
  const user = makeDemoUser()
  if (roll < 0.26) {
    if (chars.customers.length < 11) handleEvent({ type: 'chat', text: '1', user, command: 'JOIN_CUSTOMER', source: 'demo' })
    else handleEvent({ type: 'like', user, count: 12, source: 'demo' })
  } else if (roll < 0.34) {
    if (chars.apprentices.length < 3) handleEvent({ type: 'chat', text: '2', user, command: 'JOIN_APPRENTICE', source: 'demo' })
    else handleEvent({ type: 'chat', text: '1', user, command: 'JOIN_CUSTOMER', source: 'demo' })
  } else if (roll < 0.52) {
    handleEvent({ type: 'like', user, count: 8 + Math.floor(Math.random() * 30), source: 'demo' })
  } else if (roll < 0.72) {
    handleEvent({ type: 'gift', user, action: 'SPAWN_IMPATIENT', gift: { id: '5655', name: 'Gül', coins: 1, count: 1, repeatEnd: true }, coins: 1, source: 'demo' })
  } else if (roll < 0.84) {
    handleEvent({ type: 'gift', user, action: 'OKEY_FIGHT', gift: { id: '6410', name: 'Kalp', coins: 10, count: 1, repeatEnd: true }, coins: 10, source: 'demo' })
  } else if (roll < 0.92) {
    handleEvent({ type: 'gift', user, action: 'THROW_TOST_CAY', gift: { id: '6104', name: 'Donut', coins: 30, count: 1, repeatEnd: true }, coins: 30, source: 'demo' })
  } else if (roll < 0.975) {
    if (!chars.zabita) handleEvent({ type: 'gift', user, action: 'ZABITA_RAID', gift: { id: '6429', name: 'Corgi', coins: 100, count: 1, repeatEnd: true }, coins: 100, source: 'demo' })
    else handleEvent({ type: 'like', user, count: 20, source: 'demo' })
  } else {
    if (!chars.muhtar) handleEvent({ type: 'gift', user, action: 'MUHTAR_VIP', gift: { id: '6120', name: 'Aslan', coins: 300, count: 1, repeatEnd: true }, coins: 300, source: 'demo' })
    else handleEvent({ type: 'like', user, count: 30, source: 'demo' })
  }
}

function eventIsLive() {
  return dom.demoBadge.classList.contains('live')
}

/* ---------------------------------------------------------------- camera */

function baseCamera() {
  if (portrait) {
    return {
      pos: new THREE.Vector3(12.6, 16.2, 24.4),
      look: new THREE.Vector3(0, 2.15, -3.0),
      fov: 43
    }
  }
  return {
    pos: new THREE.Vector3(16.2, 14.1, 21.6),
    look: new THREE.Vector3(0, 1.75, -1.7),
    fov: 34
  }
}

function updateCamera(dt) {
  const base = baseCamera()
  cameraState.base = base
  if (!cameraState.pos.lengthSq()) {
    cameraState.pos.copy(base.pos).multiplyScalar(1.08)
    cameraState.look.copy(base.look)
    cameraState.fov = base.fov
  }
  let desired = base.pos
  let look = base.look
  let fov = base.fov

  const muhtar = chars.muhtar
  if (muhtar && !muhtar.leaving && muhtar.arrived) {
    const p = muhtar.character.group.position
    look = new THREE.Vector3(p.x, p.y + 1.7, p.z)
    if (cameraState.focus?.type === 'muhtar' && sim.time < cameraState.focus.until) {
      desired = new THREE.Vector3(p.x + 3.1, p.y + 2.5, p.z + 4.1)
      fov = 31
    } else {
      desired = base.pos.clone().lerp(new THREE.Vector3(p.x + 6.2, 7.4, p.z + 9.0), 0.55)
    }
  } else if (chars.zabita && !chars.zabita.leaving) {
    look = new THREE.Vector3(4.2, 2.4, 4.6)
    desired = base.pos.clone().lerp(new THREE.Vector3(8.6, 8.0, 14.2), 0.5)
    fov = base.fov - 2
  } else if (cameraState.focus && sim.time < cameraState.focus.until) {
    // generic focus
  }

  introTime += dt
  const ease = 1 - Math.exp(-dt * (introTime < 1.6 ? 1.6 : 3.1))
  cameraState.pos.lerp(desired, ease)
  cameraState.look.lerp(look, ease)
  cameraState.fov += (fov - cameraState.fov) * Math.min(1, dt * 2.6)

  camera.position.copy(cameraState.pos)
  if (cameraState.shake > 0.001) {
    const s = cameraState.shake
    camera.position.x += (Math.random() - 0.5) * s
    camera.position.y += (Math.random() - 0.5) * s * 0.6
    camera.position.z += (Math.random() - 0.5) * s * 0.7
    cameraState.shake *= Math.exp(-dt * 2.6)
  }
  camera.lookAt(cameraState.look)
  if (Math.abs(camera.fov - cameraState.fov) > 0.02) {
    camera.fov = cameraState.fov
    camera.updateProjectionMatrix()
  }
}

/* ------------------------------------------------------------------- UI */

function pushToast(user, title, sub, icon = '💬', color = '#ffb45c') {
  if (!dom.toasts) return
  const now = performance.now()
  if (now - toastLock < 90) return
  toastLock = now
  const el = document.createElement('div')
  el.className = 'toast'
  el.style.setProperty('--toast-color', color)
  const img = document.createElement('img')
  img.alt = ''
  img.loading = 'lazy'
  const fallback = demoAvatar({ nickname: user?.nickname ?? 'Çay', color })
  img.src = user?.avatar || fallback
  img.onerror = () => { img.src = fallback }
  const copy = document.createElement('div')
  copy.className = 'toast-copy'
  const strong = document.createElement('strong')
  strong.textContent = title
  const span = document.createElement('span')
  span.textContent = sub ?? ''
  copy.append(strong, span)
  const emoji = document.createElement('span')
  emoji.className = 'toast-icon'
  emoji.textContent = icon
  el.append(img, copy, emoji)
  dom.toasts.prepend(el)
  while (dom.toasts.children.length > 4) dom.toasts.lastChild.remove()
  setTimeout(() => {
    el.classList.add('out')
    setTimeout(() => el.remove(), 420)
  }, 4800)
}

let cinematicTimer = null
function showCinematic(user, { name, icon, sub }, duration = 6000) {
  if (!dom.cinematic) return
  dom.cineAvatar.src = user?.avatar || demoAvatar({ nickname: user?.nickname ?? 'İzleyici', color: '#ffd166' })
  dom.cineAvatar.onerror = () => { dom.cineAvatar.src = demoAvatar({ nickname: 'İzleyici', color: '#ffd166' }) }
  dom.cineKicker.textContent = name ?? 'HEDİYE'
  dom.cineName.textContent = user?.nickname ?? 'izleyici'
  dom.cineSub.textContent = sub ?? ''
  dom.cineIcon.textContent = icon ?? '🎁'
  dom.cinematic.classList.add('show')
  clearTimeout(cinematicTimer)
  cinematicTimer = setTimeout(() => dom.cinematic.classList.remove('show'), duration)
}

function appendTicker(html) {
  tickerQueue.unshift(html)
  if (tickerQueue.length > 6) tickerQueue.pop()
  dom.ticker.innerHTML = tickerQueue[0]
}

const defaultTicker = [
  'Sohbete <b>1</b> yaz → masaya otur · <b>2</b> yaz → çırak ol',
  '🌹 Gül → sabırsız müşteri · 🀄 Kalp → okey kavgası',
  '🫖 Donut → çay & tost yağmuru · 🚨 Corgi → zabıta baskını',
  '🎩 Aslan → Muhtar gelir, meydan altın olur',
  '🔥 Beğeni yağdır → semaver harlansın, çaycı hızlansın',
  'Süre biterse çaycı kazanır · kaos %100 olursa chat kazanır'
]
let tickerIndex = 0
function rotateTicker() {
  if (tickerQueue.length) {
    tickerQueue.pop()
    dom.ticker.innerHTML = tickerQueue[0] ?? defaultTicker[tickerIndex % defaultTicker.length]
    if (tickerQueue.length) return
  }
  tickerIndex += 1
  dom.ticker.innerHTML = defaultTicker[tickerIndex % defaultTicker.length]
}

function setChaos(chaos) {
  const pct = Math.round(chaos)
  dom.chaosFill.style.width = `${pct}%`
  dom.chaosPct.textContent = `%${pct}`
  dom.chaosFill.classList.toggle('hot', pct >= 68)
  dom.chaosTrack?.setAttribute('aria-valuenow', String(pct))
}

let lastHud = 0
function updateHud(force = false) {
  const now = performance.now()
  if (!force && now - lastHud < 90) return
  lastHud = now
  const seconds = Math.max(0, Math.ceil(sim.remaining))
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  dom.timer.textContent = `${mm}:${ss}`
  dom.timer.classList.toggle('urgent', seconds <= 30 && sim.running)
  dom.roundNum.textContent = String(sim.round)
  dom.roundState.textContent = !sim.running ? 'BİTTİ' : sim.paused ? 'DURDU' : 'OYUN'
  setChaos(sim.chaos)
  dom.scoreChat.textContent = String(sim.wins.chat)
  dom.scoreCayci.textContent = String(sim.wins.cayci)
  dom.viewers.textContent = formatNumber(viewerFake)

  if (!sim.running && sim.resetAt) {
    const left = Math.max(0, Math.ceil(sim.resetAt - sim.time))
    dom.verdictNext.textContent = String(left)
  }
}

function formatNumber(n) {
  return new Intl.NumberFormat('tr-TR').format(Math.round(n))
}

function confetti(winner) {
  dom.confetti.innerHTML = ''
  const colors = winner === 'chat' ? ['#ef5b5b', '#ffb45c', '#ffd166', '#c4b5fd'] : ['#43c98b', '#6ed6ff', '#ffd166', '#f6e8cc']
  for (let i = 0; i < 70; i++) {
    const el = document.createElement('i')
    el.style.left = `${Math.random() * 100}%`
    el.style.background = colors[i % colors.length]
    el.style.setProperty('--dx', `${(Math.random() - 0.5) * 220}px`)
    el.style.animationDuration = `${2.4 + Math.random() * 2.2}s`
    el.style.animationDelay = `${Math.random() * 1.2}s`
    el.style.width = `${4 + Math.random() * 6}px`
    el.style.height = `${8 + Math.random() * 10}px`
    dom.confetti.append(el)
  }
  setTimeout(() => { dom.confetti.innerHTML = '' }, 6500)
}

/* --------------------------------------------------------------- aspect */

function computeRatio() {
  if (settings.aspect === '9:16') return 'portrait'
  if (settings.aspect === '16:9') return 'landscape'
  const rect = dom.stage.getBoundingClientRect()
  return window.innerWidth < window.innerHeight ? 'portrait' : 'landscape'
}

function applyRatio() {
  const ratio = computeRatio()
  portrait = ratio === 'portrait'
  dom.app.dataset.ratio = ratio
  if (dom.aspectLabel) dom.aspectLabel.textContent = portrait ? '9:16' : '16:9'
  lastRatio = ratio
  requestAnimationFrame(resize)
}

function resize() {
  if (!renderer) return
  const rect = dom.stage.getBoundingClientRect()
  const w = Math.max(2, Math.floor(rect.width))
  const h = Math.max(2, Math.floor(rect.height))
  renderer.setSize(w, h, false)
  composer?.setSize(w, h)
  if (bloom) bloom.setSize(w, h)
  if (camera) {
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  baseCamera()
}

function toggleAspect() {
  settings.aspect = portrait ? '16:9' : '9:16'
  applyRatio()
  pushToast(null, settings.aspect === '9:16' ? 'Dikey 9:16' : 'Yatay 16:9', 'Ekran oranı değişti (F9)', '📱', '#38bdf8')
  net?.saveSettings({ aspect: settings.aspect })
}

/* ----------------------------------------------------------- net & state */

function applySettings(patch, fromNet = false) {
  const next = normalizeSettings({ ...settings, ...(patch ?? {}) })
  const ratioChanged = next.aspect !== settings.aspect
  const roundChanged = next.roundSeconds !== settings.roundSeconds
  Object.assign(settings, next)
  sound.setVolume(settings.volume)
  sound.setMuted(settings.muted)
  updateSoundButton()
  applyAtmosphere()
  if (ratioChanged) applyRatio()
  if (roundChanged && !sim.running) sim.remaining = settings.roundSeconds
  if (!fromNet) net?.saveSettings(next)
}

function updateSoundButton() {
  if (!dom.soundBtn) return
  const muted = settings.muted || !sound.unlocked
  dom.soundBtn.classList.toggle('off', muted)
  dom.soundLabel.textContent = settings.muted ? 'KAPALI' : sound.unlocked ? 'AÇIK' : 'AÇ'
  dom.soundBtn.querySelector('svg')?.classList.toggle('muted', muted)
}

function setupNet() {
  net = new Net({ role: 'game' })
  mapping = net.mapping
  net.on('hello', (hello) => {
    applySettings(hello.settings, true)
    if (hello.mapping) mapping = hello.mapping
    if (hello.tiktok) applyTikTok(hello.tiktok)
    if (Array.isArray(hello.catalog) && hello.catalog.length) {
      // catalog is admin-side; nothing to do but keep the mapping fresh
    }
    updateSoundButton()
  })
  net.on('settings', (s) => applySettings(s, true))
  net.on('mapping', (m) => { if (m?.mapping) mapping = m.mapping })
  net.on('game:event', handleEvent)
  net.on('tiktok:status', applyTikTok)
  net.on('mode', ({ mode }) => {
    if (mode === 'local') {
      dom.demoBadge.textContent = 'DEMO YAYIN'
      dom.demoBadge.classList.remove('live')
    }
  })
  net.on('round:command', (payload = {}) => {
    switch (payload.action) {
      case 'pause': sim.paused = true; updateHud(true); break
      case 'resume': sim.paused = false; updateHud(true); break
      case 'reset': resetRound(true); break
      case 'start': if (!sim.running) resetRound(true); break
      case 'end-chat': endRound('chat'); break
      case 'end-cayci': endRound('cayci'); break
      case 'skip': resetRound(); break
      default: break
    }
    if (payload.action === 'reset') pushToast(null, 'Tur sıfırlandı', 'Yeni mücadele başlıyor', '🔄', '#38bdf8')
  })
  net.on('player:kick', ({ id } = {}) => {
    const cust = chars.customers.find((c) => c.user?.id === id)
    if (cust) { leaveCustomer(cust, { ejected: true }); return }
    const ap = chars.apprentices.find((a) => a.user?.id === id)
    if (ap) {
      ap.leaving = true
      ap.character.setPose('walk')
      followPath(ap.character, [{ x: world.entrance.x, z: world.entrance.z }], 1.7, () => {
        const idx = chars.apprentices.indexOf(ap)
        if (idx >= 0) chars.apprentices.splice(idx, 1)
        ap.character.dispose()
      })
      pushToast(ap.user, `${ap.user.nickname} çıraklıktan ayrıldı`, 'Yönetici işlemi', '🥾', '#ef5b5b')
    }
  })
  net.on('state-request', () => sendMetrics(true))
  net.on('game:trace', () => {})
  net.on('metrics', () => {})
}

function applyTikTok(status) {
  if (!status) return
  const live = status.state === 'connected'
  dom.demoBadge.textContent = live ? 'TIKTOK CANLI' : status.state === 'connecting' ? 'BAĞLANIYOR…' : 'DEMO YAYIN'
  dom.demoBadge.classList.toggle('live', live)
  if (live) {
    viewerFake = Number(status.viewers) > 0 ? Number(status.viewers) : 1520
    if (!eventIsLive()) pushToast(null, `@${status.username} yayınına bağlandı`, 'Gerçek TikTok olayları akıyor', '📡', '#43c98b')
  } else if (status.state === 'error' && status.message) {
    pushToast(null, 'TikTok bağlantı hatası', status.message.slice(0, 72), '⚠️', '#ef5b5b')
  }
}

function sendMetrics(force = false) {
  if (!net) return
  if (!force && sim.time - sim.metricsAt < 0.7) return
  sim.metricsAt = sim.time
  const players = []
  for (const c of chars.customers) {
    if (c.leaving) continue
    players.push({
      id: c.user.id,
      nickname: c.user.nickname,
      avatar: c.user.avatar,
      role: 'musteri',
      status: !c.seated ? 'geliyor' : c.teaServed ? 'çay içiyor' : c.impatient ? 'sabırsız' : 'bekliyor',
      table: c.tableIndex
    })
  }
  for (const a of chars.apprentices) {
    if (a.leaving) continue
    players.push({
      id: a.user.id, nickname: a.user.nickname, avatar: a.user.avatar,
      role: 'apprentice', status: a.ready ? 'bardak topluyor' : 'geliyor'
    })
  }
  players.push({ id: 'cayci-riza', nickname: 'Çaycı Rıza', avatar: '', role: 'cayci', status: sim.running ? 'servis' : 'mola' })
  if (chars.zabita) players.push({ id: 'zabita', nickname: 'Zabıta Kemal', avatar: '', role: 'zabita', status: 'baskın' })
  if (chars.muhtar) players.push({ id: 'muhtar', nickname: 'Muhtar Hüsnü', avatar: '', role: 'muhtar', status: 'ziyaret' })
  sim.spectators = Math.max(0, seenUsers.size - players.length)
  net.sendMetrics({
    chaos: Number(sim.chaos.toFixed(1)),
    timer: Math.ceil(sim.remaining),
    round: sim.round,
    state: sim.running ? (sim.paused ? 'paused' : 'playing') : 'ended',
    players: players.slice(0, 26),
    spectators: sim.spectators,
    customers: chars.customers.filter((c) => c.seated && !c.leaving).length,
    apprentices: chars.apprentices.filter((a) => a.ready && !a.leaving).length,
    fights: world.tables.filter((t) => t.fightUntil > sim.time).length,
    gifts: sim.gifts,
    likes: sim.likes,
    seats: seats.filter((s) => s.occupied).length,
    totalSeats: seats.length,
    wins: sim.wins,
    viewers: Math.round(viewerFake),
    boost: sim.time < sim.boostUntil,
    immunity: sim.time < sim.immunityUntil,
    updatedAt: Date.now()
  }, force)
}

/* ------------------------------------------------------------------ loop */

function animate() {
  requestAnimationFrame(animate)
  const now = performance.now()
  const raw = (now - lastFrame) / 1000
  lastFrame = now
  const dt = Math.min(0.1, Math.max(0.001, raw))
  visualTime += dt

  if (sim.running && !sim.paused) {
    sim.time += dt
    updateRound(dt)
    updateCayci(dt)
    updateCustomers(dt)
    updateApprentices(dt)
    updateSpecials(dt)
    demoTick(dt)
  } else {
    updateCustomers(dt)
    updateApprentices(dt)
    updateSpecials(dt)
    if (!sim.running && sim.round > 0 && sim.resetAt && sim.time >= sim.resetAt && dom.overlay.hidden === false) {
      // reset handled below for timing independent of paused time
    }
  }

  if (!sim.running) {
    sim.time += dt
    updateCayci(dt)
    if (sim.resetAt && sim.time >= sim.resetAt) {
      sim.resetAt = 0
      resetRound()
    }
  }

  chars.cayci?.update(dt, visualTime)
  world.update(dt, visualTime)
  effects.update(dt)
  updateCamera(dt)
  updateHud()
  if (sim.time - (animate.lastMetrics ?? 0) > 0.7) {
    animate.lastMetrics = sim.time
    sendMetrics()
  }

  compositedRender()
}

let renderedOnce = false
function compositedRender() {
  if (composer) composer.render()
  else renderer.render(scene, camera)
  if (!renderedOnce) {
    renderedOnce = true
    setTimeout(() => {
      dom.boot?.classList.add('hide')
    }, 350)
  }
}

/* ------------------------------------------------------------------ boot */

async function boot() {
  createRenderer()
  setupScene()
  setupCharacters()
  seedInitial(3)
  applyRatio()
  setupNet()
  setupUiEvents()
  applyAtmosphere()
  updateHud(true)
  applySettings({ ...settings })
  sim.remaining = settings.roundSeconds
  sim.demoNext = sim.time + 2.2

  // Intro showcase: a few gentle beats so the square never looks static.
  setTimeout(() => {
    if (!sim.running) return
    appendTicker('🫖 <b>Çaycı Rıza</b> ocağı yaktı — meydan açıldı')
    pushToast(null, 'Mahalle meydanı açıldı', 'Tur başladı · 5 dakika', '🫖', '#ffb45c')
  }, 1200)

  animate()

  net.ready.then(() => {
    updateSoundButton()
  })
}

function setupUiEvents() {
  const unlock = () => {
    sound.unlock()
    sound.setVolume(settings.volume)
    sound.setMuted(settings.muted)
    dom.soundHint?.classList.add('hide')
    updateSoundButton()
  }
  document.addEventListener('pointerdown', unlock, { once: true })
  document.addEventListener('keydown', unlock, { once: true })

  dom.soundBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    sound.unlock()
    settings.muted = !settings.muted
    sound.setMuted(settings.muted)
    updateSoundButton()
    if (!settings.muted) {
      sound.playTeaSpoon()
      pushToast(null, 'Ses açıldı', 'Prosedürel mahalle sesleri dinliyor', '🔊', '#43c98b')
    }
    net?.saveSettings({ muted: settings.muted })
  })

  dom.aspectBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleAspect()
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F9') {
      e.preventDefault()
      toggleAspect()
    }
    if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey) {
      dom.soundBtn.click()
    }
  })

  let resizeTimer = 0
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      if (settings.aspect === 'auto') applyRatio()
      else resize()
    }, 120)
  })

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      lastFrame = performance.now()
      sound.ctx?.resume?.().catch(() => {})
    }
  })
}

boot().catch((error) => {
  console.error(error)
  showFatal(error?.message ?? 'Bilinmeyen hata')
})
