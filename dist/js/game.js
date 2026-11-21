import * as THREE from '/vendor/three.module.js';
import { SoundEngine } from './sound_engine.js';

/* ============================================================
   FETİH KORTEJİ — 3D Alay Meydanı
   ============================================================ */
const canvas = document.querySelector('#canvas');
const safeEl = document.querySelector('#safe');
const ferman = document.querySelector('#ferman');
const fermanTitle = document.querySelector('#bannerTitle');
const fermanSub = document.querySelector('#bannerSub');
const flashEl = document.querySelector('#flash');
const sound = new SoundEngine();
const socket = window.io();

const state = { portrait: false, safeZones: false, started: false };
const clock = new THREE.Clock();
const players = new Map();
const tmpV = new THREE.Vector3();
let marchStarted = false;

/* ---------- Renderer / sahne ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x4a3430, 62, 155);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 320);
camera.position.set(14, 8.5, 33.5);

const lookCurrent = new THREE.Vector3(0, 2.2, 8);

/* ---------- Işık ---------- */
scene.add(new THREE.HemisphereLight(0xffd7a8, 0x1a2028, 1.15));
const ambient = new THREE.AmbientLight(0xffb877, 0.28);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffcf9a, 2.5);
sun.position.set(-28, 36, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -42; sun.shadow.camera.right = 42;
sun.shadow.camera.top = 46; sun.shadow.camera.bottom = -34;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0007;
scene.add(sun);

const rim = new THREE.DirectionalLight(0x6f86c9, 0.9);
rim.position.set(20, 18, -40);
scene.add(rim);

/* ============================================================
   Doku yardımcıları
   ============================================================ */
function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  return tex;
}

const stoneTex = canvasTexture(512, 512, (g, w, h) => {
  g.fillStyle = '#8a7a5d'; g.fillRect(0, 0, w, h);
  const rows = 8, bh = h / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * 44;
    for (let x = -44; x < w; x += 88) {
      const shade = 116 + Math.random() * 34;
      g.fillStyle = `rgb(${shade + 12},${shade},${shade - 22})`;
      g.fillRect(x + offset + 2, r * bh + 2, 84, bh - 4);
      g.strokeStyle = 'rgba(52,42,30,.55)'; g.lineWidth = 3;
      g.strokeRect(x + offset + 2, r * bh + 2, 84, bh - 4);
    }
  }
  // Selçuklu yıldızı motifleri
  g.strokeStyle = 'rgba(58,44,28,.5)'; g.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const cx = 50 + (i % 3) * 170, cy = 80 + Math.floor(i / 3) * 240, R = 22;
    g.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = k % 2 ? R * 0.45 : R;
      g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath(); g.stroke();
  }
}, [2, 10]);

const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95, color: 0xcfc0a4 });
const darkStoneMat = new THREE.MeshStandardMaterial({ color: 0x5d5344, roughness: 1 });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.88, roughness: 0.26 });
const darkGoldMat = new THREE.MeshStandardMaterial({ color: 0x8a6a1c, metalness: 0.85, roughness: 0.4 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x4d2f1b, roughness: 0.85 });
const redMat = new THREE.MeshStandardMaterial({ color: 0x7e1717, roughness: 0.75 });
const deepRedMat = new THREE.MeshStandardMaterial({ color: 0x4a0f10, roughness: 0.9 });
const steelMat = new THREE.MeshStandardMaterial({ color: 0x8f9aa2, metalness: 0.75, roughness: 0.35 });
const clothMat = new THREE.MeshStandardMaterial({ color: 0x2f3a2c, roughness: 0.9 });

/* ============================================================
   Gökyüzü
   ============================================================ */
function buildSky() {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(170, 32, 18),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x0a1228) },
        mid: { value: new THREE.Color(0x3c2438) },
        horizon: { value: new THREE.Color(0xc07a46) }
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 horizon;
        void main(){ float h = normalize(vP).y;
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.26, h));
          c = mix(c, top, smoothstep(0.22, 0.72, h));
          gl_FragColor = vec4(c, 1.0); }`
    })
  );
  scene.add(sky);

  const glowTex = canvasTexture(256, 256, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,236,196,1)');
    grad.addColorStop(0.18, 'rgba(255,196,120,.85)');
    grad.addColorStop(0.5, 'rgba(255,140,70,.25)');
    grad.addColorStop(1, 'rgba(255,120,50,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  }));
  sunSprite.position.set(-62, 15, -120); sunSprite.scale.set(80, 80, 1);
  scene.add(sunSprite);

  const haze = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 46),
    new THREE.MeshBasicMaterial({ color: 0xb97a4e, transparent: true, opacity: 0.12, depthWrite: false, fog: false })
  );
  haze.position.set(0, 12, -128);
  scene.add(haze);
}

/* ============================================================
   Dünya
   ============================================================ */
const torches = [];
const catapults = [];
const flameSprites = [];
let mehter = null;

function buildWorld() {
  buildSky();

  const dirtTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#3b3124'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      const a = Math.random() * 0.16;
      g.fillStyle = Math.random() > 0.5 ? `rgba(120,100,70,${a})` : `rgba(20,16,10,${a})`;
      const r = 1 + Math.random() * 3;
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2); g.fill();
    }
  }, [14, 14]);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(280, 280),
    new THREE.MeshStandardMaterial({ map: dirtTex, color: 0x9a8a6e, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.38; ground.receiveShadow = true;
  scene.add(ground);

  // Yol
  const road = new THREE.Mesh(new THREE.BoxGeometry(25, 0.35, 100), stoneMat);
  road.position.set(0, -0.14, 8); road.receiveShadow = true;
  scene.add(road);

  const curbMat = new THREE.MeshStandardMaterial({ color: 0x9b8a68, roughness: 0.9 });
  for (const x of [-12.7, 12.7]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 100), curbMat);
    curb.position.set(x, 0.06, 8); curb.receiveShadow = true; curb.castShadow = true;
    scene.add(curb);
  }

  // Yol ortasındaki tören şeridi
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 100),
    new THREE.MeshStandardMaterial({ color: 0x6b1a1a, roughness: 0.95, transparent: true, opacity: 0.34 })
  );
  strip.rotation.x = -Math.PI / 2; strip.position.set(0, 0.05, 8);
  scene.add(strip);

  buildBridgeRails();
  buildTorches();
  buildThrone();
  buildCity();
  buildCatapults();
  buildMehter();
  buildRocks();
}

function buildBridgeRails() {
  for (const side of [-1, 1]) {
    const x = side * 12.7;
    for (let z = -26; z <= 42; z += 8) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.1, 0.45), stoneMat);
      post.position.set(x, 1.0, z); post.castShadow = true;
      scene.add(post);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), goldMat);
      cap.position.set(x, 2.15, z); scene.add(cap);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 70), goldMat);
    rail.position.set(x, 1.85, 8); scene.add(rail);

    // Kemerler
    for (let z = -18; z <= 30; z += 12) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.28, 6, 18, Math.PI), stoneMat);
      arch.rotation.y = Math.PI / 2;
      arch.position.set(x + side * 0.4, -0.9, z);
      scene.add(arch);
    }
  }
}

function flameTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, h * 0.1, 0, h * 0.95);
    grad.addColorStop(0, 'rgba(255,252,226,0)');
    grad.addColorStop(0.25, 'rgba(255,232,170,.9)');
    grad.addColorStop(0.55, 'rgba(255,150,40,.8)');
    grad.addColorStop(0.82, 'rgba(255,84,16,.35)');
    grad.addColorStop(1, 'rgba(255,50,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(64, 4);
    g.bezierCurveTo(92, 48, 116, 84, 64, 122);
    g.bezierCurveTo(12, 84, 36, 48, 64, 4);
    g.closePath(); g.fill();
    const core = g.createRadialGradient(64, 82, 2, 64, 82, 26);
    core.addColorStop(0, 'rgba(255,255,235,.95)');
    core.addColorStop(1, 'rgba(255,210,110,0)');
    g.fillStyle = core;
    g.beginPath(); g.arc(64, 82, 26, 0, Math.PI * 2); g.fill();
  });
}
const FLAME_TEX = flameTexture();

function buildTorches() {
  for (const side of [-1, 1]) {
    for (let z = -18; z <= 30; z += 8) {
      const x = side * 11.2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 3.1, 8), woodMat);
      pole.position.set(x, 1.5, z); pole.castShadow = true; scene.add(pole);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.26, 0.4, 10), darkGoldMat);
      bowl.position.set(x, 3.1, z); scene.add(bowl);

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: FLAME_TEX, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      sprite.position.set(x, 3.55, z);
      sprite.scale.set(1.15, 1.65, 1);
      scene.add(sprite);
      flameSprites.push({ sprite, base: 1.0 + Math.random() * 0.22, seed: Math.random() * 10 });
      torches.push({ x, z });
    }
  }
  for (const [x, z] of [[-11.2, 6], [11.2, 22]]) {
    const light = new THREE.PointLight(0xff7a2a, 18, 16, 2);
    light.position.set(x, 3.6, z);
    scene.add(light);
    torches.push({ x, z, light, base: 18 });
  }
}

function buildThrone() {
  const platform = new THREE.Group();
  platform.position.set(0, 0, -22);
  scene.add(platform);

  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(15 - i * 1.8, 0.5, 7 - i * 1.4), stoneMat);
    step.position.set(0, 0.25 + i * 0.48, 0);
    step.receiveShadow = true; step.castShadow = true;
    platform.add(step);
  }

  const throne = new THREE.Group();
  throne.position.set(0, 1.55, -1.4);
  platform.add(throne);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.7, 2.6), goldMat);
  seat.position.y = 1.1; seat.castShadow = true; throne.add(seat);
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.35, 2.0), redMat);
  cushion.position.y = 1.58; throne.add(cushion);

  const back = new THREE.Mesh(new THREE.BoxGeometry(4.6, 5.2, 0.45), goldMat);
  back.position.set(0, 3.4, -1.15); back.castShadow = true; throne.add(back);
  const backPanel = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.1, 0.1), deepRedMat);
  backPanel.position.set(0, 3.4, -0.9); throne.add(backPanel);

  const crest = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.14, 8, 28), goldMat);
  crest.position.set(0, 4.2, -0.82); throne.add(crest);
  const crestStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), goldMat);
  crestStar.position.set(0, 4.2, -0.75); throne.add(crestStar);

  for (const x of [-2.3, 2.3]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.3, 2.3), goldMat);
    arm.position.set(x, 2.0, 0); throne.add(arm);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), goldMat);
    knob.position.set(x, 2.7, 1.0); throne.add(knob);
  }
  for (const x of [-1.9, 1.9]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.2, 8), goldMat);
    leg.position.set(x, 0.3, 0.7); throne.add(leg);
  }

  // Kanopi
  for (const x of [-4.6, 4.6]) {
    for (const z of [-2.8, 1.6]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 8, 8), darkGoldMat);
      p.position.set(x, 4, z); p.castShadow = true; platform.add(p);
    }
  }
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.35, 5.2), redMat);
  canopy.position.set(0, 8.05, -0.6); canopy.castShadow = true; platform.add(canopy);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(9.9, 0.12, 5.3), goldMat);
  trim.position.set(0, 8.26, -0.6); platform.add(trim);
  for (let i = -4; i <= 4; i += 2) {
    const drape = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.4), redMat);
    drape.position.set(i, 6.8, 2.05); drape.rotation.x = 0.08; platform.add(drape);
  }

  // Sancaklar
  for (const x of [-6.8, 6.8]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 9, 8), woodMat);
    pole.position.set(x, 4.5, 1.4); platform.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.0), new THREE.MeshStandardMaterial({
      map: crescentBannerTexture(), side: THREE.DoubleSide, roughness: 0.9
    }));
    flag.position.set(x + (x < 0 ? 1.12 : -1.12), 7.2, 1.4);
    flag.rotation.y = x < 0 ? 0.15 : -0.15;
    platform.add(flag);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), goldMat);
    finial.position.set(x, 9.1, 1.4); platform.add(finial);
  }

  // Ferman taşı
  const tablet = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 0.2), darkStoneMat);
  tablet.position.set(7.6, 1.2, 2.2); tablet.rotation.y = -0.35; platform.add(tablet);
}

function crescentBannerTexture() {
  return canvasTexture(256, 340, (g, w, h) => {
    g.fillStyle = '#7e1717'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d8ad5a'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
    g.strokeStyle = 'rgba(216,173,90,.5)'; g.lineWidth = 3; g.strokeRect(24, 24, w - 48, h - 48);
    g.fillStyle = '#e7c878';
    g.beginPath(); g.arc(w / 2, h * 0.44, 66, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7e1717';
    g.beginPath(); g.arc(w / 2 + 20, h * 0.44, 56, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e7c878';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const r = i % 2 ? 14 : 30;
      g[i ? 'lineTo' : 'moveTo'](w / 2 + 78 + Math.cos(a) * r, h * 0.44 + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
    g.fillStyle = '#f0d89a'; g.font = 'bold 34px Georgia'; g.textAlign = 'center';
    g.fillText('FETİH', w / 2, h * 0.78);
  });
}

function buildCity() {
  const city = new THREE.Group();
  city.position.set(0, 0, -52);
  scene.add(city);
  const wall = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0x9a8668, roughness: 1 });
  const dome = new THREE.MeshStandardMaterial({ color: 0x5a4a3c, metalness: 0.35, roughness: 0.6 });

  for (let i = 0; i < 9; i++) {
    const x = -36 + i * 9;
    const hgt = 8 + ((i * 7) % 9);
    const b = new THREE.Mesh(new THREE.BoxGeometry(7.5, hgt, 7), wall);
    b.position.set(x, hgt / 2, -6 - (i % 3) * 5);
    b.castShadow = true; city.add(b);
    const d = new THREE.Mesh(new THREE.SphereGeometry(3.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), dome);
    d.position.set(x, hgt, -6 - (i % 3) * 5); city.add(d);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.4, 6), goldMat);
    finial.position.set(x, hgt + 3.4, -6 - (i % 3) * 5); city.add(finial);
  }
  // Minareler
  for (const [x, z] of [[-30, 2], [-12, -2], [4, 3], [22, -1], [38, 2]]) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.95, 22, 10), wall);
    shaft.position.set(x, 11, z); shaft.castShadow = true; city.add(shaft);
    const balcony = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.5, 10), dome);
    balcony.position.set(x, 17, z); city.add(balcony);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.05, 4.5, 10), dome);
    cone.position.set(x, 22.6, z); city.add(cone);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), goldMat);
    finial.position.set(x, 25, z); city.add(finial);
    // Aydınlık pencere
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.9), new THREE.MeshBasicMaterial({ color: 0xffc46a }));
    win.position.set(x, 12.5, z + 0.96); city.add(win);
  }
  // Sur
  const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(110, 6, 3), wall);
  wallMesh.position.set(0, 3, 6); city.add(wallMesh);
  for (let x = -52; x <= 52; x += 8) {
    const merlon = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 3.2), wall);
    merlon.position.set(x, 6.9, 6); city.add(merlon);
  }
  // Sur üzerindeki ışıklı mazgallar
  for (let x = -48; x <= 48; x += 12) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), new THREE.MeshBasicMaterial({ color: 0xffb45e }));
    win.position.set(x, 3.6, 7.52); city.add(win);
  }
}

function buildCatapults() {
  for (const side of [-1, 1]) {
    for (const z of [4, 17]) {
      const c = createCatapult();
      c.group.position.set(side * 15.5, 0, z);
      c.group.rotation.y = side * -0.35;
      scene.add(c.group);
      catapults.push(c);
    }
  }
}

function createCatapult() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 3), woodMat);
  base.position.y = 1.0; base.castShadow = true; group.add(base);
  for (const x of [-1.8, 1.8]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 5.4), woodMat);
    beam.position.set(x, 1.5, 0); beam.rotation.x = -0.12; group.add(beam);
  }
  for (const x of [-1.7, 1.7]) {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.6, 0.4), woodMat);
    upright.position.set(x, 2.6, -1.2); upright.rotation.x = 0.22; upright.castShadow = true; group.add(upright);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.6, 8), steelMat);
  axle.rotation.z = Math.PI / 2; axle.position.set(0, 3.7, -1.0); group.add(axle);

  const armPivot = new THREE.Group();
  armPivot.position.set(0, 3.7, -1.0);
  group.add(armPivot);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 6.2), woodMat);
  arm.position.set(0, 0, 2.4); armPivot.add(arm);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.5, 8), darkGoldMat);
  cup.position.set(0, 0.35, 5.3); armPivot.add(cup);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.0), darkStoneMat);
  counter.position.set(0, -0.3, -1.0); armPivot.add(counter);
  armPivot.rotation.x = 1.05;

  for (const x of [-2.1, 2.1]) {
    for (const z of [-1.4, 1.4]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.16, 6, 12), woodMat);
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(x, 0.62, z); group.add(wheel);
    }
  }
  return { group, armPivot, cooldown: 0 };
}

function buildMehter() {
  mehter = new THREE.Group();
  mehter.visible = false;
  scene.add(mehter);
  const positions = [[-13.4, 0, 8], [-13.4, 0, 13], [13.4, 0, 8], [13.4, 0, 13]];
  positions.forEach(([x, y, z], i) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = x < 0 ? -0.5 : 0.5;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 1.2, 8), woodMat);
    stand.position.y = 0.6; g.add(stand);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.95, 20), redMat);
    drum.rotation.z = Math.PI / 2; drum.position.y = 1.65; drum.castShadow = true; g.add(drum);
    const rim1 = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.08, 6, 24), goldMat);
    rim1.rotation.y = Math.PI / 2; rim1.position.set(0, 1.65, 0.48); g.add(rim1);
    const rim2 = rim1.clone(); rim2.position.z = -0.48; g.add(rim2);

    const drummer = new THREE.Group();
    drummer.position.set(0, 0, 1.1);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.1, 8), clothMat);
    body.position.y = 1.2; drummer.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshStandardMaterial({ color: 0xb98a62 }));
    head.position.y = 1.95; drummer.add(head);
    const turban = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe8e0c8 }));
    turban.position.y = 2.08; drummer.add(turban);
    const sticks = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.34, 1.55, 0);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.9, 5), woodMat);
      stick.position.set(side * 0.22, 0.2, 0.35); stick.rotation.z = side * 0.4; stick.rotation.x = 0.7;
      pivot.add(stick); drummer.add(pivot); sticks.push(pivot);
    }
    g.add(drummer);
    g.userData = { sticks, phase: i * 1.3 };
    mehter.add(g);
  });
  mehter.userData.until = 0;
}

function buildRocks() {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x39322a, roughness: 1 });
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (17 + Math.random() * 22);
    const z = -20 + Math.random() * 65;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + Math.random() * 1.1, 0), rockMat);
    rock.position.set(x, Math.random() * 0.3 - 0.1, z);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    scene.add(rock);
  }
  // Kuru ot kümeleri
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x4a4a2a, roughness: 1, side: THREE.DoubleSide });
  for (let i = 0; i < 60; i++) {
    const side = i % 2 ? 1 : -1;
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.9, 4), grassMat);
    tuft.position.set(side * (14 + Math.random() * 16), 0.35, -20 + Math.random() * 65);
    scene.add(tuft);
  }
}

/* ============================================================
   Asker üretimi
   ============================================================ */
const GEO = {
  torso: new THREE.CylinderGeometry(0.3, 0.42, 1.05, 8),
  skirt: new THREE.ConeGeometry(0.46, 0.44, 8),
  head: new THREE.SphereGeometry(0.235, 12, 10),
  helmet: new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
  arm: new THREE.CapsuleGeometry(0.075, 0.42, 3, 6),
  leg: new THREE.CapsuleGeometry(0.095, 0.45, 3, 6),
  boot: new THREE.BoxGeometry(0.19, 0.16, 0.34),
  shield: new THREE.CylinderGeometry(0.27, 0.27, 0.05, 14),
  pole: new THREE.CylinderGeometry(0.022, 0.022, 2.5, 5),
  flag: new THREE.PlaneGeometry(0.92, 1.15),
  medallion: new THREE.CircleGeometry(0.29, 20),
  medallionRing: new THREE.TorusGeometry(0.30, 0.028, 6, 22),
  blob: new THREE.CircleGeometry(0.52, 12),
  horseBody: new THREE.CapsuleGeometry(0.38, 1.0, 4, 8),
  horseLeg: new THREE.CylinderGeometry(0.1, 0.08, 0.95, 6),
  horseNeck: new THREE.CylinderGeometry(0.16, 0.26, 1.1, 7),
  horseHead: new THREE.BoxGeometry(0.32, 0.34, 0.8),
  turban: new THREE.SphereGeometry(0.3, 12, 8)
};

const MATS = new Map();
function mat(color, metal = 0, rough = 0.72) {
  const key = `${color}|${metal}|${rough}`;
  if (!MATS.has(key)) MATS.set(key, new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough }));
  return MATS.get(key);
}
const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });

const RANKS = {
  Nefer: { tier: 0, color: 0x5f6b4e, trim: 0x8a7444 },
  Sipahi: { tier: 1, color: 0x64707a, trim: 0xa9a284 },
  Sancaktar: { tier: 2, color: 0x8c7a44, trim: 0xd8ad5a },
  'Akıncı': { tier: 3, color: 0x4f5558, trim: 0x9a2c22 },
  Vezir: { tier: 4, color: 0x6e1c1c, trim: 0xd8ad5a }
};

/* Profil bayrakları */
const bannerCache = new Map();
const avatarImages = new Map();
let avatarLoads = 0;

function makeBannerTexture(name, color, avatarUrl) {
  const key = `${name}|${color}|${avatarUrl}`;
  if (bannerCache.has(key)) return bannerCache.get(key);
  const c = document.createElement('canvas');
  c.width = 160; c.height = 200;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const draw = (img) => {
    g.clearRect(0, 0, 160, 200);
    // Bayrak gövdesi
    const grad = g.createLinearGradient(0, 0, 0, 200);
    grad.addColorStop(0, '#8f2020'); grad.addColorStop(1, '#4a0d0d');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(6, 6); g.lineTo(154, 6); g.lineTo(154, 168); g.lineTo(80, 196); g.lineTo(6, 168);
    g.closePath(); g.fill();
    g.strokeStyle = '#e2bc6a'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = 'rgba(226,188,106,.45)'; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(18, 18); g.lineTo(142, 18); g.lineTo(142, 158); g.lineTo(80, 180); g.lineTo(18, 158);
    g.closePath(); g.stroke();

    // Madalyon
    const cx = 80, cy = 78, r = 48;
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    if (img) {
      g.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    } else {
      const pg = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      pg.addColorStop(0, color); pg.addColorStop(1, '#241a12');
      g.fillStyle = pg; g.fillRect(cx - r, cy - r, r * 2, r * 2);
      g.fillStyle = 'rgba(255,240,205,.92)';
      g.font = 'bold 44px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText((name || '?').trim().charAt(0).toUpperCase(), cx, cy + 2);
    }
    g.restore();
    g.strokeStyle = '#e2bc6a'; g.lineWidth = 4;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();

    // İsim
    g.fillStyle = '#f5e2b8'; g.font = 'bold 17px Georgia'; g.textAlign = 'center';
    const label = (name || 'Misafir').length > 13 ? (name || 'Misafir').slice(0, 12) + '…' : (name || 'Misafir');
    g.fillText(label, 80, 152);
    g.fillStyle = '#d8ad5a'; g.fillRect(52, 162, 56, 2);
    tex.needsUpdate = true;
  };

  draw(null);
  if (avatarUrl && avatarLoads < 70) {
    avatarLoads++;
    const load = (url) => {
      const img = new Image();
      img.onload = () => { draw(img); avatarImages.set(avatarUrl, img); };
      img.onerror = () => {};
      img.src = url;
    };
    if (avatarImages.has(avatarUrl)) draw(avatarImages.get(avatarUrl));
    else load(`/api/avatar?url=${encodeURIComponent(avatarUrl)}`);
  }
  bannerCache.set(key, tex);
  return tex;
}

const medallionCache = new Map();
function makeMedallionTexture(name, color, avatarUrl) {
  const key = `m|${name}|${color}|${avatarUrl}`;
  if (medallionCache.has(key)) return medallionCache.get(key);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = (img) => {
    g.clearRect(0, 0, 128, 128);
    g.save();
    g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.clip();
    if (img) g.drawImage(img, 8, 8, 112, 112);
    else {
      const pg = g.createLinearGradient(0, 0, 128, 128);
      pg.addColorStop(0, color); pg.addColorStop(1, '#20160f');
      g.fillStyle = pg; g.fillRect(0, 0, 128, 128);
      g.fillStyle = 'rgba(255,244,214,.95)';
      g.font = 'bold 52px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText((name || '?').charAt(0).toUpperCase(), 64, 68);
    }
    g.restore();
    g.strokeStyle = '#e2bc6a'; g.lineWidth = 7;
    g.beginPath(); g.arc(64, 64, 55, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,238,190,.7)'; g.lineWidth = 2;
    g.beginPath(); g.arc(64, 64, 48, 0, Math.PI * 2); g.stroke();
    tex.needsUpdate = true;
  };
  draw(null);
  if (avatarUrl && avatarLoads < 70) {
    avatarLoads++;
    const img = new Image();
    img.onload = () => { draw(img); avatarImages.set(avatarUrl, img); };
    img.src = `/api/avatar?url=${encodeURIComponent(avatarUrl)}`;
  }
  medallionCache.set(key, tex);
  return tex;
}

function addLimb(parent, geo, x, y, material) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = -0.27;
  mesh.castShadow = true;
  pivot.add(mesh);
  parent.add(pivot);
  return pivot;
}

function createHorse() {
  const g = new THREE.Group();
  const hide = mat(0x3b2517, 0, 0.92);
  const body = new THREE.Mesh(GEO.horseBody, hide);
  body.rotation.x = Math.PI / 2;
  body.position.y = 1.2; body.castShadow = true; g.add(body);

  const neck = new THREE.Mesh(GEO.horseNeck, hide);
  neck.position.set(0, 1.75, -0.78); neck.rotation.x = 0.55; g.add(neck);
  const head = new THREE.Mesh(GEO.horseHead, hide);
  head.position.set(0, 2.18, -1.22); head.rotation.x = -0.15; g.add(head);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 5), hide);
    ear.position.set(side * 0.1, 2.42, -1.12); g.add(ear);
  }
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.7), mat(0x17110c, 0, 1));
  mane.position.set(0, 2.02, -0.82); mane.rotation.x = 0.5; g.add(mane);

  const legs = [];
  for (const x of [-0.3, 0.3]) {
    for (const z of [-0.72, 0.72]) {
      const leg = new THREE.Mesh(GEO.horseLeg, hide);
      leg.position.set(x, 0.62, z); leg.castShadow = true; g.add(leg); legs.push(leg);
    }
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 6), mat(0x17110c, 0, 1));
  tail.position.set(0, 1.35, 1.05); tail.rotation.x = -0.7; g.add(tail);

  // İşlemeli örtü
  const caparison = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.06, 1.5), new THREE.MeshStandardMaterial({
    map: caparisonTexture(), roughness: 0.85
  }));
  caparison.position.set(0, 1.62, 0.05); g.add(caparison);
  const fringe = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.4), new THREE.MeshStandardMaterial({
    color: 0x8f2020, side: THREE.DoubleSide, roughness: 0.9
  }));
  fringe.position.set(0, 1.42, 0.05); fringe.rotation.x = Math.PI / 2; g.add(fringe);

  g.userData.legs = legs;
  return g;
}

function caparisonTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#7e1717'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d8ad5a'; g.lineWidth = 4;
    for (let i = 0; i < 4; i++) {
      g.strokeRect(6 + i * 4, 6 + i * 4, w - 12 - i * 8, h - 12 - i * 8);
    }
    g.fillStyle = '#d8ad5a';
    for (let x = 20; x < w; x += 28) {
      g.beginPath(); g.arc(x, h / 2, 4, 0, Math.PI * 2); g.fill();
    }
  }, [2, 2]);
}

function createSoldier(rec) {
  const rank = RANKS[rec.rank] || RANKS.Nefer;
  const tier = rank.tier;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const tunic = mat(rank.color, tier >= 1 ? 0.25 : 0, 0.82);
  const trim = mat(rank.trim, tier >= 2 ? 0.55 : 0.1, 0.5);

  const torso = new THREE.Mesh(GEO.torso, tunic);
  torso.position.y = 1.15; torso.castShadow = true; body.add(torso);
  const skirt = new THREE.Mesh(GEO.skirt, tunic);
  skirt.position.y = 0.84; body.add(skirt);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.12, 8), trim);
  belt.position.y = 0.98; body.add(belt);

  const skinTones = [0xb98a62, 0xa9764f, 0xc79a72, 0x8f5f3d];
  const head = new THREE.Mesh(GEO.head, mat(skinTones[Math.floor(Math.random() * skinTones.length)], 0, 0.85));
  head.position.y = 1.92; head.castShadow = true; body.add(head);

  if (tier >= 1) {
    const helmet = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.42, 10), steelMat);
    helmet.position.y = 2.16; helmet.castShadow = true; body.add(helmet);
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.045, 6, 16), steelMat);
    brim.rotation.x = Math.PI / 2; brim.position.y = 1.99; body.add(brim);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.24, 0.055), steelMat);
    nose.position.set(0, 1.94, 0.235); body.add(nose);
    if (tier >= 2) {
      const plume = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0xd8c89a }));
      plume.position.set(0, 2.5, 0.05); body.add(plume);
      const padMat = mat(rank.trim, 0.6, 0.4);
      for (const side of [-1, 1]) {
        const pad = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), padMat);
        pad.position.set(side * 0.4, 1.62, 0); pad.scale.y = 0.7; body.add(pad);
      }
    }
  } else {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.2, 10), mat(0x3a3328, 0, 0.9));
    cap.position.y = 2.13; body.add(cap);
    const capTop = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.24, 10), mat(0x3a3328, 0, 0.9));
    capTop.position.y = 2.34; body.add(capTop);
    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.06), mat(rank.trim, 0, 0.8));
    sash.position.set(0.1, 1.16, 0.37); sash.rotation.z = 0.32; body.add(sash);
  }
  if (tier >= 4) {
    const turban = new THREE.Mesh(GEO.turban, new THREE.MeshStandardMaterial({ color: 0xece2c6, roughness: 0.9 }));
    turban.position.y = 2.22; turban.scale.set(1.1, 0.85, 1.1); body.add(turban);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.055, 6, 16), goldMat);
    band.rotation.x = Math.PI / 2; band.position.y = 2.12; body.add(band);
    const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshStandardMaterial({ color: 0xd94f6a, emissive: 0x5a0e1a, roughness: 0.3 }));
    jewel.position.set(0, 2.22, 0.3); body.add(jewel);
  }

  const armL = addLimb(body, GEO.arm, -0.4, 1.56, tunic);
  const armR = addLimb(body, GEO.arm, 0.4, 1.56, tunic);
  const legL = addLimb(body, GEO.leg, -0.16, 0.9, mat(0x3a3228, 0, 0.9));
  const legR = addLimb(body, GEO.leg, 0.16, 0.9, mat(0x3a3228, 0, 0.9));
  for (const leg of [legL, legR]) {
    const boot = new THREE.Mesh(GEO.boot, mat(0x2a2019, 0, 0.9));
    boot.position.set(0, -0.55, 0.05); leg.add(boot);
  }

  if (tier >= 1 && tier <= 2) {
    const shield = new THREE.Mesh(GEO.shield, mat(0x6b1a1a, 0.35, 0.55));
    shield.rotation.x = Math.PI / 2;
    shield.position.set(-0.44, 1.28, 0.18); body.add(shield);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), goldMat);
    boss.position.set(-0.44, 1.28, 0.23); body.add(boss);
  }

  let cape = null;
  if (tier >= 2) {
    cape = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 1.15), new THREE.MeshStandardMaterial({
      color: tier >= 4 ? 0x6e1010 : 0x8f2020, side: THREE.DoubleSide, roughness: 0.92
    }));
    cape.position.set(0, 1.22, 0.4); cape.rotation.x = -0.06; body.add(cape);
  }

  // Profil işareti: düşük rütbeler madalyon, üst rütbeler sancak taşır
  let flag = null, medallion = null;
  const colorHex = `#${rank.color.toString(16).padStart(6, '0')}`;
  if (tier >= 2) {
    const pole = new THREE.Mesh(GEO.pole, darkGoldMat);
    pole.position.set(0.52, 2.0, 0.14); pole.scale.y = 1.08; body.add(pole);
    flag = new THREE.Mesh(GEO.flag, new THREE.MeshBasicMaterial({
      map: makeBannerTexture(rec.name, colorHex, rec.avatar),
      transparent: true, side: THREE.DoubleSide, alphaTest: 0.08
    }));
    flag.position.set(0.52, 2.58, 0.14);
    flag.scale.setScalar(0.78);
    body.add(flag);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.28, 6), goldMat);
    finial.position.set(0.52, 3.28, 0.14); body.add(finial);
  } else {
    const avatarPivot = new THREE.Group();
    avatarPivot.position.set(0, 2.56, 0.03);
    body.add(avatarPivot);
    medallion = new THREE.Mesh(GEO.medallion, new THREE.MeshBasicMaterial({
      map: makeMedallionTexture(rec.name, colorHex, rec.avatar),
      transparent: true, alphaTest: 0.1, side: THREE.DoubleSide
    }));
    avatarPivot.add(medallion);
    const ring = new THREE.Mesh(GEO.medallionRing, goldMat);
    ring.position.z = 0.012; avatarPivot.add(ring);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 5), darkGoldMat);
    stem.position.set(0, 2.35, 0.02); body.add(stem);
    body.userData.avatarPivot = avatarPivot;
  }

  const blob = new THREE.Mesh(GEO.blob, blobMat);
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02;
  blob.scale.setScalar(tier >= 3 ? 2.0 : 1);
  root.add(blob);

  if (tier >= 3) {
    const horse = createHorse();
    root.add(horse);
    body.position.y = 0.92;
    legL.rotation.x = -1.15; legR.rotation.x = -1.15;
    legL.visible = false; legR.visible = false;
    root.userData.horse = horse;
  }

  root.userData = {
    ...(root.userData || {}),
    parts: { body, armL, armR, legL, legR, flag, head, torso, cape, avatarPivot: body.userData.avatarPivot || null },
    tier, phase: Math.random() * Math.PI * 2
  };
  root.scale.setScalar(0.94 + Math.random() * 0.1);
  return root;
}

/* ============================================================
   Kalabalık
   ============================================================ */
function ensurePlayer(d) {
  let rec = players.get(d.uniqueId);
  if (rec) {
    if (d.avatar && d.avatar !== rec.avatar) rec.avatar = d.avatar;
    return rec;
  }
  rec = {
    id: String(d.uniqueId), name: d.nickname || d.uniqueId || 'Misafir',
    avatar: d.avatar || d.profilePictureUrl || '', rank: 'Nefer', score: 0, boost: 0
  };
  rec.group = createSoldier(rec);
  rec.group.position.set((Math.random() - 0.5) * 6, 0, 34 + Math.random() * 4);
  rec.target = new THREE.Vector3().copy(rec.group.position);
  scene.add(rec.group);
  players.set(rec.id, rec);
  return rec;
}

function upgradePlayer(rec, rank) {
  const old = rec.group;
  rec.rank = rank;
  rec.boost = 2.2;
  rec.group = createSoldier(rec);
  rec.group.position.copy(old.position);
  scene.remove(old);
  scene.add(rec.group);
  // eski hedefi koru; düzen yeniden hesaplanacak
}

function layoutCrowd() {
  const list = [...players.values()].sort((a, b) => (b.score || 0) - (a.score || 0));
  const cols = state.portrait ? 7 : 9;
  const gapX = state.portrait ? 1.62 : 1.95;
  const gapZ = state.portrait ? 1.85 : 2.15;
  list.forEach((rec, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = (col - (cols - 1) / 2) * gapX + (row % 2 ? gapX * 0.3 : 0);
    const z = 5 + row * gapZ;
    if (!rec.target) rec.target = new THREE.Vector3();
    rec.target.set(x, 0, z);
  });
  updateWideFraming(list);
}

function updateWideFraming(list = [...players.values()]) {
  let maxZ = 12;
  for (const rec of list) if (rec.target && rec.target.z > maxZ) maxZ = rec.target.z;
  const depth = Math.max(0, maxZ - 5);
  director.widePos.set(13.0, 9.0 + depth * 0.03, maxZ + 14);
  director.wideLook.set(0, 2.6, 1 + depth * 0.12);
  director.portraitPos.set(7.0, 9.8 + depth * 0.04, maxZ + 14);
  director.portraitLook.set(1.2, 3.2, 1.5 + depth * 0.12);
}

function addDemoCrowd() {
  const names = ['Alparslan', 'Kutalmış', 'Süleyman Şah', 'Togan', 'Boğaç', 'Cengiz', 'Arslan', 'Tuğrul', 'Melikşah', 'Sancar', 'Kılıç Arslan', 'Orhan', 'Bayezid', 'Selim', 'Murat', 'Yıldırım'];
  const ranks = ['Vezir', 'Akıncı', 'Sancaktar', 'Sancaktar', 'Sipahi', 'Sipahi', 'Sipahi', 'Sipahi', 'Nefer', 'Nefer', 'Nefer', 'Nefer'];
  for (let i = 0; i < 46; i++) {
    const rec = {
      id: `demo-${i}`,
      name: names[i % names.length] + (i > 15 ? ' ' + (i + 1) : ''),
      avatar: '', rank: ranks[i % ranks.length], score: 900 - i * 12, boost: 0
    };
    rec.group = createSoldier(rec);
    rec.group.position.set((Math.random() - 0.5) * 14, 0, 8 + Math.random() * 24);
    rec.target = new THREE.Vector3().copy(rec.group.position);
    scene.add(rec.group);
    players.set(rec.id, rec);
  }
  layoutCrowd();
}

/* ============================================================
   Parçacıklar
   ============================================================ */
const MAX_P = 900;
const pPos = new Float32Array(MAX_P * 3);
const pCol = new Float32Array(MAX_P * 3);
const pVel = new Float32Array(MAX_P * 3);
const pLife = new Float32Array(MAX_P);
const pMax = new Float32Array(MAX_P);
const pGrav = new Float32Array(MAX_P);
for (let i = 0; i < MAX_P; i++) pPos[i * 3 + 1] = -999;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
  size: 0.17, vertexColors: true, transparent: true, opacity: 0.95,
  depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
}));
particles.frustumCulled = false;
scene.add(particles);
let pCursor = 0;

function spawnParticle(x, y, z, vx, vy, vz, r, g, b, life = 1.2, grav = 2.5) {
  const i = pCursor = (pCursor + 1) % MAX_P;
  pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
  pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
  pCol[i * 3] = r; pCol[i * 3 + 1] = g; pCol[i * 3 + 2] = b;
  pLife[i] = pMax[i] = life; pGrav[i] = grav;
}
function burst(pos, count, color, power = 5, life = 1.3) {
  const c = new THREE.Color(color);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI;
    const s = power * (0.35 + Math.random() * 0.8);
    spawnParticle(pos.x, pos.y, pos.z,
      Math.cos(a) * Math.sin(e) * s, Math.cos(e) * s + power * 0.4, Math.sin(a) * Math.sin(e) * s,
      c.r, c.g, c.b, life * (0.6 + Math.random() * 0.8), 4);
  }
}
function updateParticles(dt) {
  for (let i = 0; i < MAX_P; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -999; continue; }
    pVel[i * 3 + 1] -= pGrav[i] * dt;
    pPos[i * 3] += pVel[i * 3] * dt;
    pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
    pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    const f = Math.max(0, pLife[i] / pMax[i]);
    pCol[i * 3] *= 0.995; pCol[i * 3 + 1] *= 0.99; pCol[i * 3 + 2] *= 0.985;
    if (f < 0.25) { pCol[i * 3] *= 0.9; pCol[i * 3 + 1] *= 0.9; pCol[i * 3 + 2] *= 0.9; }
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}

/* ============================================================
   Efektler
   ============================================================ */
const projectiles = [];
const seal = createSeal();
let shake = 0;
let sealState = null;

function createSeal() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b04a, metalness: 0.9, roughness: 0.22, emissive: 0x3a2405, emissiveIntensity: 0.35 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.6, 36), gold);
  disc.castShadow = true; g.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.14, 8, 40), gold);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.32; g.add(rim);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.7), gold);
    bar.position.set(Math.cos(a) * 1.45, 0.34, Math.sin(a) * 1.45);
    bar.rotation.y = -a; g.add(bar);
  }
  const star = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.1, 8), gold);
  star.position.y = 0.36; g.add(star);
  g.visible = false;
  scene.add(g);
  return g;
}

function fireCatapults() {
  const targets = [new THREE.Vector3(-2, 0.4, 6), new THREE.Vector3(3, 0.4, 9), new THREE.Vector3(0, 0.4, 13), new THREE.Vector3(-4, 0.4, 16)];
  catapults.forEach((c, i) => {
    if (c.cooldown > 0) return;
    c.cooldown = 0.55 + Math.random() * 0.35;
    c.armPivot.rotation.x = -0.35;
    const start = c.group.position.clone().add(new THREE.Vector3(0, 4.2, 0));
    const target = targets[i % targets.length];
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a2118, emissive: 0xff5a10, emissiveIntensity: 1.8, roughness: 0.6 })
    );
    mesh.position.copy(start);
    scene.add(mesh);
    projectiles.push({ mesh, start, target, t: 0, dur: 1.15 + Math.random() * 0.2, trail: 0 });
  });
  sound.playCatapultFire();
  showFerman('MANCINIK SALDIRISI', 'Alevli gülleler barikatları dövüyor');
  director.set('event', 2.4);
  setTimeout(() => { shake = Math.max(shake, 0.55); flash(0.35); }, 1050);
}

function dropSeal(target) {
  seal.position.set(target.x, 34, target.z);
  seal.rotation.set(0, 0, 0);
  seal.scale.setScalar(1);
  seal.visible = true;
  sealState = { t: 0, phase: 'fall', target: target.clone(), landed: 0 };
  sound.playGrandSeal();
  showFerman('SADRAZAM MÜHRÜ', 'Altın mühür gökten iniyor — 60 saniye dokunulmazlık');
  director.set('seal', 4.2, target);
  setTimeout(() => { shake = Math.max(shake, 0.8); flash(0.5); }, 620);
}

function flash(strength = 0.4) {
  flashEl.style.transition = 'none';
  flashEl.style.opacity = String(strength);
  requestAnimationFrame(() => {
    flashEl.style.transition = 'opacity .5s ease-out';
    flashEl.style.opacity = '0';
  });
}

function activateMehter() {
  mehter.visible = true;
  mehter.userData.until = clock.elapsedTime + 15;
  mehter.children.forEach((g, i) => {
    g.scale.setScalar(0.01);
    g.userData.spawn = i * 0.12;
  });
  sound.playMehterDrum();
  showFerman('MEHTER COŞKUSU', 'Kös davulları gürlüyor — alay hızlanıyor');
  director.set('event', 3.2);
}

/* ============================================================
   Ferman bandı
   ============================================================ */
let fermanTimer = null;
function showFerman(title, sub) {
  fermanTitle.textContent = title;
  fermanSub.textContent = sub || '';
  ferman.classList.add('show');
  clearTimeout(fermanTimer);
  fermanTimer = setTimeout(() => ferman.classList.remove('show'), 4600);
}

/* ============================================================
   Akıllı yönetmen kamera
   ============================================================ */
const director = {
  mode: 'wide', until: 0, target: null,
  set(mode, seconds = 3, target = null) {
    this.mode = mode;
    this.until = clock.elapsedTime + seconds;
    this.target = target;
  },
  widePos: new THREE.Vector3(14, 8.5, 33.5),
  wideLook: new THREE.Vector3(0, 2.2, 8),
  portraitPos: new THREE.Vector3(16.5, 11.5, 40),
  portraitLook: new THREE.Vector3(0, 2.8, 12)
};

function updateCamera(dt, t) {
  if (director.mode !== 'wide' && t > director.until) { director.mode = 'wide'; director.target = null; }

  const widePos = state.portrait ? director.portraitPos : director.widePos;
  const wideLook = state.portrait ? director.portraitLook : director.wideLook;
  let pos = widePos, look = wideLook;

  if (director.target && director.target.position) {
    const tp = director.target.position;
    if (director.mode === 'follow') {
      pos = tmpV.set(tp.x + (state.portrait ? 4.2 : 5.2), tp.y + 3.4, tp.z + 7.2).clone();
      look = new THREE.Vector3(tp.x, tp.y + 1.4, tp.z);
    } else if (director.mode === 'hero') {
      pos = tmpV.set(tp.x + 3.6, tp.y + 2.4, tp.z - 7).clone();
      look = new THREE.Vector3(tp.x, tp.y + 1.7, tp.z);
    } else if (director.mode === 'seal') {
      pos = tmpV.set(tp.x + 7, 5.5, tp.z + 11).clone();
      look = new THREE.Vector3(tp.x, 3.2, tp.z);
    }
  }
  if (director.mode === 'event') {
    pos = state.portrait ? new THREE.Vector3(15, 10, 34) : new THREE.Vector3(17, 8, 30);
    look = new THREE.Vector3(0, 6.5, 2);
  }

  const k = 1 - Math.exp(-2.4 * dt);
  camera.position.lerp(pos, k);
  lookCurrent.lerp(look, k);

  if (shake > 0.001) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake * 0.6;
    camera.position.z += (Math.random() - 0.5) * shake * 0.5;
    shake *= Math.exp(-7 * dt);
  }
  camera.lookAt(lookCurrent);
}

/* ============================================================
   Aksiyonlar
   ============================================================ */
const ACTION_TEXT = {
  JOIN_MARCH: ['SAFA KATILDI', 'Kortejin arkasına katıldı'],
  RANK_SIPAHI: ['SİPAHİ TERFİSİ', 'Zırh kuşandı, orta safa ilerliyor'],
  RANK_SANCAKTAR: ['SANCAKTAR TERFİSİ', 'Sırtında kartal sancağı, ön safa geçiyor'],
  EVENT_MEHTER: ['MEHTER COŞKUSU', 'Kös davulları gürlüyor'],
  EVENT_CATAPULT: ['MANCINIK SALDIRISI', 'Barikatlar parçalanıyor'],
  RANK_CAVALRY: ['ATLI AKINCI', 'Zırhlı ata binip komutana katıldı'],
  EVENT_SEAL: ['SADRAZAM MÜHRÜ', 'Dokunulmazlık fermanı mühürlendi'],
  RANK_VIZIER: ['BAŞKOMUTAN', 'Saltanat tahtının yanında yerini aldı']
};
const RANK_OF = { RANK_SIPAHI: 'Sipahi', RANK_SANCAKTAR: 'Sancaktar', RANK_CAVALRY: 'Akıncı', RANK_VIZIER: 'Vezir' };

function onAction(d) {
  sound.init();
  if (!marchStarted) { sound.marching(Math.max(18, players.size)); marchStarted = true; }
  const action = d.action;
  if (!action) return;
  const rec = ensurePlayer(d);

  if (RANK_OF[action]) {
    rec.score = (rec.score || 0) + (d.diamonds || 100);
    upgradePlayer(rec, RANK_OF[action]);
    rec.boost = 2.4;
    layoutCrowd();
  } else if (action === 'JOIN_MARCH') {
    rec.score = (rec.score || 0) + 1;
    layoutCrowd();
  }

  const [title, sub] = ACTION_TEXT[action] || ['FETİH ALAYI', 'Yeni bir olay'];
  showFerman(title, `${rec.name} — ${sub}`);

  if (action === 'EVENT_MEHTER') activateMehter();
  if (action === 'EVENT_CATAPULT') fireCatapults();
  if (action === 'EVENT_SEAL') dropSeal(rec.group.position.clone().setY(0.2));
  if (action === 'RANK_VIZIER') {
    director.set('hero', 5, rec.group);
    sound.playVizierFanfare();
    rec.specialUntil = clock.elapsedTime + 6;
    rec.specialTarget = new THREE.Vector3(3.6, 0, -19.2);
    burst(rec.group.position.clone().setY(1.5), 40, 0xf0c46a, 3, 1.6);
  }
  if (action === 'RANK_CAVALRY') {
    sound.playHorseNeigh();
    director.set('follow', 3.2, rec.group);
    burst(rec.group.position.clone().setY(0.4), 22, 0xb08a5a, 2, 1.0);
  }
  if (action === 'RANK_SIPAHI' || action === 'RANK_SANCAKTAR') {
    director.set('follow', 3, rec.group);
    burst(rec.group.position.clone().setY(1.0), 16, 0xe0c070, 2, 0.9);
  }
  if (action === 'JOIN_MARCH') {
    burst(rec.group.position.clone().setY(0.4), 10, 0xc9a227, 1.2, 0.8);
  }
}

/* ============================================================
   Çizim döngüsü
   ============================================================ */
let lastT = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // Meşale alevleri
  for (const f of flameSprites) {
    const s = 1 + Math.sin(t * 9 + f.seed) * 0.16 + Math.sin(t * 21 + f.seed * 2) * 0.08;
    f.sprite.scale.set(f.base * s * 0.85, f.base * 1.35 * s, 1);
    f.sprite.material.opacity = 0.85 + Math.sin(t * 13 + f.seed) * 0.12;
  }
  for (const torch of torches) {
    if (!torch.light) continue;
    torch.light.intensity = torch.base + Math.sin(t * 11 + torch.z) * 4 + Math.sin(t * 27) * 2;
  }
  // Kıvılcımlar
  if (Math.random() < 0.6) {
    const tr = torches[Math.floor(Math.random() * torches.length)];
    spawnParticle(tr.x + (Math.random() - 0.5) * 0.4, 3.6, tr.z + (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3,
      1, 0.55, 0.15, 1.4, 0.4);
  }

  // Kalabalık
  for (const rec of players.values()) {
    const g = rec.group;
    if (!g) continue;
    if (rec.specialUntil && t < rec.specialUntil) {
      g.position.lerp(rec.specialTarget, 1 - Math.exp(-2.2 * dt));
    } else {
      if (rec.specialUntil && t >= rec.specialUntil) { rec.specialUntil = 0; layoutCrowd(); }
      const k = rec.boost > 0 ? 5.5 : 2.0;
      g.position.lerp(rec.target, 1 - Math.exp(-k * dt));
      rec.boost = Math.max(0, (rec.boost || 0) - dt);
    }
    const parts = g.userData.parts;
    const phase = t * 6 + g.userData.phase;
    const dist = g.position.distanceToSquared(rec.target);
    const moving = dist > 0.04 || rec.boost > 0;
    const swing = Math.sin(phase) * (moving ? 0.95 : 0.32);
    if (parts.legL) parts.legL.rotation.x = parts.legL.visible === false ? -1.15 : swing;
    if (parts.legR) parts.legR.rotation.x = parts.legR.visible === false ? -1.15 : -swing;
    if (parts.armL) parts.armL.rotation.x = -swing * 0.7;
    if (parts.armR) parts.armR.rotation.x = swing * 0.7;
    if (parts.body) parts.body.position.y = (g.userData.tier >= 3 ? 0.92 : 0) + Math.abs(Math.sin(phase)) * (moving ? 0.05 : 0.02);
    if (g.userData.horse) {
      g.userData.horse.position.y = Math.abs(Math.sin(phase * 1.2)) * 0.06;
      const legs = g.userData.horse.userData.legs;
      if (legs) {
        legs.forEach((l, i) => { l.rotation.x = Math.sin(phase * 1.2 + i * 1.6) * 0.4; });
      }
    }
    if (parts.flag) {
      parts.flag.rotation.y = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
      parts.flag.position.y = 2.58 + Math.sin(t * 3 + g.userData.phase) * 0.03;
    }
    if (parts.avatarPivot) {
      parts.avatarPivot.rotation.y = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
    }
    if (parts.cape) parts.cape.rotation.x = -0.06 + Math.sin(t * 3 + g.userData.phase) * 0.05;
  }

  // Mehter
  if (mehter.visible) {
    mehter.children.forEach((g, i) => {
      if (g.userData.spawn !== undefined && g.userData.spawn > 0) {
        g.userData.spawn -= dt;
        g.scale.setScalar(Math.min(1, 1 - g.userData.spawn));
      }
      const s = Math.sin(t * 8 + g.userData.phase) * 0.55;
      g.userData.sticks[0].rotation.x = s;
      g.userData.sticks[1].rotation.x = -s;
      g.position.y = Math.abs(Math.sin(t * 4 + g.userData.phase)) * 0.03;
    });
    if (t > mehter.userData.until) mehter.visible = false;
  }

  // Mancınık kolları
  for (const c of catapults) {
    c.cooldown = Math.max(0, c.cooldown - dt);
    if (c.cooldown > 0) {
      c.armPivot.rotation.x += (1.05 - c.armPivot.rotation.x) * (1 - Math.exp(-8 * dt));
    }
  }

  // Gülleler
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.t += dt / p.dur;
    const tt = Math.min(1, p.t);
    p.mesh.position.lerpVectors(p.start, p.target, tt);
    p.mesh.position.y += Math.sin(Math.PI * tt) * 9;
    p.trail -= dt;
    if (p.trail <= 0) {
      p.trail = 0.03;
      spawnParticle(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z,
        (Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.4, 1, 0.42, 0.08, 0.8, 0.2);
    }
    if (p.t >= 1) {
      burst(p.target, 60, 0xff7a20, 7, 1.6);
      burst(p.target, 25, 0xffd27a, 4, 1.1);
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
      shake = Math.max(shake, 0.42);
      flash(0.25);
    }
  }

  // Mühür
  if (sealState) {
    sealState.t += dt;
    if (sealState.phase === 'fall') {
      const k = Math.min(1, sealState.t / 0.65);
      const eased = k * k;
      seal.position.y = 34 - eased * 33;
      if (k >= 1) {
        sealState.phase = 'landed';
        sealState.landed = t;
        burst(seal.position, 70, 0xd8ad5a, 6, 1.6);
        burst(seal.position, 30, 0x8a7a5d, 4, 1.2);
        shake = Math.max(shake, 0.9);
        flash(0.55);
      }
    } else {
      seal.position.y = 1 + Math.sin(t * 1.4) * 0.05;
      if (t - sealState.landed > 4) {
        sealState = null;
        seal.visible = false;
      }
    }
  }

  // Partiküller
  updateParticles(dt);

  // Kamera + render
  updateCamera(dt, t);
  renderer.render(scene, camera);
}

/* ============================================================
   Ayarlar / oran / socket
   ============================================================ */
function applyAspect(aspect) {
  state.portrait = aspect === '9:16';
  document.body.classList.toggle('portrait', state.portrait);
  camera.fov = state.portrait ? 50 : 40;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  layoutCrowd();
}

function applySettings(s) {
  if (!s) return;
  if (typeof s.volume === 'number') sound.setVolume(s.volume / 100);
  if (typeof s.muted === 'boolean') sound.mute(s.muted);
  if (typeof s.safeZones === 'boolean') { state.safeZones = s.safeZones; safeEl.classList.toggle('on', s.safeZones); }
  if (s.aspect) applyAspect(s.aspect);
}

window.addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

window.addEventListener('keydown', e => {
  if (e.key === 'F9') {
    const next = state.portrait ? '16:9' : '9:16';
    applyAspect(next);
    socket.emit('aspect', next);
  }
});

document.addEventListener('pointerdown', () => {
  sound.init();
  if (!marchStarted) { sound.marching(Math.max(18, players.size)); marchStarted = true; }
}, { once: true });

socket.on('settings', applySettings);
socket.on('gameAction', onAction);
socket.on('leaderboard', list => {
  if (!Array.isArray(list)) return;
  for (const p of list) {
    const rec = ensurePlayer({ uniqueId: p.uniqueId, nickname: p.nickname, avatar: p.avatar });
    if (p.rank && p.rank !== rec.rank) { upgradePlayer(rec, p.rank); }
    rec.score = p.score || 0;
  }
  layoutCrowd();
});
socket.on('resetTurn', () => {
  for (const rec of players.values()) if (!rec.id.startsWith('demo-')) { scene.remove(rec.group); players.delete(rec.id); }
  if (players.size === 0) addDemoCrowd();
  layoutCrowd();
  showFerman('YENİ TUR', 'Alay yeniden düzenlendi');
});
socket.on('status', s => { if (s?.state === 'Bağlandı') showFerman('YAYIN BAĞLANDI', s.message); });

/* ============================================================
   Başlat
   ============================================================ */
buildWorld();
addDemoCrowd();
applyAspect('16:9');
animate();

fetch('/api/state').then(r => r.json()).then(d => {
  applySettings(d.settings);
  if (Array.isArray(d.leaderboard) && d.leaderboard.length) {
    // Demo kadrosunu gerçek oyuncularla değiştir
    for (const rec of [...players.values()]) { scene.remove(rec.group); players.delete(rec.id); }
    d.leaderboard.forEach(p => {
      const rec = ensurePlayer({ uniqueId: p.uniqueId, nickname: p.nickname, avatar: p.avatar });
      rec.score = p.score || 0;
      if (p.rank && p.rank !== rec.rank) upgradePlayer(rec, p.rank);
    });
    layoutCrowd();
  }
}).catch(() => {});
