// Asset pipeline: loads the manifest at boot and swaps procedural art for real
// files when the streamer drops them in. Missing files silently keep the
// procedural fallback, so the game always renders.
import * as PIXI from 'pixi.js';

export interface AssetManifest {
  version: number;
  sprites: string[];
  fonts: string[];
  audio: string[];
}

/** slot name -> candidate paths (first existing wins) */
export type Slot = 'boss.kraken' | 'boss.crab' | 'boss.tornado' | 'fx.meteor' | 'fx.coin'
  | 'avatars.crown' | 'arena.beach' | 'arena.volcano' | 'arena.ice'
  | 'arena.night-forest' | 'arena.sky-island';

// NB: only files the streamer drops into assets/sprites/** override the art.
// assets/placeholders/** is reference material, not an override, so the
// higher-quality procedural textures stay in charge by default.
const SLOT_FILES: Record<Slot, string[]> = {
  'boss.kraken': ['assets/sprites/bosses/kraken.png'],
  'boss.crab': ['assets/sprites/bosses/cangrejo.png'],
  'boss.tornado': ['assets/sprites/fx/tornado.png'],
  'fx.meteor': ['assets/sprites/fx/meteor.png'],
  'fx.coin': ['assets/sprites/fx/coin.png'],
  'avatars.crown': ['assets/sprites/avatars/crown.png'],
  'arena.beach': ['assets/sprites/arena/beach.png'],
  'arena.volcano': ['assets/sprites/arena/volcano.png'],
  'arena.ice': ['assets/sprites/arena/ice.png'],
  'arena.night-forest': ['assets/sprites/arena/night-forest.png'],
  'arena.sky-island': ['assets/sprites/arena/sky-island.png'],
};

export interface LoadedAudio {
  url: string;
  buffer: AudioBuffer;
}

export class AssetLoader {
  manifest: AssetManifest | null = null;
  textures = new Map<Slot, PIXI.Texture>();
  audio = new Map<string, LoadedAudio>();
  missing: string[] = [];
  loaded: string[] = [];
  /** F1 -> audio slot map (file names without extension) */
  private audioByName = new Map<string, LoadedAudio>();

  async load(base = 'assets'): Promise<void> {
    try {
      const r = await fetch(`${base}/assets.manifest.json`, { cache: 'no-cache' });
      if (r.ok) this.manifest = await r.json() as AssetManifest;
    } catch { /* manifest optional */ }

    // --- sprites ---
    for (const [slot, candidates] of Object.entries(SLOT_FILES) as [Slot, string[]][]) {
      for (const p of candidates) {
        const tex = await this.tryTexture(`${base}/${p.replace(/^assets\//, '')}`);
        if (tex) {
          this.textures.set(slot, tex);
          this.loaded.push(p);
          break;
        } else if (tex === null) {
          this.missing.push(p);
        }
      }
    }

    // --- audio (decoded lazily; missing = procedural synth) ---
    if (this.manifest?.audio?.length) {
      for (const a of this.manifest.audio) {
        if (a.includes('*')) continue;         // announcer glob slots stay empty
        const url = `${base}/${a}`;
        try {
          const head = await fetch(url, { method: 'HEAD' });
          // dev/preview servers may answer unknown paths with index.html (200),
          // so the content type has to agree before we call a slot "present"
          const ct = head.headers.get('content-type') ?? '';
          if (!head.ok || ct.includes('text/html')) { this.missing.push(a); continue; }
          this.loaded.push(a);
        } catch { this.missing.push(a); }
      }
    }

    // --- fonts: injected as CSS so Pixi Text picks them up ---
    if (this.manifest?.fonts?.length) {
      const faces = this.manifest.fonts.map((f) =>
        `@font-face{font-family:"TaçDisplay";src:url("${base}/${f}") format("truetype");font-display:swap;}`);
      const style = document.createElement('style');
      style.textContent = faces.join('\n');
      document.head.appendChild(style);
      // wait so the first text measure uses the real font
      try { await (document as Document & { fonts: FontFaceSet }).fonts.ready; } catch { /* noop */ }
    }
  }

  private async tryTexture(url: string): Promise<PIXI.Texture | null> {
    // Plain <img> decode keeps this independent of Pixi asset extensions
    // (works for png/webp/jpg/svg) and never throws on a missing file.
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(PIXI.Texture.from(img));
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  /** Register a decoded audio file under a logical name (e.g. 'music-calm'). */
  registerAudio(name: string, url: string, buffer: AudioBuffer) {
    this.audioByName.set(name, { url, buffer });
    this.audio.set(name, { url, buffer });
  }
  audioFor(name: string): LoadedAudio | undefined { return this.audioByName.get(name); }

  /** Sprites present / missing, for the admin console. */
  report() {
    return {
      manifest: !!this.manifest,
      slots: `${this.textures.size}/${Object.keys(SLOT_FILES).length}`,
      loaded: this.loaded.length,
      missing: this.missing.length,
      audio: this.audioByName.size,
    };
  }
}

export const assets = new AssetLoader();
