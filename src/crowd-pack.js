// ============================================================================
// Dans eden kalabalık yöneticisi (100 karakter)
// Sketchfab rigged dans modelleri (Free Standard / CC Attribution) yüklenir,
// arenaya LOD'a göre 100 adet kopya yerleştirilir ve beat'e göre dans ettirilir.
//   · Her karakter kendi AnimationMixer'ı ile kendi klibini çalar
//   · Kalite düşükse gerçek karakter sayısı azalır, siluet kalabalık devreye girer
// ============================================================================
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadAsset, collectCredits, fitToHeight, stripGroundPlanes } from './assets.js';

const DANCE_ASSETS = [
  'models/dance_hype.glb',
  'models/dance_river.glb',
  'models/dance_salsa.glb',
  'models/dance_african.glb',
  'models/dance_floss.glb',
  'models/dance_floss_m.glb'
];

export class CrowdPack {
  constructor(scene, { count = 100, mixerGroup = new THREE.Group() } = {}) {
    this.scene = scene;
    this.count = count;
    this.group = mixerGroup;
    this.scene.add(this.group);
    this.loaded = 0;
    this.sources = [];
    this.mixers = [];
    this.instances = [];
    this.ready = false;
    this.credits = [];
  }

  async load(base = './') {
    const sources = await Promise.all(DANCE_ASSETS.map(async (p) => {
      try {
        const { group, animations, meta } = await loadAsset(base + p);
        stripGroundPlanes(group); // filigran zeminini temizle
        this.credits.push(meta ? `"${meta.name}" by ${meta.author} (${meta.license})` : p);
        return { root: group, clips: animations };
      } catch (e) {
        console.warn('[crowd] yüklenemedi', p, e);
        return null;
      }
    }));
    this.sources = sources.filter(Boolean);
    this.ready = this.sources.length > 0;
    return this.ready;
  }

  /** Adayın ön sıralarına dans eden karakterleri yerleştir. */
  spawn(positions) {
    if (!this.ready) return;
    const n = Math.min(this.count, positions.length);
    for (let i = 0; i < n; i++) {
      const src = this.sources[i % this.sources.length];
      const inst = skeletonClone(src.root); // her kopyaya kendi iskeleti (düzgün skinning)
      fitToHeight(inst, 1.7 + Math.random() * 0.3);
      inst.userData.beatOffset = Math.random() * Math.PI * 2;
      inst.userData.baseY = 0;
      positions[i].set(inst);
      this.instances.push(inst);
      if (src.clips.length) {
        const mixer = new THREE.AnimationMixer(inst);
        const clip = src.clips[i % src.clips.length];
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat);
        action.time = Math.random() * 100;
        action.play();
        this.mixers.push({ mixer, action });
      }
    }
    this.instances.forEach((i) => this.group.add(i));
  }

  setCount(n) {
    n = Math.min(n, this.instances.length);
    for (let i = 0; i < this.instances.length; i++) this.instances[i].visible = i < n;
  }

  update(dt, beatPhase) {
    if (this.mixers.length) {
      // hepsini aynı delta ile sür (GPU maliyeti düşük tutmak için paylaşımlı)
      for (const m of this.mixers) {
        m.action.timeScale = 0.9 + Math.sin(beatPhase + m.mixer.getRoot().userData.beatOffset) * 0.35;
        m.mixer.update(dt);
      }
    }
    for (const inst of this.instances) {
      if (!inst.visible) continue;
      inst.position.y = inst.userData.baseY + Math.abs(Math.sin(inst.userData.beatOffset + beatPhase * 3)) * 0.06;
    }
  }

  get creditsList() {
    return this.credits.filter(Boolean);
  }
}
