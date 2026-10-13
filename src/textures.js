// ============================================================================
// Prosedürel gerçekçi doku fabrikası (PBR)
// Albedo + normal + roughness + AO haritalarını çalışma anında üretir.
// Hiçbir dış dosya gerektirmez; tümü deterministik fBm gürültüsünden türetilir.
// ============================================================================
import * as THREE from 'three';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';

const SIZE = 512;
const perlin = new ImprovedNoise();

function fbm(x, y, octaves = 5, gain = 0.5, lac = 2.03) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * perlin.noise(x * freq, y * freq, o * 17.13);
    norm += amp;
    amp *= gain;
    freq *= lac;
  }
  return sum / norm;
}

// Sobel ile height map'ten normal map üretimi
function heightToNormal(height, size, strength = 2.4) {
  const data = new Uint8Array(size * size * 4);
  const idx = (x, y) => ((y & (size - 1)) * size + (x & (size - 1)));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = height[idx(x - 1, y)], r = height[idx(x + 1, y)];
      const u = height[idx(x, y - 1)], d = height[idx(x, y + 1)];
      let nx = (l - r) * strength;
      let ny = (u - d) * strength;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

function toTexture(data, size, repeat = 1) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const cA = new THREE.Color();
const cB = new THREE.Color();

/** Kapadokya tüf kayası — yumuşak kum taşı, katmanlı aşınma */
export function rockTextures(repeat = 6) {
  const size = SIZE;
  const albedo = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const ao = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const S = 1 / 26;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n1 = fbm(x * S, y * S, 5);
      const n2 = fbm(x * S * 3.4, y * S * 3.4, 4);
      const strat = Math.sin((y * 0.035) + n1 * 3.2) * 0.5 + 0.5;  // katmanlı tabaka
      const crack = Math.pow(Math.max(0, n2), 2.2) * 1.6;            // çatlaklar
      const h = n1 * 0.6 + strat * 0.4 - crack * 0.25;
      height[y * size + x] = h;
      const v = 0.5 + h * 0.62;
      // sıcak kum tonu: #b07a4d → #8a5a36
      const shade = THREE.MathUtils.clamp(v, 0, 1);
      cA.setHex(0xc08b58); cB.setHex(0x6e4526);
      cA.lerp(cB, 1 - shade);
      const i = (y * size + x) * 4;
      albedo[i] = cA.r * 255; albedo[i + 1] = cA.g * 255; albedo[i + 2] = cA.b * 255; albedo[i + 3] = 255;
      const rgh = THREE.MathUtils.clamp(0.9 - crack * 0.35 + (n2 * 0.05), 0.45, 1);
      rough[i] = rgh * 255; rough[i + 1] = rgh * 255; rough[i + 2] = rgh * 255; rough[i + 3] = 255;
      const aoV = THREE.MathUtils.clamp(0.62 + h * 0.5, 0.25, 1);
      ao[i] = aoV * 255; ao[i + 1] = aoV * 255; ao[i + 2] = aoV * 255; ao[i + 3] = 255;
    }
  }
  return {
    map: toTexture(albedo, size, repeat),
    normalMap: heightToNormal(height, size, 2.2),
    roughnessMap: toTexture(rough, size, repeat),
    aoMap: toTexture(ao, size, repeat)
  };
}

/** Zemin: kuru vadi toprağı + taş parçaları */
export function groundTextures(repeat = 26) {
  const size = SIZE;
  const albedo = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const ao = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const S = 1 / 22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n1 = fbm(x * S, y * S, 5);
      const n2 = fbm(x * S * 6.1 + 31.4, y * S * 6.1 - 12.7, 3);
      const pebbles = Math.max(0, n2 * 2.4 - 1.1);
      const h = n1 * 0.7 + pebbles * 0.5;
      height[y * size + x] = h;
      const i = (y * size + x) * 4;
      cA.setHex(0x8a5f3c); cB.setHex(0x5b3a22);
      cA.lerp(cB, THREE.MathUtils.clamp(0.5 - h * 0.55, 0, 1));
      cA.lerp(new THREE.Color(0x7d6141), pebbles * 0.6);
      albedo[i] = cA.r * 255; albedo[i + 1] = cA.g * 255; albedo[i + 2] = cA.b * 255; albedo[i + 3] = 255;
      const rgh = THREE.MathUtils.clamp(0.97 - pebbles * 0.25, 0.6, 1);
      rough[i] = rgh * 255; rough[i + 1] = rgh * 255; rough[i + 2] = rgh * 255; rough[i + 3] = 255;
      const aov = THREE.MathUtils.clamp(0.7 + h * 0.4, 0.3, 1);
      ao[i] = aov * 255; ao[i + 1] = aov * 255; ao[i + 2] = aov * 255; ao[i + 3] = 255;
    }
  }
  return {
    map: toTexture(albedo, size, repeat),
    normalMap: heightToNormal(height, size, 1.1),
    roughnessMap: toTexture(rough, size, repeat),
    aoMap: toTexture(ao, size, repeat)
  };
}

/** Cıvata metal / karanlık boyalı çelik (sahne ve truss) */
export function metalTextures(repeat = 3) {
  const size = 256;
  const albedo = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const ao = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x * (1 / 18), y * (1 / 18), 3);
      const brush = Math.sin(x * 1.7 + n * 6.0) * 0.5 + 0.5;
      const h = n * 0.5 + brush * 0.12;
      height[y * size + x] = h;
      const i = (y * size + x) * 4;
      const v = 0.5 + h * 0.4;
      albedo[i] = v * 255 * 0.98; albedo[i + 1] = v * 255 * 0.99; albedo[i + 2] = v * 255;
      albedo[i + 3] = 255;
      const rgh = THREE.MathUtils.clamp(0.35 + brush * 0.35 - n * 0.1, 0.12, 0.8);
      rough[i] = rgh * 255; rough[i + 1] = rgh * 255; rough[i + 2] = rgh * 255; rough[i + 3] = 255;
      const aov = 0.9 + h * 0.1;
      ao[i] = aov * 255; ao[i + 1] = aov * 255; ao[i + 2] = aov * 255; ao[i + 3] = 255;
    }
  }
  return {
    map: toTexture(albedo, size, repeat),
    normalMap: heightToNormal(height, size, 0.9),
    roughnessMap: toTexture(rough, size, repeat),
    aoMap: toTexture(ao, size, repeat)
  };
}

/** Kalabalık kumaşı/deri */
export function clothTextures(repeat = 2) {
  const size = 256;
  const albedo = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const weave = Math.sin(x * 3.1) * 0.5 + 0.5;
      const weave2 = Math.sin(y * 2.7) * 0.5 + 0.5;
      const n = fbm(x * 0.06, y * 0.06, 3);
      const h = weave * weave2 * 0.35 + n * 0.3;
      height[y * size + x] = h;
      const i = (y * size + x) * 4;
      albedo[i] = 150 + h * 90; albedo[i + 1] = 150 + h * 95; albedo[i + 2] = 160 + h * 100; albedo[i + 3] = 255;
      const rgh = 0.92 + weave * 0.06;
      rough[i] = rgh * 255; rough[i + 1] = rgh * 255; rough[i + 2] = rgh * 255; rough[i + 3] = 255;
    }
  }
  return {
    map: toTexture(albedo, size, repeat),
    normalMap: heightToNormal(height, size, 0.7),
    roughnessMap: toTexture(rough, size, repeat)
  };
}

/** Balon kumaşı desenli */
export function balloonTextures() {
  const size = 256;
  const albedo = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = y / size;
      // dikey bantlar (balon zarfı segmentleri)
      const band = Math.floor(v * 8) % 2 === 0 ? 1 : 0.55;
      const n = fbm(v * 26, x * (1 / 30), 4);
      const h = (band * 0.6 + n * 0.4);
      height[y * size + x] = h;
      const i = (y * size + x) * 4;
      // palet: kızıl/turuncu/krem
      cA.setHex(0xd8442c); cB.setHex(0xf2b832);
      cA.lerp(cB, band * 0.55 + n * 0.2);
      const dark = v > 0.86 ? (1 - (v - 0.86) * 2.4) : 1;
      albedo[i] = cA.r * 255 * dark; albedo[i + 1] = cA.g * 255 * dark; albedo[i + 2] = cA.b * 255 * dark; albedo[i + 3] = 255;
      const rgh = 0.86 + band * 0.05;
      rough[i] = rgh * 255; rough[i + 1] = rgh * 255; rough[i + 2] = rgh * 255; rough[i + 3] = 255;
    }
  }
  return {
    map: toTexture(albedo, size, 1),
    normalMap: heightToNormal(height, size, 0.6),
    roughnessMap: toTexture(rough, size, 1)
  };
}

/** Kumaş perde/arka fon dokusu */
export function stageClothTextures(repeat = 2) {
  const size = 256;
  const albedo = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fold = Math.sin(x * 0.09 + Math.sin(y * 0.03) * 1.4) * 0.5 + 0.5;
      const n = fbm(x * 0.08, y * 0.08, 4);
      const h = fold * 0.55 + n * 0.45;
      height[y * size + x] = h;
      const i = (y * size + x) * 4;
      cA.setHex(0x4a1f6e); cB.setHex(0x1a0b2c);
      cA.lerp(cB, 1 - h);
      albedo[i] = cA.r * 255; albedo[i + 1] = cA.g * 255; albedo[i + 2] = cA.b * 255; albedo[i + 3] = 255;
      const rgh = 0.88 + fold * 0.08;
      rough[i] = rgh * 255; rough[i + 1] = rgh * 255; rough[i + 2] = rgh * 255; rough[i + 3] = 255;
    }
  }
  return {
    map: toTexture(albedo, size, repeat),
    normalMap: heightToNormal(height, size, 1.4),
    roughnessMap: toTexture(rough, size, repeat)
  };
}
