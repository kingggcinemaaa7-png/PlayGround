// Uygulama ekran yakalama: kendi tarayıcısını açar, masaüstü+mobile çeker, kapatır.
// Girdi: CAPTURE_URL, CAPTURE_DIR env.
// Çıkış: 0 ok; 75 geçici gezinme/tarayıcı altyapı hatası; 1 betik/render hatası.
// Yakalama çıktısı kaynak dışına yazılır; uygulama çalışır durumda bırakılır.
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

function fail(code, msg) {
  console.error(msg);
  process.exit(code);
}

const CAP_URL = process.env.CAPTURE_URL;
const OUT = process.env.CAPTURE_DIR;
if (!CAP_URL) fail(1, "capture: CAPTURE_URL is required (script defect).");
if (!OUT) fail(1, "capture: CAPTURE_DIR is required (script defect).");
try { new globalThis.URL(CAP_URL); } catch { fail(1, `capture: invalid CAPTURE_URL: ${CAP_URL}`); }

const runtime = join(process.env.HOME, ".local/share/omgithub-playwright");
let chromium;
try {
  const require = createRequire(join(runtime, "package.json"));
  ({ chromium } = require("playwright"));
} catch (e) { fail(1, `capture: playwright module unavailable: ${e.message}`); }

let launchOptions = {};
try {
  const cfg = JSON.parse(readFileSync(join(runtime, process.platform === "darwin" ? "metal.json" : "linux.json"), "utf8"));
  launchOptions = cfg.browser.launchOptions;
} catch (e) { fail(1, `capture: browser config unreadable: ${e.message}`); }
if (process.platform === "linux") {
  try { process.env.DISPLAY ||= ":" + readFileSync(join(runtime, "display"), "utf8").trim(); }
  catch (e) { fail(75, `capture: Xvfb display unavailable: ${e.message}`); }
}

mkdirSync(OUT, { recursive: true });
const transient = (e) => Object.assign(e instanceof Error ? e : new Error(String(e)), { exitCode: 75 });

let browser;
try {
  browser = await chromium.launch({ ...launchOptions, timeout: 30000 }).catch((e) => { throw transient(e); });
  for (const [name, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } }).catch((e) => { throw transient(e); });
    try {
      page.setDefaultTimeout(30000);
      page.on("pageerror", (e) => console.error(`pageerror(${name}):`, e.message));
      const response = await page.goto(CAP_URL, { waitUntil: "load", timeout: 45000 }).catch((e) => { throw transient(e); });
      const st = response?.status();
      if (!response || !response.ok()) {
        const code = (!response || [408, 429, 500, 502, 503, 504].includes(st)) ? 75 : 1;
        fail(code, `capture: HTTP ${st ?? "no-response"} loading ${CAP_URL}`);
      }
      await page.locator("body").waitFor({ state: "visible" }).catch((e) => { throw transient(e); });
      await page.waitForFunction(() => document.fonts.status === "loaded").catch(() => {});
      // render kanıtı: sayfada gerçek içerik olmalı (boş sayfa = render hatası)
      const rendered = await page.evaluate(() => ({
        nodes: document.body ? document.body.querySelectorAll("*").length : 0,
        text: (document.body ? document.body.innerText : "").trim().length,
        canvas: document.querySelectorAll("canvas").length,
      }));
      if (!rendered.nodes || (!rendered.text && !rendered.canvas)) {
        fail(1, `capture: page rendered no content (${JSON.stringify(rendered)})`);
      }
      await page.waitForTimeout(1500);
      const file = join(OUT, `final-${name}.png`);
      await page.screenshot({ path: file, timeout: 30000 }).catch((e) => {
        if (e.name === "TimeoutError" || !browser.isConnected()) throw transient(e);
        throw e;
      });
      const size = statSync(file).size;
      if (!size) fail(1, `capture: empty screenshot ${file}`);
      console.log(`capture: ${name} -> ${file} (${size} bytes, nodes=${rendered.nodes})`);
    } finally {
      await page.close().catch(() => {});
    }
  }
  console.log("capture: OK");
} catch (e) {
  console.error(e?.stack ?? String(e));
  process.exit(e?.exitCode || 1);
} finally {
  await browser?.close().catch((e) => { console.error(String(e)); process.exitCode ||= 75; });
}
