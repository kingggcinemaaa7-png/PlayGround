// ============================================================================
// Kamera sistemi — 360° serbest bakış + sinematik modlar
//   · Serbest mod: fare ile tam döndürme (yatay 360°, dikey ±90° — gökyüzü dahil)
//   · Yörünge modu: sahne etrafında otomatik tur
//   · Sinematik: sabit kadrajlar (sahne, havadan, DJ kabini)
// Tüm geçişler yumuşak (critically damped).
// ============================================================================
import * as THREE from 'three';

const SPH = new THREE.Spherical();

export class TourCamera {
  constructor(camera, domElement) {
    this.cam = camera;
    this.dom = domElement;
    this.mode = 'orbit'; // orbit | free | cine
    this.cineIndex = 0;

    // yörünge (kameranın etrafında döndüğü merkez + yarıçap)
    this.target = new THREE.Vector3(0, 15, -8);
    this.yaw = 0.35;
    this.pitch = 0.22;      // + = kamera hedefin üstünde, - = altında (gökyüzü görünümü)
    this.dist = 62;
    this.minDist = 6;
    this.maxDist = 220;

    // serbest bakış (kamera konumu + bakış yönü)
    this.pos = new THREE.Vector3(0, 3.2, 26);
    this.look = { yaw: Math.PI, pitch: -0.05 };
    this.vel = new THREE.Vector3();

    this.keys = new Set();
    this.dragging = false;
    this.lx = 0; this.ly = 0;
    this._spd = 1;
    this._want = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this.bind();
  }

  bind() {
    const d = this.dom;
    d.addEventListener('pointerdown', (e) => { this.dragging = true; this.lx = e.clientX; this.ly = e.clientY; d.setPointerCapture?.(e.pointerId); });
    const up = () => { this.dragging = false; };
    d.addEventListener('pointerup', up);
    d.addEventListener('pointercancel', up);
    d.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = (e.clientX - this.lx) || 0;
      const dy = (e.clientY - this.ly) || 0;
      this.lx = e.clientX; this.ly = e.clientY;
      const k = (e.shiftKey ? 0.35 : 1);
      if (this.mode === 'free') {
        // serbest bakış: tam 360° yatay, dikey ±88°
        this.look.yaw -= dx * 0.0032 * k;
        this.look.pitch = THREE.MathUtils.clamp(this.look.pitch - dy * 0.0032 * k, -1.535, 1.535);
      } else {
        // yörünge: tam 360° yatay, dikey ±85° (yukarı bakan kamera da mümkün)
        this.yaw -= dx * 0.0042 * k;
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.0034 * k, -1.44, 1.44);
      }
      this.autoRotate = false;
    });
    d.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.mode === 'free') {
        this._spd = THREE.MathUtils.clamp(this._spd * (1 + e.deltaY * 0.0012), 0.15, 8);
      } else {
        this.dist = THREE.MathUtils.clamp(this.dist * (1 + e.deltaY * 0.0014), this.minDist, this.maxDist);
      }
    }, { passive: false });
    d.addEventListener('dblclick', () => this.setMode('free'));
    addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }

  setMode(m) {
    this.mode = m;
    if (m === 'free') {
      // mevcut merceğin yönünü koru: konumu ve bakış açısını senkronize et
      this._want.copy(this.cam.position);
      this.look.pitch = Math.asin(THREE.MathUtils.clamp(this.cam.getWorldDirection(this._tmp).y, -1, 1));
      this.look.yaw = Math.atan2(this.cam.getWorldDirection(this._tmp).x, this.cam.getWorldDirection(this._tmp).z);
      this.pos.copy(this.cam.position);
    }
  }
  cycle() {
    const order = ['orbit', 'cine', 'free'];
    const next = order[(order.indexOf(this.mode) + 1) % order.length];
    this.setMode(next);
    return next;
  }
  /** Gökyüzüne bak ve balonları göster */
  lookToSky(t) {
    this.setMode('free');
    this.look.pitch = 0.85 + Math.sin(t * 0.4) * 0.12;
    this.look.yaw = this.look.yaw + 0.0;
    if (this.pos.y < 6) this.pos.y = 6;
  }
  /** Aerial: vadinin tamamı */
  toAerial() {
    this.setMode('orbit');
    this.target.set(0, 8, -4);
    this.pitch = 0.72;
    this.dist = 150;
  }
  /** Sahne / DJ kabini */
  toDJ() {
    this.setMode('orbit');
    this.target.set(0, 3.2, 0.6);
    this.pitch = 0.06;
    this.dist = 13;
  }
  toStage() {
    this.setMode('orbit');
    this.target.set(0, 12, -6.5);
    this.pitch = 0.2;
    this.dist = 62;
  }

  update(dt, t) {
    const keys = this.keys;
    const spd = (this.mode === 'free' ? 26 : 22) * this._spd * dt;
    if (this.mode === 'free') {
      // serbest uçuş
      const dir = new THREE.Vector3(Math.sin(this.look.yaw), 0, Math.cos(this.look.yaw));
      const right = new THREE.Vector3(dir.z, 0, -dir.x);
      const forward2 = new THREE.Vector3(Math.sin(this.look.yaw), Math.sin(this.look.pitch), Math.cos(this.look.yaw)).normalize();
      if (keys.has('w')) this.vel.addScaledVector(forward2, spd * 1.2);
      if (keys.has('s')) this.vel.addScaledVector(forward2, -spd);
      if (keys.has('a')) this.vel.addScaledVector(right, -spd);
      if (keys.has('d')) this.vel.addScaledVector(right, spd);
      if (keys.has('e')) this.vel.y += spd;
      if (keys.has('q')) this.vel.y -= spd;
      this.pos.addScaledVector(this.vel, dt * 6);
      this.vel.multiplyScalar(Math.pow(0.02, dt));
      // zemin/üst sınırları
      this.pos.y = THREE.MathUtils.clamp(this.pos.y, 1.2, 260);
      const r = Math.hypot(this.pos.x, this.pos.z);
      if (r > 300) { this.pos.x *= 300 / r; this.pos.z *= 300 / r; }
      // yumuşak uygula
      this.cam.position.lerp(this.pos, 1 - Math.pow(0.0001, dt));
      const pitch = this.look.pitch;
      this._lookAt.set(
        this.pos.x + Math.sin(this.look.yaw) * Math.cos(pitch),
        this.pos.y + Math.sin(pitch),
        this.pos.z + Math.cos(this.look.yaw) * Math.cos(pitch)
      );
      this.cam.lookAt(this._lookAt);
      return;
    }

    if (this.mode === 'orbit') {
      if (this.autoRotate !== false) {
        this.yaw += dt * 0.045;
      }
      SPH.set(0, 0, 0);
      SPH.radius = this.dist;
      SPH.phi = Math.PI / 2 - this.pitch;     // phi: 0=üst, PI=alt
      SPH.theta = this.yaw;
      const p = new THREE.Vector3().setFromSpherical(SPH).add(this.target);
      p.y = Math.max(1.1, p.y);
      this.cam.position.lerp(p, 1 - Math.pow(0.0015, dt));
      this._lookAt.copy(this.target);
      this.cam.lookAt(this._lookAt);
      return;
    }

    // cine: sabit kadrajlar arasında yavaş geçiş
    if (this.mode === 'cine') {
      this.cineIndex = Math.floor(t / 16) % 4;
      this.toCine(this.cineIndex, t);
    }
  }

  toCine(i, t) {
    // sinematik yollar
    if (i === 0) {
      this.cam.position.set(Math.sin(t * 0.12) * 44, 17 + Math.sin(t * 0.09) * 5, 30 + Math.cos(t * 0.12) * 16);
      this._lookAt.set(0, 13, -6);
    } else if (i === 1) {
      this.cam.position.set(-24 + Math.sin(t * 0.2) * 8, 5.5, -18 + Math.cos(t * 0.2) * 8);
      this._lookAt.set(0, 6, -4);
    } else if (i === 2) {
      this.cam.position.set(Math.sin(t * 0.16) * 26, 46 + Math.cos(t * 0.11) * 6, 20 + Math.sin(t * 0.16) * 10);
      this._lookAt.set(0, 6, -2);
    } else {
      this.cam.position.set(7.5, 3.1, 8.5);
      this._lookAt.set(0, 3.2, 1.2);
    }
    this.cam.lookAt(this._lookAt);
  }
}
