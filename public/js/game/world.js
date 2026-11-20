/**
 * Procedural open-air Turkish neighbourhood square: two-level cobbled meydan,
 * tea house with copper semaver, six felt okey tables, pergola, Edison bulbs,
 * fountain, shops, mosque silhouette and a sleeping cat.
 */
import * as THREE from 'three'
import {
  COLORS, G, M, box, sphere, scaleSphere, cyl, capsule, mesh, cylinderBetween,
  floorHeight, textures, planarShadow, material
} from './kit.js'

const TABLE_POSITIONS = [
  { x: -6.3, z: 0.5, ry: 0.08 },
  { x: 0.1, z: 1.2, ry: -0.04 },
  { x: 6.4, z: 0.4, ry: 0.12 },
  { x: -6.1, z: 5.6, ry: -0.1 },
  { x: 0.2, z: 6.2, ry: 0.05 },
  { x: 6.3, z: 5.3, ry: -0.14 }
]

const VIP_TABLES = [
  { x: -7.4, z: -6.4, ry: 0.2 },
  { x: 7.2, z: -6.5, ry: -0.2 }
]

function catenary(a, b, sag, count = 14) {
  const points = []
  for (let i = 0; i <= count; i++) {
    const t = i / count
    points.push(new THREE.Vector3(
      THREE.MathUtils.lerp(a.x, b.x, t),
      THREE.MathUtils.lerp(a.y, b.y, t) - Math.sin(t * Math.PI) * sag,
      THREE.MathUtils.lerp(a.z, b.z, t)
    ))
  }
  return points
}

function buildSky(scene, refs) {
  const uniforms = {
    topColor: { value: new THREE.Color(0x120b26) },
    midColor: { value: new THREE.Color(0x3a2043) },
    bottomColor: { value: new THREE.Color(0xd06a3a) },
    sunColor: { value: new THREE.Color(0xffb066) },
    sunDir: { value: new THREE.Vector3(-0.55, 0.07, 0.83) }
  }
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(90, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms,
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vWorld = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor, midColor, bottomColor, sunColor, sunDir;
        varying vec3 vWorld;
        void main() {
          float h = clamp(vWorld.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(bottomColor, midColor, smoothstep(0.0, 0.42, h));
          col = mix(col, topColor, smoothstep(0.4, 0.86, h));
          float sun = pow(max(dot(normalize(vWorld), normalize(sunDir)), 0.0), 22.0);
          float halo = pow(max(dot(normalize(vWorld), normalize(sunDir)), 0.0), 4.0);
          col += sunColor * sun * 0.85 + sunColor * halo * 0.13;
          gl_FragColor = vec4(col, 1.0);
        }`
    })
  )
  sky.frustumCulled = false
  scene.add(sky)
  refs.sky = sky
  refs.skyUniforms = uniforms

  // Stars
  const starGeo = new THREE.BufferGeometry()
  const positions = []
  for (let i = 0; i < 420; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(0.15 + Math.random() * 0.85)
    const r = 82
    positions.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    )
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffe6bb, size: 0.32, sizeAttenuation: true, transparent: true, opacity: 0.75, depthWrite: false
  }))
  scene.add(stars)
  refs.stars = stars

  const moon = mesh(scene, G.sphere, M.emissive(0xfff0d0, 0.8), {
    x: -20, y: 27, z: -46, sx: 2.4, sy: 2.4, sz: 2.4, cast: false
  })
  refs.moon = moon
}

function buildGround(scene, refs) {
  const T = textures()

  const groundMat = new THREE.MeshStandardMaterial({
    map: T.cobble, bumpMap: T.cobble, bumpScale: 0.06, roughness: 0.96, color: 0xa89883
  })
  const ground = new THREE.Mesh(new THREE.BoxGeometry(36, 0.4, 32), groundMat)
  ground.position.set(0, -0.2, 1.5)
  ground.receiveShadow = true
  scene.add(ground)

  const dirt = new THREE.Mesh(new THREE.PlaneGeometry(80, 70), new THREE.MeshStandardMaterial({ color: 0x16110d, roughness: 1 }))
  dirt.rotation.x = -Math.PI / 2
  dirt.position.y = -0.42
  scene.add(dirt)

  // Terrace
  const terraceMat = new THREE.MeshStandardMaterial({
    map: T.wallStone, roughness: 0.92, color: 0xb3a48a
  })
  const terrace = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.9, 8.6), terraceMat)
  terrace.position.set(0, 0.45, -8.2)
  terrace.receiveShadow = true
  terrace.castShadow = true
  scene.add(terrace)

  const terraceTop = new THREE.Mesh(
    new THREE.PlaneGeometry(18.4, 8.6),
    new THREE.MeshStandardMaterial({ map: T.wallStone, roughness: 0.94, color: 0xa89880 })
  )
  terraceTop.rotation.x = -Math.PI / 2
  terraceTop.position.set(0, 0.905, -8.2)
  terraceTop.receiveShadow = true
  scene.add(terraceTop)

  // Two shallow steps across the teras front
  for (let i = 0; i < 2; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(11 - i * 0.5, 0.3, 1.05), terraceMat)
    step.position.set(0, 0.15 + i * 0.3, -3.55 - i * 0.55)
    step.receiveShadow = true
    step.castShadow = true
    scene.add(step)
  }

  // stone trim
  box(scene, M.stoneDark(), 18.6, 0.16, 0.5, 0, 0.94, -3.9)
  box(scene, M.stoneDark(), 0.5, 0.9, 8.6, -9.2, 0.45, -8.2, { cast: false })
  box(scene, M.stoneDark(), 0.5, 0.9, 8.6, 9.2, 0.45, -8.2, { cast: false })

  // Kilim on the terrace
  const kilim = canvasKilim()
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.5), new THREE.MeshStandardMaterial({ map: kilim, roughness: 1 }))
  rug.rotation.x = -Math.PI / 2
  rug.rotation.z = 0.05
  rug.position.set(-3.2, 0.915, -5.4)
  rug.receiveShadow = true
  scene.add(rug)

  refs.terraceY = 0.9

  // Low neighbourhood walls / borders
  const lowWall = (x, z, w, d, ry = 0) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.75, d), new THREE.MeshStandardMaterial({ map: T.wallStone, color: 0x9b8b76, roughness: 0.95 }))
    wall.position.set(x, 0.37, z)
    wall.rotation.y = ry
    wall.castShadow = true
    wall.receiveShadow = true
    scene.add(wall)
  }
  lowWall(-16.5, 1.5, 0.6, 24)
  lowWall(16.5, 1.5, 0.6, 24)
  lowWall(0, 16.8, 33, 0.6)

  // Paving details
  for (let i = 0; i < 16; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.4 + Math.random() * 0.5, 0.18), new THREE.MeshStandardMaterial({ color: 0x4a4138, roughness: 1 }))
    p.rotation.x = -Math.PI / 2
    p.rotation.z = Math.random() * 3
    p.position.set(-14 + Math.random() * 28, 0.012, -2 + Math.random() * 17)
    scene.add(p)
  }
}

function canvasKilim() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 300
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#7c2f28'
  ctx.fillRect(0, 0, 512, 300)
  ctx.strokeStyle = '#e0b464'
  ctx.lineWidth = 10
  ctx.strokeRect(14, 14, 484, 272)
  const motifs = ['#e0b464', '#1f4b4a', '#c9533e', '#efe0c0', '#2d3348']
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 7; col++) {
      const x = 48 + col * 64
      const y = 55 + row * 58
      ctx.fillStyle = motifs[(row + col) % motifs.length]
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(Math.PI / 4)
      ctx.fillRect(-13, -13, 26, 26)
      ctx.restore()
      ctx.strokeStyle = '#2a1810'
      ctx.lineWidth = 2
      ctx.strokeRect(x - 7, y - 7, 14, 14)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function buildStepsAndDoor() {}

function buildTeaHouse(scene, refs) {
  const T = textures()
  const house = new THREE.Group()
  scene.add(house)

  const plasterMat = new THREE.MeshStandardMaterial({ map: T.plaster, roughness: 0.95, color: 0xd9c3a1 })

  // Back and side walls
  const back = new THREE.Mesh(new THREE.BoxGeometry(13.6, 4.9, 0.55), plasterMat)
  back.position.set(0, 3.15, -12.4)
  back.castShadow = true
  back.receiveShadow = true
  house.add(back)
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.55, 4.9, 6.2), plasterMat)
    wall.position.set(side * 6.6, 3.15, -9.3)
    wall.castShadow = true
    wall.receiveShadow = true
    house.add(wall)
  }

  // Wooden frame beams
  const beam = M.woodDark()
  box(house, beam, 13.8, 0.24, 0.7, 0, 5.62, -12.4)
  box(house, beam, 13.8, 0.2, 0.7, 0, 0.82, -12.4)
  for (const x of [-6.3, -3.2, 0, 3.2, 6.3]) box(house, beam, 0.2, 4.9, 0.6, x, 3.15, -12.28)
  for (const side of [-1, 1]) {
    box(house, beam, 0.65, 4.9, 0.24, side * 6.6, 3.15, -6.3)
    box(house, beam, 0.65, 0.24, 6.3, side * 6.6, 5.55, -9.3)
  }

  // Roof (pitched suggestion with tiles)
  const roofMat = new THREE.MeshStandardMaterial({ map: T.roof, roughness: 0.9, color: 0xb77a5c })
  const roof = new THREE.Mesh(new THREE.BoxGeometry(14.8, 0.35, 7.4), roofMat)
  roof.position.set(0, 5.85, -9.2)
  roof.rotation.x = -0.055
  roof.castShadow = true
  house.add(roof)
  const ridge = mesh(house, G.cylinderLow, roofMat, { x: 0, y: 6.12, z: -12.2, sx: 0.22, sy: 14.6, sz: 0.22, rz: Math.PI / 2 })
  ridge.castShadow = true
  // front awning
  const awning = new THREE.Mesh(new THREE.BoxGeometry(13.9, 0.16, 2.7), roofMat)
  awning.position.set(0, 5.25, -5.4)
  awning.rotation.x = -0.24
  awning.castShadow = true
  house.add(awning)

  // Porch posts
  for (const x of [-6.2, 6.2]) {
    box(house, M.woodLight(), 0.24, 4.4, 0.24, x, 3.1, -5.9)
    box(house, M.wood(), 0.5, 0.25, 0.5, x, 0.92, -5.9)
  }
  box(house, M.woodDark(), 13.2, 0.22, 0.26, 0, 5.2, -5.9)

  // Sign board
  const signMat = new THREE.MeshStandardMaterial({ map: T.signCay, roughness: 0.66, emissive: 0x3a1d08, emissiveIntensity: 0.5 })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.35), signMat)
  sign.position.set(0, 4.62, -5.87)
  house.add(sign)
  box(house, M.brass(), 5.65, 0.09, 0.12, 0, 5.32, -5.92)
  box(house, M.brass(), 5.65, 0.09, 0.12, 0, 3.92, -5.92)

  // Counter
  const counter = new THREE.Group()
  counter.position.set(0, 0.9, -9.55)
  house.add(counter)
  box(counter, new THREE.MeshStandardMaterial({ map: T.wood, roughness: 0.8, color: 0x9a7048 }), 7.2, 1.15, 1.25, 0, 0.58, 0)
  box(counter, M.cream(), 7.45, 0.1, 1.42, 0, 1.17, 0)
  for (let i = -3; i <= 3; i++) {
    box(counter, M.woodDark(), 0.06, 0.88, 0.06, i * 1.05, 0.5, 0.66)
  }
  box(counter, M.woodDark(), 7.2, 0.12, 0.12, 0, 1.03, 0.68)
  // brass foot rail
  mesh(counter, G.cylinderLow, M.brass(), { x: 0, y: 0.22, z: 0.86, sx: 0.05, sy: 7, sz: 0.05, rz: Math.PI / 2 })

  // Shelves + glasses on the back wall
  for (const y of [2.6, 3.35]) {
    box(house, M.woodDark(), 5.4, 0.09, 0.45, -2.4, y, -12.02)
    box(house, M.woodDark(), 4.2, 0.09, 0.45, 4.1, y, -12.02)
  }
  const glassGeo = new THREE.CylinderGeometry(0.055, 0.042, 0.19, 8)
  const glassMat = material('shelfGlass', { color: 0xffd9a0, emissive: 0xc46a1e, emissiveIntensity: 0.55, transparent: true, opacity: 0.72, roughness: 0.2 })
  const teaMat = M.tea()
  for (let i = 0; i < 26; i++) {
    const side = i < 13 ? -1 : 1
    const idx = i % 13
    const x = side < 0 ? -4.6 + idx * 0.36 : 2.6 + idx * 0.3
    const y = i % 2 ? 2.6 : 3.35
    const glass = new THREE.Mesh(glassGeo, glassMat)
    glass.position.set(x, y + 0.15, -12.0)
    house.add(glass)
    const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.038, 0.07, 8), teaMat)
    tea.position.set(x, y + 0.125, -12.0)
    house.add(tea)
    box(house, M.cream(), 0.14, 0.012, 0.14, x, y + 0.05, -12.0, { cast: false })
  }

  // TV
  const tvGroup = new THREE.Group()
  tvGroup.position.set(5.4, 3.78, -12.05)
  house.add(tvGroup)
  box(tvGroup, M.black(), 2.05, 1.5, 0.42, 0, 0, 0)
  box(tvGroup, material('tvBody', { color: 0x2c2a2e, roughness: 0.5 }), 2.2, 0.18, 0.3, 0, -0.8, 0.05)
  const tvMat = new THREE.MeshStandardMaterial({
    map: T.tv, emissive: 0x2f9a58, emissiveMap: T.tv, emissiveIntensity: 1.2, roughness: 0.25
  })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 1.14), tvMat)
  screen.position.set(0, 0.08, 0.215)
  tvGroup.add(screen)
  refs.tvMaterial = tvMat
  const tvLight = new THREE.PointLight(0x54d98a, 5, 5.5, 2)
  tvLight.position.set(5.4, 3.8, -11.2)
  house.add(tvLight)
  refs.tvLight = tvLight

  // Wall clock
  const clockGroup = new THREE.Group()
  clockGroup.position.set(-5.0, 3.85, -12.08)
  house.add(clockGroup)
  mesh(clockGroup, G.cylinderLow, M.woodDark(), { x: 0, y: 0, z: 0, sx: 0.66, sy: 0.14, sz: 0.66, rx: Math.PI / 2 })
  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.61, 32), new THREE.MeshStandardMaterial({ map: T.clock, roughness: 0.8 }))
  clockFace.position.z = 0.075
  clockGroup.add(clockFace)
  const hourPivot = new THREE.Group()
  hourPivot.position.set(0, 0, 0.1)
  clockGroup.add(hourPivot)
  box(hourPivot, M.black(), 0.035, 0.3, 0.02, 0, 0.14, 0)
  const minutePivot = new THREE.Group()
  minutePivot.position.set(0, 0, 0.11)
  clockGroup.add(minutePivot)
  box(minutePivot, M.black(), 0.025, 0.44, 0.02, 0, 0.2, 0)
  refs.clockHour = hourPivot
  refs.clockMinute = minutePivot

  // Menu board
  const menuMat = new THREE.MeshStandardMaterial({ map: T.menu, roughness: 0.85 })
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), menuMat)
  menu.position.set(3.1, 2.05, -12.06)
  house.add(menu)
  box(house, M.woodDark(), 2.55, 1.65, 0.05, 3.1, 2.05, -12.1)

  // Hanging glass rack
  box(house, M.iron(), 3.2, 0.05, 0.32, -2.1, 3.9, -9.6)
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Mesh(glassGeo, glassMat)
    g.position.set(-3.5 + i * 0.34, 3.76, -9.6)
    g.rotation.z = Math.PI
    house.add(g)
  }

  // Pendant lamps
  const shadeMat = material('lampShade', { color: 0x254a3f, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide })
  for (const [x, z] of [[-4.6, -8.4], [0, -8.6], [4.6, -8.4]]) {
    mesh(house, G.cylinderLow, M.iron(), { x, y: 4.5, z, sx: 0.015, sy: 1.2, sz: 0.015, cast: false })
    mesh(house, new THREE.ConeGeometry(0.34, 0.3, 16, 1, true), shadeMat, { x, y: 3.98, z, sx: 1, sy: 1, sz: 1 })
    sphere(house, M.emissive(0xffc784, 2.2), 0.105, x, 3.87, z)
  }

  // Counter props: tray, sugar bowl, teapot, toasts
  const tray = mesh(counter, G.cylinderLow, M.brass(), { x: -2.3, y: 1.24, z: 0.1, sx: 0.55, sy: 0.035, sz: 0.55 })
  for (let i = 0; i < 4; i++) {
    const gx = -2.55 + (i % 2) * 0.5
    const gz = -0.05 + Math.floor(i / 2) * 0.32
    const g = new THREE.Mesh(glassGeo, glassMat)
    g.position.set(gx, 1.38, gz)
    counter.add(g)
  }
  const teapot = new THREE.Group()
  teapot.position.set(1.4, 1.27, 0.05)
  counter.add(teapot)
  scaleSphere(teapot, M.copper(), 0.26, 0.22, 0.26, 0, 0.12, 0)
  mesh(teapot, G.cylinderLow, M.copper(), { x: 0, y: 0.32, z: 0, sx: 0.1, sy: 0.08, sz: 0.1 })
  mesh(teapot, G.torus, M.copperDark(), { x: 0.27, y: 0.14, z: 0, sx: 0.13, sy: 0.13, sz: 0.13, ry: Math.PI / 2 })
  cylinderBetween(teapot, M.copper(), new THREE.Vector3(0.2, 0.16, 0.1), new THREE.Vector3(0.34, 0.24, 0.16), 0.03, 6)
  box(counter, material('toast', { color: 0xc9893b, roughness: 0.9 }), 0.34, 0.12, 0.3, 3.0, 1.28, 0.1)
  cylinderBetween(counter, M.cream(), new THREE.Vector3(2.8, 1.23, -0.3), new THREE.Vector3(3.2, 1.23, -0.3), 0.09, 8)

  // Stools
  for (const x of [-4.2, 4.1]) {
    const stool = new THREE.Group()
    stool.position.set(x, 0.9, -8.3)
    house.add(stool)
    mesh(stool, G.cylinderLow, M.wood(), { x: 0, y: 0.55, sx: 0.28, sy: 0.09, sz: 0.28 })
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      mesh(stool, G.cylinderLow, M.woodDark(), { x: Math.cos(a) * 0.18, y: 0.27, z: Math.sin(a) * 0.18, sx: 0.03, sy: 0.55, sz: 0.03 })
    }
  }

  // Semaver
  buildSemaver(house, refs)

  // Doorway glow on the back wall
  box(house, material('doorway', { color: 0x150d08, roughness: 1 }), 1.1, 2.2, 0.1, -1.2, 2.0, -12.08)
  refs.teaHouse = house
}

function buildSemaver(parent, refs) {
  const semaver = new THREE.Group()
  semaver.position.set(-1.15, 1.9, -9.55)
  parent.add(semaver)

  mesh(semaver, G.cylinderLow, M.copperDark(), { x: 0, y: 0.08, sx: 0.5, sy: 0.16, sz: 0.5 })
  mesh(semaver, G.cylinderLow, M.brass(), { x: 0, y: 0.17, sx: 0.46, sy: 0.1, sz: 0.46 })
  mesh(semaver, G.cylinderLow, M.copper(), { x: 0, y: 0.72, sx: 0.42, sy: 0.95, sz: 0.42 })
  // decorative bands
  for (const y of [0.42, 0.68, 0.96]) {
    mesh(semaver, G.cylinderLow, M.brassLight(), { x: 0, y, sx: 0.45, sy: 0.045, sz: 0.45 })
  }
  mesh(semaver, new THREE.CylinderGeometry(0.24, 0.42, 0.28, 20), M.copper(), { x: 0, y: 1.3 })
  mesh(semaver, G.cylinderLow, M.brass(), { x: 0, y: 1.46, sx: 0.17, sy: 0.08, sz: 0.17 })
  mesh(semaver, G.cylinderLow, M.copperDark(), { x: 0, y: 1.66, sx: 0.1, sy: 0.42, sz: 0.1 })
  mesh(semaver, new THREE.ConeGeometry(0.16, 0.22, 12), M.brass(), { x: 0, y: 1.95 })
  // curved spout
  const spoutCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.34, 1.06, 0),
    new THREE.Vector3(0.62, 1.06, 0),
    new THREE.Vector3(0.72, 1.22, 0),
    new THREE.Vector3(0.62, 1.36, 0)
  ])
  const spout = new THREE.Mesh(new THREE.TubeGeometry(spoutCurve, 10, 0.045, 6, false), M.brass())
  semaver.add(spout)
  // handles
  for (const side of [-1, 1]) {
    mesh(semaver, G.torus, M.brass(), { x: side * 0.46, y: 0.82, z: 0, sx: 0.2, sy: 0.24, sz: 0.2, ry: Math.PI / 2 })
  }
  // tap
  cylinderBetween(semaver, M.brassLight(), new THREE.Vector3(-0.05, 0.34, 0.35), new THREE.Vector3(-0.05, 0.28, 0.62), 0.03, 8)
  mesh(semaver, G.sphere, M.brass(), { x: -0.05, y: 0.41, z: 0.62, sx: 0.06, sy: 0.06, sz: 0.06 })

  // ocak / tüp flame under the semaver
  const flame = new THREE.Group()
  flame.position.set(0, 0.13, 0.35)
  semaver.add(flame)
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
  refs.stoveFlame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 10), flameMat)
  refs.stoveFlame.position.y = 0.26
  flame.add(refs.stoveFlame)
  const flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 8), new THREE.MeshBasicMaterial({ color: 0xffe1a0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }))
  flameCore.position.y = 0.19
  flame.add(flameCore)
  refs.stoveFlameCore = flameCore
  refs.stoveFlameGroup = flame
  const fireLight = new THREE.PointLight(0xff6a1e, 8, 5.5, 2)
  fireLight.position.set(0, 0.5, 0.6)
  semaver.add(fireLight)
  refs.stoveLight = fireLight

  // steam origin
  refs.steamOrigin = new THREE.Vector3(-1.15, 3.75, -9.5)
  refs.stovePos = new THREE.Vector3(-1.15, 2.02, -9.35)
  refs.semaver = semaver

  // sugar bowl + tea glasses near stove
  const bowl = mesh(semaver, G.cylinderLow, M.cream(), { x: 0.75, y: 0.99, z: 0.1, sx: 0.14, sy: 0.11, sz: 0.14 })
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.042, 0.19, 8), M.glass())
    g.position.set(-0.7 + i * 0.24, 0.98, 0.62)
    semaver.add(g)
  }
}

function buildTables(scene, refs) {
  refs.tables = []
  for (const t of [...TABLE_POSITIONS, ...VIP_TABLES]) {
    const isVip = t.z < -4
    const y = isVip ? 0.9 : 0
    const group = new THREE.Group()
    group.position.set(t.x, y, t.z)
    group.rotation.y = t.ry
    scene.add(group)

    // pedestal + top
    mesh(group, G.cylinderLow, M.woodDark(), { x: 0, y: 0.36, sx: 0.16, sy: 0.7, sz: 0.16 })
    mesh(group, G.cylinderLow, M.woodDark(), { x: 0, y: 0.06, sx: 0.45, sy: 0.09, sz: 0.45 })
    box(group, M.wood(), 1.72, 0.13, 1.72, 0, 0.73, 0)
    const felt = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.055, 1.52), new THREE.MeshStandardMaterial({ map: textures().felt, roughness: 1, color: 0xb9d8c6 }))
    felt.position.set(0, 0.79, 0)
    felt.receiveShadow = true
    group.add(felt)
    // brass corner caps
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box(group, M.brass(), 0.16, 0.05, 0.16, sx * 0.78, 0.755, sz * 0.78)
    }

    // backgammon board
    const board = new THREE.Group()
    board.position.set(0.28, 0.82, -0.2)
    board.rotation.y = -0.08
    group.add(board)
    box(board, material('board', { color: 0x6b3a1e, roughness: 0.7 }), 0.86, 0.045, 0.62, 0, 0, 0)
    for (let i = 0; i < 6; i++) {
      box(board, M.cream(), 0.055, 0.02, 0.22, -0.36 + i * 0.145, 0.03, -0.14)
      box(board, M.black(), 0.055, 0.02, 0.22, -0.36 + i * 0.145, 0.03, 0.14)
    }
    // okey racks
    for (const side of [-1, 1]) {
      const rack = new THREE.Group()
      rack.position.set(side * 0.52, 0.84, 0.42)
      rack.rotation.y = side * -0.2
      group.add(rack)
      box(rack, M.woodDark(), 0.62, 0.06, 0.12, 0, 0, 0)
      box(rack, M.woodDark(), 0.62, 0.1, 0.05, 0, 0.04, -0.05)
      for (let i = 0; i < 7; i++) {
        const tile = box(rack, i % 2 ? M.cream() : material('okeyTile', { color: 0xf2ead8, roughness: 0.8 }), 0.065, 0.09, 0.035, -0.26 + i * 0.075, 0.06, 0.01)
        box(tile, M.black(), 0.03, 0.01, 0.02, 0, 0.1, 0, { cast: false })
      }
    }
    // tea glasses + saucers
    for (let i = 0; i < 4; i++) {
      const gx = -0.55 + (i % 2) * 0.36
      const gz = -0.5 - Math.floor(i / 2) * 0.28
      mesh(group, G.cylinderLow, M.cream(), { x: gx, y: 0.825, z: gz, sx: 0.12, sy: 0.018, sz: 0.12 })
      mesh(group, new THREE.CylinderGeometry(0.055, 0.04, 0.17, 10), M.glass(), { x: gx, y: 0.91, z: gz })
      mesh(group, new THREE.CylinderGeometry(0.044, 0.036, 0.11, 8), M.tea(), { x: gx, y: 0.88, z: gz })
    }
    // dice
    box(group, M.cream(), 0.08, 0.08, 0.08, 0.1, 0.86, 0.22, { ry: 0.4 })
    box(group, M.cream(), 0.08, 0.08, 0.08, 0.22, 0.86, 0.3, { ry: 1.1 })

    group.traverse((o) => { if (o.isMesh) o.castShadow = true })
    planarShadow(scene, t.x, t.z, 2.5, 2.5, 0.55, 0.025)

    // chairs + seat anchors
    const seats = []
    const count = isVip ? 2 : 4
    for (let i = 0; i < count; i++) {
      const angle = t.ry + (isVip ? 0.6 : Math.PI / 4) + (i / count) * Math.PI * 2
      const cx = t.x + Math.cos(angle) * (isVip ? 1.15 : 1.28)
      const cz = t.z + Math.sin(angle) * (isVip ? 1.15 : 1.28)
      buildChair(scene, cx, y, cz, angle + Math.PI, isVip)
      seats.push({
        x: cx,
        z: cz,
        y,
        angle: Math.atan2(t.x - cx, t.z - cz),
        table: { x: t.x, z: t.z, y },
        vip: isVip
      })
    }
    refs.tables.push({ ...t, y, vip: isVip, seats, group })
  }
}

function buildChair(scene, x, y, z, ry, vip) {
  const chair = new THREE.Group()
  chair.position.set(x, y, z)
  chair.rotation.y = ry
  scene.add(chair)
  box(chair, M.wood(), 0.56, 0.08, 0.54, 0, 0.47, 0)
  box(chair, M.woodLight(), 0.56, 0.5, 0.07, 0, 0.73, -0.25)
  for (const sx of [-1, 1]) {
    box(chair, M.woodDark(), 0.055, 0.47, 0.055, sx * 0.23, 0.23, 0.2)
    box(chair, M.woodDark(), 0.055, 0.47, 0.055, sx * 0.23, 0.23, -0.2)
    box(chair, M.woodDark(), 0.055, 0.5, 0.055, sx * 0.23, 0.73, -0.25)
  }
  box(chair, M.brass(), 0.4, 0.025, 0.025, 0, 0.95, -0.26)
  chair.traverse((o) => { if (o.isMesh) o.castShadow = true })
  return chair
}

function buildPergola(scene, refs) {
  const T = textures()
  const woodMat = new THREE.MeshStandardMaterial({ map: T.wood, roughness: 0.85, color: 0xa07a52 })
  const posts = [
    [-11.2, -2.4], [-11.2, 8.6], [-8.6, 8.6], [11.4, -2.2], [11.4, 8.8], [8.4, 8.8]
  ]
  for (const [x, z] of posts) {
    box(scene, woodMat, 0.28, 4.8, 0.28, x, 2.4, z)
    box(scene, M.stone(), 0.5, 0.3, 0.5, x, 0.15, z)
  }
  box(scene, woodMat, 23, 0.24, 0.3, 0, 4.85, -2.3)
  box(scene, woodMat, 23, 0.24, 0.3, 0, 4.85, 8.7)
  box(scene, woodMat, 0.3, 0.24, 11.2, -11.2, 4.85, 3.2)
  box(scene, woodMat, 0.3, 0.24, 11.2, 11.4, 4.85, 3.3)
  // sparse cross slats on the sides only (keeps the square visible)
  for (let i = 0; i < 6; i++) {
    box(scene, woodMat, 2.6, 0.12, 0.16, -10, 5.0, -1 + i * 1.9)
    box(scene, woodMat, 2.6, 0.12, 0.16, 10.1, 5.0, -1 + i * 1.95)
  }
  buildVines(scene, refs)
}

function buildVines(scene, refs) {
  const leafGeo = new THREE.IcosahedronGeometry(0.16, 0)
  const green = M.leaf()
  const dark = M.leafDark()
  const positions = []
  for (let i = 0; i < 90; i++) {
    const side = i % 2 ? 1 : -1
    const x = side * (10.1 + Math.random() * 1.6)
    const z = -2 + Math.random() * 11
    const y = 2.6 + Math.random() * 2.3
    positions.push([x, y, z])
  }
  for (let i = 0; i < 40; i++) {
    positions.push([-12.5 + Math.random() * 3, 3.2 + Math.random() * 1.9, 8.4 + Math.random() * 0.6])
  }
  const inst = new THREE.InstancedMesh(leafGeo, green, positions.length)
  const dummy = new THREE.Object3D()
  positions.forEach((p, i) => {
    dummy.position.set(p[0], p[1], p[2])
    dummy.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
    const s = 0.7 + Math.random() * 1.3
    dummy.scale.set(s, s * 0.7, s)
    dummy.updateMatrix()
    inst.setMatrixAt(i, dummy.matrix)
  })
  inst.castShadow = true
  scene.add(inst)
  refs.vines = inst

  // Wisteria-ish hanging bunches
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1
    const x = side * (10.2 + Math.random() * 1.2)
    const z = -1.5 + Math.random() * 10.5
    for (let j = 0; j < 5; j++) {
      sphere(scene, j % 2 ? material('bloom', { color: 0x8a6fb5, roughness: 0.9 }) : dark, 0.1, x + (Math.random() - 0.5) * 0.2, 4.2 - j * 0.18, z + (Math.random() - 0.5) * 0.2, { cast: false })
    }
  }
}

function buildLights(scene, refs) {
  const hemi = new THREE.HemisphereLight(0x5b4b86, 0x23160f, 0.85)
  scene.add(hemi)
  refs.hemi = hemi

  const key = new THREE.DirectionalLight(0xffc08a, 2.4)
  key.position.set(-11, 18, 9)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -20
  key.shadow.camera.right = 20
  key.shadow.camera.top = 20
  key.shadow.camera.bottom = -18
  key.shadow.camera.near = 1
  key.shadow.camera.far = 55
  key.shadow.bias = -0.0015
  key.shadow.normalBias = 0.04
  scene.add(key)
  refs.keyLight = key

  const rim = new THREE.DirectionalLight(0x6f7dff, 0.55)
  rim.position.set(10, 9, -14)
  scene.add(rim)
  refs.rimLight = rim

  const houseLight = new THREE.PointLight(0xffb060, 26, 14, 1.8)
  houseLight.position.set(0, 3.6, -9.0)
  scene.add(houseLight)
  refs.houseLight = houseLight

  const bulbLight = new THREE.PointLight(0xffc27a, 20, 13, 1.9)
  bulbLight.position.set(0, 4.2, 2.6)
  scene.add(bulbLight)
  refs.bulbLight = bulbLight

  const terraceLight = new THREE.PointLight(0xffcb8a, 14, 9, 2)
  terraceLight.position.set(-4, 3.4, -6.2)
  scene.add(terraceLight)
  refs.terraceLight = terraceLight

  // siren lights (zabıta)
  const red = new THREE.PointLight(0xff2b3d, 0, 18, 1.6)
  red.position.set(7, 5.2, 9)
  const blue = new THREE.PointLight(0x2b6bff, 0, 18, 1.6)
  blue.position.set(4, 5.6, 9)
  scene.add(red, blue)
  refs.sirenRed = red
  refs.sirenBlue = blue

  // muhtar golden light
  const gold = new THREE.PointLight(0xffcb5e, 0, 22, 1.6)
  gold.position.set(0, 6.5, 3)
  scene.add(gold)
  refs.goldLight = gold

  // chaos warning glow
  const chaosLight = new THREE.PointLight(0xff3a1e, 0, 20, 2)
  chaosLight.position.set(0, 7, 4)
  scene.add(chaosLight)
  refs.chaosLight = chaosLight
}

function buildBulbs(scene, refs) {
  refs.bulbs = []
  const bulbGeo = new THREE.SphereGeometry(0.085, 12, 8)
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffc27a, emissiveIntensity: 3.2, roughness: 0.2 })
  const capMat = M.iron()

  const addStrand = (a, b, sag, n, seed) => {
    const pts = catenary(a, b, sag, n * 2)
    const curve = new THREE.CatmullRomCurve3(pts)
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, n * 2, 0.012, 4, false), new THREE.MeshBasicMaterial({ color: 0x1b1410 }))
    scene.add(tube)
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      const p = curve.getPoint(t)
      const bulb = new THREE.Mesh(bulbGeo, bulbMat)
      bulb.position.copy(p)
      bulb.position.y -= 0.14
      scene.add(bulb)
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.09, 8), capMat)
      cap.position.copy(bulb.position)
      cap.position.y += 0.1
      scene.add(cap)
      refs.bulbs.push({ mesh: bulb, base: bulb.position.clone(), phase: seed + i * 0.7 })
    }
    return curve
  }

  // tea house awning strand
  addStrand(new THREE.Vector3(-6.4, 4.55, -6.4), new THREE.Vector3(6.4, 4.55, -6.4), 0.55, 9, 0.3)
  // square criss-cross strands
  addStrand(new THREE.Vector3(-12, 5.1, 7.2), new THREE.Vector3(12, 4.9, 3.6), 0.9, 13, 1.7)
  addStrand(new THREE.Vector3(-12.2, 5.3, 0.6), new THREE.Vector3(12.2, 5.15, -1.2), 0.8, 13, 2.9)
  addStrand(new THREE.Vector3(-3, 4.9, 11.8), new THREE.Vector3(11.5, 4.8, 9.4), 0.5, 7, 4.1)

  refs.bulbLight.position.set(0, 4.4, 3)
}

function buildFountain(scene, refs) {
  const group = new THREE.Group()
  group.position.set(-10.4, 0, 7.8)
  scene.add(group)
  const stone = new THREE.MeshStandardMaterial({ map: textures().wallStone, color: 0x9d9485, roughness: 0.92 })
  mesh(group, G.cylinderLow, stone, { x: 0, y: 0.32, sx: 2.15, sy: 0.64, sz: 2.15 })
  mesh(group, new THREE.CylinderGeometry(1.95, 1.95, 0.1, 8), M.stoneDark(), { x: 0, y: 0.63 })
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1.86, 28),
    new THREE.MeshStandardMaterial({ color: 0x235a6b, metalness: 0.5, roughness: 0.12, transparent: true, opacity: 0.9, emissive: 0x0c2a33, emissiveIntensity: 0.5 })
  )
  water.rotation.x = -Math.PI / 2
  water.position.y = 0.655
  group.add(water)
  refs.fountainWater = water

  mesh(group, G.cylinderLow, stone, { x: 0, y: 1.1, sx: 0.42, sy: 1.0, sz: 0.42 })
  mesh(group, new THREE.CylinderGeometry(0.95, 0.42, 0.3, 12), stone, { x: 0, y: 1.72 })
  mesh(group, G.cylinderLow, M.brass(), { x: 0, y: 1.92, sx: 0.18, sy: 0.15, sz: 0.18 })
  // water streams
  refs.fountainStreams = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const stream = mesh(group, G.cylinderLow, M.glass(), {
      x: Math.cos(a) * 1.25, y: 1.05, z: Math.sin(a) * 1.25,
      sx: 0.018, sy: 1.15, sz: 0.018, rx: Math.cos(a) * 0.32, rz: Math.sin(a) * 0.32, cast: false, receive: false
    })
    refs.fountainStreams.push(stream)
  }
  // coins
  for (let i = 0; i < 14; i++) {
    const coin = mesh(group, G.cylinderLow, M.brassLight(), {
      x: (Math.random() - 0.5) * 3, y: 0.67, z: (Math.random() - 0.5) * 3,
      sx: 0.05, sy: 0.012, sz: 0.05, cast: false
    })
  }
  planarShadow(scene, -10.4, 7.8, 5.4, 5.4, 0.5)

  // plants at basin
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3
    buildPot(scene, -10.4 + Math.cos(a) * 2.6, 0, 7.8 + Math.sin(a) * 2.6, 0.6 + Math.random() * 0.2)
  }
  refs.fountain = group
}

function buildPot(scene, x, y, z, scale = 0.7) {
  const pot = new THREE.Group()
  pot.position.set(x, y, z)
  pot.scale.setScalar(scale)
  scene.add(pot)
  cyl(pot, material('terracotta', { color: 0x8a4a2d, roughness: 0.95 }), 0.34, 0.44, 0.55, 0, 0.28, 0)
  cyl(pot, material('soil', { color: 0x2a1c12, roughness: 1 }), 0.4, 0.4, 0.06, 0, 0.56, 0)
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * 0.26
    const h = 0.25 + Math.random() * 0.4
    cylinderBetween(pot, M.leafDark(), new THREE.Vector3(Math.cos(a) * r, 0.56, Math.sin(a) * r), new THREE.Vector3(Math.cos(a) * r * 1.8, 0.56 + h, Math.sin(a) * r * 1.8), 0.025, 5)
    const flower = Math.random() < 0.45
    sphere(pot, flower ? material('flowerR', { color: 0xc2453d, roughness: 0.9 }) : M.leaf(), flower ? 0.07 : 0.1, Math.cos(a) * r * 1.8, 0.58 + h, Math.sin(a) * r * 1.8, { cast: false })
  }
  planarShadow(scene, x, z, 0.9 * scale * 2, 0.9 * scale * 2, 0.45)
}

function buildFacades(scene, refs) {
  const T = textures()
  const shopWindowMat = new THREE.MeshStandardMaterial({ map: T.shop, emissive: 0x6b3a16, emissiveMap: T.shop, emissiveIntensity: 0.45, roughness: 0.6 })

  // Barber on the left
  const barber = new THREE.Group()
  barber.position.set(-14.9, 0, 2.6)
  barber.rotation.y = Math.PI / 2
  scene.add(barber)
  const barberWall = new THREE.Mesh(new THREE.BoxGeometry(7.6, 5.4, 0.5), new THREE.MeshStandardMaterial({ map: T.wallStone, color: 0xa39178, roughness: 0.95 }))
  barberWall.position.set(0, 2.7, 0)
  barberWall.castShadow = true
  barber.add(barberWall)
  box(barber, M.woodDark(), 8.0, 0.5, 0.7, 0, 5.5, 0)
  const bWin = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.0), shopWindowMat)
  bWin.position.set(-1.8, 1.9, 0.27)
  barber.add(bWin)
  box(barber, M.woodDark(), 2.8, 0.12, 0.16, -1.8, 2.98, 0.34)
  box(barber, M.woodDark(), 2.8, 0.12, 0.16, -1.8, 0.84, 0.34)
  const bSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.72), new THREE.MeshStandardMaterial({ map: T.signBerber, roughness: 0.7, emissive: 0x221608, emissiveIntensity: 0.5 }))
  bSign.position.set(-1.8, 3.55, 0.28)
  barber.add(bSign)
  // barber pole
  const poleTex = T.barber
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.5, 16), new THREE.MeshStandardMaterial({ map: poleTex, roughness: 0.55, emissive: 0x331010, emissiveIntensity: 0.25 }))
  pole.position.set(2.6, 2.3, 0.36)
  barber.add(pole)
  refs.barberPole = pole
  sphere(barber, M.brass(), 0.18, 2.6, 3.12, 0.36)
  sphere(barber, M.brass(), 0.18, 2.6, 1.5, 0.36)
  // chair silhouette behind glass
  box(barber, M.black(), 0.8, 1.2, 0.1, -1.8, 1.3, 0.2, { cast: false })

  // Bakkal on the right
  const bakkal = new THREE.Group()
  bakkal.position.set(14.9, 0, -1.0)
  bakkal.rotation.y = -Math.PI / 2
  scene.add(bakkal)
  const bWall = new THREE.Mesh(new THREE.BoxGeometry(8, 5.6, 0.5), new THREE.MeshStandardMaterial({ map: T.wallStone, color: 0xb09a7a, roughness: 0.95 }))
  bWall.position.set(0, 2.8, 0)
  bWall.castShadow = true
  bakkal.add(bWall)
  box(bakkal, M.woodDark(), 8.4, 0.55, 0.7, 0, 5.7, 0)
  const kWin = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), shopWindowMat)
  kWin.position.set(0.4, 2.0, 0.28)
  bakkal.add(kWin)
  const kSign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.8), new THREE.MeshStandardMaterial({ map: T.signBakkal, roughness: 0.7, emissive: 0x1a2416, emissiveIntensity: 0.5 }))
  kSign.position.set(0.4, 3.65, 0.3)
  bakkal.add(kSign)
  // striped awning
  for (let i = 0; i < 7; i++) {
    box(bakkal, i % 2 ? M.cream() : material('awningRed', { color: 0xa63c34, roughness: 0.9 }), 0.5, 0.06, 1.5, -1.6 + i * 0.5, 3.2, 0.85, { rx: -0.22 })
  }
  // crates
  for (let i = 0; i < 3; i++) {
    box(bakkal, M.woodLight(), 0.6, 0.45, 0.5, 2.6, 0.23 + i * 0.46, 0.8)
    sphere(bakkal, material('apple', { color: 0xc23a2e, roughness: 0.8 }), 0.09, 2.5 + (i % 2) * 0.2, 0.5 + i * 0.46, 0.9, { cast: false })
  }

  // Distant apartment silhouettes
  const silhouette = material('silhouette', { color: 0x1b1220, roughness: 1 })
  const lit = new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0.55 })
  for (let i = 0; i < 7; i++) {
    const x = -24 + i * 8
    const h = 7 + Math.random() * 8
    const b = new THREE.Mesh(new THREE.BoxGeometry(5.5, h, 4), silhouette)
    b.position.set(x, h / 2 - 0.2, -24 - Math.random() * 6)
    scene.add(b)
    for (let j = 0; j < 4; j++) {
      if (Math.random() < 0.5) continue
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.75), lit)
      w.position.set(b.position.x - 1.6 + j * 1.1, 2 + Math.random() * (h - 3.5), b.position.z + 2.05)
      scene.add(w)
    }
  }

  // Mosque + minaret silhouette
  const mosque = new THREE.Group()
  mosque.position.set(-9, 0, -27)
  scene.add(mosque)
  box(mosque, silhouette, 9, 5, 7, 0, 2.5, 0)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), material('dome', { color: 0x2c2733, roughness: 0.8 }))
  dome.position.set(0, 5, 0)
  mosque.add(dome)
  mesh(mosque, G.cylinderLow, silhouette, { x: 0, y: 9.6, sx: 0.06, sy: 2.4, sz: 0.06 })
  const minaret = new THREE.Group()
  minaret.position.set(7.2, 0, -1.2)
  mosque.add(minaret)
  mesh(minaret, G.cylinderLow, silhouette, { x: 0, y: 6, sx: 0.5, sy: 12, sz: 0.5 })
  mesh(minaret, G.cylinderLow, material('minaretRing', { color: 0x3f3748 }), { x: 0, y: 9.4, sx: 0.78, sy: 0.22, sz: 0.78 })
  mesh(minaret, new THREE.ConeGeometry(0.55, 1.6, 10), silhouette, { x: 0, y: 12.7 })
  mesh(minaret, G.cylinderLow, material('minaretTip', { color: 0x9a8a62, metalness: 0.7, roughness: 0.4 }), { x: 0, y: 13.7, sx: 0.035, sy: 0.9, sz: 0.035 })

  // Arch at the street entrance
  const arch = new THREE.Group()
  arch.position.set(12.8, 0, 13.2)
  arch.rotation.y = -0.55
  scene.add(arch)
  const pillarMat = new THREE.MeshStandardMaterial({ map: T.wallStone, color: 0x9d8d76, roughness: 0.95 })
  for (const x of [-2.2, 2.2]) {
    box(arch, pillarMat, 0.55, 4.2, 0.55, x, 2.1, 0)
    box(arch, M.stoneDark(), 0.8, 0.25, 0.8, x, 4.3, 0)
    box(arch, M.brass(), 0.65, 0.06, 0.65, x, 4.48, 0)
  }
  box(arch, M.woodDark(), 5.2, 0.5, 0.6, 0, 4.9, 0)
  const archSign = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 1.02), new THREE.MeshStandardMaterial({ map: T.signSquare, roughness: 0.7, emissive: 0x2a1a0a, emissiveIntensity: 0.5 }))
  archSign.position.set(0, 5.6, 0)
  arch.add(archSign)
  for (let i = 0; i < 3; i++) {
    sphere(arch, M.emissive(0xffbb70, 1.8), 0.09, -1.5 + i * 1.5, 4.36, 0.35, { cast: false })
  }
  refs.arch = arch
  refs.entrance = new THREE.Vector3(13.4, 0, 13.4)
}

function buildTrees(scene, refs) {
  const spots = [
    [-14.2, -1.2, 1.1], [-14.6, 11.4, 0.9], [14.6, 7.4, 1.0], [15.2, -8.2, 0.85], [8.9, -5.2, 0.62]
  ]
  for (const [x, z, s] of spots) {
    const tree = new THREE.Group()
    tree.position.set(x, 0, z)
    tree.scale.setScalar(s)
    scene.add(tree)
    mesh(tree, G.cylinderLow, material('bark', { color: 0x4a3524, roughness: 1 }), { x: 0, y: 1.5, sx: 0.26, sy: 3.0, sz: 0.26 })
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * 1.1
      const y = 3.2 + Math.random() * 1.6
      const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15 + Math.random() * 0.5, 0), i % 2 ? M.leafDark() : M.leaf())
      foliage.position.set(Math.cos(a) * r, y, Math.sin(a) * r)
      foliage.scale.y = 0.85
      foliage.castShadow = true
      tree.add(foliage)
    }
    refs.trees = refs.trees ?? []
    refs.trees.push(tree)
    planarShadow(scene, x, z, 4 * s, 4 * s, 0.42)
  }
}

function buildCat(scene, refs) {
  const cat = new THREE.Group()
  cat.position.set(-7.9, 0.02, 8.7)
  cat.rotation.y = -0.7
  scene.add(cat)
  const fur = material('catFur', { color: 0xc47a3a, roughness: 1 })
  scaleSphere(cat, fur, 0.34, 0.25, 0.22, 0, 0.22, 0)
  sphere(cat, fur, 0.2, 0.32, 0.42, 0.03)
  for (const [x, z, rz] of [[0.26, -0.08, 0.3], [0.26, 0.13, -0.3]]) {
    mesh(cat, new THREE.ConeGeometry(0.08, 0.16, 4), fur, { x: 0.33, y: 0.56, z, rx: -0.1, rz })
  }
  sphere(cat, M.cream(), 0.075, 0.44, 0.35, 0.13, { cast: false })
  sphere(cat, M.cream(), 0.075, 0.44, 0.35, -0.07, { cast: false })
  sphere(cat, M.black(), 0.02, 0.5, 0.44, 0.1, { cast: false })
  sphere(cat, M.black(), 0.02, 0.5, 0.44, -0.04, { cast: false })
  const tail = new THREE.Group()
  tail.position.set(-0.32, 0.2, 0)
  cat.add(tail)
  for (let i = 0; i < 4; i++) {
    mesh(tail, G.cylinderLow, fur, { x: -0.1 * i, y: 0.03 * i, z: 0.02 * i, sx: 0.055, sy: 0.22, sz: 0.055, rz: Math.PI / 2 - 0.4, ry: i * 0.35 })
  }
  refs.cat = cat
  refs.catTail = tail
  planarShadow(scene, -7.9, 8.7, 1.2, 1.2, 0.4)
}

function buildLooseProps(scene, refs) {
  // Tea crates, stools, broom, ashtrays around the square
  for (const [x, z, ry] of [[-11.5, 10.2, 0.4], [10.4, 11.5, -0.8]]) {
    box(scene, M.woodLight(), 0.9, 0.5, 0.6, x, 0.25, z, { ry })
    box(scene, M.woodDark(), 0.9, 0.06, 0.06, x, 0.52, z, { ry })
  }
  // chalkboard menu at the entrance of the tea house
  const board = new THREE.Group()
  board.position.set(-5.4, 0.9, -4.6)
  board.rotation.y = 0.3
  scene.add(board)
  box(board, M.woodDark(), 1.2, 1.6, 0.12, 0, 0.8, 0, { rx: -0.1 })
  const chalk = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.35), new THREE.MeshStandardMaterial({ map: textures().menu, roughness: 1 }))
  chalk.position.set(0, 0.85, 0.08)
  chalk.rotation.x = -0.1
  board.add(chalk)

  // Wall lanterns on the arch and tea house
  for (const [x, y, z] of [[-6.2, 4.0, -5.9], [6.2, 4.0, -5.9]]) {
    mesh(scene, G.cylinderLow, M.iron(), { x, y: y + 0.25, z, sx: 0.02, sy: 0.5, sz: 0.02 })
    box(scene, M.iron(), 0.3, 0.36, 0.3, x, y, z)
    sphere(scene, M.emissive(0xffbd74, 2.4), 0.11, x, y - 0.02, z)
  }

  // Hanging dried peppers near the door
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 5), material('pepper', { color: 0x9e2f1f, roughness: 0.8 }))
    p.position.set(-3.6 + Math.random() * 0.3, 3.0 - i * 0.12, -12.03)
    p.rotation.x = Math.PI
    scene.add(p)
  }
}

export function buildWorld(scene, renderer = null) {
  const refs = {}
  buildSky(scene, refs)
  buildGround(scene, refs)
  buildTeaHouse(scene, refs)
  buildTables(scene, refs)
  buildPergola(scene, refs)
  buildLights(scene, refs)
  buildBulbs(scene, refs)
  buildFountain(scene, refs)
  buildFacades(scene, refs)
  buildTrees(scene, refs)
  buildCat(scene, refs)
  buildLooseProps(scene, refs)

  refs.animations = []
  refs.tablePositions = TABLE_POSITIONS
  refs.vipTables = VIP_TABLES

  // animate small things
  refs.update = (dt, time) => {
    if (refs.tvMaterial) refs.tvMaterial.emissiveIntensity = 1.05 + Math.sin(time * 7.3) * 0.12 + Math.random() * 0.08
    if (refs.clockMinute) {
      const d = new Date()
      refs.clockMinute.rotation.z = -((d.getMinutes() / 60) * Math.PI * 2)
      refs.clockHour.rotation.z = -(((d.getHours() % 12) / 12) * Math.PI * 2 + (d.getMinutes() / 60) * (Math.PI / 6))
    }
    if (refs.catTail) refs.catTail.rotation.y = Math.sin(time * 0.8) * 0.35
    if (refs.cat) refs.cat.scale.y = 1 + Math.sin(time * 1.6) * 0.012
    if (refs.bulbs) {
      for (const b of refs.bulbs) {
        b.mesh.position.y = b.base.y + Math.sin(time * 0.9 + b.phase) * 0.012
      }
    }
    if (refs.stoveFlame) {
      const s = refs.flameBoost ?? 1
      refs.stoveFlame.scale.set(0.85 + Math.sin(time * 9) * 0.1, s * (0.9 + Math.sin(time * 11.3) * 0.14), 0.85)
      refs.stoveFlameCore.scale.set(0.9, s * (0.85 + Math.cos(time * 13) * 0.1), 0.9)
      refs.stoveLight.intensity = 6 * s + Math.sin(time * 12) * 1.5
    }
    if (refs.fountainWater) {
      refs.fountainWater.position.y = 0.65 + Math.sin(time * 1.4) * 0.006
      refs.fountainWater.material.opacity = 0.82 + Math.sin(time * 2.2) * 0.04
    }
    if (refs.fountainStreams) {
      for (let i = 0; i < refs.fountainStreams.length; i++) {
        refs.fountainStreams[i].material.opacity = 0.22 + Math.sin(time * 5 + i) * 0.06
      }
    }
    if (refs.barberPole) refs.barberPole.rotation.y = time * 1.3
  }

  return refs
}
