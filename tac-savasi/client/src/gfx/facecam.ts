// Facecam strip: webcam frames rendered inside the game canvas so TikTok LIVE
// Studio always captures it. Pushes the top HUD cluster down while active.
import * as PIXI from 'pixi.js';

export class Facecam {
  root = new PIXI.Container();
  private video: HTMLVideoElement | null = null;
  private sprite: PIXI.Sprite | null = null;
  private tex: PIXI.Texture | null = null;
  private border = new PIXI.Graphics();
  private label = new PIXI.Text({
    text: '',
    style: { fontFamily: '"Trebuchet MS", system-ui, sans-serif', fontSize: 22, fill: 0x9fe3ff, fontWeight: '700', stroke: { color: 0x12081f, width: 4, join: 'round' } },
  });
  active = false;
  error = '';
  stripPx = 100;
  /** true when the current frame source is a synthetic test pattern */
  synthetic = false;

  constructor() {
    this.label.anchor.set(0.5);
    this.label.position.set(540, 50);
    this.label.alpha = 0.75;
    this.root.addChild(this.border, this.label);
    this.root.visible = false;
    this.applyLayout();
  }

  private applyLayout() {
    const h = this.stripPx;
    this.border.clear();
    this.border.rect(0, 0, 1080, h).fill({ color: 0x04070f, alpha: 0.94 });
    this.border.rect(0, h - 4, 1080, 4).fill({ color: 0x39d0ff, alpha: 0.9 });
    this.label.position.set(540, h / 2);
    if (this.sprite) {
      this.sprite.height = h - 8;
      const vw = this.video?.videoWidth || 16;
      const vh = this.video?.videoHeight || 9;
      const target = (h - 8) * (vw / vh);
      this.sprite.width = Math.max(target, 180);
      this.sprite.position.set(540, h / 2);
    }
  }

  /** Starts the real webcam. Returns false (and sets `error`) if denied. */
  async start(stripPx = 100): Promise<boolean> {
    this.stripPx = stripPx;
    this.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360, frameRate: 30 }, audio: false });
      await this.attach(stream);
      this.active = true;
      this.error = '';
    } catch (e) {
      this.active = false;
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.root.visible = this.active;
    this.applyLayout();
    return this.active;
  }

  /** Attach an arbitrary MediaStream (used by tests / capture cards). */
  async attach(stream: MediaStream): Promise<void> {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.srcObject = stream;
    await v.play().catch(() => undefined);
    this.video = v;
    // drop the previous sprite BEFORE its texture dies, otherwise the old
    // sprite keeps rendering a destroyed source and kills the render loop
    this.clearSprite();
    this.tex = PIXI.Texture.from(v);
    this.tex.source.scaleMode = 'linear';
    const spr = new PIXI.Sprite(this.tex);
    spr.anchor.set(0.5);
    spr.scale.x = -1; // mirror, like every streaming app
    this.sprite = spr;
    this.root.addChildAt(spr, 1);
    this.applyLayout();
  }

  /** Synthetic animated pattern so the strip is testable without a camera. */
  async startTestPattern(stripPx = 100): Promise<void> {
    this.stop();
    this.stripPx = stripPx;
    const c = document.createElement('canvas');
    c.width = 640; c.height = 360;
    const g = c.getContext('2d')!;
    let t = 0;
    const draw = () => {
      t += 0.05;
      const gr = g.createLinearGradient(0, 0, 640, 360);
      gr.addColorStop(0, `hsl(${(t * 40) % 360},70%,45%)`);
      gr.addColorStop(1, '#101a33');
      g.fillStyle = gr; g.fillRect(0, 0, 640, 360);
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.beginPath(); g.arc(320 + Math.sin(t) * 120, 180 + Math.cos(t * 1.3) * 60, 42, 0, 7); g.fill();
      g.fillStyle = 'rgba(0,0,0,.75)';
      g.font = 'bold 34px system-ui';
      g.textAlign = 'center';
      g.fillText('KAMERA TESTİ', 320, 330);
      requestAnimationFrame(draw);
    };
    draw();
    this.synthetic = true;
    const stream = c.captureStream(30);
    await this.attach(stream);
    this.active = true;
    this.root.visible = true;
    this.applyLayout();
  }

  /** Detach and destroy the current sprite+texture in the safe order. */
  private clearSprite() {
    if (this.sprite) { this.root.removeChild(this.sprite); this.sprite.destroy(); this.sprite = null; }
    if (this.tex) { this.tex.destroy(true); this.tex = null; }
  }

  stop() {
    const so = this.video?.srcObject as MediaStream | null;
    so?.getTracks?.().forEach((tr: MediaStreamTrack) => tr.stop());
    this.video = null;
    this.active = false;
    this.synthetic = false;
    this.clearSprite();
    this.root.visible = false;
  }

  update() {
    if (!this.active || !this.tex) return;
    // VideoSource re-uploads the current frame on 'update'
    const src = this.tex.source as unknown as { update?: () => void };
    src?.update?.();
  }
}
