// ============================================================================
// Kapadokya Beat Vadisi — devasa festival sahnesi (3D dünya)
// Referans fotoğraf ölçeğinde:
//   · 44×26 metrelik ana sahne, 3 katlı LED duvar, lazer sütunları
//   · çevresi mağara evli dev peribacaları (sıcak pencere ışıkları)
//   · 1000+ kişilik arena kalabalığı, meşale çukurları, balon filosu
// Tüm detaylar instancing ile düşük maliyetli tutulur.
// ============================================================================
import * as THREE from 'three';
import { rockTextures, groundTextures, metalTextures, clothTextures, stageClothTextures } from './textures.js';
import { createFairyChimney } from './rock.js';

function seeded(seed) {
  let a = seed >>> 0;
  const rnd = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    rnd,
    range: (a, b) => a + rnd() * (b - a),
    pick: (arr) => arr[Math.floor(rnd() * arr.length)]
  };
}

const G_WIN = new THREE.BoxGeometry(0.5, 0.75, 0.12);
const G_CROWD = new THREE.CapsuleGeometry(0.17, 0.78, 3, 6);
G_CROWD.translate(0, 0.55, 0);
const G_PHONE = new THREE.PlaneGeometry(0.07, 0.12);

// ============================================================================
export function buildWorld(scene, q = { low: false }) {
  const world = new THREE.Group();
  const S = seeded(0x5eed1234);
  const low = !!q.low;

  // ---------------- GERÇEKÇİ DOKULAR --------------------------------------
  const rock = rockTextures(7);
  const groundT = groundTextures(40);
  const metal = metalTextures(4);
  const cloth = stageClothTextures(3);
  const crowdT = clothTextures(1);

  // ---------------- GÖKKUŞAĞI: gün batımı + samanyolu ---------------------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uDawn: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
    fragmentShader: `
      uniform float uTime; uniform float uDawn; varying vec3 vP;
      float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vP);
        float h = clamp(d.y*0.5+0.5, 0.0, 1.0);

        // gün batımı — ufukta parlak sıcak bant, yukarı doğru mor → lacivert
        float dy = abs(d.y);
        float horizon = pow(max(0.0, 1.0 - dy * 3.2), 2.4);
        float band = pow(max(0.0, 1.0 - abs(dy - 0.035) * 26.0), 2.0);
        vec3 col = vec3(0.012,0.010,0.042);
        col += vec3(1.05,0.42,0.13) * band * (1.15 + uDawn*0.5);
        col += vec3(0.72,0.28,0.10) * horizon * 1.25;
        col += vec3(0.36,0.12,0.30) * smoothstep(0.06,0.42,dy) * 0.95;
        col += vec3(0.05,0.03,0.14) * smoothstep(0.40,0.92,dy);

        // samanyolu
        float band = exp(-pow((d.x*0.55 + d.z*0.83) * 2.6, 2.0));
        col += vec3(0.55,0.48,0.78)*0.085 * band * exp(-pow((d.y*0.55)*2.0,2.0));

        // yıldızlar
        vec3 sp = floor(d*520.0);
        float st = hash(sp);
        float s = smoothstep(0.9978, 1.0, st);
        s *= smoothstep(0.03, 0.28, h);
        s *= 0.5 + 0.5*sin(uTime*1.6 + st*140.0);
        col += vec3(0.92,0.94,1.0) * s * 3.0;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 40, 26), skyMat);
  world.add(sky);

  // ---------------- ZEMİN: vadi arenası -----------------------------------
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(340, 96),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: groundT.map,
      normalMap: groundT.normalMap,
      roughnessMap: groundT.roughnessMap,
      aoMap: groundT.aoMap,
      roughness: 1,
      metalness: 0
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);

  // ufuk sisi
  const mist = new THREE.Mesh(
    new THREE.RingGeometry(240, 418, 64),
    new THREE.MeshBasicMaterial({ color: 0x4a2436, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false })
  );
  mist.rotation.x = -Math.PI / 2; mist.position.y = 0.6;
  world.add(mist);

  // ---------------- MAĞARA EVLİ DEV PERİBACALARI (jeolojik) ---------------
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: rock.map, normalMap: rock.normalMap, roughnessMap: rock.roughnessMap, aoMap: rock.aoMap,
    roughness: 1, metalness: 0
  });
  // daha sert taştan koyu "şapka" ve pencere çerçevesi
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x6b4326, map: rock.map, normalMap: rock.normalMap, roughnessMap: rock.roughnessMap, roughness: 1, metalness: 0
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x2a1a10, map: rock.map, roughness: 0.85, metalness: 0
  });
  // pencerelerin sıcak ışığı (referans: bal rengi, tek tek parlayan açıklıklar)
  // pencereler: sıcak ışıklı cam (opak sıcak renk + hafif parlamayı bloom verir)
  const lightMat = new THREE.MeshBasicMaterial({
    color: 0xffa851, transparent: false, side: THREE.DoubleSide, toneMapped: true
  });
  const towers = new THREE.Group();
  const towerObjs = [];
  const towerCount = low ? 9 : 15;
  for (let i = 0; i < towerCount; i++) {
    const a = (i / towerCount) * Math.PI * 2 + S.range(-0.14, 0.14);
    const rad = S.range(74, 122);
    const back = Math.cos(a) < 0;
    const h = S.range(26, 48) * (back ? 1 : 0.68);
    const t = createFairyChimney({
      seed: 1000 + i * 37,
      height: h,
      totalHeight: h,
      wallRadius: S.range(9.5, 13.5),
      material: rockMat,
      windowMaterial: frameMat,
      lightMaterial: lightMat,
      windowDensity: low ? 3 : 6
    });
    // şapkayı daha koyu taşla değiştir: ikinci materyali çocuklara uygula
    t.traverse((o) => { if (o.isMesh && o.geometry.userData.isCap) o.material = capMat; });
    t.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    t.rotation.y = S.range(0, Math.PI * 2);
    t.scale.setScalar(S.range(0.9, 1.5));
    towers.add(t);
    towerObjs.push(t);
  }
  world.add(towers);

  // pencere ışıkları rock modülünde üretilir (mağara açıklıkları + insan siluetleri)

  // uzak şehir ışıkları
  const cityGeo = new THREE.BoxGeometry(2.2, 0.12, 2.2);
  const city = new THREE.InstancedMesh(cityGeo, new THREE.MeshBasicMaterial({ color: 0xffb066 }), low ? 90 : 260);
  const cd = new THREE.Object3D(); const ccol = new THREE.Color();
  for (let i = 0; i < city.count; i++) {
    const a = S.range(0, Math.PI * 2), rad = S.range(150, 240);
    cd.position.set(Math.cos(a) * rad, 0.16, Math.sin(a) * rad);
    cd.rotation.set(0, S.range(0, 3), 0);
    cd.scale.setScalar(S.range(0.5, 2.4));
    cd.updateMatrix();
    city.setMatrixAt(i, cd.matrix);
    ccol.setHex(0xffb066).multiplyScalar(S.range(0.4, 1.15));
    city.setColorAt(i, ccol);
  }
  world.add(city);

  // =========================================================================
  // ANA SAHNE — 62 × 34 m
  // =========================================================================
  const stage = new THREE.Group();
  stage.position.set(0, 0, -12);

  // platform + merdiven
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(62, 3.0, 34),
    new THREE.MeshStandardMaterial({ color: 0x241d3c, map: metal.map, normalMap: metal.normalMap, roughnessMap: metal.roughnessMap, roughness: 0.45, metalness: 0.55 })
  );
  deck.position.y = 3.2;
  deck.receiveShadow = true; deck.castShadow = true;
  stage.add(deck);

  // ön LED şeritler (sıcak)
  const stripMat = new THREE.MeshStandardMaterial({ color: 0x110800, emissive: 0xff9a3c, emissiveIntensity: 3.2, roughness: 0.4 });
  for (let i = 0; i < 22; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.09, 0.9), stripMat);
    s.position.set(-27 + i * 2.6, 4.76, 17.2);
    stage.add(s);
  }
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.09, 1.4), stripMat);
    s.position.set(30.5, 4.76, -15 + i * 2.4);
    stage.add(s);
    const s2 = s.clone(); s2.position.x = -30.5; stage.add(s2);
  }

  // ---- LED duvar ekranlar (canlı görselleştirici dokusu) ----
  const ledScreens = [];
  const ledTex = makeLedScreenTexture();
  const ledMat = new THREE.MeshBasicMaterial({ map: ledTex });
  const screenSpecs = [
    { w: 40, h: 17, x: 0, y: 26, z: -16.6, ry: 0 },
    { w: 20, h: 13, x: -24, y: 22, z: -14, ry: 0.32 },
    { w: 20, h: 13, x: 24, y: 22, z: -14, ry: -0.32 }
  ];
  for (const sp of screenSpecs) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sp.w, sp.h), ledMat);
    m.position.set(sp.x, sp.y, sp.z);
    m.rotation.y = sp.ry;
    stage.add(m);
    // çerçeve
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(sp.w + 0.9, sp.h + 0.9, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x191527, map: metal.map, roughnessMap: metal.roughnessMap, roughness: 0.4, metalness: 0.8 })
    );
    frame.position.set(sp.x, sp.y, sp.z - 0.35);
    frame.rotation.y = sp.ry;
    stage.add(frame);
    ledScreens.push(m);
  }

  // ---- DJ kabini ----
  const booth = new THREE.Group();
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(15, 0.5, 4.2),
    new THREE.MeshStandardMaterial({ color: 0x14121f, map: metal.map, normalMap: metal.normalMap, roughnessMap: metal.roughnessMap, roughness: 0.28, metalness: 0.85 })
  );
  table.position.set(0, 7.6, 0);
  table.castShadow = true;
  booth.add(table);
  for (const x of [-7, 7]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.4, 3.6),
      new THREE.MeshStandardMaterial({ color: 0x1d1830, map: metal.map, roughness: 0.5, metalness: 0.6 }));
    leg.position.set(x, 5.2, 0);
    booth.add(leg);
  }
  const turntables = [];
  for (const x of [-3.6, 3.6]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.16, 32),
      new THREE.MeshStandardMaterial({ color: 0x0a0a11, roughness: 0.25, metalness: 0.9 }));
    t.position.set(x, 7.95, 0);
    t.userData.spin = 1;
    booth.add(t);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.06, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x2b2b45, roughness: 0.3, metalness: 0.7 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(x, 7.97, 0);
    booth.add(ring);
  }
  // mikser
  const mixerM = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x101019, roughness: 0.3, metalness: 0.8 }));
  mixerM.position.set(0, 7.95, 0.6);
  booth.add(mixerM);
  stage.add(booth);

  // ---- truss + mover ışıkları ----
  const truss = new THREE.Group();
  const trussH = 30;
  const trussZ = [6.5, 2.0, -6.0];
  for (const z of trussZ) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(70, 0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x4b4664, map: metal.map, normalMap: metal.normalMap, roughnessMap: metal.roughnessMap, roughness: 0.55, metalness: 0.85 }));
    b.position.set(0, trussH, z);
    truss.add(b);
  }
  for (const x of [-33, -22, -11, 0, 11, 22, 33]) {
    for (const z of trussZ) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.45, trussH, 0.45),
        new THREE.MeshStandardMaterial({ color: 0x484465, roughness: 0.5, metalness: 0.85 }));
      pole.position.set(x, trussH / 2, z);
      truss.add(pole);
    }
  }

  const spotLights = [];
  const ledXs = low ? [-22, 0, 22] : [-33, -22, -11, 0, 11, 22, 33];
  for (const x of ledXs) {
    for (const z of trussZ) {
      const led = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.85, 14),
        new THREE.MeshStandardMaterial({ color: 0x111, emissive: 0xffffff, emissiveIntensity: 3.4, roughness: 0.5 }));
      led.position.set(x, trussH - 0.5, z);
      truss.add(led);
      const pl = new THREE.SpotLight(0xffffff, 900, 160, Math.PI / 6, 0.5, 1.1);
      pl.position.set(x, trussH, z);
      pl.target.position.set(x * 0.2, 4.6, 3);
      truss.add(pl);
      truss.add(pl.target);
      spotLights.push({ light: pl, led, baseX: x, baseZ: z, phase: (Math.abs(x) + Math.abs(z)) * 0.25, hue: (x + 34) / 68 });
    }
  }
  stage.add(truss);

  // ---- LAZER SÜTUNLARI ----
  const lasers = [];
  const laserGeo = new THREE.CylinderGeometry(0.12, 3.4, 90, 12, 1, true);
  const laserXs = low ? [-14, -7, 0, 7, 14] : [-28, -20, -14, -7, 0, 7, 14, 20, 28];
  for (const x of laserXs) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: 0x53c8ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(laserGeo, mat);
    beam.material.color.setHSL(0.5 + Math.abs(x) * 0.0015, 0.9, 0.62);
    beam.position.y = 45;
    g.add(beam);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xa8ecff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    tip.position.y = 90;
    g.add(tip);
    g.position.set(x, trussH, 6.5);
    stage.add(g);
    lasers.push({ g, beam, baseX: x, phase: Math.abs(x) * 0.22 });
  }

  // ---- SAHNE ÖNÜ HACİMSEL IŞIK KONİLERİ ----
  const beamVols = [];
  for (const [x, c] of [[-20, 0xffb066], [0, 0xffc98a], [20, 0xffa060]]) {
    const v = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 15, 46, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide
      })
    );
    v.position.set(x, 26, 4);
    stage.add(v);
    beamVols.push(v);
  }

  // sahne ışıkları
  const stageSpot = new THREE.SpotLight(0xffc98a, 6000, 210, Math.PI / 4.6, 0.5, 1.1);
  stageSpot.position.set(0, 32, 8);
  stageSpot.target.position.set(0, 4.8, 3);
  stage.add(stageSpot);
  stage.add(stageSpot.target);
  const stageFill = new THREE.PointLight(0xa880ff, 3000, 120, 1.6);
  stageFill.position.set(0, 12, 0);
  stage.add(stageFill);
  world.add(stage);

  // ---- sahne arkası perde ----
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(66, 34),
    new THREE.MeshStandardMaterial({
      color: 0x3a1c5c, map: cloth.map, normalMap: cloth.normalMap, roughnessMap: cloth.roughnessMap,
      roughness: 0.9, emissive: 0x180a2c, emissiveIntensity: 0.8
    })
  );
  backdrop.position.set(0, 26, -18.5);
  stage.add(backdrop);

  // =========================================================================
  // KALABALIK — geniş arena, 1500+ kişi (instanced)
  // =========================================================================
  const crowdCount = low ? 260 : 1520;
  const crowdMat = new THREE.MeshStandardMaterial({
    color: 0x241c44, map: crowdT.map, normalMap: crowdT.normalMap, roughnessMap: crowdT.roughnessMap, roughness: 0.85
  });
  const crowd = new THREE.InstancedMesh(G_CROWD, crowdMat, crowdCount);
  crowd.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  crowd.castShadow = true;
  const dummy = new THREE.Object3D();
  const crowdData = [];
  const Z0 = 22, perRow = low ? 20 : 26, rowStep = 2.3;
  const rows = Math.ceil(crowdCount / perRow);
  for (let i = 0; i < crowdCount; i++) {
    const row = Math.floor(i / perRow);
    const slot = i % perRow;
    const half = (perRow - 1) / 2;
    const x = (slot - half) * 3.4 + S.range(-0.5, 0.5);
    const z = Z0 + row * rowStep + S.range(-0.4, 0.4);
    // arena hafifçe yayılsın
    const arc = Math.abs(x) * 0.004;
    crowdData.push({ x, z: z + arc * 6, phase: S.range(0, 6.28), speed: S.range(1.6, 3.5), sway: S.range(-0.5, 0.5), scale: S.range(0.85, 1.2) });
  }
  crowd.instanceMatrix.needsUpdate = true;
  world.add(crowd);

  const phones = new THREE.InstancedMesh(G_PHONE,
    new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    crowdCount);
  phones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  world.add(phones);

  // ---- meşale çukurları (sahne önünde iki sıra) ----
  const firepits = [];
  const fireMat = new THREE.MeshStandardMaterial({ color: 0xff7a1e, emissive: 0xff8c1e, emissiveIntensity: 4, roughness: 0.6 });
  for (const x of [-40, -34, -28, 28, 34, 40]) {
    const g = new THREE.Group();
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.1, 1.0, 14),
      new THREE.MeshStandardMaterial({ color: 0x4a3524, map: rock.map, roughness: 0.95 }));
    pit.position.y = 0.5; g.add(pit);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.4, 12), fireMat);
    flame.position.y = 2.1; g.add(flame);
    g.position.set(x, 0, 16);
    stage.add(g);
    // ışıklar yalnızca sahne kenar meşalelerinde (performans)
    firepits.push({ g, flame, phase: Math.random() * 6.28, x });
  }

  // balonlar (GLB runtime)
  const balloonAnchor = new THREE.Group();
  world.add(balloonAnchor);

  scene.add(world);

  return {
    world, sky, skyMat, stage, ledScreens, ledTex, turntables, spotLights, stageSpot, stageFill,
    crowd, crowdData, phones, dummy, lasers, beamVols, firepits, towerObjs, deck
  };
}

// ---------------------------------------------------------------------------
// Peribacası: ana süt + taban kaynağı + kapak
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// LED duvar: canlı spektral görselleştirici (canvas 2D)
// ---------------------------------------------------------------------------
function makeLedScreenTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const bars = 48;
  const heights = new Array(bars).fill(0.3);
  tex.userData.update = (t, energy = 1) => {
    // arka plan gradyan
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#120a2e');
    grd.addColorStop(1, '#04030f');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 256);
    // merkez logo halkası
    g.strokeStyle = 'rgba(255,255,255,0.10)';
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(256, 128, 30 + i * 16, 0, Math.PI * 2); g.stroke(); }
    // ekolayzer
    for (let i = 0; i < bars; i++) {
      const target = Math.max(0.06, Math.abs(Math.sin(t * (1.1 + i * 0.035) + i)) * energy);
      heights[i] += (target - heights[i]) * 0.18;
      const h = heights[i] * 210;
      const hue = 190 + i * 3.2;
      const grad = g.createLinearGradient(0, 256 - h, 0, 256);
      grad.addColorStop(0, `hsl(${hue},100%,65%)`);
      grad.addColorStop(1, `hsl(${hue + 40},100%,${18 + heights[i] * 30}%)`);
      g.fillStyle = grad;
      g.fillRect(i * (512 / bars) + 2, 256 - h, 512 / bars - 4, h);
    }
    // üst yazı bandı
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = 'bold 40px sans-serif';
    g.textAlign = 'center';
    g.fillText('KAPADOKYA  BEAT  VADİSİ', 256, 46);
    g.font = '16px sans-serif';
    g.fillStyle = 'rgba(255,215,0,0.9)';
    g.fillText('LIVE · TİKTOK · 1000+ KİŞİ', 256, 72);
    tex.needsUpdate = true;
  };
  return tex;
}
