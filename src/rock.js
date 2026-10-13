// ============================================================================
// Kapadokya kaya kalesi üreteci (jeolojik prosedürel)
// Yapı (referans fotoğraf ölçeğinde):
//   · DİKEY ve geniş kaya duvarı — neredeyse sabit enli, içe hafif daralan
//   · Duvar yüzeyinde petek mağara pencereleri (sıcak ışıklı, kemerli)
//   · Üstte 1-3 bağımsız peribacası sütunu + düz sert taş "kask" şapka
// Tek draw call (mergeGeometries) + pencere ışıkları instanced.
// ============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash3(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 2147483647;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi);
  const c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1);
  const c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
  const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}
function fbm(x, y, z, oct = 4) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

const TAU = Math.PI * 2;
const PANE = new THREE.PlaneGeometry(1, 1);
PANE.translate(0, 0.5, 0);

/** Aşınmış dik sütun gövdesi (neredeyse sabit en, tabanda hafif yay, dikey oluklu) */
export function shellGeometry({ height, rTop, rBase, radial = 14, segs = 16, seed = 1, n = 1, taperPow = 2.6 }) {
  const rng = seeded(seed);
  const off = rng() * 130;
  const pos = [], nor = [], uv = [], idx = [];
  const profile = (t) => rTop + (rBase - rTop) * Math.pow(Math.max(0, 1 - t * 2.35), taperPow * 0.55);
  const P = (i, j) => {
    const t = j / (segs - 1);
    const ang = (i / radial) * TAU;
    const r = profile(t);
    const bands = fbm(Math.cos(ang) * 1.6 + off, t * 3.0 + off, Math.sin(ang) * 1.6 + off, 4) - 0.5;
    const ribs = Math.sin(ang * (5 + n * 2) + fbm(off, t * 1.8, 1.7, 3) * 4.6) * 0.03;
    const rr = r * (1 + bands * 0.06 + ribs);
    const tw = Math.sin(t * 4.2 + off) * 0.04;
    return new THREE.Vector3(Math.cos(ang + tw * 0.4) * rr, t * height, Math.sin(ang + tw * 0.4) * rr);
  };
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i <= radial; i++) {
      const p = P(i, j);
      const pa = P(i, Math.max(0, j - 1)), pb = P(i, Math.min(segs - 1, j + 1));
      const pc = P(i - 1, j), pd = P(i + 1, j);
      const n1 = new THREE.Vector3().crossVectors(pc.clone().sub(p), pd.clone().sub(p)).normalize();
      const n2 = new THREE.Vector3().crossVectors(pa.clone().sub(p), pb.clone().sub(p)).normalize();
      n1.add(n2);
      if (n1.lengthSq() < 1e-6) n1.set(0, 1, 0); else n1.normalize();
      if (j === 0 && n1.y < 0) n1.y = Math.abs(n1.y);
      pos.push(p.x, p.y, p.z); nor.push(n1.x, n1.y, n1.z); uv.push(i / radial, j / (segs - 1));
    }
  }
  const stride = radial + 1;
  for (let j = 0; j < segs - 1; j++) for (let i = 0; i < radial; i++) {
    const a = j * stride + i, b = (j + 1) * stride + i, c = j * stride + i + 1, d = (j + 1) * stride + i + 1;
    idx.push(a, b, c, c, b, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Düz, yayvan "kask" şapka (sert taş) */
export function capGeometry({ rNeck, height, seed = 4, radial = 14 }) {
  const off = seeded(seed * 3 + 11)() * 90;
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const flare = Math.sin(t * Math.PI * 0.82);
    const r = rNeck * (1.42 + flare * 0.62 - Math.pow(t, 3) * 0.38);
    pts.push(new THREE.Vector2(Math.max(0.05, r), t * height));
  }
  const geo = new THREE.LatheGeometry(pts, radial);
  const a = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < a.count; i++) {
    v.fromBufferAttribute(a, i);
    const n = fbm(v.x * 0.09 + off, v.y * 0.12 + off, v.z * 0.09 + off, 4) - 0.5;
    const r = Math.hypot(v.x, v.z) || 1;
    v.x += (v.x / r) * n * 1.1;
    v.z += (v.z / r) * n * 1.1;
    a.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  geo.userData.isCap = true;
  return geo;
}

/** Kemarli, içeri göçük mağara penceresi */
export function archWindowGeometry(w, h, depth = 0.55) {
  const s = new THREE.Shape();
  const r = w * 0.5;
  s.moveTo(-r, 0);
  s.lineTo(-r, h - r);
  s.absarc(0, h - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.lineTo(-r, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 5 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/**
 * Kapadokya kaya kalesi.
 * @param {object} o
 * @param {number} o.totalHeight  rock duvarı + sütunlar dahil toplam yükseklik
 */
export function createFairyChimney({
  seed = 1,
  totalHeight = 40,
  wallRadius = 8.6,
  material, frameMaterial, lightMaterial,
  windowDensity = 6
} = {}) {
  const group = new THREE.Group();
  const rocks = [], frames = [], panes = [], people = [];

  const rng = seeded(seed);
  const wallH = totalHeight * (0.52 + rng() * 0.14);      // dik kaya duvarı yüksekliği
  const wallR = wallRadius;
  const wallTopR = wallRadius * 0.66;

  // ---- dik kaya duvarı ----
  const wall = shellGeometry({ height: wallH, rTop: wallTopR, rBase: wallR, segs: 14, radial: 15, seed, n: 1, taperPow: 2.6 });
  wall.translate(0, -1.2, 0);
  rocks.push(wall);
  const wallSurfaceR = (t) => wallTopR + (wallR - wallTopR) * Math.pow(Math.max(0, 1 - t * 2.35), 1.43);

  // duvar tabanına birkaç ikincil kaya çıkıntısı
  for (let i = 0; i < 3; i++) {
    const a = rng() * TAU;
    const rad = wallR * (0.9 + rng() * 0.25);
    const h = wallH * (0.16 + rng() * 0.16);
    const g = shellGeometry({ height: h, rTop: wallR * 0.34, rBase: wallR * 0.5, segs: 7, radial: 9, seed: seed + 61 + i, n: 2 });
    g.rotateY(a);
    g.translate(Math.cos(a) * rad, -1.6, Math.sin(a) * rad);
    rocks.push(g);
  }

  // ---- peribacası sütunları (duvarın üstünde) ----
  const spires = [];
  const nSpires = 2 + (Math.floor(rng() * 3));
  for (let i = 0; i < nSpires; i++) {
    const a = rng() * TAU;
    const rad = wallTopR * (0.12 + rng() * 0.5);
    const h = wallH * (0.62 + rng() * 0.5);
    const rT = 1.05 + rng() * 0.5;
    const rB = rT * (1.7 + rng() * 0.5);
    const g = shellGeometry({ height: h, rTop: rT, rBase: rB, segs: 12, radial: 11, seed: seed + 17 + i * 3, n: 2 });
    g.rotateY(a);
    g.translate(Math.cos(a) * rad, wallH - 1.4, Math.sin(a) * rad);
    rocks.push(g);
    const capH = Math.min(4.2, h * 0.17);
    const cap = capGeometry({ rNeck: rT * 1.5, height: capH, seed: seed + 33 + i });
    cap.rotateY(a);
    cap.translate(Math.cos(a) * rad, wallH - 1.4 + h - 0.35, Math.sin(a) * rad);
    rocks.push(cap);
    spires.push({ a, rad, h, rT, rB, y0: wallH - 1.4 });
  }

  // ---- petek mağara pencereleri (duvar yüzeyi + sütunlar) ----
  const placeWindows = (y0, y1, rFn, count, lumScale = 1) => {
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      const y = y0 + (y1 - y0) * t;
      const a = rng() * TAU;
      const rr = rFn(t) * 0.985;
      const w = 0.9 + fbm(a * 2.4, y * 0.1, seed, 3) * (0.95 * lumScale);
      const h = w * (1.45 + fbm(y, a, seed + 5, 3) * 0.4);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const frame = archWindowGeometry(w, h, Math.min(1.1, rr * 0.34));
      frame.rotateY(-a);
      frame.translate(x, y, z);
      frames.push(frame);

      const pane = PANE.clone();
      pane.scale(w * 0.78, h * 0.78, 1);
      const pos = new THREE.Vector3(x, y, z);
      const out = new THREE.Vector3(x, 0, z).normalize();
      pos.addScaledVector(out, 0.18);
      const m = new THREE.Mesh(pane, lightMaterial);
      m.position.copy(pos);
      m.rotation.y = Math.PI / 2 - a;
      panes.push({ position: pos, rotation: m.rotation.clone(), scale: m.scale.clone() });

      if (windowDensity > 4 && k % 3 === 0) {
        people.push({ pos: pos.clone(), y, h, a, out });
      }
    }
  };

  // duvar: petek dizilim, alt yarıda daha yoğun
  const wallWindows = Math.round(windowDensity * 2.6);
  const clusters = 3 + Math.floor(rng() * 2);
  for (let c = 0; c < clusters; c++) {
    const clusterT = 0.16 + (c / (clusters - 1)) * 0.72;
    const count = Math.max(4, Math.round(wallWindows / clusters));
    placeWindows(-1.0 + wallH * (clusterT - 0.16), -1.0 + wallH * (clusterT + 0.16), (t) => wallSurfaceR((t + 1.0) / wallH), count, 1.25);
  }
  // sütunlar: her birine 4-6 pencere
  for (const sp of spires) {
    const n = 4 + Math.floor(rng() * 3);
    const rFn = (t) => sp.rT + (sp.rB - sp.rT) * Math.pow(Math.max(0, 1 - t * 2.35), 1.43);
    const a = sp.a, rad = sp.rad, y0 = sp.y0;
    for (let k = 0; k < n; k++) {
      const t = 0.2 + (k / n) * 0.72;
      const y = y0 + sp.h * t;
      const rr = rFn(t) * 0.98;
      const ang = a + (rng() - 0.5) * 1.6;
      const w = 0.85 + rng() * 0.5;
      const h = w * 1.5;
      const frame = archWindowGeometry(w, h, 0.45);
      frame.rotateY(-a - (ang - a));
      // yerel çerçeveyi sütunun konumuna taşı
      frame.translate(Math.cos(a) * rad + Math.cos(ang) * rr, y, Math.sin(a) * rad + Math.sin(ang) * rr);
      frames.push(frame);
      const pane = PANE.clone();
      pane.scale(w * 0.8, h * 0.8, 1);
      const pos = new THREE.Vector3(Math.cos(a) * rad + Math.cos(ang) * rr, y, Math.sin(a) * rad + Math.sin(ang) * rr);
      const out = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)).normalize();
      pos.addScaledVector(out, 0.22);
      const m = new THREE.Mesh(pane, lightMaterial);
      m.position.copy(pos);
      m.rotation.y = Math.PI / 2 - ang;
      panes.push({ position: pos, rotation: m.rotation.clone(), scale: m.scale.clone() });
    }
  }

  const rockMesh = new THREE.Mesh(mergeGeometries(rocks, false), material);
  rockMesh.castShadow = true; rockMesh.receiveShadow = true;
  group.add(rockMesh);

  if (frames.length) {
    const fm = new THREE.Mesh(mergeGeometries(frames, false), frameMaterial);
    fm.receiveShadow = true;
    group.add(fm);
  }

  if (panes.length) {
    const inst = new THREE.InstancedMesh(PANE, lightMaterial, panes.length);
    const d = new THREE.Object3D();
    for (let i = 0; i < panes.length; i++) {
      d.position.copy(panes[i].position);
      d.rotation.copy(panes[i].rotation);
      d.scale.copy(panes[i].scale);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.renderOrder = 2;
    group.add(inst);
  }

  if (people.length) {
    const pg = new THREE.CapsuleGeometry(0.16, 0.5, 2, 5);
    pg.translate(0, 0.3, 0);
    const pim = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ color: 0x140a06 }), people.length);
    const d = new THREE.Object3D();
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      d.position.set(p.pos.x, p.pos.y, p.pos.z);
      d.rotation.set(0, Math.PI / 2 - p.a, 0);
      d.updateMatrix();
      pim.setMatrixAt(i, d.matrix);
    }
    pim.instanceMatrix.needsUpdate = true;
    group.add(pim);
  }

  group.userData.height = totalHeight;
  group.userData.radius = wallRadius;
  return group;
}
