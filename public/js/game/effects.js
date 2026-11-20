/**
 * Atmosphere & gift effects: semaver steam, dust motes, stove embers,
 * ballistic okey tiles / dice / tea glasses / toasts and the golden tea tray.
 */
import * as THREE from 'three'
import { G, M, mesh, textures, material } from './kit.js'

function particleMaterial(texture, color = 0xffffff) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uColor: { value: new THREE.Color(color) }
    },
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (300.0 / max(0.6, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(uColor * tex.rgb, tex.a * vAlpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
}

class ParticleSystem {
  constructor(scene, { count, texture, color, size, spawn, velocity, life, gravity = 0, wind = [0, 0, 0], opacity = 0.6 }) {
    this.count = count
    this.spawn = spawn
    this.velocity = velocity
    this.life = life
    this.gravity = gravity
    this.wind = wind
    this.opacity = opacity
    this.particles = []
    this.geometry = new THREE.BufferGeometry()
    this.positions = new Float32Array(count * 3)
    this.sizes = new Float32Array(count)
    this.alphas = new Float32Array(count)
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1))
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1))
    this.material = particleMaterial(texture, color)
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false
    scene.add(this.points)
    for (let i = 0; i < count; i++) this.particles.push(this.reset({}, true))
    this.refill()
  }

  reset(p, initial = false) {
    const s = this.spawn()
    p.x = s.x
    p.y = s.y
    p.z = s.z
    const v = this.velocity()
    p.vx = v.x
    p.vy = v.y
    p.vz = v.z
    p.age = initial ? Math.random() * this.life : 0
    p.life = this.life * (0.7 + Math.random() * 0.6)
    p.size = this.size * (0.6 + Math.random() * 0.9)
    return p
  }

  refill() {
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i]
      this.positions[i * 3] = p.x
      this.positions[i * 3 + 1] = p.y
      this.positions[i * 3 + 2] = p.z
      this.sizes[i] = p.size
      this.alphas[i] = 0
    }
  }

  burst(origin, count = 0) {
    const n = count || this.count
    for (let i = 0; i < Math.min(n, this.count); i++) {
      const p = this.particles[i]
      this.reset(p)
      p.x = origin.x + (Math.random() - 0.5) * 0.4
      p.y = origin.y + Math.random() * 0.2
      p.z = origin.z + (Math.random() - 0.5) * 0.4
      p.age = 0
    }
  }

  update(dt) {
    const pos = this.positions
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i]
      p.age += dt
      if (p.age >= p.life) this.reset(p)
      p.vy += this.gravity * dt
      p.x += (p.vx + this.wind[0]) * dt
      p.y += (p.vy + this.wind[1]) * dt
      p.z += (p.vz + this.wind[2]) * dt
      const k = p.age / p.life
      this.alphas[i] = Math.sin(Math.min(1, k) * Math.PI) * this.opacity
      pos[i * 3] = p.x
      pos[i * 3 + 1] = p.y
      pos[i * 3 + 2] = p.z
    }
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.aAlpha.needsUpdate = true
  }
}

export class Effects {
  constructor(scene, world) {
    this.scene = scene
    this.world = world
    this.time = 0
    this.animations = []
    this.projectiles = []
    this.geo = {
      tile: new THREE.BoxGeometry(0.16, 0.045, 0.1),
      dice: new THREE.BoxGeometry(0.11, 0.11, 0.11),
      glass: new THREE.CylinderGeometry(0.06, 0.045, 0.18, 9),
      tea: new THREE.CylinderGeometry(0.048, 0.038, 0.09, 8),
      toast: new THREE.BoxGeometry(0.34, 0.12, 0.3),
      saucer: new THREE.CylinderGeometry(0.13, 0.13, 0.016, 12)
    }
    const T = textures()

    this.steam = new ParticleSystem(scene, {
      count: 46,
      texture: T.smoke,
      color: 0xffe6c4,
      size: 0.55,
      opacity: 0.22,
      life: 3.2,
      spawn: () => ({
        x: world.steamOrigin.x + (Math.random() - 0.5) * 0.4,
        y: world.steamOrigin.y - 0.2 + Math.random() * 0.4,
        z: world.steamOrigin.z + (Math.random() - 0.5) * 0.4
      }),
      velocity: () => ({
        x: (Math.random() - 0.5) * 0.16,
        y: 0.28 + Math.random() * 0.36,
        z: (Math.random() - 0.5) * 0.16
      }),
      wind: [0.035, 0.02, 0.02]
    })

    this.motes = new ParticleSystem(scene, {
      count: 140,
      texture: T.smoke,
      color: 0xffcf8f,
      size: 0.13,
      opacity: 0.32,
      life: 9,
      spawn: () => ({
        x: -15 + Math.random() * 30,
        y: 0.4 + Math.random() * 6.5,
        z: -11 + Math.random() * 24
      }),
      velocity: () => ({
        x: (Math.random() - 0.5) * 0.05,
        y: Math.random() * 0.035,
        z: (Math.random() - 0.5) * 0.05
      }),
      wind: [0.012, 0.002, 0.008]
    })

    this.embers = new ParticleSystem(scene, {
      count: 40,
      texture: T.fire,
      color: 0xff8f3a,
      size: 0.2,
      opacity: 0.9,
      life: 1.1,
      gravity: 1.6,
      spawn: () => ({
        x: world.stovePos.x + (Math.random() - 0.5) * 0.5,
        y: world.stovePos.y + 0.15,
        z: world.stovePos.z + 0.35 + (Math.random() - 0.5) * 0.3
      }),
      velocity: () => ({
        x: (Math.random() - 0.5) * 0.5,
        y: 0.7 + Math.random() * 1.3,
        z: (Math.random() - 0.5) * 0.5
      })
    })
    this.embers.points.visible = false

    this.goldSparks = new ParticleSystem(scene, {
      count: 70,
      texture: T.fire,
      color: 0xffd166,
      size: 0.22,
      opacity: 0.95,
      life: 1.6,
      gravity: -0.6,
      spawn: () => ({ x: 0, y: 3, z: 0 }),
      velocity: () => ({
        x: (Math.random() - 0.5) * 5,
        y: 1.5 + Math.random() * 3.5,
        z: (Math.random() - 0.5) * 5
      })
    })
    this.goldSparks.points.visible = false
  }

  setSteamOrigin(v) {
    this.world.steamOrigin.copy(v)
  }

  setBoost(on) {
    this.embers.points.visible = on
  }

  sparkle(origin, count = 40) {
    this.goldSparks.points.visible = true
    this.goldSparks.burst(origin, count)
    this.animations.push({
      t: 0,
      duration: 2.2,
      update: () => {},
      done: () => {
        this.goldSparks.points.visible = false
      }
    })
  }

  /* ------------------------------------------------------- projectiles */

  launch(mesh, from, to, { duration = 0.8, gravity = 18, spin = 8, delay = 0 } = {}) {
    mesh.position.copy(from)
    mesh.castShadow = true
    this.scene.add(mesh)
    const g = gravity
    const vertical = (to.y - from.y + 0.5 * g * duration * duration) / duration
    const vx = (to.x - from.x) / duration
    const vz = (to.z - from.z) / duration
    const p = {
      mesh, vx, vy: vertical, vz, g,
      delay,
      life: duration + 0.9,
      age: -delay,
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * spin,
        (Math.random() - 0.5) * spin,
        (Math.random() - 0.5) * spin
      ),
      landed: false
    }
    this.projectiles.push(p)
    return p
  }

  throwOkey(table, from, count = 6) {
    const matTile = material('okeyProj', { color: 0xf4ecd8, roughness: 0.7 })
    const matDark = M.black()
    for (let i = 0; i < count; i++) {
      const tile = new THREE.Mesh(this.geo.tile, i % 3 ? matTile : matDark)
      const start = new THREE.Vector3(
        from.x + (Math.random() - 0.5) * 0.8,
        from.y + 0.8 + Math.random() * 0.5,
        from.z + (Math.random() - 0.5) * 0.8
      )
      const target = new THREE.Vector3(
        table.x + (Math.random() - 0.5) * 1.1,
        0.86 + Math.random() * 0.2,
        table.z + (Math.random() - 0.5) * 1.1
      )
      this.launch(tile, start, target, { duration: 0.5 + Math.random() * 0.45, delay: i * 0.035, spin: 16 })
    }
    for (let i = 0; i < 2; i++) {
      const dice = new THREE.Mesh(this.geo.dice, M.cream())
      this.launch(dice, new THREE.Vector3(from.x, from.y + 1.1, from.z), new THREE.Vector3(table.x, 0.85, table.z), {
        duration: 0.7, delay: 0.08 * i, spin: 22
      })
    }
  }

  throwTea(table, from, withToast = false) {
    const glass = new THREE.Group()
    mesh(glass, this.geo.saucer, M.cream(), { y: -0.1 })
    mesh(glass, this.geo.glass, M.glass(), { y: 0.02 })
    mesh(glass, this.geo.tea, M.tea(), { y: -0.01 })
    const start = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0, (Math.random() - 0.5) * 1.4))
    const target = new THREE.Vector3(table.x + (Math.random() - 0.5) * 0.7, 0.95, table.z + (Math.random() - 0.5) * 0.7)
    this.launch(glass, start, target, { duration: 0.7, spin: 4 })
    if (withToast) {
      const toast = new THREE.Mesh(this.geo.toast, material('toastProj', { color: 0xc9893b, roughness: 0.85 }))
      const crust = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.13, 0.05), material('crust', { color: 0x8f5a26, roughness: 0.9 }))
      toast.add(crust)
      this.launch(toast, start.clone().add(new THREE.Vector3(0.2, 0.4, 0)), target.clone().add(new THREE.Vector3(0.3, 0, 0.2)), { duration: 0.85, spin: 7 })
    }
  }

  goldTrayRain(tables, center = new THREE.Vector3(0, 4.4, 3)) {
    const tray = new THREE.Group()
    mesh(tray, G.cylinderLow, M.brassLight(), { sx: 1.5, sy: 0.05, sz: 1.5 })
    mesh(tray, G.torus, M.brass(), { sx: 1.52, sy: 1.52, sz: 1.52, rx: Math.PI / 2 })
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      mesh(tray, new THREE.CylinderGeometry(0.06, 0.045, 0.18, 8), M.glass(), { x: Math.cos(a) * 1.1, y: 0.14, z: Math.sin(a) * 1.1 })
      mesh(tray, new THREE.CylinderGeometry(0.05, 0.04, 0.09, 8), M.tea(), { x: Math.cos(a) * 1.1, y: 0.12, z: Math.sin(a) * 1.1 })
    }
    for (let i = 0; i < 3; i++) {
      mesh(tray, this.geo.toast, material('toastProj', { color: 0xc9893b, roughness: 0.85 }), { x: -0.5 + i * 0.5, y: 0.12, z: 0.1 })
    }
    tray.position.set(center.x, center.y + 5, center.z)
    tray.rotation.y = 0.3
    this.scene.add(tray)
    this.animations.push({
      t: 0,
      duration: 1.5,
      update: (k) => {
        tray.position.y = center.y + 5 - k * 4.6
        tray.rotation.y = 0.3 + k * 4
        tray.rotation.z = Math.sin(k * Math.PI) * 0.16
      },
      done: () => {
        this.scene.remove(tray)
        tables.forEach((table, i) => {
          const from = new THREE.Vector3(
            center.x + (Math.random() - 0.5) * 2,
            4.4 + Math.random() * 0.5,
            center.z + (Math.random() - 0.5) * 2
          )
          setTimeout(() => {
            this.throwTea(table, from, i % 2 === 0)
            this.throwTea(table, from, i % 2 === 1)
          }, i * 55)
        })
      }
    })
    this.sparkle(new THREE.Vector3(center.x, 4.5, center.z), 60)
  }

  update(dt) {
    this.time += dt
    this.steam.update(dt)
    this.motes.update(dt)
    if (this.embers.points.visible) this.embers.update(dt)
    if (this.goldSparks.points.visible) this.goldSparks.update(dt)

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]
      p.age += dt
      if (p.age < 0) {
        p.mesh.visible = false
        continue
      }
      p.mesh.visible = true
      p.mesh.position.x += p.vx * dt
      p.mesh.position.z += p.vz * dt
      p.vy -= p.g * dt
      p.mesh.position.y += p.vy * dt
      p.mesh.rotation.x += p.spin.x * dt
      p.mesh.rotation.y += p.spin.y * dt
      p.mesh.rotation.z += p.spin.z * dt
      if (p.mesh.position.y < 0.06) {
        p.mesh.position.y = 0.06
        p.vy *= -0.25
        p.vx *= 0.5
        p.vz *= 0.5
        p.spin.multiplyScalar(0.4)
      }
      if (p.age > p.life) {
        this.scene.remove(p.mesh)
        this.projectiles.splice(i, 1)
      }
    }

    for (let i = this.animations.length - 1; i >= 0; i--) {
      const a = this.animations[i]
      a.t += dt
      const k = Math.min(1, a.t / a.duration)
      a.update?.(k)
      if (k >= 1) {
        a.done?.()
        this.animations.splice(i, 1)
      }
    }
  }
}
