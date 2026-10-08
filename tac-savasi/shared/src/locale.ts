// Minimal key-based i18n with fallback chain target -> en -> log.
import esMX from './locales/es-MX.json' with { type: 'json' };
import esES from './locales/es-ES.json' with { type: 'json' };
import trTR from './locales/tr-TR.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };

const TABLES: Record<string, Record<string, string>> = {
  'es-MX': esMX as Record<string, string>,
  'es-ES': esES as Record<string, string>,
  'tr-TR': trTR as Record<string, string>,
  en: en as Record<string, string>,
};
const missing = new Set<string>();
export function t(locale: string, key: string, vars?: Record<string, string | number>): string {
  const table = TABLES[locale] ?? {};
  let s = table[key] ?? (TABLES.en as Record<string,string>)[key];
  if (s == null) {
    const k = `${locale}:${key}`;
    if (!missing.has(k)) { missing.add(k); console.warn(`[i18n] missing key ${k}`); }
    return key.includes('.') ? key.split('.').pop()! : key;
  }
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
export function fmtNum(locale: string, n: number): string {
  try {
    const tag = locale === 'es-MX' ? 'es-MX' : locale === 'es-ES' ? 'es-ES' : locale === 'tr-TR' ? 'tr-TR' : 'en-US';
    return new Intl.NumberFormat(tag).format(n);
  } catch { return String(n); }
}
// Turkish-safe uppercase helper (i->İ, ı->I)
export function upper(locale: string, s: string): string {
  try {
    if (locale.startsWith('tr')) return s.toLocaleUpperCase('tr-TR');
    return s.toLocaleUpperCase(locale);
  } catch { return s.toUpperCase(); }
}
export function truncateNick(s: string, max = 14): string {
  const g = [...s];
  return g.length <= max ? s : g.slice(0, max - 1).join('') + '…';
}
