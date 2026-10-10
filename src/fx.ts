import * as THREE from 'three';

// Parçacık + şok dalgası havuzu (GC dostu, canlı yayın performansı için)
const MAX = 700;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class FX {
  readonly points: THREE.Points;
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private cursor = 0;
  private rings: { m: THREE.Mesh; t: number; dur: number; r0: number; r1: number }[] = [];
  private c = new THREE.Color();
  private v = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -999;
    const p = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', p);
    this.geo.setAttribute('color', c);
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      size: 0.15, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.55, 1, 56),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
      this.rings.push({ m, t: 0, dur: 1, r0: 1, r1: 6 });
    }
  }

  private one(px: number, py: number, pz: number, vx: number, vy: number, vz: number, r: number, g: number, b: number, life: number, gr: number) {
    const i = this.cursor = (this.cursor + 1) % MAX;
    const i3 = i * 3;
    this.pos[i3] = px; this.pos[i3 + 1] = py; this.pos[i3 + 2] = pz;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.life[i] = life; this.maxLife[i] = life; this.grav[i] = gr;
  }

  spawn(origin: THREE.Object3D, vel: THREE.Vector3, color: THREE.Color, life: number, grav = -5) {
    this.one(origin.position.x, origin.position.y, origin.position.z,
      vel.x, vel.y, vel.z, color.r, color.g, color.b, life, grav);
  }

  fire(origin: THREE.Object3D, dir: THREE.Vector3, n: number, power = 1) {
    for (let i = 0; i < n; i++) {
      this.v.set(dir.x + (Math.random() - 0.5) * 0.5, dir.y + (Math.random() - 0.5) * 0.5, dir.z + (Math.random() - 0.5) * 0.5)
        .normalize().multiplyScalar(rand(1.5, 4) * power);
      this.c.setHSL(rand(0.02, 0.12), 1, rand(0.45, 0.62));
      this.spawn(origin, this.v, this.c, rand(0.35, 0.8), 3.5);
    }
  }
  sparkle(origin: THREE.Object3D, n: number, hue = 0.5) {
    for (let i = 0; i < n; i++) {
      this.v.set(rand(-1, 1), rand(0.2, 1.6), rand(-1, 1)).multiplyScalar(1.4);
      this.c.setHSL((hue + rand(-0.08, 0.08) + 1) % 1, 1, 0.68);
      this.spawn(origin, this.v, this.c, rand(0.4, 0.9), -3);
    }
  }
  smoke(origin: THREE.Object3D, n: number) {
    for (let i = 0; i < n; i++) {
      this.v.set(rand(-0.8, 0.8), rand(0.6, 2), rand(-0.8, 0.8)).multiplyScalar(1.2);
      this.c.setHSL(0.58, 0.05, rand(0.25, 0.4));
      this.spawn(origin, this.v, this.c, rand(0.8, 1.6), -0.6);
    }
  }
  dust(origin: THREE.Object3D, n: number, hue = 0.75) {
    for (let i = 0; i < n; i++) {
      this.v.set(rand(-2.5, 2.5), rand(0.4, 1.6), rand(-2.5, 2.5));
      this.c.setHSL((hue + rand(-0.1, 0.1) + 1) % 1, 1, 0.6);
      this.spawn(origin, this.v, this.c, rand(0.3, 0.7), -4.5);
    }
  }

  ring(pos: THREE.Vector3, color: number, r1: number, dur = 0.9, r0 = 0.4) {
    const r = this.rings.find(x => !x.m.visible) ?? this.rings[0];
    r.m.position.copy(pos); r.m.visible = true;
    r.t = 0; r.dur = dur; r.r0 = r0; r.r1 = r1;
    (r.m.material as THREE.MeshBasicMaterial).color.setHex(color);
    r.m.scale.setScalar(r0);
  }

  update(dt: number) {
    for (let i = 0; i < MAX; i++) {
      const i3 = i * 3;
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[i3 + 1] += this.grav[i] * dt;
      this.vel[i3] *= 1 - 1.2 * dt; this.vel[i3 + 2] *= 1 - 1.2 * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.col[i3] *= k; this.col[i3 + 1] *= k; this.col[i3 + 2] *= k;
      if (this.life[i] <= 0) { this.pos[i3 + 1] = -999; this.col[i3] = this.col[i3 + 1] = this.col[i3 + 2] = 0; }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) { r.m.visible = false; continue; }
      r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * k);
      (r.m.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    }
  }
}
