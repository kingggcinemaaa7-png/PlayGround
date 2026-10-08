// Tween / easing / camera-shake helpers.
export type Easing = (t: number) => number;
export const Ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outBack: (t: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  outBounceSoft: (t: number) => {
    const p = 1 - Math.pow(1 - t, 3);
    return p + Math.sin(p * Math.PI) * 0.08;
  },
};

function getPath(obj: any, path: string): number {
  const parts = path.split('.');
  let v = obj;
  for (const p of parts) v = v[p];
  return typeof v === 'number' ? v : 0;
}
function setPath(obj: any, path: string, val: number): boolean {
  const parts = path.split('.');
  let v = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    v = v?.[parts[i]];
    if (v == null) return false;
  }
  if (v == null) return false;
  v[parts[parts.length - 1]] = val;
  return true;
}
function isDead(obj: any): boolean {
  return !obj || obj.destroyed === true;
}

interface Item {
  obj: any; path: string; from: number; to: number;
  t: number; d: number; delay: number; ease: Easing;
  onDone?: () => void; id?: string;
  onUpdate?: (v: number) => void;
}

export class Tweener {
  private items: Item[] = [];

  /**
   * `id` verilen tween'ler aynı obj+path üzerindeki diğer tween'leri ÖLDÜRMEZ;
   * böylece "giriş -> gecikmeli çıkış" zinciri kurulabilir. Aynı `id` ile
   * tekrar çağrılırsa o tween değiştirilir. `id` verilmemiş tween'ler
   * (mevcut tüm çağrılar) eski davranışı korur: aynı yolu değiştirirler.
   */
  to(obj: any, path: string, to: number, dur = 0.3, opts: { ease?: Easing; delay?: number; onDone?: () => void; id?: string; onUpdate?: (v: number) => void; from?: number } = {}): Item {
    this.items = this.items.filter((i) => {
      if (i.obj !== obj || i.path !== path) return true;
      if (opts.id !== undefined) return i.id !== opts.id;
      return i.id === undefined;
    });
    const item: Item = {
      obj, path, to,
      from: opts.from ?? getPath(obj, path),
      t: 0, d: Math.max(0.0001, dur), delay: opts.delay ?? 0,
      ease: opts.ease ?? Ease.outCubic,
      onDone: opts.onDone, id: opts.id, onUpdate: opts.onUpdate,
    };
    this.items.push(item);
    return item;
  }
  kill(obj: any, path?: string, id?: string) {
    this.items = this.items.filter((i) => {
      if (id && i.id === id) return false;
      if (obj && i.obj === obj && (!path || i.path === path)) return false;
      return true;
    });
  }
  killAll() { this.items.length = 0; }
  get count() { return this.items.length; }

  update(dt: number) {
    if (!this.items.length) return;
    const keep: Item[] = [];
    for (const i of this.items) {
      // a tween may outlive the sprite it animates (destroyed in another tween)
      if (isDead(i.obj)) continue;
      if (i.delay > 0) { i.delay -= dt; keep.push(i); continue; }
      i.t += dt;
      const raw = Math.min(1, i.t / i.d);
      const k = i.ease(raw);
      const v = i.from + (i.to - i.from) * k;
      if (!setPath(i.obj, i.path, v)) continue;
      i.onUpdate?.(v);
      if (raw < 1) keep.push(i); else i.onDone?.();
    }
    this.items = keep;
  }
}

export const tweener = new Tweener();

// Critically-damped camera shake with decaying amplitude.
export class Shake {
  private t = 0;
  private amp = 0;
  private seed = Math.random() * 1000;
  add(amp: number) { this.amp = Math.max(this.amp, amp); this.t = 0; }
  update(dt: number): { x: number; y: number } {
    if (this.amp <= 0.05) { this.amp = 0; return { x: 0, y: 0 }; }
    this.t += dt;
    const decay = Math.exp(-this.t * 6.5);
    const a = this.amp * decay;
    const n = (o: number) => Math.sin(this.t * 47 + this.seed + o) * 0.6 + Math.sin(this.t * 91 + o * 2) * 0.4;
    this.amp = a;
    return { x: n(0) * a, y: n(1.7) * a };
  }
}
