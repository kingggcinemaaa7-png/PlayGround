// ============================================================================
// profesyonel varlık hattı: GLB + FBX + PBR materyal normalizasyonu
// public/models/ içine konulan dosyalar bu hattan geçer:
//   1. Yükle (GLTFLoader / FBXLoader)
//   2. Materyal normalizasyonu (unlit → PBR, FBX Phong → PBR)
//   3. Attribution yan dosyası (CC lisans koruması)
// Oyun kodu sadece finalizeAsset() sonucunu kullanır.
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const extensions = { glb: 'glb', gltf: 'gltf', fbx: 'fbx' };

/**
 * @param {string} path  models/xxx.glb | .gltf | .fbx
 * @returns {Promise<{group:THREE.Group, animations:THREE.AnimationClip[], meta:object}>}
 */
export async function loadAsset(path) {
  const ext = path.split('.').pop().toLowerCase();
  const loader = ext === 'fbx' ? new FBXLoader() : new GLTFLoader();
  const obj = await loader.loadAsync(path);
  let group, animations = [];
  if (ext === 'fbx') {
    group = obj;
    animations = obj.animations || [];
  } else {
    group = obj.scene || obj.scenes[0];
    animations = obj.animations || [];
  }
  const meta = await fetchAssetMeta(path);
  finalizeAsset(group, meta);
  return { group, animations, meta };
}

async function fetchAssetMeta(path) {
  try {
    const r = await fetch(path + '.attribution.json');
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** PBR'ya yükseltme: FBX/Phong/unlit materyalleri standartlit PBR yapar. */
export function finalizeAsset(root, meta = null) {
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((m) => normalizeMaterial(m));
    if (Array.isArray(o.material)) o.material = out.map((m) => m.clone());
    else o.material = out[0];
  });
  root.userData.meta = meta;
  if (root.userData.meta?.license) root.userData.credit = `${meta.name} — ${meta.author} (${meta.license})`;
  return root;
}

function normalizeMaterial(m) {
  if (!m) return m;
  const isUnlit = m.isMeshBasicMaterial || m.isMeshLambertMaterial;
  const isPBR = m.isMeshStandardMaterial || m.isMeshPhysicalMaterial;
  const baseColor =
    m.color?.clone() ||
    m.diffuse?.clone() ||
    new THREE.Color(0x9aa0c0);
  if (!isPBR) {
    const nm = new THREE.MeshStandardMaterial({
      map: m.map || null,
      normalMap: m.normalMap || null,
      normalScale: m.normalScale?.clone() || new THREE.Vector2(1, 1),
      aoMap: m.aoMap || null,
      alphaMap: m.alphaMap || null,
      transparent: m.transparent === true,
      opacity: m.opacity ?? 1,
      side: m.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide,
      envMap: m.envMap || null,
      color: baseColor,
      roughness: m.roughness ?? 0.55,
      metalness: m.metalness ?? 0.15,
      emissive: (m.emissive || new THREE.Color(0x000000)).clone(),
      emissiveIntensity: m.emissiveIntensity ?? 0.25,
      emissiveMap: m.emissiveMap || null,
      flatShading: m.flatShading === true
    });
    // unlit (görünür ışıkla çizilen) varlıklarda hafif emissive koru
    if (isUnlit) {
      nm.emissive = baseColor.clone().multiplyScalar(0.35);
      nm.emissiveIntensity = 1.0;
    }
    nm.name = (m.name || 'material') + '_pbr';
    return nm;
  }
  m.roughness = THREE.MathUtils.clamp(m.roughness ?? 0.55, 0.12, 1.0);
  m.metalness = THREE.MathUtils.clamp(m.metalness ?? 0.15, 0.0, 0.85);
  m.envMapIntensity = 1.0;
  if (m.map) m.map.anisotropy = 8;
  return m;
}

/** varlıkların attribution listesini topla (künye paneli) */
export function collectCredits(objects) {
  return objects
    .filter(Boolean)
    .map((o) => o.userData?.credit)
    .filter(Boolean);
}
