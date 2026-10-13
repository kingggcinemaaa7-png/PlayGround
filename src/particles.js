// Parçacık sistemleri: yıldız yağmuru, konfeti, kıvılcım, alan ışık patlaması
// Havuzlanmış puan/eğri kümesi sabitleri; GPU buffer'ları her karede güncellenir.
import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene, max = 3000) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.color = new Float32Array(max * 3);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.spin = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(this.color, 3));

    // yumuşak dairesel parçacık shader
    const mat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float size; attribute vec3 color; varying vec3 vColor;
        void main(){
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * (320.0 / max(0.001, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main(){
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = geo;
  }

  spawn(x, y, z, vx, vy, vz, life, size, col, gravity = -9.8, drag = 0.99) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size;
    this.color[i * 3] = col.r; this.color[i * 3 + 1] = col.g; this.color[i * 3 + 2] = col.b;
    this.gravity[i] = gravity; this.drag[i] = drag; this.spin[i] = 0;
  }

  burst(kind, origin, opts = {}) {
    const n = opts.n ?? 220;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = Math.random() * Math.PI - Math.PI / 2;
      const sp = opts.speed ?? 9;
      const vx = Math.cos(a) * Math.cos(el) * sp * (0.3 + Math.random() * 0.7);
      const vy = Math.sin(el) * sp * (0.3 + Math.random() * 0.7) + (opts.up ?? 2);
      const vz = Math.sin(a) * Math.cos(el) * sp * (0.3 + Math.random() * 0.7);
      let life = 1 + Math.random() * 1.4;
      let grav = -9.8;
      let size = 0.5 + Math.random() * 1.1;
      let col;
      if (kind === 'confetti') {
        const palette = ['#ffd700', '#ff4d6d', '#7b68ee', '#4a90d9', '#ffffff', '#f5a623'];
        col = new THREE.Color(palette[Math.floor(Math.random() * palette.length)]);
        grav = -12; size = 0.5 + Math.random() * 0.6;
      } else if (kind === 'stars') {
        col = new THREE.Color('#fff2b8');
        grav = -3; size = 0.7 + Math.random() * 1.6; life = 1.6 + Math.random() * 1.5;
      } else if (kind === 'fire') {
        col = new THREE.Color('#ff8c32'); grav = -2.2; size = 0.9 + Math.random() * 1.8;
      } else if (kind === 'rave') {
        col = new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
        grav = 0; size = 0.8 + Math.random() * 1.2;
      } else {
        col = new THREE.Color('#ffffff');
      }
      this.spawn(
        origin.x + (Math.random() - 0.5) * (opts.spread ?? 2),
        origin.y + (Math.random() - 0.5) * (opts.spread ?? 2),
        origin.z + (Math.random() - 0.5) * (opts.spread ?? 2),
        vx, vy, vz, life, size, col, grav, 0.96
      );
    }
  }

  update(dt) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-pop
        const j = --this.count;
        if (i !== j) {
          for (let k = 0; k < 3; k++) {
            this.pos[i * 3 + k] = this.pos[j * 3 + k];
            this.vel[i * 3 + k] = this.vel[j * 3 + k];
            this.color[i * 3 + k] = this.color[j * 3 + k];
          }
          this.life[i] = this.life[j];
          this.maxLife[i] = this.maxLife[j];
          this.size[i] = this.size[j];
          this.gravity[i] = this.gravity[j];
          this.drag[i] = this.drag[j];
        }
        continue;
      }
      const d = Math.pow(this.drag[i], dt * 60);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.gravity[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      // ömrü azaldıkça soluklaş
      const fade = Math.min(1, this.life[i] / Math.max(0.2, this.maxLife[i] * 0.5));
      this.size[i * 1] = this.size[i] * 1.0;
      this.color[i * 3 + 0] *= 1 + (0.0);
      i++;
    }
    this.geo.setDrawRange(0, this.count);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
