import * as THREE from 'three';

// ============================================================
// FANTEZİ KARAKTER RİGLERİ — cosplay maskotlar, ejderha, kahraman
// Prosedürel iskelet: isimli eklem grupları + imza hareketleri
// ============================================================
export type CharKind = 'lion' | 'tiger' | 'panda' | 'fox' | 'wolf' | 'bear' | 'dragon' | 'hero';

export interface Rig {
  kind: CharKind;
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Group | null;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  ears: THREE.Object3D[];
  mane: THREE.Object3D | null;
  tail: THREE.Group[];
  wingL: THREE.Group | null;
  wingR: THREE.Group | null;
  capeGeo: THREE.PlaneGeometry | null;
  capeMesh: THREE.Mesh | null;
  ring: THREE.Mesh;
  fire: THREE.Object3D | null;
  home: THREE.Vector3;
  seed: number;
  solo: number;
  sig: number;
  fly: number;
  scale: number;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let v = geoCache.get(key);
  if (!v) { v = make(); geoCache.set(key, v); }
  return v as T;
}
// eklem pivotunun altına sarkan uzuv kapsülü
const caps = (r: number, l: number) => cached(`cap${r}:${l}`, () => {
  const c = new THREE.CapsuleGeometry(r, l, 4, 10); c.translate(0, -(l / 2 + r), 0); return c;
});
const sph = (r: number) => cached(`s${r}`, () => new THREE.SphereGeometry(r, 18, 14));
const cone = (r: number, h: number) => cached(`c${r}:${h}`, () => {
  const c = new THREE.ConeGeometry(r, h, 14); c.translate(0, h / 2, 0); return c;
});
const box = (w: number, h: number, d: number) => cached(`b${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
const tor = (R: number, r: number) => cached(`t${R}:${r}`, () => new THREE.TorusGeometry(R, r, 10, 30));

const furMat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0.03 });
const suitMat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.25 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.6 });
const glowMat = (c: number, i = 2.4) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive: c, emissiveIntensity: i, roughness: 0.3 });
const eyeMat = () => new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 0.15, metalness: 0.4 });
const whiteMat = () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35 });

function ring(accent: number) {
  const m = new THREE.Mesh(tor(0.62, 0.05), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.85 }));
  m.rotation.x = Math.PI / 2; m.position.y = 0.05; return m;
}
function limb(m: THREE.Material, r = 0.12, l = 0.5, pawR = 0) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(caps(r, l), m); g.add(mesh);
  if (pawR > 0) { const p = new THREE.Mesh(sph(pawR), m); p.position.y = -l - r - pawR * 0.4; g.add(p); }
  return g;
}
function darkEye(parent: THREE.Object3D, x: number, y: number, z: number, r = 0.062) {
  const e = new THREE.Mesh(sph(r), eyeMat()); e.position.set(x, y, z); parent.add(e);
  const h = new THREE.Mesh(sph(r * 0.34), whiteMat()); h.position.set(x + r * 0.35, y + r * 0.35, z + r * 0.8); parent.add(h);
}

type EarsKind = 'lion' | 'point' | 'round' | 'panda' | 'small';
interface MascotSpec {
  fur: number; belly: number; dark: number; accent: number; ears: EarsKind;
  muzzle: boolean; stripes?: boolean; eyePatch?: boolean; mane?: boolean;
  tailKind: 'tuft' | 'long' | 'bushy' | 'short' | 'none'; chubby?: boolean; snout?: number;
}

function buildMascot(spec: MascotSpec, seed: number): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const fur = furMat(spec.fur), bellyM = furMat(spec.belly), dark = darkMat.clone(), accentM = suitMat(spec.accent);
  const ears: THREE.Object3D[] = []; let mane: THREE.Object3D | null = null; let jaw: THREE.Group | null = null;

  // gövde
  const tr = spec.chubby ? 0.46 : 0.38;
  const torso = new THREE.Mesh(caps(tr, 0.5), fur); torso.position.y = 1.3; body.add(torso);
  const belly = new THREE.Mesh(sph(0.3), bellyM); belly.scale.set(0.85, 1.1, 0.5); belly.position.set(0, 1.22, 0.18); body.add(belly);
  if (spec.stripes) for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(box(0.72, 0.07, 0.1), dark);
    s.position.set(0, 1.05 + i * 0.17, 0.1 - i * 0.04); s.rotation.x = 0.12; body.add(s);
  }
  // kostüm yeleği
  const vest = new THREE.Mesh(tor(0.4, 0.075), accentM); vest.rotation.x = Math.PI / 2; vest.position.y = 0.98; body.add(vest);
  // bacaklar
  const legL = limb(fur, 0.13, 0.52), legR = limb(fur, 0.13, 0.52);
  for (const [l, x] of [[legL, -0.22], [legR, 0.22]] as const) {
    l.position.set(x, 1.05, 0);
    const foot = new THREE.Mesh(box(0.3, 0.16, 0.42), bellyM); foot.position.set(0, -0.72, 0.1); l.add(foot);
    body.add(l);
  }
  // kollar (paw uçlu)
  const armL = limb(fur, 0.11, 0.45, 0.15), armR = limb(fur, 0.11, 0.45, 0.15);
  armL.position.set(-0.55, 1.55, 0); armR.position.set(0.55, 1.55, 0); body.add(armL, armR);

  // kafa
  const head = new THREE.Group(); head.position.y = 1.95; body.add(head);
  const skull = new THREE.Mesh(sph(0.4), fur); skull.position.y = 0.42; head.add(skull);
  if (spec.eyePatch) for (const x of [-0.15, 0.15]) {
    const p = new THREE.Mesh(sph(0.14), dark); p.scale.set(1, 1, 0.4); p.position.set(x, 0.48, 0.3); head.add(p);
  }
  const eyeZ = 0.33;
  darkEye(head, -0.15, 0.48, eyeZ); darkEye(head, 0.15, 0.48, eyeZ);
  // burun + ağız
  if (spec.muzzle) {
    jaw = new THREE.Group(); jaw.position.set(0, 0.34, 0.1); head.add(jaw);
    const muz = new THREE.Mesh(sph(0.19), bellyM); muz.scale.set(1, 0.75, spec.snout ?? 1.1); muz.position.set(0, 0.02, 0.22); jaw.add(muz);
    const nose = new THREE.Mesh(sph(0.07), dark); nose.position.set(0, 0.09, 0.42); jaw.add(nose);
  } else {
    const nose = new THREE.Mesh(sph(0.06), dark); nose.position.set(0, 0.36, 0.38); head.add(nose);
  }
  // kulaklar
  switch (spec.ears) {
    case 'lion':
    case 'panda':
      for (const x of [-0.24, 0.24]) {
        const e = new THREE.Mesh(sph(0.14), spec.ears === 'panda' ? dark : fur);
        e.position.set(x, 0.78, -0.02); head.add(e); ears.push(e);
      }
      break;
    case 'point':
      for (const x of [-0.22, 0.22]) {
        const e = new THREE.Group(); e.position.set(x, 0.72, -0.02); e.rotation.z = x * 0.5; head.add(e);
        const c = new THREE.Mesh(cone(0.13, 0.34), fur); e.add(c); ears.push(e);
      }
      break;
    case 'small':
      for (const x of [-0.2, 0.2]) {
        const e = new THREE.Mesh(sph(0.1), fur); e.position.set(x, 0.75, 0); head.add(e); ears.push(e);
      }
      break;
  }
  // yele (aslan)
  if (spec.mane) {
    mane = new THREE.Group(); mane.position.y = 0.42; head.add(mane);
    const m = new THREE.Mesh(tor(0.46, 0.22), furMat(spec.dark));
    m.scale.set(1, 1, 0.85); m.position.z = -0.06; mane.add(m);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spike = new THREE.Mesh(cone(0.11, 0.3), furMat(spec.dark));
      spike.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.46, -0.02);
      spike.rotation.z = -a - Math.PI / 2; mane.add(spike);
    }
  }
  // kuyruk
  const tail: THREE.Group[] = [];
  if (spec.tailKind !== 'none') {
    const first = new THREE.Group(); first.position.set(0, 1.15, -0.55); body.add(first); tail.push(first);
    const segs = spec.tailKind === 'long' ? 3 : 2;
    let parent: THREE.Group = first;
    for (let i = 1; i <= segs; i++) {
      const s = new THREE.Group(); s.position.y = 0.3; parent.add(s); tail.push(s); parent = s;
      const m = new THREE.Mesh(caps(0.11, 0.3), fur); m.position.y = -0.15; s.add(m);
    }
    if (spec.tailKind === 'tuft' || spec.tailKind === 'bushy') {
      const tuft = new THREE.Mesh(sph(0.2), furMat(spec.tailKind === 'tuft' ? spec.dark : spec.fur));
      tuft.position.y = -0.35; parent.add(tuft);
    }
  }
  root.scale.setScalar(1.12);
  return { kind: 'lion', root, body, head, jaw, armL, armR, legL, legR, ears, mane, tail, wingL: null, wingR: null, capeGeo: null, capeMesh: null, ring: ring(spec.accent), fire: null, home: new THREE.Vector3(), seed, solo: 0, sig: 0, fly: 0, scale: 1.12 };
}

const KINDS: Record<string, () => Rig> = {};

// ---- hayvan maskotlar (cosplay) ----
const SPECS: Record<string, MascotSpec> = {
  lion: { fur: 0xf6a52c, belly: 0xffe3b8, dark: 0xa8640f, accent: 0xffd166, ears: 'lion', muzzle: true, mane: true, tailKind: 'tuft', snout: 1.2 },
  tiger: { fur: 0xff9426, belly: 0xfff1d8, dark: 0x1c1c22, accent: 0xff5c5c, ears: 'point', muzzle: true, stripes: true, tailKind: 'long', snout: 1.25 },
  panda: { fur: 0xf4f4f8, belly: 0xffffff, dark: 0x1a1a22, accent: 0x7dff5e, ears: 'panda', muzzle: true, eyePatch: true, tailKind: 'short', chubby: true },
  fox: { fur: 0xff6a2b, belly: 0xfff4e8, dark: 0xd8d8de, accent: 0xff3b5c, ears: 'point', muzzle: true, tailKind: 'bushy', snout: 1.15 },
  wolf: { fur: 0x9fb0d8, belly: 0xe2e8f5, dark: 0x35406b, accent: 0x7d9fff, ears: 'point', muzzle: true, tailKind: 'long', snout: 1.35 },
  bear: { fur: 0x8a5a2b, belly: 0xd8a86a, dark: 0x5c3a18, accent: 0xffb347, ears: 'small', muzzle: true, tailKind: 'none', chubby: true },
};
for (const k of Object.keys(SPECS)) {
  const spec = SPECS[k];
  KINDS[k] = () => { const r = buildMascot(spec, Math.random() * 10); r.kind = k as CharKind; return r; };
}

// ---- ejderha ----
KINDS.dragon = (): Rig => {
  const root = new THREE.Group();
  root.scale.setScalar(1.35);
  const body = new THREE.Group(); root.add(body);
  const skin = furMat(0x2fa85a), bellyM = furMat(0xffcf3d), hornM = furMat(0xf2e6c8);

  const torso = new THREE.Mesh(caps(0.62, 0.55), skin); torso.position.y = 1.55; body.add(torso);
  const belly = new THREE.Mesh(sph(0.5), bellyM); belly.scale.set(0.8, 1.05, 0.6); belly.position.set(0, 1.42, 0.24); body.add(belly);
  for (let i = 0; i < 4; i++) {
    const plate = new THREE.Mesh(sph(0.11), glowMat(0xff8a00, 1.6));
    plate.position.set(0, 1.15 + i * 0.2, 0.45); body.add(plate);
  }
  // kuyruk zinciri
  const tail: THREE.Group[] = [];
  const tailRoot = new THREE.Group(); tailRoot.position.set(0, 1.3, -0.7); body.add(tailRoot); tail.push(tailRoot);
  let tp: THREE.Group = tailRoot;
  for (let i = 1; i <= 4; i++) {
    const s = new THREE.Group(); s.position.y = 0.42; tp.add(s); tail.push(s); tp = s;
    const m = new THREE.Mesh(caps(0.16 - i * 0.02, 0.42), skin); m.position.y = -0.21; s.add(m);
    const spike = new THREE.Mesh(cone(0.09, 0.2), hornM); spike.position.set(0, 0.1, 0.12); s.add(spike);
  }
  // boyun zinciri + kafa
  const head = new THREE.Group(); head.position.y = 2.5; body.add(head);
  let np: THREE.Group = head;
  for (let i = 1; i <= 3; i++) {
    const s = new THREE.Group(); s.position.y = i === 1 ? -0.35 : -0.4; np.add(s);
    const m = new THREE.Mesh(caps(0.15 - i * 0.02, 0.4), skin); m.position.y = -0.2; s.add(m);
    np = s;
  }
  const skull = new THREE.Mesh(sph(0.32), skin); skull.position.z = 0.1; head.add(skull);
  const snout = new THREE.Mesh(cone(0.16, 0.5), skin); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.04, 0.5); head.add(snout);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.16, 0.16); head.add(jaw);
  const lower = new THREE.Mesh(box(0.26, 0.1, 0.5), skin); lower.position.set(0, -0.05, 0.25); jaw.add(lower);
  for (const x of [-0.16, 0.16]) {
    const horn = new THREE.Mesh(cone(0.07, 0.55), hornM); horn.position.set(x, 0.24, -0.1); horn.rotation.x = -0.5; head.add(horn);
    const h2 = new THREE.Mesh(cone(0.05, 0.3), hornM); h2.position.set(x * 0.6, 0.3, 0.05); h2.rotation.x = -1.1; head.add(h2);
  }
  for (const x of [-0.14, 0.14]) { const e = new THREE.Mesh(sph(0.06), glowMat(0xffe45e, 3.4)); e.position.set(x, 0.08, 0.36); head.add(e); }
  const fire = new THREE.Object3D(); fire.position.set(0, -0.04, 0.85); head.add(fire);
  // kanatlar
  const wing = (dir: number) => {
    const w = new THREE.Group(); w.position.set(dir * 0.6, 1.75, -0.15); body.add(w);
    const upper = new THREE.Group(); w.add(upper);
    const u = new THREE.Mesh(cone(0.42, 1.7), new THREE.MeshStandardMaterial({ color: 0x1f7d45, roughness: 0.7, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
    u.scale.z = 0.14; u.rotation.z = dir * -0.5; u.position.set(dir * 0.85, 0, 0); upper.add(u);
    const lower = new THREE.Group(); lower.position.set(dir * 1.6, -0.15, 0); upper.add(lower);
    const l = new THREE.Mesh(cone(0.34, 1.4), u.material.clone());
    l.scale.z = 0.12; l.rotation.z = dir * -0.9; l.position.set(dir * 0.7, -0.5, 0); lower.add(l);
    const claw = new THREE.Mesh(cone(0.06, 0.4), hornM); claw.position.set(dir * 1.55, -0.95, 0.3); claw.rotation.x = Math.PI / 2; lower.add(claw);
    return { w, upper, lower };
  };
  const wl = wing(-1), wr = wing(1);
  // bacaklar
  const legL = limb(skin, 0.17, 0.55), legR = limb(skin, 0.19, 0.62);
  for (const [l, x] of [[legL, -0.34], [legR, 0.34]] as const) {
    l.position.set(x, 1.1, 0.1);
    const foot = new THREE.Mesh(box(0.42, 0.16, 0.5), skin); foot.position.set(0, -0.78, 0.12); l.add(foot);
    for (const cx of [-0.14, 0, 0.14]) { const c = new THREE.Mesh(cone(0.05, 0.22), hornM); c.position.set(cx, -0.86, 0.36); l.add(c); }
    body.add(l);
  }
  // ön pençeler
  const armL = limb(skin, 0.13, 0.42), armR = limb(skin, 0.13, 0.42);
  armL.position.set(-0.58, 1.7, 0.15); armR.position.set(0.58, 1.7, 0.15); body.add(armL, armR);
  return { kind: 'dragon', root, body, head, jaw, armL, armR, legL, legR, ears: [], mane: null, tail, wingL: wl.w, wingR: wr.w, capeGeo: null, capeMesh: null, ring: ring(0x35e06a), fire, home: new THREE.Vector3(), seed: Math.random() * 10, solo: 0, sig: 0, fly: 0, scale: 1.35 };
};

// ---- kahraman ----
KINDS.hero = (): Rig => {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const suit = suitMat(0x2a4bff), suit2 = suitMat(0xff3355), skin = furMat(0xe8b98a), boot = furMat(0x161626);
  const torso = new THREE.Mesh(caps(0.34, 0.55), suit); torso.position.y = 1.3; body.add(torso);
  const belt = new THREE.Mesh(box(0.5, 0.12, 0.42), suit2); belt.position.y = 0.98; body.add(belt);
  // göğüs amblemi
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.09 : 0.22;
    star[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  const embl = new THREE.Mesh(new THREE.ShapeGeometry(star), glowMat(0xffe45e, 1.8));
  embl.position.set(0, 1.42, 0.36); body.add(embl);
  // bacaklar + botlar
  const legL = limb(suit, 0.12, 0.52), legR = limb(suit, 0.12, 0.52);
  for (const [l, x] of [[legL, -0.19], [legR, 0.19]] as const) {
    l.position.set(x, 0.95, 0);
    const b = new THREE.Mesh(box(0.26, 0.22, 0.4), boot); b.position.set(0, -0.72, 0.08); l.add(b);
    body.add(l);
  }
  const armL = limb(suit, 0.1, 0.46), armR = limb(suit, 0.1, 0.46);
  for (const [a, x] of [[armL, -0.48], [armR, 0.48]] as const) {
    a.position.set(x, 1.5, 0);
    const glove = new THREE.Mesh(sph(0.13), suit2); glove.position.set(0, -0.62, 0); a.add(glove);
    body.add(a);
  }
  // kafa + maske
  const head = new THREE.Group(); head.position.y = 1.92; body.add(head);
  const skull = new THREE.Mesh(sph(0.3), skin); skull.position.y = 0.32; head.add(skull);
  const band = new THREE.Mesh(box(0.56, 0.1, 0.56), suit); band.position.y = 0.4; head.add(band);
  for (const x of [-0.11, 0.11]) { const e = new THREE.Mesh(sph(0.05), whiteMat()); e.position.set(x, 0.31, 0.29); head.add(e); }
  const hair = new THREE.Mesh(sph(0.29), furMat(0x2a1c10)); hair.scale.set(1, 0.6, 1); hair.position.set(0, 0.5, -0.04); head.add(hair);
  // pelerin
  const capeGeo = new THREE.PlaneGeometry(0.95, 1.35, 8, 10);
  capeGeo.translate(0, -0.67, 0);
  const cape = new THREE.Mesh(capeGeo, new THREE.MeshStandardMaterial({ color: 0xff3355, roughness: 0.75, side: THREE.DoubleSide }));
  cape.position.set(0, 1.62, -0.28); body.add(cape);
  return { kind: 'hero', root, body, head, jaw: null, armL, armR, legL, legR, ears: [], mane: null, tail: [], wingL: null, wingR: null, capeGeo, capeMesh: cape, ring: ring(0x2a4bff), fire: null, home: new THREE.Vector3(), seed: Math.random() * 10, solo: 0, sig: 0, fly: 0, scale: 1.05 };
};

export function build(kind: CharKind): Rig {
  return KINDS[kind]();
}

export interface Ctx {
  t: number; dt: number; pulse: number; energy: number; amp: number; beat: number;
}

// ------------------------------------------------------------
// Animasyon motoru: ortak dans + karaktere özel imza hareketleri
// ------------------------------------------------------------
const v3 = new THREE.Vector3();

function waveCape(r: Rig, t: number, amp: number, stream: boolean) {
  if (!r.capeGeo) return;
  const pos = r.capeGeo.attributes.position as THREE.BufferAttribute;
  const base = (r.capeGeo.userData.base as Float32Array) ?? (r.capeGeo.userData.base = Float32Array.from(pos.array));
  for (let i = 0; i < pos.count; i++) {
    const bx = base[i * 3], by = base[i * 3 + 1];
    const z = Math.sin(t * (stream ? 14 : 5) + by * 6 + bx * 3) * (stream ? 0.42 : 0.07) * (1 + amp);
    const y = stream ? -Math.abs(Math.sin(t * 9 + i * 0.4)) * 0.22 : 0;
    pos.setXYZ(i, bx, by + y, z);
  }
  pos.needsUpdate = true;
}

export function animateRig(r: Rig, c: Ctx) {
  const energy = c.energy, pulse = c.pulse, amp = c.amp;
  const spd = 2.2 + energy * 3.2;
  const s = c.t * spd + r.seed;
  const solo = r.solo > 0;
  const spin = solo ? 2.2 : 0.45;

  // gövde: zıplama + squash & stretch + yaw
  const air = Math.abs(Math.sin(s * 1.6));
  const stretch = 1 + air * 0.13 * amp;
  r.body.position.y = air * 0.42 * amp + (r.fly > 0 ? r.fly * 1.1 : 0);
  r.body.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
  r.body.rotation.y += spin * c.dt * amp;
  r.body.rotation.z = Math.sin(s * 0.55) * 0.07 * amp;

  // kollar / kafa / bacaklar — senkron ama çeşitli
  const w = Math.sin(s * 2.2);
  const pump = pulse * (0.8 + amp * 0.6);
  r.armL.rotation.z = 0.45 + w * 1.05 * amp + pump * 0.7;
  r.armR.rotation.z = -0.45 - Math.cos(s * 2.2) * 1.05 * amp - pump * 0.7;
  r.armL.rotation.x = r.armR.rotation.x = -pump * 1.15;
  r.head.rotation.y = Math.sin(s * 1.15) * (solo ? 0.55 : 0.32);
  r.legL.rotation.x = Math.sin(s * 1.6) * 0.35 * amp;
  r.legR.rotation.x = -Math.sin(s * 1.6) * 0.35 * amp;

  // kulak wiggles
  for (let i = 0; i < r.ears.length; i++) {
    r.ears[i].rotation.z = Math.sin(c.t * 7 + i * 2 + r.seed) * 0.12 * (0.4 + pulse);
  }

  // yer halkası nabız
  const rm = r.ring.material as THREE.MeshBasicMaterial;
  rm.opacity = 0.5 + pulse * 0.45;
  r.ring.scale.setScalar(1 + pulse * 0.12 * amp + (solo ? 0.2 : 0));
  rm.color.setHSL((c.t * 0.12 + r.seed * 0.1) % 1, 1, 0.6);

  switch (r.kind) {
    case 'lion': {
      // kükreme: kafa geri, ağız açık, yele titrer
      const roar = r.sig > 0 ? Math.sin(Math.min(1, 1 - r.sig / 0.5) * Math.PI) : 0;
      r.head.rotation.x = -0.55 * roar + Math.sin(s * 1.3) * 0.05;
      if (r.jaw) r.jaw.rotation.x = 0.5 * roar;
      if (r.mane) r.mane.scale.setScalar(1 + roar * 0.18 + pulse * 0.06);
      r.tail.forEach((g, i) => { g.rotation.y = Math.sin(s * 1.6 + i * 0.7) * (0.25 + roar * 0.5); g.rotation.x = 0.1 * Math.sin(s + i); });
      break;
    }
    case 'tiger': {
      // süzülme: çökme + yan adım + kuyruk kırbacı
      r.body.position.y *= 0.55;
      r.body.position.x = Math.sin(s * 1.1) * 0.55 * amp;
      r.body.rotation.z += Math.sin(s * 1.1 + 1.5) * 0.16 * amp;
      r.tail.forEach((g, i) => { g.rotation.y = Math.sin(s * 2.6 - i * 0.5) * 0.4; g.rotation.x = Math.cos(s * 2 + i) * 0.2; });
      if (r.jaw) r.jaw.rotation.x = -0.15 - pulse * 0.25;
      break;
    }
    case 'panda': {
      // yavaş, komik dev zıplama + kulak sallama
      r.body.position.y *= 0.6;
      r.armL.rotation.z = 0.9 + Math.abs(Math.sin(s * 0.9)) * 1.4 * amp;
      r.armR.rotation.z = -0.9 - Math.abs(Math.cos(s * 0.9)) * 1.4 * amp;
      r.head.rotation.z = Math.sin(s * 0.9) * 0.18;
      break;
    }
    case 'fox': {
      // hızlı dönüş + zarif kuyruk kıvrımı
      r.body.rotation.y += c.dt * spd * 1.4 * amp;
      r.tail.forEach((g, i) => { g.rotation.y = Math.sin(s * 3 + i * 0.8) * 0.5; g.rotation.x = Math.cos(s * 2.4) * 0.3; });
      r.head.rotation.x = Math.sin(s * 2.4) * 0.12;
      break;
    }
    case 'wolf': {
      // uluma: kafa yukarı, ağız açık
      const howl = r.sig > 0 ? Math.sin(Math.min(1, 1 - r.sig / 0.9) * Math.PI) : 0;
      r.head.rotation.x = -0.85 * howl + Math.sin(s * 1.2) * 0.05;
      if (r.jaw) r.jaw.rotation.x = 0.28 * howl;
      r.armL.rotation.z = 0.5 + howl * 0.5; r.armR.rotation.z = -0.5 - howl * 0.5;
      r.tail.forEach((g, i) => { g.rotation.y = Math.sin(s * 1.8 + i) * 0.3; });
      break;
    }
    case 'bear': {
      // ağır stomp dans
      r.body.position.y *= 0.7;
      const step = Math.max(0, Math.sin(s * 1.4));
      r.legL.rotation.x = -step * 0.9 * amp; r.legR.rotation.x = Math.max(0, -Math.sin(s * 1.4)) * 0.9 * amp;
      r.armL.rotation.z = 1.1 + step * 0.8; r.armR.rotation.z = -1.1 - step * 0.8;
      r.head.rotation.z = Math.sin(s * 1.4) * 0.12;
      break;
    }
    case 'dragon': {
      // boyun salınımı, kanat çırpma, kuyruk kıvrımı, alev
      for (let i = 0; i < r.tail.length; i++) {
        g_move(r.tail[i], i, s, c);
      }
      if (r.wingL && r.wingR) {
        const flap = 0.75 + pulse * 0.5 + amp * 0.3;
        r.wingL.rotation.z = Math.sin(s * 4.4) * flap;
        r.wingR.rotation.z = -Math.sin(s * 4.4) * flap;
        r.wingL.rotation.y = -0.25 - flap * 0.3;
        r.wingR.rotation.y = 0.25 + flap * 0.3;
      }
      r.head.rotation.x = Math.sin(s * 1.6) * 0.2 + (r.sig > 0 ? -0.25 : 0);
      if (r.jaw) r.jaw.rotation.x = 0.12 + pulse * 0.2 + (r.sig > 0 ? 0.35 : 0);
      // kanat altı parlaması
      r.ring.scale.setScalar(1 + pulse * 0.3 + (r.fly > 0 ? 0.4 : 0));
      break;
    }
    case 'hero': {
      // pelerin dalgalanması + imza yumruk poz
      waveCape(r, c.t, amp, r.fly > 0 || r.sig > 0);
      r.armR.rotation.x = r.sig > 0 ? -2.4 : -0.5 - pump;
      r.armR.rotation.z = r.sig > 0 ? -0.3 : -0.45 - Math.cos(s * 2.2) * 1.05 * amp - pump * 0.7;
      r.body.rotation.x = r.fly > 0 ? -0.35 : 0;
      if (r.fly > 0) r.body.rotation.y += c.dt * 1.2;
      break;
    }
  }
}

function g_move(g: THREE.Group, i: number, s: number, c: Ctx) {
  g.rotation.x = 0.12 + Math.sin(s * 2 - i * 0.6) * 0.16;
  g.rotation.y = Math.sin(s * 1.3 + i * 0.5) * 0.3;
}

export function bigMove(r: Rig, kind: 'roar' | 'fire' | 'flight' | 'howl', dur = 1.2) {
  r.sig = dur;
  if (kind === 'fire' || kind === 'flight') r.fly = 1;
}

