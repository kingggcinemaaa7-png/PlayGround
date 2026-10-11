// Türkçe normalizasyon + bulanık eşleşme + moderasyon (Master Plan §3, §11)
const TR_MAP = { İ: "i", I: "i", ı: "i", Ş: "s", ş: "s", Ğ: "g", ğ: "g", Ü: "u", ü: "u", Ö: "o", ö: "o", Ç: "c", ç: "c" };

export function normalizeName(s = "") {
  let out = String(s);
  out = out.replace(/[İIıŞşĞğÜüÖöÇç]/g, (c) => TR_MAP[c] ?? c);
  out = out.toLowerCase();
  // emoji / sembol temizle, boşlukları daralt
  out = out.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu, "");
  out = out.replace(/[^a-z0-9@_\s.-]/g, " ").replace(/\s+/g, " ").trim();
  out = out.replace(/^@+/, "");
  return out;
}

export function stripLeet(s = "") {
  return String(s).toLowerCase()
    .replace(/[@]/g, "a").replace(/[01]/g, (c) => (c === "0" ? "o" : "i"))
    .replace(/[$]/g, "s").replace(/[+]/g, "t").replace(/\s+/g, "");
}

// Basit Jaro benzerliği (0..1), harici bağımlılık yok
export function jaro(a = "", b = "") {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const mMax = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const aM = new Array(a.length).fill(false);
  const bM = new Array(b.length).fill(false);
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - mMax), hi = Math.min(b.length - 1, i + mMax);
    for (let j = lo; j <= hi; j++) {
      if (!bM[j] && a[i] === b[j]) { aM[i] = true; bM[j] = true; m++; break; }
    }
  }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) {
    if (aM[i]) {
      while (!bM[k]) k++;
      if (a[i] !== b[k]) t++;
      k++;
    }
  }
  t /= 2;
  return (m / a.length + m / b.length + (m - t) / m) / 3;
}

export function fuzzyMatch(a, b, threshold = 0.82) {
  const na = normalizeName(a), nb = normalizeName(b);
  if (!na || !nb) return { hit: false, score: 0, na, nb };
  if (na === nb) return { hit: true, score: 1, na, nb };
  const score = jaro(na, nb);
  return { hit: score >= threshold, score, na, nb };
}

export function isClean(name, patterns = []) {
  const n = stripLeet(normalizeName(name));
  const compact = (p) => stripLeet(normalizeName(p));
  return !patterns.some((p) => {
    const cp = compact(p);
    return cp && n.includes(cp);
  });
}

export function safeDisplayName(name, patterns = []) {
  const raw = String(name ?? "").trim();
  if (!raw) return "Misafir";
  if (!isClean(raw, patterns)) return "Misafir";
  return raw.slice(0, 120);
}
