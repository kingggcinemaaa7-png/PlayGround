// İsim plakası satır kırma: en fazla 3 satır, asla kırpma yok (§6)
export function wrapName(name, maxPerLine = 14, maxLines = 3) {
  const words = String(name ?? "Misafir").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  const flush = () => { if (cur) { lines.push(cur); cur = ""; } };
  for (const w of words) {
    if (w.length > maxPerLine) {
      flush();
      // uzun kelimeyi sert böl (emoji-safe değilse bile kırpma yok)
      for (let i = 0; i < w.length; i += maxPerLine) {
        lines.push(w.slice(i, i + maxPerLine));
        if (lines.length >= maxLines) break;
      }
      if (lines.length >= maxLines) break;
      continue;
    }
    const next = cur ? cur + " " + w : w;
    if (next.length <= maxPerLine) cur = next;
    else { flush(); cur = w; if (lines.length >= maxLines - 1 && cur.length > maxPerLine) break; }
    if (lines.length >= maxLines) break;
  }
  flush();
  const overflow = lines.length > maxLines;
  const out = lines.slice(0, maxLines);
  return { lines: out, truncated: overflow, scale: overflow ? 0.9 : 1 };
}
