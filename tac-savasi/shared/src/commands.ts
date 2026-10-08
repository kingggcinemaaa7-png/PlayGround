// Command normalization: case/accents/tr-TR aware + 1-typo tolerance.
const ALIASES: Record<string, 'shield' | 'fire' | 'respond'> = {
  escudo: 'shield', kalkan: 'shield', shield: 'shield',
  fuego: 'fire', 'ateş': 'fire', ates: 'fire', fire: 'fire',
  responde: 'respond', cevap: 'respond', respond: 'respond',
};

function trLower(s: string): string {
  try { return s.toLocaleLowerCase('tr-TR'); } catch { return s.toLowerCase(); }
}

// strip accents but keep dotless-i distinction safe: map ı->i? keep as-is for lookup,
// provide both folded and unfolded keys.
function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function levenshtein1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  // simple edit distance <=1
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; }
    else {
      edits++;
      if (edits > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else { i++; j++; }
    }
  }
  edits += (a.length - i) + (b.length - j);
  return edits <= 1;
}

export type Cmd = 'shield' | 'fire' | 'respond' | null;

export function normalizeCommand(raw: string): Cmd {
  if (!raw) return null;
  let t = raw.trim();
  if (t.startsWith('!')) t = t.slice(1);
  t = t.split(/\s+/)[0] ?? '';
  t = trLower(t);
  // Turkish dotted capital İ -> i̇ ; normalize to i
  t = t.replace(/i̇/g, 'i');
  const candidates = [t, fold(t)];
  for (const c of candidates) {
    const hit = (ALIASES as Record<string, Cmd>)[c];
    if (hit) return hit;
  }
  for (const c of candidates) {
    for (const key of Object.keys(ALIASES)) {
      if (levenshtein1(c, key) || levenshtein1(c, fold(key))) return ALIASES[key];
    }
  }
  return null;
}
