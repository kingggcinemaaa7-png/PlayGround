// Command normalization: case/accents/tr-TR aware + 1-typo tolerance.
const ALIASES: Record<string, 'shield' | 'fire' | 'respond' | 'power' | 'team' | 'help'> = {
  escudo: 'shield', kalkan: 'shield', shield: 'shield',
  fuego: 'fire', ateş: 'fire', ates: 'fire', fire: 'fire',
  responde: 'respond', cevap: 'respond', respond: 'respond',
  poder: 'power', güç: 'power', guc: 'power', power: 'power',
  equipo: 'team', takım: 'team', takim: 'team', team: 'team',
  ayuda: 'help', yardım: 'help', yardim: 'help', help: 'help',
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

export type Cmd = 'shield' | 'fire' | 'respond' | 'power' | 'team' | 'help' | null;
export type Team = 'rojo' | 'azul' | null;

/** Faz 3.5: takım seçimi — !takim rojo / !equipo azul / !team red */
export function normalizeTeam(raw: string): Team {
  if (!raw) return null;
  let s = trLower(raw.trim());
  if (s.startsWith('!')) s = s.slice(1);
  const parts = s.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  const RED = ['rojo', 'red', 'kirmizi', 'kırmızı', 'rubi', 'r', 'kirmizil'];
  const BLUE = ['azul', 'blue', 'mavi', 'b', 'azules'];
  if (RED.includes(last)) return 'rojo';
  if (BLUE.includes(last)) return 'azul';
  return null;
}

export function normalizeCommand(raw: string): Cmd {
  if (!raw) return null;
  // Normal sohbet komut tetiklemez. Bu olmadan "hire"->fire, "held"->help
  // gibi yanlış eşleşmeler seyircinin mesajından komut üretiyordu.
  if (!raw.trimStart().startsWith('!')) return null;
  // Takım ayrıştırma SADECE açık komut işaretli ("!") satırlarda çalışır.
  // Daha önce her sohbet cümlesi denendiği için "azul", "vamos bien b" gibi
  // normal mesajlar takım vuruşu tetikliyordu (bedava kalkan + hasar).
  if (raw.trimStart().startsWith('!')) {
    const team = normalizeTeam(raw);
    if (team) return 'team';
  }
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
