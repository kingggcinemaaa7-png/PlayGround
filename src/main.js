// ============================================================================
// Kapadokya Beat Vadisi — 3D Desktop Edition
// Professör 3D render motoru + GLB/FBX karakter boru hattı + oyun sistemleri
// Spec: Kapadokya_Beat_Vadisi_Geliştirici_Teslim.md (§5-§9)
// ============================================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildWorld } from './world.js';
import { ParticleSystem } from './particles.js';
import { AudioBus } from './audio.js';
import { loadAsset, finalizeAsset, collectCredits, fitToHeight } from './assets.js';
import { TourCamera } from './camera.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CrowdPack } from './crowd-pack.js';
import { config, giftmap, TIERS, tierForScore, giftByKey, CooldownManager, StreakTracker, LocalShowRunner } from './state.js';

// ---------------------------------------------------------------------------
// Durum (spec §6-§8)
// ---------------------------------------------------------------------------
const G = {
  score: 0,
  hype: 0,
  comboCount: 0,
  users: new Map(), // id -> {id,name,score,tier}
  play: true,
  music: true,
  ai: false,
 obsMode: false,
  elapsed: 0,
  dropFlash: 0,
  sceneShake: 0,
  eventEndsAt: 0,
  trackEvent: null,
  shoot: 0,
  fps: 0,
  fpsAccum: 0,
  fpsFrames: 0
};
const cooldowns = new CooldownManager();
const streak = new StreakTracker(config.streak.windowMs);
const runner = new LocalShowRunner();
const audio = new AudioBus(config.audio);

// ---------------------------------------------------------------------------
// Render / sahne — kalite seviyesi otomatik algılama
// (SwiftShader / yazılım render'de gölge + ışık yükü düşürülür)
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

// yazılım render tespiti (agents.md: SwiftShader = CPU yazılım render)
let gpuName = 'unknown';
try {
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  gpuName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
} catch { /* yoksay */ }
const SOFTWARE = /swiftshader|software|llvmpipe|basic render|mesa offscreen/i.test(gpuName);
const q = {
  low: SOFTWARE,
  label: SOFTWARE ? `yazılım render (${gpuName.slice(0, 40)})` : gpuName.slice(0, 40),
  shadows: !SOFTWARE,
  particles: SOFTWARE ? 900 : 4000,
  pixelRatio: SOFTWARE ? 1 : Math.min(devicePixelRatio, 2)
};

if (SOFTWARE) {
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.0));
  renderer.setSize(innerWidth, innerHeight);
}

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x120a24, 0.0055);

// ---------------------------------------------------------------------------
// Dünya + parçacıklar
// ---------------------------------------------------------------------------
const W = buildWorld(scene, q);
const particles = new ParticleSystem(scene, q.particles);

// Post-processing: gerçekçi bloom (ışık/laser parlaması) — yazılım render'de kapalı
let composer = null;
if (!q.low) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.62, 0.85, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.setSize(innerWidth, innerHeight);
}

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.5, 1600);
camera.position.set(0, 3.2, 26);

// ---------------------------------------------------------------------------
// Işıklandırma
// ---------------------------------------------------------------------------
// gün batımı atmosferi: gökyüzü morumsu, zeminden sıcak yansıma
scene.add(new THREE.HemisphereLight(0x6a58b8, 0xb06030, 1.5));
const ambient = new THREE.AmbientLight(0x3a2a58, 0.9);
scene.add(ambient);
// ana ay ışığı (soğuk, kısa gölge)
const key = new THREE.DirectionalLight(0xd9c9ff, 1.1);
key.position.set(-18, 26, -14);
// gün batımı arka ışığı: ufuktan sıcak, kayaların arkasını aydınlatır
const sunFill = new THREE.DirectionalLight(0xff9440, 3.4);
sunFill.position.set(-30, 6, -190);
scene.add(sunFill);
// sahneyi çevreleyen sıcak rim
const rim = new THREE.DirectionalLight(0xffb066, 0.9);
rim.position.set(0, 6, 120);
scene.add(rim);
if (q.shadows) {
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 90;
  key.shadow.camera.left = -30; key.shadow.camera.right = 30;
  key.shadow.camera.top = 30; key.shadow.camera.bottom = -30;
  key.shadow.bias = -0.0006;
}
scene.add(key);

// ---------------------------------------------------------------------------
// GLB karakterler (lisans: CC Attribution)
// ---------------------------------------------------------------------------
const tour = new TourCamera(camera, canvas);
const creditsEl = document.getElementById('creditNames');
const allCredits = [];
const characters = { dj: null, duel: [], balloons: [] };
const dancerPack = new CrowdPack(scene, { count: q.low ? 26 : 100 });
const mixer = new THREE.AnimationMixer(scene);
let djModel = null;
let idleAction = null;

async function loadModels() {
  const base = import.meta.env.BASE_URL || './';
  const jobs = [
    { path: 'models/dj.glb', where: 'dj' },
    { path: 'models/duellocu.glb', where: 'duellocu' },
    { path: 'models/balloon.glb', where: 'balloon' }
  ];
  const credits = [];
  await Promise.all(jobs.map(async (j) => {
    try {
      const { group, animations, meta } = await loadAsset(base + j.path);
      if (meta) credits.push(`"${meta.name}" by ${meta.author} (${meta.license})`);
      finalizeModel(j.where, group, animations, meta);
    } catch (e) {
      console.warn('[model] yüklenemedi', j.path, e);
    }
  }));
  allCredits.push(...credits);
  creditsEl.textContent = allCredits.join(' · ') || 'modeller çalışma anında üretildi';
  document.getElementById('loader').classList.add('hidden');
  setTimeout(() => { const l = document.getElementById('loader'); if (l) l.style.display = 'none'; }, 500);
}

function finalizeModel(where, root, animations = [], meta = null) {
  // PBR'ya yükseltme (unlit/Phong/FBX) — assets.js hattı
  finalizeAsset(root, meta);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  if (where === 'dj') {
    // DJ kabininde: yükseklik normalize (~2.9 m, sahne varlığı), tezgahın üstünde
    root.position.set(0, 0, 0);
    root.rotation.y = Math.PI;
    fitToHeight(root, 2.9);
    root.position.x = 0; root.position.z = -0.4;
    root.position.y = 7.85; // tezgah tablası üstü
    W.stage.add(root);
    djModel = root;
    if (animations.length) {
      // dans döngüsünü seç (GLB klipleri)
      const prefer = ['Idle', 'Dance', 'metarig|Idle', 'Armature|Armature|Armature|Refile Idle', 'metarigAction'];
      let clip = null;
      for (const p of prefer) clip = animations.find((a) => a.name.includes(p)) || clip;
      if (!clip) clip = animations[0];
      const act = mixer.clipAction(clip);
      act.reset(); act.clampWhenFinished = false;
      act.setLoop(THREE.LoopRepeat);
      act.play();
      idleAction = act;
    }
    // Kliplerin eşlik etmediği durumlar için prosedürel dans döngüsü
    if (!idleAction) animateFallback(root, 0);
  } else if (where === 'duellocu') {
    // Dans düellosu için 2 kopya (solda/sağda)
    for (const side of [-1, 1]) {
      const inst = skeletonClone(root); // kendi iskeletiyle bağımsız animasyon
      fitToHeight(inst, 2.2);
      inst.position.x = side * 5.5;
      inst.position.y = 4.8;
      inst.position.z = 1.5;
      inst.rotation.y = -side * 0.5 + (side < 0 ? 0.6 : -0.6);
      inst.visible = false;
      W.stage.add(inst);
      characters.duel.push(inst);
      if (animations.length) {
        const clip = animations.find((a) => /Death|Jump|Run|Refile/i.test(a.name)) || animations[0];
        const m = new THREE.AnimationMixer(inst);
        const a2 = m.clipAction(clip);
        a2.setLoop(THREE.LoopRepeat); a2.play();
        inst.userData.mixer = m;
      }
    }
  } else if (where === 'balloon') {
    // sıcak hava balonu filosu — iç aydınlatmalı zarif (gece festivali)
    for (let i = 0; i < 3; i++) {
      const b = root.clone(true);
      fitToHeight(b, 11 + Math.random() * 3); // gerçek balon ölçeği ~12 m
      b.position.set((Math.random() - 0.5) * 46, 12 + Math.random() * 12, -14 - Math.random() * 30);
      b.rotation.y = Math.random() * Math.PI * 2;
      b.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          if (o.material) {
            const single = !Array.isArray(o.material);
            const mats = single ? [o.material] : o.material;
            const out = mats.map((m) => {
              const nm = m.clone();
              nm.side = THREE.DoubleSide;
              nm.emissive = new THREE.Color(0xffb35c);
              nm.emissiveIntensity = 1.15;
              nm.emissiveMap = nm.map || null;
              nm.roughness = 0.85;
              nm.metalness = 0.0;
              return nm;
            });
            o.material = single ? out[0] : out;
          }
        }
      });
      // zarfın içindeki sıcak ışığı emissive ile karşıla (yazılım render'de ek ışık yok)
      b.userData.isBalloon = true;
      scene.add(b);
      characters.balloons.push({ obj: b, phase: Math.random() * 6.28, speed: 0.06 + Math.random() * 0.08, y: b.position.y });
    }
  }
}

function animateFallback(model, seed) {
  model.userData.fallback = true;
  model.userData.phase = seed;
  model.userData.basePos = model.position.clone();
}

// ---------------------------------------------------------------------------
// Kamera kontrolleri
// ---------------------------------------------------------------------------
const camState = { yaw: 0, pitch: 0, dist: 11.5, dragging: false, lx: 0, ly: 0, keys: new Set(), vec: new THREE.Vector3() };
canvas.addEventListener('pointerdown', (e) => { camState.dragging = true; camState.lx = e.clientX; camState.ly = e.clientY; });
addEventListener('pointerup', () => { camState.dragging = false; });
addEventListener('pointermove', (e) => {
  if (!camState.dragging) return;
  camState.yaw -= (e.clientX - camState.lx) * 0.004;
  camState.pitch += (e.clientY - camState.ly) * 0.002;
  camState.pitch = THREE.MathUtils.clamp(camState.pitch, -0.35, 1.1);
  camState.lx = e.clientX; camState.ly = e.clientY;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  camState.dist = THREE.MathUtils.clamp(camState.dist + e.deltaY * 0.01, 3.5, 34);
}, { passive: false });

// ---------------------------------------------------------------------------
// Etki / mekanikler
// ---------------------------------------------------------------------------
function flash(msg, ms = 2200) {
  const b = document.getElementById('banner');
  b.textContent = msg;
  b.classList.toggle('show');
  clearTimeout(b._t);
  if (ms > 0) b._t = setTimeout(() => b.classList.remove('show'), ms);
}
function toast(text) {
  const c = document.getElementById('toasts');
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = text;
  c.appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; d.style.transition = 'opacity .4s'; }, 1800);
  setTimeout(() => d.remove(), 2300);
  while (c.children.length > 6) c.firstChild.remove();
}
function speak(name, line) {
  document.getElementById('djText').textContent = line;
  if (G.music) audio.duckSpeak(name + ' ' + line);
}

function applyGift(user, gift, effect) {
  const mult = streak.comboMultiplier(streak.count);
  const gained = Math.round(effect.score * mult);
  G.score += gained;
  user.score += gained;
  // hype
  G.hype = Math.min(config.hypeBar.max, G.hype + effect.hypeValue);
  // combo
  streak.push(gift.tiktokGiftId);
  G.comboCount = streak.count;
  const label = streak.comboLabel(streak.count);
  document.getElementById('comboX').textContent = label;
  // ses
  audio.sfx(effect.sfx || 'gift_small');
  // görsel patlama
  const origin = { x: (Math.random() - 0.5) * 8, y: 2.6 + Math.random() * 1.6, z: (Math.random() - 0.5) * 4 + 1 };
  particles.burst('confetti', origin, { n: 60, speed: 7 });
  if (streak.count >= 10) {
    particles.burst('fire', { x: 0, y: 3.2, z: 0.8 }, { n: 200, speed: 6, spread: 6 });
    particles.burst('rave', { x: 0, y: 3.4, z: 0.8 }, { n: 120, spread: 5 });
    triggerScene('drop', { silent: true });
    flash('COMBO ×10!', 1800);
  } else if (streak.count >= 5) {
    particles.burst('stars', { x: 0, y: 3.2, z: 0.8 }, { n: 160, speed: 5, spread: 5 });
    flash('COMBO ×5!', 1500);
  } else if (streak.count >= 3) {
    particles.burst('stars', { x: 0, y: 3.2, z: 0.8 }, { n: 90, speed: 4, spread: 4 });
    flash('COMBO ×3!', 1200);
  }

  // sahne tetikleyici
  if (effect.sceneTrigger) triggerScene(effect.sceneTrigger, { user, gift });
  // tier kontrolü
  const before = tierForScore(user.score - gained);
  const after = tierForScore(user.score);
  if (after !== before && after.threshold > before.threshold) {
    promoteUser(user, before, after);
  }
  renderState();
}

function promoteUser(user, from, to) {
  flash(`🌟 ${user.name} → ${to.name}!`, 2600);
  toast(`${user.name} yükseldi: ${from.name} → ${to.name}`);
  audio.sfx('gift_large');
  particles.burst('confetti', { x: 0, y: 4, z: 2 }, { n: 220, speed: 10, spread: 4 });
  speak('DJ Kapadokya:', `${user.name} ${to.label} seviyesine yükseldi! Vadi coşku dolu!`);
  renderState();
}

// Görsel olaylar (spec §9 event-catalog)
function triggerScene(id, opts = {}) {
  if (!cooldowns.canTrigger(id)) return;
  cooldowns.trigger(id, config.cooldown.eventCooldownMs[id] || 20000);
  G.eventEndsAt = performance.now() + (id === 'safak_finali' ? 9000 : 7000);
  G.trackEvent = id;
  const tgt = { x: 0, y: 3.4, z: 1.2 };
  if (id === 'drop') {
    flash('DROP!', 2000);
    audio.sfx('drop');
    G.sceneShake = 1.0;
    G.dropFlash = 1.4;
    particles.burst('confetti', tgt, { n: 500, speed: 16, spread: 8, up: 6 });
    particles.burst('fire', tgt, { n: 260, speed: 7, spread: 8 });
    speak('DJ Kapadokya:', 'Hazır ol. 4, 3, 2, 1. DROP!');
  } else if (id === 'yildiz_yagmuru') {
    flash('YILDIZ YAĞMURU ☄️', 2400);
    for (let i = 0; i < 5; i++) {
      setTimeout(() => particles.burst('stars', { x: (Math.random() - 0.5) * 24, y: 16 + Math.random() * 6, z: (Math.random() - 0.5) * 18 - 4 }, { n: 120, speed: 3, up: -1 }), i * 220);
    }
    speak('DJ Kapadokya:', 'Gökyüzü yıldızları döküyor! Kameranızı açın!');
  } else if (id === 'duello') {
    characters.duel.forEach((d) => { d.visible = true; });
    G.eventEndsAt = performance.now() + 9000;
    flash('DANS DÜELLOSU 🕺💃', 2400);
    flash('', 0);
    document.getElementById('banner').classList.add('show');
    speak('DJ Kapadokya:', 'İki dansçı sahnede! Kim kazanacak?');
  } else if (id === 'buyuk_isik_toreni') {
    flash('BÜYÜK IŞIK TÖRENİ ✨', 3400);
    particles.burst('rave', tgt, { n: 700, speed: 12, spread: 10 });
    particles.burst('stars', tgt, { n: 400, speed: 6, spread: 12 });
    G.dropFlash = 1.0;
    speak('DJ Kapadokya:', 'Portal açılıyor! Işık töreni başladı!');
  } else if (id === 'safak_finali') {
    flash('ŞAFAK FİNALİ 🌅', 5000);
    // gece→şafak geçişi
    W.skyMat.uniforms.uDawn = { value: 0 };
    speak('DJ Kapadokya:', 'Şafak vakti! Bu gece burada efsane oldunuz!');
    particles.burst('confetti', tgt, { n: 900, speed: 14, spread: 14, up: 8 });
  }
  renderEventButtons();
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function renderTiers() {
  const c = document.getElementById('tiers');
  c.innerHTML = '';
  const counts = new Map();
  for (const u of G.users.values()) {
    const t = tierForScore(u.score);
    counts.set(t.id, (counts.get(t.id) || 0) + 1);
  }
  for (const t of TIERS) {
    const d = document.createElement('div');
    d.className = 'tier';
    d.dataset.tier = t.id;
    d.innerHTML = `<span class="dot" style="background:${t.color};color:${t.color}"></span>
      <span class="nm">${t.id}. ${t.name} <small style="color:var(--dim)">${t.label}</small></span>
      <span class="ct" data-count="${t.id}">${counts.get(t.id) || 0}</span>`;
    c.appendChild(d);
  }
}
function renderGiftButtons() {
  const c = document.getElementById('gifts');
  c.innerHTML = '';
  for (const m of giftmap.mappings) {
    const b = document.createElement('button');
    b.className = 'giftBtn';
    b.dataset.gift = m.tiktokGiftId;
    b.innerHTML = `<b>${m.tiktokGiftName}</b><span>${m.gameEffect.hypeValue} hype · ${m.gameEffect.score} puan</span>`;
    b.onclick = () => sendGift(m);
    c.appendChild(b);
  }
}
function renderEventButtons() {
  const c = document.getElementById('events');
  if (c.childElementCount === 0) {
    const evts = [
      { id: 'drop', label: 'DROP' },
      { id: 'yildiz_yagmuru', label: '☄️ Yıldız' },
      { id: 'duello', label: '🕺 Düello' },
      { id: 'buyuk_isik_toreni', label: '✨ Tören' },
      { id: 'safak_finali', label: '🌅 Şafak' }
    ];
    for (const e of evts) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.dataset.event = e.id;
      b.textContent = e.label;
      b.onclick = () => triggerScene(e.id);
      c.appendChild(b);
    }
  }
  for (const b of c.children) {
    const ok = cooldowns.canTrigger(b.dataset.event);
    b.style.opacity = ok ? '1' : '0.35';
    b.style.borderColor = ok ? 'rgba(255,255,255,0.12)' : 'rgba(255,80,80,0.5)';
  }
}
function renderLeaders() {
  const c = document.getElementById('leaders');
  const sorted = [...G.users.values()].sort((a, b2) => b2.score - a.score).slice(0, 6);
  if (!sorted.length) {
    c.innerHTML = '<div style="color:var(--dim);font-size:12px">Henüz skor yok — hediye gönder!</div>';
    return;
  }
  c.innerHTML = sorted.map((u, i) => {
    const t = tierForScore(u.score);
    return `<div class="tier${i === 0 ? ' hot' : ''}">
      <span class="dot" style="background:${t.color};color:${t.color}"></span>
      <span class="nm">${i + 1}. ${u.name} <small style="color:var(--dim)">T${t.id}</small></span>
      <span class="ct">${u.score.toLocaleString('tr-TR')}</span></div>`;
  }).join('');
}
function renderState() {
  G.hype = Math.min(config.hypeBar.max, G.hype);
  document.getElementById('hypeVal').textContent = Math.floor(G.hype);
  document.getElementById('hypeFill').style.width = G.hype + '%';
  const ready = G.hype >= config.hypeBar.dropThreshold && cooldowns.canTrigger('drop');
  document.getElementById('dropState').textContent = ready ? 'DROP HAZIR!' : 'DROP hazır değil';
  document.getElementById('dropState').style.color = ready ? '#ffd700' : '';
  document.getElementById('scoreVal').textContent = G.score.toLocaleString('tr-TR');
  renderTiers();
  renderLeaders();
}

// ---------------------------------------------------------------------------
// Girdi & etkileşim
// ---------------------------------------------------------------------------
let fakeId = 1;
function ensureUser(name) {
  const id = 'me';
  if (!G.users.has(id)) G.users.set(id, { id, name: 'Sen', score: 0 });
  return G.users.get(id);
}
function sendGift(m) {
  const effect = m.gameEffect;
  applyGift(ensureUser('Sen'), m, effect);
  toast(`${m.tiktokGiftName} gönderdi! +${effect.hypeValue} hype`);
}

const SIM_NAMES = ['Ayşe', 'Mehmet', 'Zeynep', 'Emre', 'Elif', 'Can', 'Selin', 'Burak', 'Deniz', 'Kerem'];
let simTimer = null;
function startSim() {
  if (simTimer) return;
  const tick = () => {
    const names = SIM_NAMES;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const name = names[Math.floor(Math.random() * names.length)];
      const uid = 'u' + name;
      if (!G.users.has(uid)) G.users.set(uid, { id: uid, name, score: 0 });
      const user = G.users.get(uid);
      const m = giftmap.mappings[Math.floor(Math.random() * giftmap.mappings.length)];
      const mult = Math.random() < 0.18 ? 2 : 1;
      applyGift(user, m, { ...m.gameEffect, score: m.gameEffect.score * mult, hypeValue: m.gameEffect.hypeValue });
      if (Math.random() < 0.28) toast(`${name}: ${m.tiktokGiftName} 🎁`);
    }
    if (G.hype >= config.hypeBar.dropThreshold && cooldowns.canTrigger('drop')) {
      triggerScene('drop');
    }
    simTimer = setTimeout(tick, 700 + Math.random() * 1400);
  };
  simTimer = setTimeout(tick, 400);
}
function stopSim() { if (simTimer) clearTimeout(simTimer); simTimer = null; }

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  camState.keys.add(k);
  if (k === ' ') { e.preventDefault(); triggerScene('drop'); }
  if (k === 'd') triggerScene('duello');
  if (k === 'c') cycleCam();
  if (k === 'g') tour.lookToSky(clock.elapsedTime);
  if (k === 'r') tour.toStage();
  const m = giftByKey(k);
  if (m) { sendGift(m); return; }
  const tierIdx = '1234567'.indexOf(k);
  if (tierIdx >= 0 && !m) {
    const t = TIERS[tierIdx];
    if (t) triggerScene(tierToScene(t.id));
  }
});
addEventListener('keyup', (e) => camState.keys.delete(e.key.toLowerCase()));
function tierToScene(id) {
  return ['drop', 'yildiz_yagmuru', 'yildiz_yagmuru', 'yildiz_yagmuru', 'buyuk_isik_toreni', 'buyuk_isik_toreni', 'safak_finali'][id - 1];
}

const CAM_LABEL = { orbit: 'Yörünge', cine: 'Sinematik', free: 'Serbest (360°)' };
function cycleCam() { const m = tour.cycle(); document.getElementById('camLabel').textContent = CAM_LABEL[m] || m; }

// butonlar
document.getElementById('btnSim').onclick = (e) => { G.play = !G.play; e.target.textContent = G.play ? '⏸ Simülasyon' : '▶ Simülasyon'; e.target.classList.toggle('on', !G.play); G.play ? startSim() : stopSim(); };
document.getElementById('btnMusic').onclick = () => { if (!G.music) { audio.start(); G.music = true; } else G.music = audio.toggleMute(); };
document.getElementById('btnAI').onclick = (e) => { G.ai = !G.ai; e.target.classList.toggle('on', G.ai); speak('DJ Kapadokya:', G.ai ? 'AI show-runner devrede. Şovu bana bırakın!' : 'AI show-runner durduruldu.'); };
document.getElementById('btnCam').onclick = () => cycleCam();
document.getElementById('btnSky').onclick = () => { const m = tour.mode; if (m !== 'free') tour.setMode('free'); tour.lookToSky(clock.elapsedTime); document.getElementById('camLabel').textContent = CAM_LABEL.free; };
document.getElementById('btnOBS').onclick = (e) => { G.obsMode = !G.obsMode; document.body.classList.toggle('obs', G.obsMode); e.target.classList.toggle('on', G.obsMode); };
document.getElementById('btnFull').onclick = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); };

// ---------------------------------------------------------------------------
// Döngü
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let aiTimer = 0;

function updateCharacter(m, t) {
  if (!m) return;
  if (m.userData.mixer) {
    m.userData.mixer.update(Math.min(clock.getDelta(), 0.05));
    // beat'e uyan ince sallanma (karakter sınırsız)
    m.rotation.z = Math.sin(t * 3.0 + m.userData.phase || 0) * 0.03;
  } else if (m.userData.fallback) {
    const base = m.userData.basePos;
    const p = t * 2.2 + m.userData.phase;
    m.position.y = base.y + Math.abs(Math.sin(p)) * 0.28;
    m.rotation.z = Math.sin(p * 0.5) * 0.09;
    m.rotation.y = Math.PI + Math.sin(p * 0.35) * 0.35;
  }
}

let auroraIntensity = 1;
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.066);
  const t = clock.elapsedTime;
  G.elapsed += dt;

  // fps
  G.fpsFrames++; G.fpsAccum += dt;
  if (G.fpsAccum > 0.5) { G.fps = Math.round(G.fpsFrames / G.fpsAccum); document.getElementById('fps').textContent = G.fps + ' fps'; G.fpsAccum = 0; G.fpsFrames = 0; }
  document.getElementById('gpuInfo').textContent = q.label;
  adaptiveQuality(dt);

  // hype decay (spec §6.1)
  G.hype = Math.max(0, G.hype - config.hypeBar.decayRate * (dt * 1000 / config.hypeBar.decayIntervalMs));
  if (G.hype >= config.hypeBar.dropThreshold && cooldowns.canTrigger('drop') && Math.random() < dt * 0.25) {
    triggerScene('drop');
  }
  renderState();

  // gökyüzü
  W.skyMat.uniforms.uTime.value = t;
  if (W.skyMat.uniforms.uDawn) {
    const target = G.trackEvent === 'safak_finali' ? 1 : 0;
    W.skyMat.uniforms.uDawn.value += (target - W.skyMat.uniforms.uDawn.value) * dt * 0.8;
  }

  // ışık animasyonları
  const beat = Math.abs(Math.sin(t * 2.0));
  const beatPhase = t * 2.0;
  W.spotLights.forEach((s, i) => {
    const c = new THREE.Color().setHSL((t * 0.08 + s.hue) % 1, 0.85, 0.55);
    s.light.color.copy(c);
    s.light.intensity = 16 + beat * 34;
    s.led.material.emissive.copy(c);
    s.led.material.emissiveIntensity = 1.5 + beat * 3;
    s.light.target.position.x = s.baseX * Math.sin(t * 0.5 + s.phase) * 0.6;
  });
  if (W.ledTex?.userData?.update) W.ledTex.userData.update(t, 0.55 + beat * 0.45);

  W.stageSpot.intensity = 18 + beat * 14;
  if (W.stageFill) W.stageFill.intensity = 900 + beat * 3200;
  W.turntables.forEach((tp) => { tp.rotation.y += dt * (G.music ? 26 : 0.4); });

  // kalabalık: yukarı-aşağı + telefonlar
  const cd = W.crowdData;
  for (let i = 0; i < cd.length; i++) {
    const c = cd[i];
    const p = t * c.speed + c.phase;
    const h = Math.abs(Math.sin(p)) * (0.12 + (1 - W.crowdData.length / 200) * 0.1) * (G.play ? 1 : 0.3);
    W.dummy.position.set(c.x, h, c.z);
    W.dummy.rotation.set(0, p * 0.4, 0);
    W.dummy.scale.setScalar(1);
    W.dummy.updateMatrix();
    W.crowd.setMatrixAt(i, W.dummy.matrix);
    // telefonlar: kalabalık üstünde parlıyor
    W.dummy.position.set(c.x, h + 1.1, c.z);
    W.dummy.rotation.set(0, p * 0.4, 0);
    W.dummy.scale.setScalar(0.9);
    W.dummy.updateMatrix();
    W.phones.setMatrixAt(i, W.dummy.matrix);
  }
  W.crowd.instanceMatrix.needsUpdate = true;
  W.phones.instanceMatrix.needsUpdate = true;

  // karakterler
  updateCharacter(djModel, t);
  if (dancerPack.ready) dancerPack.update(dt, beatPhase);
  characters.duel.forEach((m, i) => { if (m.visible) updateCharacter(m, t + i); });
  if (characters.duel.some((m) => m.visible) && G.eventEndsAt && t > G.eventEndsAt / 1000) {
    characters.duel.forEach((m) => (m.visible = false));
  }

  // balonlar
  characters.balloons.forEach((b) => {
    b.obj.position.y = b.y + Math.sin(t * 0.4 + b.phase) * 1.6;
    b.obj.rotation.y += b.speed * dt;
  });

  // parçacıklar
  particles.update(dt);

  // DROP flash + kamera sallanması
  if (G.dropFlash > 0) {
    G.dropFlash = Math.max(0, G.dropFlash - dt * 0.8);
    const f = G.dropFlash * G.dropFlash;
    renderer.toneMappingExposure = 1.12 + f * 0.9;
    ambient.intensity = 0.6 + f * 1.6;
    if (W.stageFill) W.stageFill.intensity = 900 + f * 9000;
  } else {
    renderer.toneMappingExposure = 1.12;
    ambient.intensity = 0.6;
  }
  if (G.sceneShake > 0) {
    G.sceneShake = Math.max(0, G.sceneShake - dt * 1.6);
    const s = G.sceneShake * G.sceneShake * 0.4;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
  }

  // yeni kamera sistemi (360° serbest bakış + yörünge + sinematik)
  tour.update(dt, t);

  // AI runner
  if (G.ai) {
    aiTimer += dt;
    if (aiTimer > config.aiRunner.tickIntervalMs / 1000 * 0.4) {
      aiTimer = 0;
      const pick = runner.pick(G.hype, cooldowns);
      if (pick.eventId && pick.eventId !== 'announce') triggerScene(pick.eventId);
      speak('DJ Kapadokya:', pick.text);
    }
  }

  if (composer) composer.render(dt);
  else renderer.render(scene, camera);
}

// WebGL bağlam kaybı/kurtarma (yazılım render'de bellek baskısı)
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  document.getElementById('fps').textContent = 'bağlam kayboldu — kurtarılıyor';
});
canvas.addEventListener('webglcontextrestored', () => {
  document.getElementById('fps').textContent = 'bağlam geri geldi';
});

addEventListener('resize', () => {
  if (SOFTWARE) renderer.setPixelRatio(Math.min(devicePixelRatio, 1.0));
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer?.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
// Uyarlanabilir kalite (spec §11 performans bütçesi): ortalama FPS 25 altına
// düşerse parçacık/kalabalık/Işık yükünü kademeli azalt.
const QUALITY = { level: 0, label: 'tam', fpsWindow: 3.0, fpsSum: 0, frames: 0 };
function degrade(reason) {
  QUALITY.level += 1;
  if (QUALITY.level === 1) {
    particles.max = 400;
    QUALITY.label = 'dengeli';
  } else if (QUALITY.level === 2) {
    W.crowd.count = Math.max(18, Math.floor(W.crowd.count * 0.5));
    W.phones.count = W.crowd.count;
    renderer.setPixelRatio(0.75);
    renderer.setSize(innerWidth, innerHeight);
    QUALITY.label = 'performans';
  } else {
    W.spotLights.forEach((s) => { s.light.intensity = 0; s.led.visible = false; });
    QUALITY.label = 'minimum';
  }
  toast(`Kalite düşürüldü → ${QUALITY.label} (${reason} ${Math.round(G.fps)}fps)`);
}
function adaptiveQuality(dt) {
  if (dt <= 0) return;
  QUALITY.fpsSum += 1 / dt;
  QUALITY.frames += 1;
  if (QUALITY.frames < 120) return;
  const avg = QUALITY.fpsSum / QUALITY.frames;
  QUALITY.fpsSum = 0; QUALITY.frames = 0;
  document.getElementById('gpuInfo').textContent = `${q.label} · ${QUALITY.label}`;
  if (avg < 25 && QUALITY.level < 3) degrade('FPS');
}

renderGiftButtons();
renderEventButtons();
renderTiers();
renderState();
loadModels();
if (G.music) {
  // kullanıcı etkileşimi gerekir; ilk tıklamada başlat
  const once = () => { audio.start(); removeEventListener('pointerdown', once); removeEventListener('keydown', once); };
  addEventListener('pointerdown', once);
  addEventListener('keydown', once);
}
// Dans eden kalabalık: arena ön sıralarına yerleştir
(async () => {
  const base = import.meta.env.BASE_URL || './';
  const ok = await dancerPack.load(base);
  if (!ok) return;
  const spots = [];
  const perRow = q.low ? 13 : 26;
  const rows = q.low ? 2 : 4;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < perRow; k++) {
      spots.push({
        set(inst) {
          const x = (k - (perRow - 1) / 2) * 3.2 + (Math.random() - 0.5) * 0.8;
          const z = 22 + r * 2.6 + (Math.random() - 0.5) * 0.6;
          inst.position.set(x, 0, z);
          inst.rotation.y = -Math.PI / 2 + (Math.random() - 0.5) * 0.5;
          inst.userData.baseY = 0;
          inst.userData.beatOffset = Math.random() * 6.28;
        }
      });
    }
  }
  dancerPack.spawn(spots);
  allCredits.push(...dancerPack.creditsList);
  creditsEl.textContent = allCredits.join(' · ');
})();

startSim();
tick();

// Hata ayıklama/doğrulama kancası (tarayıcı konsolundan sahne durumu okunur)
window.__kbv = {
  THREE, G, W, camera, renderer, particles, config, giftmap, tour, dancerPack, scene, characters,
  q: () => q,
  mode: () => tour.mode,
  dancers: () => dancerPack.instances.filter((i) => i.visible).length,
  // doğrulama için küçük JPEG anlık görüntü (base64 data URL)
  snapshot: (scale = 0.3) => {
    if (composer) composer.render(0.016); else renderer.render(scene, camera);
    const src = renderer.domElement;
    const c2 = document.createElement('canvas');
    c2.width = Math.max(120, Math.round(src.width * scale));
    c2.height = Math.max(90, Math.round(src.height * scale));
    const ctx = c2.getContext('2d');
    ctx.drawImage(src, 0, 0, c2.width, c2.height);
    return c2.toDataURL('image/jpeg', 0.72);
  },
  look: (mode, target, dist, pitch) => {
    tour.autoRotate = false;
    tour.setMode(mode);
    if (target) tour.target.set(target[0], target[1], target[2]);
    if (dist) tour.dist = dist;
    if (pitch !== undefined) tour.pitch = pitch;
  },
  objects: () => W.scene.children.length,
  visibleMeshes: () => {
    let n = 0; scene.traverse((o) => { if (o.isMesh && o.visible) n++; }); return n;
  },
  lights: () => scene.children.filter((o) => o.isLight).length
};
