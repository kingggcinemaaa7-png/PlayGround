// Bulletproof boot: every network step has a timeout, a visible splash covers
// the page until the first frame renders, and any failure reports itself with
// environment diagnostics instead of leaving a silent blue screen.
export const BOOT_TIMEOUT_MS = 6000;

export async function fetchWithTimeout(url: string, ms = BOOT_TIMEOUT_MS, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`timeout ${ms}ms: ${url}`)), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface BootDiag {
  webgl: string;
  audio: string;
  config: string;
  manifest: string;
  module: string;
}

export function collectDiag(extra: Partial<BootDiag> = {}): BootDiag {
  let webgl = 'unknown';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    webgl = gl ? `yes (${gl.getParameter(gl.RENDERER) as string})` : 'NO WEBGL';
  } catch (e) {
    webgl = `error: ${String(e).slice(0, 80)}`;
  }
  let audio = 'unknown';
  try {
    const AC = window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audio = AC ? 'available' : 'NO AudioContext';
  } catch (e) {
    audio = `error: ${String(e).slice(0, 80)}`;
  }
  return {
    webgl, audio,
    config: extra.config ?? '?',
    manifest: extra.manifest ?? '?',
    module: extra.module ?? 'loaded',
  };
}

export function diagText(d: BootDiag): string {
  return [
    `WebGL: ${d.webgl}`,
    `Ses: ${d.audio}`,
    `config.json: ${d.config}`,
    `manifest: ${d.manifest}`,
    `modül: ${d.module}`,
  ].join('\n');
}

let splashEl: HTMLElement | null = null;

export function showSplash(safemode: boolean) {
  splashEl = document.getElementById('tac-splash');
  if (!splashEl) return;
  splashEl.classList.remove('hidden');
  const sub = splashEl.querySelector('.tac-splash-sub');
  if (sub) sub.textContent = safemode ? 'Güvenli mod: ses ve kamera kapalı, yükleniyor…' : 'Arena yükleniyor…';
}

export function hideSplash() {
  splashEl = document.getElementById('tac-splash');
  splashEl?.classList.add('hidden');
}

/** Replaces the splash with a readable error + diagnostics + retry hints. */
export function splashError(title: string, err: unknown, diag: BootDiag) {
  splashEl = document.getElementById('tac-splash');
  if (!splashEl) return;
  splashEl.classList.remove('hidden');
  splashEl.innerHTML = `
    <div class="tac-splash-card">
      <div class="tac-splash-logo">TAÇ SAVAŞI</div>
      <div class="tac-splash-err">${title}: ${String(err).slice(0, 300)}</div>
      <pre class="tac-splash-diag">${diagText(diag)}</pre>
      <div class="tac-splash-hint">Önce <b>?safemode=1</b> ile dene. Sorun sürerse bu ekranın fotoğrafını gönder.</div>
      <button class="tac-splash-btn" onclick="location.reload()">Yeniden dene</button>
    </div>`;
}
