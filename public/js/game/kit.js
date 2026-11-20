/**
 * Shared Three.js kit: canvas textures, cached materials, primitive helpers.
 * Everything in the world is procedural — no external textures required.
 */
import * as THREE from 'three'

export const COLORS = {
  cream: 0xf6e8cc,
  creamDim: 0xd8c39b,
  brass: 0xc9913f,
  brassLight: 0xf0c778,
  copper: 0xb87333,
  wood: 0x5b3a20,
  woodDark: 0x3a2313,
  woodLight: 0x8a5c33,
  stone: 0x7d7468,
  stoneDark: 0x4a443d,
  felt: 0x2f7d5b,
  feltDark: 0x1d5c41,
  leaf: 0x3f7a3a,
  leafDark: 0x27522a,
  sky: 0x1a1024,
  amber: 0xffb45c,
  ember: 0xff7a2f,
  skin: 0xe2ab7e
}

const textureCache = new Map()
const materialCache = new Map()
const geometryCache = new Map()

export function canvasTexture(key, width, height, draw, { repeat = null, wrap = true } = {}) {
  if (textureCache.has(key)) return textureCache.get(key)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  draw(ctx, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  if (wrap) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    if (repeat) texture.repeat.set(repeat[0], repeat[1])
  }
  textureCache.set(key, texture)
  return texture
}

export function material(key, params = {}) {
  const id = key + JSON.stringify(params)
  if (materialCache.has(id)) return materialCache.get(id)
  const m = new THREE.MeshStandardMaterial({
    roughness: 0.82,
    metalness: 0.02,
    ...params
  })
  materialCache.set(id, m)
  return m
}

export const M = {
  wood: () => material('wood', { color: COLORS.wood, roughness: 0.78 }),
  woodDark: () => material('woodDark', { color: COLORS.woodDark, roughness: 0.9 }),
  woodLight: () => material('woodLight', { color: COLORS.woodLight, roughness: 0.72 }),
  brass: () => material('brass', { color: COLORS.brass, metalness: 0.75, roughness: 0.3 }),
  brassLight: () => material('brassLight', { color: COLORS.brassLight, metalness: 0.65, roughness: 0.24 }),
  copper: () => material('copper', { color: COLORS.copper, metalness: 0.82, roughness: 0.28 }),
  copperDark: () => material('copperDark', { color: 0x7d441d, metalness: 0.75, roughness: 0.38 }),
  stone: () => material('stone', { color: COLORS.stone, roughness: 0.95 }),
  stoneDark: () => material('stoneDark', { color: COLORS.stoneDark, roughness: 1 }),
  felt: () => material('felt', { color: COLORS.felt, roughness: 0.98 }),
  black: () => material('black', { color: 0x141114, roughness: 0.7 }),
  iron: () => material('iron', { color: 0x35323a, metalness: 0.6, roughness: 0.5 }),
  cream: () => material('cream', { color: COLORS.cream, roughness: 0.85 }),
  skin: (color = COLORS.skin) => material('skin' + color, { color, roughness: 0.8 }),
  glass: () => material('glass', {
    color: 0xffe0a8,
    emissive: 0x7a3a12,
    emissiveIntensity: 0.18,
    transparent: true,
    opacity: 0.55,
    roughness: 0.12,
    metalness: 0.1
  }),
  tea: () => material('tea', { color: 0x9c3f12, emissive: 0x6b2408, emissiveIntensity: 0.3, roughness: 0.25 }),
  leaf: () => material('leaf', { color: COLORS.leaf, roughness: 0.95, flatShading: true }),
  leafDark: () => material('leafDark', { color: COLORS.leafDark, roughness: 1, flatShading: true }),
  plaster: () => material('plaster', { color: 0xcdb99a, roughness: 0.95 }),
  plasterWarm: () => material('plasterWarm', { color: 0xbfa383, roughness: 0.95 }),
  tile: () => material('tile', { color: 0x8f4a33, roughness: 0.9 }),
  green: () => material('greenfelt', { color: 0x2f7d5b, roughness: 1 }),
  emissive: (color = 0xffc27a, intensity = 1) =>
    material('emissive' + color + intensity, { color: 0x1a120a, emissive: color, emissiveIntensity: intensity, roughness: 0.4 })
}

export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 20, 14),
  sphereLow: new THREE.SphereGeometry(1, 12, 8),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 20),
  cylinderLow: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 16),
  plane: new THREE.PlaneGeometry(1, 1),
  torus: new THREE.TorusGeometry(1, 0.08, 8, 24)
}

export function capsule(radius, length) {
  const key = `cap${radius}-${length}`
  if (!geometryCache.has(key)) geometryCache.set(key, new THREE.CapsuleGeometry(radius, length, 4, 10))
  return geometryCache.get(key)
}

export function mesh(parent, geo, mat, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, typeof mat === 'function' ? mat() : mat)
  m.position.set(x, y, z)
  m.scale.set(sx, sy, sz)
  m.rotation.set(rx, ry, rz)
  m.castShadow = cast
  m.receiveShadow = receive
  if (parent) parent.add(m)
  return m
}

export const box = (parent, mat, w, h, d, x, y, z, opts = {}) =>
  mesh(parent, G.box, mat, { x, y, z, sx: w, sy: h, sz: d, ...opts })

export const sphere = (parent, mat, r, x, y, z, opts = {}) =>
  mesh(parent, G.sphere, mat, { x, y, z, sx: r, sy: r, sz: r, ...opts })

export const scaleSphere = (parent, mat, rx, ry, rz, x, y, z, opts = {}) =>
  mesh(parent, G.sphere, mat, { x, y, z, sx: rx, sy: ry, sz: rz, ...opts })

export function cyl(parent, mat, r1, r2, h, x, y, z, opts = {}) {
  if (r1 === r2) return mesh(parent, G.cylinder, mat, { x, y, z, sx: r1, sy: h, sz: r1, ...opts })
  const key = `taper-${r1}-${r2}-${opts.segments ?? 20}`
  if (!geometryCache.has(key)) geometryCache.set(key, new THREE.CylinderGeometry(r2, r1, 1, opts.segments ?? 20))
  return mesh(parent, geometryCache.get(key), mat, { x, y, z, sy: h, ...opts })
}

export function cylinderBetween(parent, mat, from, to, radius, segments = 8) {
  const dir = new THREE.Vector3().subVectors(to, from)
  const len = dir.length()
  const geo = new THREE.CylinderGeometry(radius, radius, len, segments)
  const m = new THREE.Mesh(geo, typeof mat === 'function' ? mat() : mat)
  m.position.copy(from).add(to).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  m.castShadow = true
  m.receiveShadow = true
  parent.add(m)
  return m
}

/** 0 on the lower square, 0.9 on the tea-house terrace. */
export function floorHeight(z) {
  if (z <= -4.05) return 0.9
  return 0
}

export function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/* ------------------------------------------------------------ textures */

export function makeTextures() {
  const cobble = canvasTexture('cobble', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#3b352f'
    ctx.fillRect(0, 0, w, h)
    const rows = 9
    const cols = 8
    for (let row = 0; row < rows; row++) {
      const offset = (row % 2) * (w / cols / 2)
      for (let col = -1; col <= cols; col++) {
        const cw = w / cols
        const ch = h / rows
        const x = col * cw + offset + (Math.random() - 0.5) * 3
        const y = row * ch + (Math.random() - 0.5) * 3
        const tone = 88 + Math.random() * 38
        ctx.fillStyle = `rgb(${tone + 12},${tone + 6},${tone - 2})`
        roundedRect(ctx, x + 2, y + 2, cw - 4, ch - 5, 6)
        ctx.fill()
        ctx.strokeStyle = 'rgba(20,16,12,.55)'
        ctx.lineWidth = 2
        ctx.stroke()
        // taşın üstünde hafif ışık
        ctx.fillStyle = 'rgba(255,235,200,.06)'
        roundedRect(ctx, x + 5, y + 4, cw - 12, ch * 0.3, 5)
        ctx.fill()
        if (Math.random() < 0.12) {
          ctx.fillStyle = 'rgba(60,90,50,.28)'
          ctx.beginPath()
          ctx.ellipse(x + cw * 0.7, y + ch * 0.7, 7, 4, 0.4, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  }, { repeat: [7, 6] })

  const wallStone = canvasTexture('wallStone', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4c4237'
    ctx.fillRect(0, 0, w, h)
    const rows = 6
    for (let r = 0; r < rows; r++) {
      let x = -20 + (r % 2) * 30
      const y = (r * h) / rows
      while (x < w) {
        const bw = 52 + Math.random() * 48
        const tone = 105 + Math.random() * 32
        ctx.fillStyle = `rgb(${tone + 10},${tone},${tone - 14})`
        roundedRect(ctx, x + 2, y + 2, bw - 4, h / rows - 4, 4)
        ctx.fill()
        ctx.strokeStyle = 'rgba(30,24,18,.6)'
        ctx.lineWidth = 2
        ctx.stroke()
        x += bw
      }
    }
  }, { repeat: [4, 2] })

  const plaster = canvasTexture('plaster', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#c8b08c'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,245,220' : '80,60,40'},${Math.random() * 0.05})`
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2)
    }
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, 'rgba(255,235,200,.12)')
    grad.addColorStop(1, 'rgba(50,30,20,.25)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  }, { repeat: [2, 2] })

  const wood = canvasTexture('wood', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#6a4527'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 34; i++) {
      const y = (i / 34) * h
      ctx.strokeStyle = `rgba(${30 + Math.random() * 40},${18 + Math.random() * 22},10,${0.18 + Math.random() * 0.22})`
      ctx.lineWidth = 1 + Math.random() * 2
      ctx.beginPath()
      ctx.moveTo(0, y)
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 2.5)
      ctx.stroke()
    }
    for (let i = 0; i < 7; i++) {
      ctx.strokeStyle = 'rgba(40,24,12,.45)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(30 + Math.random() * 200, Math.random() * h, 8, 3, Math.random(), 0, Math.PI * 2)
      ctx.stroke()
    }
  }, { repeat: [3, 1] })

  const felt = canvasTexture('felt', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2f7d5b'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5)
    }
    const grad = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.72)
    grad.addColorStop(0, 'rgba(255,255,255,.05)')
    grad.addColorStop(1, 'rgba(0,0,0,.22)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  })

  const roof = canvasTexture('roof', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#793e2c'
    ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 24) {
      for (let x = -12; x < w; x += 24) {
        const off = (y / 24) % 2 ? 12 : 0
        ctx.fillStyle = `rgb(${135 + Math.random() * 25},${70 + Math.random() * 18},${48 + Math.random() * 14})`
        ctx.beginPath()
        ctx.arc(x + off + 12, y + 18, 12, Math.PI, 0)
        ctx.fill()
        ctx.strokeStyle = 'rgba(40,18,12,.55)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }
  }, { repeat: [6, 2] })

  const shadow = canvasTexture('shadow', 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2)
    g.addColorStop(0, 'rgba(0,0,0,.62)')
    g.addColorStop(0.55, 'rgba(0,0,0,.28)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }, { wrap: false })

  const smoke = canvasTexture('smoke', 64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, 'rgba(255,248,235,.9)')
    g.addColorStop(0.4, 'rgba(240,225,205,.35)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }, { wrap: false })

  const fire = canvasTexture('fire', 64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h * 0.65, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, 'rgba(255,240,180,1)')
    g.addColorStop(0.3, 'rgba(255,165,60,.9)')
    g.addColorStop(0.7, 'rgba(255,80,20,.35)')
    g.addColorStop(1, 'rgba(120,20,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }, { wrap: false })

  const clock = canvasTexture('clock', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f2e4c8'
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#6b3d17'
    ctx.lineWidth = 9
    ctx.stroke()
    ctx.fillStyle = '#4a2410'
    ctx.font = 'bold 22px Georgia'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const nums = ['12', '3', '6', '9']
    const pos = [[128, 34], [222, 128], [128, 222], [34, 128]]
    nums.forEach((n, i) => ctx.fillText(n, pos[i][0], pos[i][1]))
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2
      ctx.strokeStyle = i % 5 ? 'rgba(74,36,16,.4)' : 'rgba(74,36,16,.85)'
      ctx.lineWidth = i % 5 ? 1 : 2.5
      ctx.beginPath()
      ctx.moveTo(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100)
      ctx.lineTo(128 + Math.cos(a) * 108, 128 + Math.sin(a) * 108)
      ctx.stroke()
    }
    ctx.fillStyle = '#4a2410'
    ctx.font = 'italic 15px Georgia'
    ctx.fillText('MAHALLE', 128, 172)
  }, { wrap: false })

  const tv = canvasTexture('tv', 256, 192, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#2f8a4a')
    g.addColorStop(1, '#1c5c33')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(240,255,240,.5)'
    ctx.lineWidth = 2
    ctx.strokeRect(14, 14, w - 28, h - 28)
    ctx.beginPath()
    ctx.moveTo(14, h / 2)
    ctx.lineTo(w - 14, h / 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, 26, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,.85)'
    ctx.font = 'bold 18px Verdana'
    ctx.fillText('MAÇ 2 - 1', 18, 34)
    ctx.font = '11px Verdana'
    ctx.fillStyle = 'rgba(255,255,255,.7)'
    ctx.fillText('MAHALLE SPOR', 18, h - 22)
    for (let y = 0; y < h; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,.12)'
      ctx.fillRect(0, y, w, 1)
    }
  }, { wrap: false })

  const menu = canvasTexture('menu', 512, 320, (ctx, w, h) => {
    ctx.fillStyle = '#20170f'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#caa06a'
    ctx.lineWidth = 8
    ctx.strokeRect(12, 12, w - 24, h - 24)
    ctx.fillStyle = '#f6e7c8'
    ctx.textAlign = 'center'
    ctx.font = 'bold 46px Georgia'
    ctx.fillText('ÇAY OCAĞI', w / 2, 72)
    ctx.font = '20px Georgia'
    ctx.fillStyle = '#e0bd8a'
    ctx.fillText('— 1974 —', w / 2, 102)
    ctx.textAlign = 'left'
    ctx.font = '26px "Courier New"'
    const items = [['ÇAY', '10 ₺'], ['TOST', '45 ₺'], ['OKEY', '20 ₺'], ['TAVLA', '15 ₺']]
    items.forEach(([name, price], i) => {
      ctx.fillStyle = '#f6e7c8'
      ctx.fillText(name, 60, 160 + i * 38)
      ctx.fillStyle = '#e7c489'
      ctx.fillText(price, 330, 160 + i * 38)
      ctx.strokeStyle = 'rgba(230,200,150,.16)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(60, 172 + i * 38)
      ctx.lineTo(430, 172 + i * 38)
      ctx.stroke()
    })
  }, { wrap: false })

  const barber = canvasTexture('barber', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#efe6d2'
    ctx.fillRect(0, 0, w, h)
    for (let i = -6; i < 20; i++) {
      ctx.strokeStyle = i % 2 ? '#b83636' : '#2c5d9c'
      ctx.lineWidth = 18
      ctx.beginPath()
      ctx.moveTo(i * 26, 0)
      ctx.lineTo(i * 26 + 120, h)
      ctx.stroke()
    }
  }, { repeat: [2, 1] })

  const shop = canvasTexture('shop', 512, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#f7c66d')
    g.addColorStop(0.5, '#a85f2a')
    g.addColorStop(1, '#3a1d12')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(30,16,10,.55)'
    for (let i = 0; i < 7; i++) ctx.fillRect(20 + i * 70, 40, 6, h - 50)
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = 'rgba(30,16,10,.4)'
      ctx.fillRect(10, 60 + i * 60, w - 20, 8)
    }
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = ['#d94b3a', '#e0a63a', '#4b8f5a', '#3d6fb0'][i % 4]
      ctx.globalAlpha = 0.55
      ctx.fillRect(30 + Math.random() * (w - 70), 90 + Math.random() * 130, 9, 16)
      ctx.globalAlpha = 1
    }
  }, { wrap: false })

  const sign = (key, title, subtitle, bg = '#2a1a10', fg = '#f4d59a') =>
    canvasTexture('sign-' + key, 1024, 256, (ctx, w, h) => {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#d3a35c'
      ctx.lineWidth = 12
      ctx.strokeRect(14, 14, w - 28, h - 28)
      ctx.fillStyle = fg
      ctx.textAlign = 'center'
      ctx.font = 'bold 132px Georgia'
      ctx.fillText(title, w / 2, h / 2 + 22)
      if (subtitle) {
        ctx.font = '30px Verdana'
        ctx.fillStyle = 'rgba(244,213,154,.66)'
        ctx.fillText(subtitle, w / 2, h - 34)
      }
    }, { wrap: false })

  return {
    cobble,
    wallStone,
    plaster,
    wood,
    felt,
    roof,
    shadow,
    smoke,
    fire,
    clock,
    tv,
    menu,
    barber,
    shop,
    signCay: sign('cay', 'ÇAY OCAĞI', 'MAHALLE MEYDANI'),
    signSquare: sign('square', 'MAHALLE MEYDANI', '1974', '#241812', '#efd6a0'),
    signBakkal: sign('bakkal', 'BAKKAL', 'HER ŞEY BURADA', '#243b2c', '#f0dfa8'),
    signBerber: sign('berber', 'BERBER', 'USTA İBRAHİM', '#2b2a3c', '#f0dfa8')
  }
}

let TEXTURES = null
export function textures() {
  return (TEXTURES ??= makeTextures())
}

export function planarShadow(parent, x, z, sx, sz, opacity = 0.75, y = 0.015) {
  const mat = new THREE.MeshBasicMaterial({
    map: textures().shadow,
    transparent: true,
    opacity,
    depthWrite: false
  })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
  m.rotation.x = -Math.PI / 2
  m.position.set(x, floorHeight(z) + y, z)
  m.scale.set(sx, sz, 1)
  m.renderOrder = 1
  parent.add(m)
  return m
}
