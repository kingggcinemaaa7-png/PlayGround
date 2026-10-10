import * as THREE from 'three';
import { build, animateRig, type Rig, type CharKind } from './characters';
import { FX } from './fx';

// ============================================================
// NEON PULSE v7 — Pro TikTok Konser (Desktop 3D)
// Tarz: Fütüristik neon kulübü + festival sahnesi
// Format: Dikey 9:16 + Yatay (dual) | Karakter: Robot DJ + 3D dansçılar
// 6 sistem: Sahne / Işık / Performans / Ses-BPM / Kamera / Canlı Yayın
// ============================================================

type Section = 'verse' | 'build' | 'drop' | 'final';
type Shot = 'wide' | 'dj' | 'dance' | 'top' | 'gift' | 'hero' | 'dragon';

const $ = (id: string) => document.getElementById(id)!;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const USERS = ['elif.edits', 'emre_can', 'zeynep_live', 'burak.exe', 'gizemmm', 'kaan61', 'selinay', 'mertx', 'ayse_gul', 'denizzz'];

// ---------- Renderer / Scene ----------
const canvas = $('stage') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060d);
scene.fog = new THREE.FogExp2(0x070818, 0.028);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 4.2, 16);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ============================================================
// 1) SES + BPM MOTORU (gerçek sinyalden enerji analizi)
// ============================================================
class AudioEngine {
  ctx: AudioContext | null = null; analyser: AnalyserNode | null = null;
  data: Uint8Array = new Uint8Array(128);
  bpm = 126; beatTime = 0; beatCount = 0; beatPulse = 0; energy = 0.5;
  private nextKick = 0; private step = 0; started = false;

  start() {
    if (this.started) return;
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.data = new Uint8Array(this.analyser.frequencyBinCount);
    const master = this.ctx.createGain(); master.gain.value = 0.5;
    master.connect(this.analyser); this.analyser.connect(this.ctx.destination);
    this.nextKick = this.ctx.currentTime + 0.1;
    this.started = true;
    const tick = () => {
      if (!this.ctx || !this.analyser) return;
      const spb = 60 / this.bpm / 2; // 8'lik adımlar
      while (this.nextKick < this.ctx.currentTime + 0.25) {
        this.schedule(this.step, this.nextKick, master);
        this.nextKick += spb; this.step = (this.step + 1) % 16;
      }
      this.analyser.getByteFrequencyData(this.data as Uint8Array);
      let sum = 0; for (let i = 2; i < 24; i++) sum += this.data[i];
      this.energy += ((sum / 22 / 255) - this.energy) * 0.2;
      setTimeout(tick, 60);
    };
    tick();
  }
  private schedule(step: number, t: number, out: AudioNode) {
    const ctx = this.ctx!;
    const kick = (f: number, g: number, d: number) => {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(40, t + d);
      gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(gn); gn.connect(out); o.start(t); o.stop(t + d + 0.02);
    };
    if (step % 4 === 0) kick(150, 0.9, 0.24);            // kick
    if (step % 4 === 2) kick(8000, 0.06, 0.05);          // hat (noise yerine tiz blip)
    if (step === 4 || step === 12) kick(220, 0.25, 0.18); // snare-ish
    if (step % 2 === 0) {                                 // bas
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = [55, 55, 65.4, 49][(step / 4) | 0];
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
      o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 0.25);
    }
  }
  update(dt: number) {
    const spb = 60 / this.bpm;
    this.beatTime += dt;
    if (this.beatTime >= spb) { this.beatTime -= spb; this.beatCount++; this.beatPulse = 1; }
    this.beatPulse = Math.max(0, this.beatPulse - dt * 3);
  }
  get beatPhase() { return this.beatTime / (60 / this.bpm); }
}
const audio = new AudioEngine();

// ============================================================
// 2) LED DUVARLARI (gerçek görsel içerik: EQ + başlık + hediye)
// ============================================================
function makeLED(w: number, h: number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { c, g, tex };
}
const mainLED = makeLED(1024, 512), sideL = makeLED(256, 512), sideR = makeLED(256, 512);
let ledHeadline = 'NEON PULSE', ledSub = 'CANLI • TIKTOK KONSERİ', ledGiftUser = '';

function drawLED(t: number, section: Section) {
  const { g, c } = mainLED;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  const pal: Record<Section, [string, string]> = {
    verse: ['#0b1030', '#1b0f3a'], build: ['#2a0a2e', '#0b1030'],
    drop: ['#3a0a4a', '#001b3a'], final: ['#4a0a1a', '#2a0a4a'],
  };
  const [a, b] = pal[section];
  grad.addColorStop(0, a); grad.addColorStop(1, b);
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  // EQ barlar (enerji + beat ile)
  const n = 48, bw = c.width / n;
  for (let i = 0; i < n; i++) {
    const v = (0.25 + audio.energy * 0.75) * (0.5 + 0.5 * Math.sin(t * 4 + i * 0.55)) + audio.beatPulse * 0.35;
    const h = Math.min(1, v) * 300;
    g.fillStyle = `hsl(${(i * 7 + t * 60) % 360} 100% 60%)`;
    g.fillRect(i * bw + 2, 400 - h, bw - 4, h);
  }
  g.textAlign = 'center';
  g.fillStyle = '#fff'; g.font = '900 84px Inter,sans-serif';
  g.shadowColor = '#f0f'; g.shadowBlur = 40;
  g.fillText(ledHeadline, 512, 150);
  g.shadowBlur = 0; g.font = '600 34px Inter,sans-serif'; g.fillStyle = '#0ff';
  g.fillText(ledSub, 512, 205);
  if (ledGiftUser) {
    g.fillStyle = '#ffe45e'; g.font = '900 60px Inter,sans-serif';
    g.shadowColor = '#f80'; g.shadowBlur = 30;
    g.fillText('★ ' + ledGiftUser + ' ★', 512, 300);
    g.shadowBlur = 0;
  }
  mainLED.tex.needsUpdate = true;
  for (const s of [sideL, sideR]) {
    s.g.fillStyle = '#080a1c'; s.g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 24; i++) {
      const h = (0.3 + audio.energy * 0.7) * (0.5 + 0.5 * Math.sin(t * 5 + i)) * 380 + audio.beatPulse * 60;
      s.g.fillStyle = `hsl(${(i * 14 + t * 90) % 360} 100% 55%)`;
      s.g.fillRect(20, 480 - i * 20, Math.min(216, h * 0.5), 10);
    }
    s.tex.needsUpdate = true;
  }
}

// ============================================================
// 3) SAHNE MİMARİSİ — festival katmanları
// ============================================================
const stage = new THREE.Group(); scene.add(stage);
{
  // Zemin: parlak yansıtıcı dans pisti
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 40),
    new THREE.MeshStandardMaterial({ color: 0x0a0c1e, metalness: 0.9, roughness: 0.25 })
  );
  floor.rotation.x = -Math.PI / 2; stage.add(floor);

  // LED grid çizgileri (dans pisti)
  const grid = new THREE.GridHelper(40, 20, 0x00ffff, 0xff00ff);
  grid.position.y = 0.02; (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35; stage.add(grid);

  // Ana LED + yan ekranlar
  const main = new THREE.Mesh(new THREE.PlaneGeometry(16, 8),
    new THREE.MeshBasicMaterial({ map: mainLED.tex }));
  main.position.set(0, 7, -10); stage.add(main);
  const mkSide = (x: number, led: typeof sideL) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 8), new THREE.MeshBasicMaterial({ map: led.tex }));
    m.position.set(x, 7, -9); m.rotation.y = -x * 0.04; stage.add(m);
  };
  mkSide(-11, sideL); mkSide(11, sideR);

  // Truss kuleleri + üst bar
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x222633, metalness: 0.8, roughness: 0.4 });
  for (const x of [-13, -8, 8, 13]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.6, 14, 0.6), trussMat);
    t.position.set(x, 7, -8); stage.add(t);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(28, 0.6, 0.6), trussMat);
  bar.position.set(0, 13.5, -8); stage.add(bar);

  // DJ kabini (ortada, yükseltilmiş)
  const booth = new THREE.Mesh(new THREE.BoxGeometry(5, 1.6, 2.4),
    new THREE.MeshStandardMaterial({ color: 0x11142a, metalness: 0.7, roughness: 0.3, emissive: 0x220044, emissiveIntensity: 0.6 }));
  booth.position.set(0, 1.6, -4); stage.add(booth);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.2, 2.8),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00ffff, emissiveIntensity: 1.2 }));
  deck.position.set(0, 2.5, -4); stage.add(deck);

  // Dans podyumları
  const podMat = new THREE.MeshStandardMaterial({ color: 0x141838, metalness: 0.6, roughness: 0.35, emissive: 0x110033, emissiveIntensity: 0.5 });
  for (const [x, z] of [[-5, 0], [5, 0], [-2.5, 2], [2.5, 2], [0, 0]] as const) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.5, 24), podMat);
    p.position.set(x, 0.25, z); stage.add(p);
  }

  // Hediye sahnesi (sağda özel platform)
  const giftStage = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.3, 0.7, 32),
    new THREE.MeshStandardMaterial({ color: 0x2a1a00, emissive: 0xffaa00, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.3 }));
  giftStage.position.set(9, 0.35, 2); giftStage.name = 'giftStage'; stage.add(giftStage);

  // Seyirci silüetleri (instanced, derinlik hissi)
  const crowdGeo = new THREE.CapsuleGeometry(0.28, 0.9, 3, 8);
  const crowdMat = new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.9 });
  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, 220);
  const d = new THREE.Object3D(); let k = 0;
  for (let row = 0; row < 8; row++) for (let i = 0; i < 28 && k < 220; i++, k++) {
    d.position.set(-16 + i * 1.2 + rand(-0.3, 0.3), 0.8, 7 + row * 1.4 + rand(-0.3, 0.3));
    d.updateMatrix(); crowd.setMatrixAt(k, d.matrix);
  }
  stage.add(crowd);
  // Seyirci ışık çubukları
  const stickGeo = new THREE.BoxGeometry(0.06, 0.7, 0.06);
  const stickMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sticks = new THREE.InstancedMesh(stickGeo, stickMat, 120);
  sticks.setColorAt(0, new THREE.Color(1, 1, 1));
  for (let i = 0; i < 120; i++) {
    d.position.set(rand(-16, 16), rand(1.6, 2.4), rand(7, 16));
    d.rotation.z = rand(-0.3, 0.3); d.updateMatrix(); sticks.setMatrixAt(i, d.matrix);
    sticks.setColorAt(i, new THREE.Color().setHSL(Math.random(), 1, 0.6));
  }
  sticks.name = 'sticks'; stage.add(sticks);
}
scene.add(new THREE.HemisphereLight(0x8888ff, 0x221133, 1.6));
scene.add(new THREE.AmbientLight(0x404060, 1.0));
{
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(5, 12, 8); scene.add(dir);
}

// ============================================================
// 4) IŞIK REJİSİ — tek elden spot/lazer/wash/strobe
// ============================================================
class LightDirector {
  spots: THREE.SpotLight[] = []; targets: THREE.Object3D[] = [];
  lasers: THREE.Mesh[] = []; wash: THREE.PointLight[] = [];
  strobe = 0; intensity = 0.8; section: Section = 'verse';
  constructor() {
    for (let i = 0; i < 4; i++) {
      const s = new THREE.SpotLight(i % 2 ? 0xff00ff : 0x00ffff, 900, 60, 0.32, 0.45, 1.6);
      s.position.set(-12 + i * 8, 13, -7);
      const tg = new THREE.Object3D(); scene.add(tg); s.target = tg;
      scene.add(s); this.spots.push(s); this.targets.push(tg);
    }
    const laserMat = (c: number) => new THREE.MeshBasicMaterial({
      color: c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    for (let i = 0; i < 6; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 26), laserMat(i % 2 ? 0xff0044 : 0x00ffcc));
      beam.position.set(-10 + i * 4, rand(5, 9), 2); beam.rotation.x = -0.25; beam.rotation.y = rand(-0.5, 0.5);
      scene.add(beam); this.lasers.push(beam);
    }
    for (const [x, c] of [[-6, 0xff00ff], [6, 0x00ffff], [0, 0xffe45e]] as const) {
      const p = new THREE.PointLight(c, 60, 30); p.position.set(x, 5, -2); scene.add(p); this.wash.push(p);
    }
  }
  update(t: number, beat: number, pulse: number) {
    const I = this.intensity;
    const speed = this.section === 'drop' || this.section === 'final' ? 2.4 : this.section === 'build' ? 1.6 : 0.8;
    this.targets.forEach((tg, i) => {
      tg.position.set(Math.sin(t * speed + i * 1.7) * (6 + pulse * 4), 1 + Math.abs(Math.cos(t * speed * 0.7 + i)) * 3, Math.cos(t * speed * 0.6 + i * 2) * 5);
      this.spots[i].intensity = (300 + pulse * 900 + audio.energy * 300) * I;
      this.spots[i].color.setHSL((t * 0.08 + i * 0.2) % 1, 1, 0.6);
    });
    this.lasers.forEach((l, i) => {
      l.rotation.y = Math.sin(t * speed * 1.3 + i) * 0.7;
      (l.material as THREE.MeshBasicMaterial).opacity = (this.section === 'verse' ? 0.18 : 0.6) * I + pulse * 0.3 * I;
    });
    this.wash.forEach((w, i) => {
      w.intensity = (20 + audio.energy * 60 + pulse * 80) * I;
      w.color.setHSL((t * 0.05 + i * 0.33) % 1, 1, 0.55);
    });
    if (this.strobe > 0) {
      this.strobe -= 0.05;
      this.spots.forEach(s => s.intensity = 2000 * I * Math.random());
    }
  }
  blast() { this.strobe = 1; }
}
const lights = new LightDirector();

// ============================================================
// 5) PERFORMANS — Robot DJ + fantezi karakter kadrosu
// ============================================================
const dj = new THREE.Group();
const djArmL = new THREE.Group(), djArmR = new THREE.Group(), djHead = new THREE.Group();
{
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa4c0, metalness: 0.95, roughness: 0.25 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00ffff, emissiveIntensity: 2 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 0.9), metal); torso.position.y = 1.2; dj.add(torso);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.1), glow); chest.position.set(0, 1.4, 0.5); dj.add(chest);
  djHead.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), metal));
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.15, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x000, emissive: 0xff00ff, emissiveIntensity: 3 }));
  eyes.position.z = 0.46; djHead.add(eyes);
  djHead.position.y = 2.4; dj.add(djHead);
  for (const [arm, x] of [[djArmL, -1], [djArmR, 1]] as const) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.3, 0.35), metal);
    a.position.y = -0.5; arm.add(a);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), glow);
    hand.position.y = -1.2; arm.add(hand);
    arm.position.set(x, 1.8, 0); dj.add(arm);
  }
  dj.position.set(0, 2.6, -4); scene.add(dj);
}

const FORMATIONS: [number, number][] = [[-5, 0], [5, 0], [-2.5, 2], [2.5, 2], [0, 0], [-7, 3], [7, 3], [0, 4]];
const ROSTER: CharKind[] = ['lion', 'tiger', 'panda', 'fox', 'wolf', 'bear', 'lion', 'fox'];
const cast: Rig[] = [];
{
  for (let i = 0; i < ROSTER.length; i++) {
    const r = build(ROSTER[i]);
    const [fx, fz] = FORMATIONS[i];
    r.root.position.set(fx, 0.5, fz);
    r.home.set(fx, 0.5, fz);
    r.seed = i * 1.7;
    scene.add(r.root);
    cast.push(r);
  }
}
// Efsane kadro: ejderha + 2 kahraman (yüklü hediyelerde sahneye iner)
const dragon = build('dragon');
const heroA = build('hero'), heroB = build('hero');
heroA.root.position.set(-9.5, 0.5, 3.5); heroB.root.position.set(9.5, 0.5, 3.5);
dragon.root.position.set(0, 0.7, 5); dragon.home.set(0, 0.7, 5);
heroA.home.copy(heroA.root.position); heroB.home.copy(heroB.root.position);
dragon.root.visible = heroA.root.visible = heroB.root.visible = false;
scene.add(dragon.root, heroA.root, heroB.root);

function setDancerCount(n: number) {
  let vis = 0;
  for (const r of cast) {
    if (r.solo <= 0) { r.root.visible = vis < n; if (vis < n) vis++; }
  }
  $('dancerCount').textContent = String(vis);
}
function animatePerformers(t: number, section: Section, beat: number, pulse: number, dt: number) {
  // DJ: kafa + kol senkronu
  djHead.rotation.y = Math.sin(t * 1.4) * 0.5;
  djHead.position.y = 2.4 + pulse * 0.08;
  djArmL.rotation.x = -0.5 - pulse * 0.9 + Math.sin(t * 3) * 0.2;
  djArmR.rotation.x = -0.5 - pulse * 0.9 + Math.cos(t * 3.4) * 0.2;
  dj.rotation.y = Math.sin(t * 0.4) * 0.15;
  const amp = section === 'drop' || section === 'final' ? 1.5 : section === 'build' ? 1.1 : 0.7;
  const ctx = { t, dt, pulse, energy: audio.energy, amp, beat };
  for (const r of allPerformers()) {
    if (!r.root.visible) continue;
    if (r.solo > 0) r.solo -= dt;
    if (r.sig > 0) r.sig -= dt;
    animateRig(r, ctx);
  }
}
function allPerformers(): Rig[] {
  return dragon.root.visible ? [...cast, dragon, heroA, heroB] : [...cast];
}
const fx = new FX(scene);

// ============================================================
// 6) EFEKTLER — konfeti + patlama (havuzlu, GC dostu)
// ============================================================
const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.18),
  new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 400);
confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(confetti);
const conf: { p: THREE.Vector3; v: THREE.Vector3; r: number; on: boolean }[] =
  Array.from({ length: 400 }, () => ({ p: new THREE.Vector3(0, -10, 0), v: new THREE.Vector3(), r: 0, on: false }));
{
  const c = new THREE.Color();
  for (let i = 0; i < 400; i++) { confetti.setColorAt(i, c.setHSL(Math.random(), 1, 0.6)); }
  if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;
}
let confCursor = 0;
function fireConfetti(n: number, origin = new THREE.Vector3(0, 10, -4)) {
  const k = Math.round(n * (0.4 + lights.intensity * 0.6));
  for (let i = 0; i < k; i++) {
    const c = conf[confCursor]; confCursor = (confCursor + 1) % conf.length;
    c.on = true; c.p.copy(origin).add(new THREE.Vector3(rand(-6, 6), rand(-1, 1), rand(-2, 2)));
    c.v.set(rand(-2, 2), rand(1, 5), rand(-1, 3)); c.r = rand(0, 6);
  }
}
const dummy = new THREE.Object3D();
function updateConfetti(dt: number) {
  for (let i = 0; i < conf.length; i++) {
    const c = conf[i];
    if (c.on) {
      c.v.y -= 4.5 * dt; c.v.multiplyScalar(1 - 0.6 * dt);
      c.p.addScaledVector(c.v, dt); c.r += dt * 5;
      if (c.p.y < 0) c.on = false;
    } else c.p.set(0, -10, 0);
    dummy.position.copy(c.p); dummy.rotation.set(c.r, c.r * 0.7, 0);
    dummy.updateMatrix(); confetti.setMatrixAt(i, dummy.matrix);
  }
  confetti.instanceMatrix.needsUpdate = true;
}

// ============================================================
// 7) KAMERA YÖNETMENİ — müzik + olaya göre kesme
// ============================================================
const SHOTS: Record<Shot, { p: [number, number, number]; l: [number, number, number] }> = {
  wide: { p: [0, 5.2, 19], l: [0, 4.5, -5] },
  dj: { p: [3.4, 4.6, 1.5], l: [0, 3.4, -4] },
  dance: { p: [-7.5, 3.2, 10], l: [0, 1.5, -1] },
  top: { p: [0, 18, 4], l: [0, 0, -2] },
  gift: { p: [0, 3.4, 11], l: [0, 1.6, 3] },
  hero: { p: [0.5, 3.2, 10], l: [0, 1.7, 3.2] },
  dragon: { p: [0, 4.6, 12.5], l: [0, 7, 1.5] },
};
let shot: Shot = 'wide', nextShotAt = 0, camT = 1;
const camFrom = new THREE.Vector3(...SHOTS.wide.p), camTo = new THREE.Vector3(...SHOTS.wide.p);
const lookFrom = new THREE.Vector3(...SHOTS.wide.l), lookTo = new THREE.Vector3(...SHOTS.wide.l);
let camLock: Shot | null = null, forcedShot: Shot | null = null;
function cutTo(s: Shot) {
  if (shot === s) return;
  camFrom.copy(camera.position); lookFrom.copy(lookTo);
  shot = s; camTo.set(...SHOTS[s].p); lookTo.set(...SHOTS[s].l); camT = 0;
}
function updateCamera(t: number, dt: number) {
  const sel = ($('camSel') as HTMLSelectElement).value;
  if (forcedShot) { cutTo(forcedShot); forcedShot = null; nextShotAt = t + 4; }
  else if (sel !== 'auto') { if (shot !== sel) cutTo(sel as Shot); }
  else if (t > nextShotAt && !camLock) {
    const seq: Shot[] = legend?.kind === 'dragon' ? ['dragon'] : legend?.kind === 'hero' ? ['hero'] : ['wide', 'dj', 'dance', 'wide', 'top', 'dance', 'dj'];
    cutTo(seq[audio.beatCount % seq.length]);
    nextShotAt = t + (lights.section === 'drop' ? 3 : 5.5);
  }
  camT = Math.min(1, camT + dt * 1.4);
  const e = 1 - Math.pow(1 - camT, 3);
  camera.position.lerpVectors(camFrom, camTo, e);
  const lk = new THREE.Vector3().lerpVectors(lookFrom, lookTo, e);
  // elde tutulan hissi: hafif nefes
  lk.x += Math.sin(t * 0.8) * 0.08; lk.y += Math.sin(t * 1.1) * 0.05;
  camera.lookAt(lk);
}

// ============================================================
// 8) CANLI YAYIN REJİSİ — hediye kuyruğu + öncelik + dedupe
// ============================================================
interface GiftEvent { id: string; user: string; gift: string; level: 1 | 2 | 3; at: number; }
const queue: GiftEvent[] = [];
const seen = new Set<string>();
let active: (GiftEvent & { until: number }) | null = null;
let autoSection: Section = 'verse';
const GIFTS: Record<string, { label: string; level: 1 | 2 | 3 }> = {
  rose: { label: '🌹 Gül', level: 1 }, heart: { label: '💜 Kalp', level: 1 },
  castle: { label: '🏰 Kale', level: 2 }, whale: { label: '🐳 Balina', level: 3 },
};
function pushGift(gift: string, user = USERS[(Math.random() * USERS.length) | 0]) {
  const id = user + gift + Date.now() + Math.random().toString(16).slice(2, 6);
  if (seen.has(id)) return;
  seen.add(id);
  const level = GIFTS[gift]?.level ?? 1;
  // Yoğunlukta birleştir: aynı kullanıcı + aynı hediye varsa sayacı büyüt (basit merge)
  queue.push({ id, user, gift, level, at: performance.now() });
  queue.sort((a, b) => b.level - a.level); // büyük önce
  $('queueTxt').textContent = `Kuyruk: ${queue.length} bekleyen` + (active ? ` • sahnede: ${active.user}` : '');
  toast(`${GIFTS[gift]?.label ?? gift} — ${user}`);
}
function toast(msg: string) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  $('toast').appendChild(el); setTimeout(() => el.remove(), 3500);
}
type LegendKind = 'dragon' | 'hero';
interface Legend { rig: Rig; kind: LegendKind; dur: number; t: number; }
let legend: Legend | null = null;
let heroFlip = false;
const lgHome = new THREE.Vector3(), lgOut = new THREE.Vector3();

function summonLegend(kind: LegendKind, dur: number) {
  const rig: Rig = kind === 'dragon' ? dragon : ((heroFlip = !heroFlip) ? heroA : heroB);
  rig.root.visible = true;
  if (kind === 'dragon') {
    rig.root.position.set(0, 14, -8);
    rig.fly = 1; rig.sig = dur;
    fdragon = true; setDancerCount(6);
    fx.smoke(rig.root, 70);
    fx.ring(new THREE.Vector3(0, 0.1, 0), 0x35e06a, 14, 1.4);
  } else {
    rig.root.position.set(rig === heroA ? -12 : 12, 8, 1);
    rig.fly = 1; rig.sig = dur * 0.6;
    fx.sparkle(rig.root, 50, 0.58);
  }
  legend = { rig, kind, dur, t: 0 };
}

function updateLegend(dt: number) {
  if (!legend) return;
  const { rig, kind, dur } = legend;
  legend.t += dt;
  if (kind === 'dragon') { lgHome.set(0, 7.6, 2); lgOut.set(0, 16, -10); }
  else { lgHome.set(0, 0.7, 3.2); lgOut.set(rig === heroA ? -12 : 12, 9, -8); }
  const inT = dur * 0.22, outT = dur * 0.76;
  if (legend.t < inT) rig.root.position.lerp(lgHome, Math.min(1, dt * 2.2));
  else if (legend.t < outT) {
    rig.root.position.lerp(lgHome, Math.min(1, dt * 2));
    if (kind === 'dragon' && rig.fire) {
      fx.fire(rig.fire, new THREE.Vector3(0, -0.55, 1), 5, 1.3 + audio.energy);
      if (Math.random() < dt * 12) fx.smoke(rig.root, 1);
    }
    if (kind === 'hero' && Math.random() < dt * 24) fx.sparkle(rig.root, 1, 0.58);
    if (Math.random() < dt * 2.5)
      fx.ring(new THREE.Vector3(rig.root.position.x, 0.1, rig.root.position.z), kind === 'dragon' ? 0x35e06a : 0xffe45e, 5, 0.9);
  } else rig.root.position.lerp(lgOut, Math.min(1, dt * 1.5));
  if (legend.t >= dur) {
    rig.root.visible = false; rig.fly = 0; rig.sig = 0;
    rig.root.position.copy(rig.home);
    if (kind === 'dragon') { fdragon = false; setDancerCount(8); }
    legend = null;
  }
}
let fdragon = false;

function runShow(ev: GiftEvent, t: number) {
  const dur = ev.level === 3 ? 9 : ev.level === 2 ? 5.5 : 2.5;
  active = { ...ev, until: t + dur };
  ledGiftUser = ev.user + ' • ' + (GIFTS[ev.gift]?.label ?? ev.gift);
  $('giftUser').textContent = ev.user;
  $('giftName').textContent = (GIFTS[ev.gift]?.label ?? ev.gift) + (ev.level === 3 ? ' — EFSANE HEDİYE!' : ev.level === 2 ? ' — BÜYÜK HEDİYE' : '');
  $('giftBanner').classList.remove('hidden');
  forcedShot = ev.level === 3 ? 'dragon' : ev.level === 2 ? 'hero' : 'dj';
  lights.blast();
  fireConfetti(ev.level === 3 ? 260 : ev.level === 2 ? 130 : 30);
  if (ev.level >= 2) {
    summonLegend(ev.level === 3 ? 'dragon' : 'hero', dur);
    ledSub = (ev.level === 3 ? '🐉 EJDERHA GÖSTERİSİ • ' : '🦸 KAHRAMAN İNİŞİ • ') + ev.user.toUpperCase();
  } else {
    const onStage = cast.filter(r => r.root.visible);
    if (onStage.length) {
      const s = onStage[(Math.random() * onStage.length) | 0];
      s.solo = dur; s.sig = dur;
      s.root.position.set(0.5, 0.6, 3.4);
      fx.sparkle(s.root, 30, 0.55);
      fx.ring(new THREE.Vector3(0.5, 0.1, 3.4), 0xffe45e, 4, 0.8);
      setTimeout(() => { s.root.position.copy(s.home); s.solo = 0; }, dur * 1000);
    }
  }
}
function updateDirector(t: number) {
  if (active && t > active.until) {
    active = null;
    $('giftBanner').classList.add('hidden');
    ledGiftUser = ''; ledSub = 'CANLI • TIKTOK KONSERİ';
    $('queueTxt').textContent = `Kuyruk: ${queue.length} bekleyen`;
  }
  if (!active && queue.length) {
    const ev = queue.shift()!;
    runShow(ev, t);
    $('queueTxt').textContent = `Kuyruk: ${queue.length} bekleyen • sahnede: ${ev.user}`;
  }
  // Otomatik konser akışı: 16 verse → 8 build → 16 drop → ...
  const mode = ($('modeSel') as HTMLSelectElement).value;
  if (mode !== 'auto') { lights.section = mode as Section; }
  else {
    const bar = Math.floor(audio.beatCount / 4) % 10;
    autoSection = active?.level === 3 ? 'final' : bar < 4 ? 'verse' : bar < 6 ? 'build' : 'drop';
    lights.section = autoSection;
  }
  const titles: Record<Section, [string, string]> = {
    verse: ['NEON PULSE', 'CANLI • TIKTOK KONSERİ'],
    build: ['YÜKSELİYOR', 'SESİ AÇ • HEDİYEYİ HAZIRLA'],
    drop: ['DROP!', 'HEDİYE YAĞMURU AÇIK'],
    final: ['FİNAL ŞOV', 'EN BÜYÜK DESTEKÇİLER SAHNEDE'],
  };
  const [big, kick] = titles[lights.section];
  ledHeadline = fdragon ? '🐉 EJDERHA' : big;
  if (!active) ledSub = kick;
  $('sectionBig').textContent = big;
  $('sectionKicker').textContent = kick;
}

// ---------- UI ----------
($('startBtn') as HTMLButtonElement).onclick = () => {
  audio.start(); $('startGate').style.display = 'none'; toast('Sahne canlı! Hediye göndermeyi dene 🎁');
};
document.querySelectorAll('[data-gift]').forEach(b =>
  (b as HTMLButtonElement).onclick = () => pushGift((b as HTMLElement).dataset.gift!));
// karakter kadrosu: her karakterin imza hareketini çalıştır
document.querySelectorAll('[data-char]').forEach(b =>
  (b as HTMLButtonElement).onclick = () => {
    const kind = (b as HTMLElement).dataset.char as CharKind;
    const label = kind === 'dragon' ? '🐉 EJDERHA' : kind === 'hero' ? '🦸 KAHRAMAN' : kind.toUpperCase();
    toast(`${label} sahneye çağrıldı!`);
    if (kind === 'dragon') summonLegend('dragon', 7);
    else if (kind === 'hero') summonLegend('hero', 4.5);
    else {
      const onStage = cast.filter(r => r.root.visible);
      const target = onStage.find(r => r.kind === kind) ?? onStage[0];
      if (target) {
        const home = target.home.clone();
        target.solo = 4; target.sig = 4;
        target.root.position.set(0.5, 0.6, 3.4);
        fx.sparkle(target.root, 30, 0.55);
        fx.ring(new THREE.Vector3(0.5, 0.1, 3.4), 0xffe45e, 4, 0.9);
        setTimeout(() => { target.root.position.copy(home); target.solo = 0; }, 4000);
      }
    }
  });
$('joinBtn').onclick = () => { toast('👋 Yeni izleyici sahneye selam verdi'); fireConfetti(20); forcedShot = 'dance'; };
$('finalBtn').onclick = () => pushGift('whale');
$('stressBtn').onclick = () => { for (let i = 0; i < 10; i++) setTimeout(() => pushGift(['rose', 'heart', 'castle', 'whale'][i % 4]), i * 150); };
$('collapse').onclick = () => {
  const b = $('panelBody'); b.style.display = b.style.display === 'none' ? 'flex' : 'none';
};
$('musicSel').onchange = (e) => { audio.bpm = Number((e.target as HTMLSelectElement).value); $('bpmV').textContent = String(audio.bpm); };
$('fxRange').oninput = (e) => { lights.intensity = Number((e.target as HTMLInputElement).value) / 100; };
$('fmtSel').onchange = (e) => {
  document.body.className = (e.target as HTMLSelectElement).value === 'vert' ? 'vert' : 'dual';
};
document.body.className = 'dual';

// ---------- Ana döngü ----------
setDancerCount(8);
const clock = new THREE.Clock();
let fpsA = 60, viewers = 1240;
setInterval(() => { viewers += (Math.random() * 40 - 12) | 0; $('viewers').textContent = (viewers / 1000).toFixed(1) + 'K'; }, 2000);
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  audio.update(dt);
  const pulse = Math.max(audio.beatPulse, active?.level === 3 ? 0.7 : 0);
  updateDirector(t);
  lights.update(t, audio.beatPhase, pulse);
  animatePerformers(t, lights.section, audio.beatPhase, pulse, dt);
  updateLegend(dt);
  drawLED(t, lights.section);
  updateConfetti(dt);
  fx.update(dt);
  // Seyirci çubukları müzikle salla
  const sticks = scene.getObjectByName('sticks') as THREE.InstancedMesh;
  if (sticks && (audio.beatCount % 2 === 0)) sticks.rotation.y = Math.sin(t * 2) * 0.02;
  updateCamera(t, dt);
  fpsA += ((1 / Math.max(dt, 1e-3)) - fpsA) * 0.05;
  $('fps').textContent = String(Math.round(Math.min(120, fpsA)));
  renderer.render(scene, camera);
}
loop();
