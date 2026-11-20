/**
 * Stylised low-poly neighbourhood characters, fully procedural.
 * Each character owns a billboard avatar frame (TikTok profile photo) and a
 * tiny pose state machine: walk, sit, serve, angry, fight, hide, cheer, vip.
 */
import * as THREE from 'three'
import {
  COLORS, G, M, box, sphere, scaleSphere, cyl, capsule, mesh, material, roundedRect, textures
} from './kit.js'

const SKIN = [0xe8b48a, 0xd39a6c, 0xb97a4f, 0xf0c9a0, 0xc98d62, 0x8f5a36]
const SHIRTS = [0x4f6f9c, 0x7c4a3a, 0x3f7a5e, 0x8b5a86, 0xb08a48, 0x4a7c86, 0x9c4b4b, 0x5b6b8f]
const ROLE_TINT = {
  cayci: '#ffb45c',
  musteri: '#c4a7ff',
  apprentice: '#6ed6ff',
  zabita: '#6f9cff',
  muhtar: '#ffd166'
}

const ROLE_LABEL = {
  cayci: 'ÇAYCI',
  musteri: 'MÜŞTERİ',
  apprentice: 'ÇIRAK',
  zabita: 'ZABITA',
  muhtar: 'MUHTAR'
}

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

function cloth(color) {
  return material('cloth' + color, { color, roughness: 0.93 })
}

function drawAvatarFrame(canvas, { name, role, image, tint }) {
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  const frame = ctx.createLinearGradient(0, 0, w, h)
  frame.addColorStop(0, '#2a1a11')
  frame.addColorStop(0.5, '#120b10')
  frame.addColorStop(1, '#26160f')
  roundedRect(ctx, 6, 4, w - 12, h - 20, 34)
  ctx.fillStyle = frame
  ctx.fill()
  ctx.lineWidth = 7
  ctx.strokeStyle = tint
  ctx.stroke()

  // inner glow line
  roundedRect(ctx, 15, 13, w - 30, h - 38, 26)
  ctx.strokeStyle = 'rgba(255,240,210,.22)'
  ctx.lineWidth = 2
  ctx.stroke()

  const cx = w / 2
  const cy = 126
  const r = 84
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  let drew = false
  if (image && image.complete && image.naturalWidth > 0) {
    const s = Math.max((r * 2) / image.naturalWidth, (r * 2) / image.naturalHeight)
    const iw = image.naturalWidth * s
    const ih = image.naturalHeight * s
    ctx.drawImage(image, cx - iw / 2, cy - ih / 2, iw, ih)
    drew = true
  }
  if (!drew) {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
    g.addColorStop(0, tint)
    g.addColorStop(1, '#3a2114')
    ctx.fillStyle = g
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    ctx.fillStyle = 'rgba(20,12,8,.85)'
    ctx.font = '800 74px Verdana, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const initials = String(name || 'Ç').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase()
    ctx.fillText(initials || 'Ç', cx, cy + 4)
  }
  ctx.restore()

  // avatar ring
  ctx.beginPath()
  ctx.arc(cx, cy, r + 1, 0, Math.PI * 2)
  ctx.strokeStyle = tint
  ctx.lineWidth = 5
  ctx.stroke()

  // name plate
  roundedRect(ctx, 18, 226, w - 36, 44, 18)
  ctx.fillStyle = 'rgba(8,5,8,.8)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,235,200,.16)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#fff1d6'
  ctx.font = '700 25px "Segoe UI", Verdana, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let label = String(name ?? '').trim()
  if (label.length > 14) label = label.slice(0, 13) + '…'
  ctx.fillText(label, cx, 249)

  // role ribbon
  roundedRect(ctx, 30, 278, w - 60, 24, 12)
  ctx.fillStyle = 'rgba(255,214,150,.14)'
  ctx.fill()
  ctx.fillStyle = tint
  ctx.font = '800 13px "Segoe UI", Verdana, sans-serif'
  ctx.fillText(ROLE_LABEL[role] ?? 'İZLEYİCİ', cx, 291)

  // pointer
  ctx.beginPath()
  ctx.moveTo(cx - 13, h - 14)
  ctx.lineTo(cx, h - 2)
  ctx.lineTo(cx + 13, h - 14)
  ctx.closePath()
  ctx.fillStyle = tint
  ctx.fill()
}

export class Character {
  constructor({ role = 'musteri', user = null, x = 0, z = 0, ry = 0, scale = 1 }) {
    this.role = role
    this.user = user
    this.id = user?.id ?? `${role}-${Math.random().toString(36).slice(2, 8)}`
    this.name = role === 'cayci' ? 'Çaycı Rıza' : role === 'zabita' ? 'Zabıta Kemal' : role === 'muhtar' ? 'Muhtar Hüsnü' : (user?.nickname ?? 'izleyici')
    this.group = new THREE.Group()
    this.group.position.set(x, 0, z)
    this.group.rotation.y = ry
    this.group.scale.setScalar(scale)
    this.baseScale = scale
    this.seed = hash(user?.id ?? this.name)
    this.roleTint = ROLE_TINT[role] ?? '#ffb45c'

    this.pose = 'idle'
    this.walkPhase = Math.random() * Math.PI * 2
    this.time = Math.random() * 4
    this.moving = false
    this.target = null
    this.speed = 1.6
    this.onArrive = null
    this.yOffset = 0
    this.seated = false
    this.bodyOffset = 0
    this.trayVisible = false
    this.holdingTea = false
    this.sipTimer = 0
    this.angryTimer = 0
    this.extra = {}
    this.parts = {}

    this.buildBody()
    this.buildAvatar()
    this.buildContactShadow()
  }

  buildBody() {
    const role = this.role
    const seed = this.seed
    const skin = SKIN[seed % SKIN.length]
    const shirt = role === 'zabita' ? 0x2a416e : role === 'muhtar' ? 0x201a18 : role === 'cayci' ? 0xf2e6ce : SHIRTS[seed % SHIRTS.length]
    const pants = role === 'zabita' ? 0x1d2c4a : role === 'muhtar' ? 0x241f1d : role === 'cayci' ? 0x3a2a1e : 0x30333c
    this.palette = { skin, shirt, pants }

    const root = this.group
    const body = new THREE.Group()
    root.add(body)
    this.parts.body = body

    const legMat = cloth(pants)
    const shoeMat = material('shoe', { color: 0x1b1613, roughness: 0.7 })
    for (const side of [-1, 1]) {
      const leg = new THREE.Group()
      leg.position.set(side * 0.13, 0.86, 0)
      body.parent.add(leg)
      this.parts[side < 0 ? 'legL' : 'legR'] = leg
      const limb = mesh(leg, capsule(0.085, 0.52), legMat, { x: 0, y: -0.36, z: 0 })
      limb.scale.set(0.92, 1, 0.92)
      const shoe = box(leg, shoeMat, 0.2, 0.11, 0.32, 0, -0.69, 0.06)
      shoe.castShadow = true
    }

    // hips
    box(body, legMat, 0.4, 0.22, 0.26, 0, 0.86, 0)
    // torso
    const torso = mesh(body, capsule(0.235, 0.46), cloth(shirt), { x: 0, y: 1.18, z: 0 })
    torso.scale.set(1.1, 1, 0.86)
    torso.castShadow = true
    this.parts.torso = torso

    // neck + head
    mesh(body, G.cylinderLow, M.skin(skin), { x: 0, y: 1.53, sx: 0.085, sy: 0.12, sz: 0.085 })
    const head = sphere(body, M.skin(skin), 0.275, 0, 1.73, 0)
    head.scale.set(1, 1.05, 0.94)
    this.parts.head = head
    // ears
    for (const side of [-1, 1]) sphere(body, M.skin(skin), 0.066, side * 0.27, 1.73, 0, { cast: false })
    // nose
    sphere(body, M.skin(skin), 0.068, 0, 1.72, 0.265, { cast: false })
    // eyes
    for (const side of [-1, 1]) {
      sphere(body, M.black(), 0.028, side * 0.095, 1.785, 0.245, { cast: false })
      box(body, M.black(), 0.08, 0.018, 0.02, side * 0.1, 1.845, 0.245, { rz: side * 0.08, cast: false })
    }
    // smile / mouth
    box(body, material('mouth', { color: 0x6b3b2a, roughness: 1 }), 0.065, 0.018, 0.02, 0, 1.63, 0.255, { cast: false })

    // hair cap
    const hairColor = role === 'muhtar' ? 0x9c948c : role === 'zabita' ? 0x2a211a : 0x2e2119
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.282, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.56),
      cloth(hairColor)
    )
    hair.position.set(0, 1.735, -0.02)
    hair.rotation.x = -0.14
    hair.scale.set(1.03, 0.92, 1.02)
    body.add(hair)
    // sideburns
    for (const side of [-1, 1]) box(body, cloth(hairColor), 0.045, 0.15, 0.06, side * 0.255, 1.72, -0.03, { cast: false })

    // mustache
    const mustache = role === 'muhtar' ? 0xb0a89f : 0x33221a
    if (['cayci', 'musteri', 'muhtar', 'zabita', 'apprentice'].includes(role)) {
      for (const side of [-1, 1]) {
        const m = mesh(body, capsule(0.032, 0.09), cloth(mustache), {
          x: side * 0.068, y: 1.655, z: 0.267, rz: side * 0.34, cast: false
        })
        m.scale.set(0.65, 1, 0.62)
      }
    }

    // Arms
    const sleeve = role === 'muhtar' || role === 'zabita' ? cloth(pants) : cloth(shirt)
    for (const side of [-1, 1]) {
      const arm = new THREE.Group()
      arm.position.set(side * 0.3, 1.4, 0)
      body.add(arm)
      this.parts[side < 0 ? 'armL' : 'armR'] = arm
      const upper = mesh(arm, capsule(0.075, 0.36), sleeve, { x: 0, y: -0.22, z: 0 })
      upper.scale.set(1, 1, 1)
      const hand = sphere(arm, M.skin(skin), 0.083, 0, -0.47, 0.01)
      hand.scale.set(0.9, 1, 0.9)
      if (role === 'cayci' || role === 'apprentice') {
        // rolled-up sleeve cuff
        mesh(arm, G.cylinderLow, cloth(0xf2e6ce), { x: 0, y: -0.38, sx: 0.082, sy: 0.06, sz: 0.082 })
      }
    }

    this.dressRole({ body, head, skin, shirt, pants })
    this.parts.avatarY = 2.32
    this.parts.seatedAvatarY = 2.02
  }

  dressRole({ body, head, skin, shirt, pants }) {
    const role = this.role
    const seed = this.seed

    if (role === 'cayci') {
      // apron + sash + towel + white cap
      const apron = material('apron', { color: 0x6b3f22, roughness: 0.95 })
      box(body, apron, 0.4, 0.66, 0.035, 0, 1.03, 0.215, { rx: 0.03 })
      box(body, apron, 0.07, 0.32, 0.02, -0.16, 1.42, 0.24, { rz: 0.25 })
      box(body, apron, 0.07, 0.32, 0.02, 0.16, 1.42, 0.24, { rz: -0.25 })
      box(body, cloth(0xa8322c), 0.43, 0.075, 0.05, 0, 1.27, 0.22)
      // towel on shoulder
      box(body, M.cream(), 0.12, 0.3, 0.09, -0.3, 1.36, 0.12, { rz: 0.1 })
      // cap
      cyl(body, cloth(0xf1e6d2), 0.265, 0.275, 0.13, 0, 1.98, 0)
      box(body, cloth(0xe4d7bf), 0.3, 0.035, 0.2, 0, 1.93, 0.18)
      // belt
      box(body, M.woodDark(), 0.42, 0.07, 0.28, 0, 0.93, 0)
      this.tray = this.makeTray()
      this.tray.visible = false
      body.add(this.tray)
      this.parts.tray = this.tray
    }

    if (role === 'apprentice') {
      const apron = material('apronGreen', { color: 0x376650, roughness: 0.95 })
      box(body, apron, 0.38, 0.6, 0.035, 0, 1.05, 0.212)
      cyl(body, cloth(0xb33a32), 0.255, 0.265, 0.12, 0, 1.96, 0)
      box(body, cloth(0xa5322b), 0.28, 0.03, 0.18, 0, 1.915, 0.17)
      const basket = new THREE.Group()
      basket.position.set(0.05, 1.02, 0.5)
      body.add(basket)
      box(basket, material('basket', { color: 0x8a6231, roughness: 1 }), 0.44, 0.24, 0.3, 0, 0, 0)
      mesh(basket, G.torus, M.woodDark(), { x: 0, y: 0.14, z: 0, sx: 0.16, sy: 0.12, sz: 0.1, rx: 0.15 })
      this.basket = basket
    }

    if (role === 'musteri') {
      const vestColor = [0x2f2119, 0x3a3026, 0x2c3440, 0x4a2f2a][seed % 4]
      const vest = material('vest' + vestColor, { color: vestColor, roughness: 0.95 })
      box(body, vest, 0.46, 0.56, 0.06, 0, 1.17, -0.19)
      box(body, vest, 0.14, 0.56, 0.05, -0.16, 1.17, 0.205)
      box(body, vest, 0.14, 0.56, 0.05, 0.16, 1.17, 0.205)
      for (let i = 0; i < 3; i++) sphere(body, M.brass(), 0.018, 0, 1.34 - i * 0.1, 0.235, { cast: false })
      // cap or headscarf
      if (seed % 3 === 0) {
        cyl(body, cloth(0x3a2a1e), 0.27, 0.28, 0.12, 0, 1.955, 0)
        box(body, cloth(0x2c2118), 0.3, 0.03, 0.3, 0, 1.9, 0.2)
      } else if (seed % 3 === 1) {
        const scarf = material('scarf' + (seed % 5), { color: [0x9c4b57, 0x5a4b8c, 0x3f6b5c, 0x8c6b3a, 0x7c3a3a][seed % 5], roughness: 1 })
        const wrap = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), scarf)
        wrap.position.set(0, 1.76, -0.03)
        wrap.scale.set(1.05, 1.02, 1.02)
        body.add(wrap)
        box(body, scarf, 0.5, 0.42, 0.12, 0, 1.48, -0.2, { rx: 0.12 })
        sphere(body, cloth(0x2e2119), 0.05, 0.27, 1.6, -0.12, { cast: false })
      }
      // tesbih
      if (seed % 2 === 0) {
        const tesbih = new THREE.Group()
        tesbih.position.set(0.38, 0.98, 0.12)
        body.add(tesbih)
        for (let i = 0; i < 8; i++) {
          const a = i * 0.55
          sphere(tesbih, material('bead', { color: 0x8c4a1e, roughness: 0.6 }), 0.022, Math.cos(a) * 0.09, -i * 0.035, Math.sin(a) * 0.04, { cast: false })
        }
      }
    }

    if (role === 'zabita') {
      const uniform = material('uniform', { color: 0x243a63, roughness: 0.85 })
      box(body, uniform, 0.48, 0.3, 0.06, 0, 1.3, -0.2)
      // epaulettes
      for (const side of [-1, 1]) box(body, M.brassLight(), 0.13, 0.035, 0.12, side * 0.23, 1.43, 0.02)
      // cap + visor + badge
      cyl(body, material('policeCap', { color: 0x1b2a45, roughness: 0.7 }), 0.275, 0.285, 0.14, 0, 1.99, 0)
      box(body, material('visor', { color: 0x111a26, roughness: 0.35 }), 0.32, 0.035, 0.22, 0, 1.94, 0.2)
      sphere(body, M.brassLight(), 0.035, 0, 2.01, 0.27, { cast: false })
      // radio + antenna
      box(body, M.black(), 0.1, 0.16, 0.06, -0.19, 1.28, 0.22)
      mesh(body, G.cylinderLow, M.black(), { x: -0.24, y: 1.42, z: 0.22, sx: 0.008, sy: 0.22, sz: 0.008 })
      // baton in right hand
      const baton = mesh(body, G.cylinderLow, M.black(), { x: 0.42, y: 0.9, z: 0.18, sx: 0.028, sy: 0.42, sz: 0.028, rz: 0.2 })
      // utility belt
      box(body, M.black(), 0.44, 0.07, 0.3, 0, 0.93, 0)
      this.parts.head.rotation.y = 0
    }

    if (role === 'muhtar') {
      const suit = material('suit', { color: 0x2a2320, roughness: 0.88 })
      box(body, suit, 0.5, 0.62, 0.06, 0, 1.16, -0.2)
      box(body, suit, 0.17, 0.62, 0.05, -0.18, 1.16, 0.2)
      box(body, suit, 0.17, 0.62, 0.05, 0.18, 1.16, 0.2)
      // white shirt + bow tie
      box(body, M.cream(), 0.12, 0.3, 0.03, 0, 1.34, 0.235)
      for (const side of [-1, 1]) {
        mesh(body, G.cone, material('bow', { color: 0x8f2f2f, roughness: 0.8 }), {
          x: side * 0.06, y: 1.44, z: 0.26, sx: 0.055, sy: 0.1, sz: 0.03, rz: side * Math.PI / 2
        })
      }
      // belly
      scaleSphere(body, suit, 0.29, 0.26, 0.23, 0, 1.06, 0.02)
      box(body, suit, 0.44, 0.07, 0.3, 0, 0.92, 0)
      // pocket square + gold watch chain
      box(body, M.cream(), 0.06, 0.06, 0.02, 0.2, 1.32, 0.23)
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * 0.15 + (i / 5) * Math.PI * 0.7
        sphere(body, M.brassLight(), 0.018, Math.cos(a) * 0.2, 1.03 + Math.sin(a) * 0.05, 0.21, { cast: false })
      }
      // hat
      cyl(body, material('feltHat', { color: 0x1f1a18, roughness: 0.9 }), 0.3, 0.3, 0.12, 0, 1.99, 0)
      cyl(body, material('feltHat', { color: 0x1f1a18, roughness: 0.9 }), 0.42, 0.42, 0.025, 0, 1.94, 0)
      box(body, M.brass(), 0.08, 0.02, 0.02, 0, 1.97, 0.29)
      this.parts.head.rotation.z = 0.03
    }

    // tea glass held while served
    this.teaHand = new THREE.Group()
    this.teaHand.position.set(0.4, 1.02, 0.32)
    body.add(this.teaHand)
    mesh(this.teaHand, new THREE.CylinderGeometry(0.06, 0.045, 0.18, 9), M.glass(), { x: 0, y: 0, z: 0 })
    mesh(this.teaHand, new THREE.CylinderGeometry(0.048, 0.04, 0.1, 8), M.tea(), { x: 0, y: -0.02, z: 0 })
    mesh(this.teaHand, G.cylinderLow, M.cream(), { x: 0, y: -0.1, z: 0, sx: 0.13, sy: 0.015, sz: 0.13 })
    this.teaHand.visible = false
  }

  makeTray() {
    const tray = new THREE.Group()
    tray.position.set(0, 1.12, 0.52)
    mesh(tray, G.cylinderLow, M.brass(), { x: 0, y: 0, z: 0, sx: 0.35, sy: 0.025, sz: 0.35 })
    mesh(tray, G.torus, M.brassLight(), { x: 0, y: 0.01, z: 0, sx: 0.36, sy: 0.36, sz: 0.36, rx: Math.PI / 2 })
    for (let i = 0; i < 4; i++) {
      const x = i % 2 ? 0.15 : -0.15
      const z = i < 2 ? -0.14 : 0.14
      mesh(tray, new THREE.CylinderGeometry(0.05, 0.04, 0.16, 8), M.glass(), { x, y: 0.11, z })
      mesh(tray, new THREE.CylinderGeometry(0.04, 0.035, 0.09, 8), M.tea(), { x, y: 0.09, z })
      mesh(tray, G.cylinderLow, M.cream(), { x, y: 0.035, z, sx: 0.1, sy: 0.012, sz: 0.1 })
    }
    return tray
  }

  buildAvatar() {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 312
    this.avatarCanvas = canvas
    this.avatarTexture = new THREE.CanvasTexture(canvas)
    this.avatarTexture.colorSpace = THREE.SRGBColorSpace
    this.avatarTexture.minFilter = THREE.LinearFilter
    drawAvatarFrame(canvas, { name: this.name, role: this.role, image: null, tint: this.roleTint })
    this.avatarTexture.needsUpdate = true

    const mat = new THREE.SpriteMaterial({
      map: this.avatarTexture,
      transparent: true,
      depthWrite: false,
      depthTest: true
    })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(0.92, 1.12, 1)
    sprite.center.set(0.5, 0)
    sprite.position.set(0, 2.3, 0)
    sprite.renderOrder = 6
    this.group.add(sprite)
    this.avatarSprite = sprite

    const url = this.user?.avatar
    if (url) {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => {
        this.avatarImage = image
        drawAvatarFrame(canvas, { name: this.name, role: this.role, image, tint: this.roleTint })
        this.avatarTexture.needsUpdate = true
      }
      image.onerror = () => {}
      image.src = url
    }
  }

  buildContactShadow() {
    const mat = new THREE.MeshBasicMaterial({ map: textures().shadow, transparent: true, opacity: 0.55, depthWrite: false })
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
    sh.rotation.x = -Math.PI / 2
    sh.position.y = 0.02
    sh.scale.set(1.25, 1.05, 1)
    sh.renderOrder = 1
    this.group.add(sh)
    this.shadow = sh
  }

  setPose(pose) {
    if (this.pose !== pose) {
      this.pose = pose
      this.angryTimer = 0
    }
  }

  setSeated(seated) {
    this.seated = seated
    this.setPose(seated ? 'sit' : 'idle')
  }

  walkTo(target, speed = 1.7, onArrive = null) {
    this.target = new THREE.Vector3(target.x, target.y ?? 0, target.z)
    this.speed = speed
    this.onArrive = onArrive
    this.moving = true
    this.setPose('walk')
  }

  stop() {
    this.moving = false
    this.target = null
    if (this.pose === 'walk') this.setPose(this.seated ? 'sit' : 'idle')
  }

  faceTowards(x, z) {
    const angle = Math.atan2(x - this.group.position.x, z - this.group.position.z)
    this.group.rotation.y = angle
  }

  showTray(on) {
    this.trayVisible = on
    if (this.parts.tray) this.parts.tray.visible = on
  }

  showTea(on) {
    this.holdingTea = on
    if (this.teaHand) this.teaHand.visible = on
  }

  dispose() {
    this.group.parent?.remove(this.group)
    this.avatarTexture?.dispose()
    this.avatarSprite?.material?.dispose()
    this.shadow?.material?.dispose()
  }

  update(dt, time) {
    this.time = time
    const body = this.parts.body
    const armL = this.parts.armL
    const armR = this.parts.armR
    const legL = this.parts.legL
    const legR = this.parts.legR

    // Movement
    if (this.moving && this.target) {
      const dx = this.target.x - this.group.position.x
      const dz = this.target.z - this.group.position.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.08) {
        this.moving = false
        this.target = null
        const cb = this.onArrive
        this.onArrive = null
        if (this.pose === 'walk') this.setPose(this.seated ? 'sit' : 'idle')
        cb?.()
      } else {
        const step = Math.min(dist, this.speed * dt)
        const nx = this.group.position.x + (dx / dist) * step
        const nz = this.group.position.z + (dz / dist) * step
        this.group.position.x = nx
        this.group.position.z = nz
        const desired = Math.atan2(dx, dz)
        let diff = desired - this.group.rotation.y
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        this.group.rotation.y += diff * Math.min(1, dt * 9)
        this.walkPhase += dt * this.speed * 5.4
      }
    }

    const floor = this.group.position.z <= -4.05 ? 0.9 : 0
    this.group.position.y += ((floor + this.yOffset) - this.group.position.y) * Math.min(1, dt * 9)

    // Pose blends
    const walk = this.moving ? Math.sin(this.walkPhase) : 0
    const walk2 = this.moving ? Math.cos(this.walkPhase * 2) : 0
    let bodyY = this.moving ? Math.abs(Math.sin(this.walkPhase)) * 0.025 : 0
    let bodyZ = 0
    let armLX = walk * 0.5
    let armRX = -walk * 0.5
    let armLZ = 0.14
    let armRZ = -0.14
    let legX = walk * 0.65
    let legXR = -walk * 0.65
    let headX = 0
    let headY = 0
    let headZ = 0
    const t = time + this.seed * 0.01

    switch (this.pose) {
      case 'sit': {
        bodyY = -0.36
        legX = -1.34
        legXR = -1.34
        armLX = -0.5
        armRX = -0.5
        armLZ = 0.04
        armRZ = -0.04
        headY = Math.sin(t * 0.7) * 0.22
        if (this.holdingTea) {
          this.sipTimer += dt
          const sip = Math.max(0, Math.sin(this.sipTimer * 1.6))
          armRX = -0.5 - sip * 0.9
          armRZ = -0.36 - sip * 0.28
          headX = sip * 0.18
        }
        bodyY += Math.sin(t * 1.6) * 0.008
        break
      }
      case 'angry': {
        this.angryTimer += dt
        const slam = Math.max(0, Math.sin(this.angryTimer * 7.4))
        armRX = -0.55 - slam * 1.45
        armRZ = -0.05
        armLX = -0.3
        bodyY = -0.02 + slam * 0.04
        headX = Math.sin(this.angryTimer * 12) * 0.08
        headY = Math.sin(this.angryTimer * 20) * 0.16
        legX = -0.15
        legXR = 0.15
        break
      }
      case 'fight': {
        const wave = Math.sin(t * 14)
        armLX = -2.3 + wave * 0.35
        armRX = -2.3 - wave * 0.35
        armLZ = 0.55
        armRZ = -0.55
        bodyY = Math.abs(Math.sin(t * 8)) * 0.08
        headY = Math.sin(t * 10) * 0.35
        headZ = Math.sin(t * 9) * 0.12
        legX = -0.25
        legXR = 0.25
        break
      }
      case 'hide': {
        bodyY = -0.55
        legX = -1.1
        legXR = -1.1
        armLX = -1.9
        armRX = -1.9
        armLZ = 0.75
        armRZ = -0.75
        headX = 0.3
        headY = Math.sin(t * 6) * 0.2
        break
      }
      case 'cheer': {
        const wave = Math.sin(t * 9)
        armLX = -2.6 + wave * 0.2
        armRX = -2.6 - wave * 0.2
        armLZ = 0.5
        armRZ = -0.5
        bodyY = Math.abs(Math.sin(t * 5)) * 0.1
        headY = Math.sin(t * 3) * 0.2
        break
      }
      case 'carry': {
        armRX = -1.35
        armRZ = -0.06
        armLX = walk * 0.3
        headX = -0.05
        break
      }
      case 'serve': {
        armRX = -1.2
        armRZ = 0
        armLX = -0.18
        headX = -0.08
        break
      }
      case 'sweep': {
        armRX = -1.15
        armRZ = -0.15
        armLX = walk * 0.3
        headX = 0.1
        break
      }
      case 'vip': {
        armRX = -2.4 + Math.sin(t * 2.2) * 0.15
        armRZ = -0.55
        armLX = 0.2
        headY = Math.sin(t * 0.9) * 0.25
        headX = -0.1
        break
      }
      case 'walk': {
        headY = Math.sin(t * 0.8) * 0.12
        break
      }
      default: {
        bodyY += Math.sin(t * 1.7) * 0.008
        headY = Math.sin(t * 0.7 + this.seed) * 0.18
        armLZ = 0.14 + Math.sin(t * 1.3) * 0.03
        armRZ = -0.14 - Math.sin(t * 1.3) * 0.03
        break
      }
    }

    // apply
    body.position.y += (bodyY - body.position.y) * Math.min(1, dt * 12)
    body.position.z = bodyZ
    legL.position.y = legR.position.y = 0.86 + (this.seated ? body.position.y : 0)
    legL.rotation.x += (legX - legL.rotation.x) * Math.min(1, dt * 14)
    legR.rotation.x += (legXR - legR.rotation.x) * Math.min(1, dt * 14)
    armL.rotation.x += (armLX - armL.rotation.x) * Math.min(1, dt * 11)
    armR.rotation.x += (armRX - armR.rotation.x) * Math.min(1, dt * 11)
    armL.rotation.z += (armLZ - armL.rotation.z) * Math.min(1, dt * 11)
    armR.rotation.z += (armRZ - armR.rotation.z) * Math.min(1, dt * 11)
    this.parts.head.rotation.x += (headX - this.parts.head.rotation.x) * Math.min(1, dt * 8)
    this.parts.head.rotation.y += (headY - this.parts.head.rotation.y) * Math.min(1, dt * 8)
    this.parts.head.rotation.z += (headZ - this.parts.head.rotation.z) * Math.min(1, dt * 8)

    if (this.parts.tray && this.parts.tray.visible) {
      this.parts.tray.position.y = 1.13 + Math.sin(t * 5) * 0.006
    }
    if (this.basket) this.basket.rotation.z = Math.sin(t * 8) * (this.moving ? 0.06 : 0.01)

    // avatar frame bob + seated offset
    const targetY = (this.seated ? this.parts.seatedAvatarY : this.parts.avatarY) + Math.sin(t * 1.8) * 0.02
    this.avatarSprite.position.y += (targetY - this.avatarSprite.position.y) * Math.min(1, dt * 6)
    this.avatarSprite.visible = this.avatarSprite.position.y > 0.8

    // occasional blink (eyes are separate meshes — cheap scale trick on head not used)
    if (this.shadow) {
      this.shadow.position.y = 0.02 - (this.group.position.y - floor)
      this.shadow.material.opacity = this.seated ? 0.4 : 0.55
    }
  }
}

/** "Çaycı" hero with a permanent name tag. */
export function createCayci({ x = -1.2, z = -7.6 } = {}) {
  const c = new Character({
    role: 'cayci',
    user: { id: 'cayci-riza', nickname: 'Çaycı Rıza' },
    x,
    z,
    ry: 0
  })
  c.name = 'Çaycı Rıza'
  return c
}
