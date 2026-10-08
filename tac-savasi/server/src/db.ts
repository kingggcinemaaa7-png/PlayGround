// Persistence: better-sqlite3 when available, JSON-file fallback otherwise.
// Tables: viewers(userId, name, pic, damage, crowns, gifts, diamonds, matches), matches telemetry.
import fs from 'node:fs';

export interface Db {
  upsertViewer(v: { userId: string; name: string; pic: string | null; damage: number; crowns: number; gifts: number; diamonds: number }): void;
  topByDamage(limit: number): { userId: string; name: string; damage: number; crowns: number }[];
  logMatch(row: Record<string, string | number>): void;
  close(): void;
}

export function openDb(path = 'data/tac.db'): Db {
  try {
    const req = (globalThis as unknown as { require?: (m: string) => unknown }).require;
    const mod = req ? (req('better-sqlite3') as new (p: string) => unknown) : null;
    if (!mod) throw new Error('no require');
    fs.mkdirSync(path.split('/').slice(0, -1).join('/') || '.', { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = new (mod as any)(path) as any;
    db.exec(`CREATE TABLE IF NOT EXISTS viewers(userId TEXT PRIMARY KEY, name TEXT, pic TEXT, damage REAL DEFAULT 0, crowns INT DEFAULT 0, gifts INT DEFAULT 0, diamonds INT DEFAULT 0, matches INT DEFAULT 0);
CREATE TABLE IF NOT EXISTS matches(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, viewers INT, gifts TEXT, goalFillSec REAL, mercyRevives INT, bossKillSec REAL, avgWatchSec REAL);`);
    const up = db.prepare(`INSERT INTO viewers(userId,name,pic,damage,crowns,gifts,diamonds) VALUES(@userId,@name,@pic,@damage,@crowns,@gifts,@diamonds)
      ON CONFLICT(userId) DO UPDATE SET name=excluded.name, pic=excluded.pic, damage=viewers.damage+excluded.damage, crowns=viewers.crowns+excluded.crowns, gifts=viewers.gifts+excluded.gifts, diamonds=viewers.diamonds+excluded.diamonds`);
    const top = db.prepare(`SELECT userId,name,damage,crowns FROM viewers ORDER BY damage DESC LIMIT ?`);
    const log = db.prepare(`INSERT INTO matches(ts,viewers,gifts,goalFillSec,mercyRevives,bossKillSec,avgWatchSec) VALUES(@ts,@viewers,@gifts,@goalFillSec,@mercyRevives,@bossKillSec,@avgWatchSec)`);
    return {
      upsertViewer: (v) => up.run(v),
      topByDamage: (n) => top.all(n),
      logMatch: (r) => log.run(r),
      close: () => db.close(),
    };
  } catch {
    // JSON fallback — same API, local file only.
    const file = path.replace(/\.db$/, '.json');
    fs.mkdirSync(file.split('/').slice(0, -1).join('/') || '.', { recursive: true });
    let data: Record<string, { userId: string; name: string; pic: string | null; damage: number; crowns: number; gifts: number; diamonds: number }> = {};
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* fresh */ }
    const save = () => fs.writeFileSync(file, JSON.stringify(data));
    return {
      upsertViewer: (v) => {
        const cur = data[v.userId] ?? { ...v, damage: 0, crowns: 0, gifts: 0, diamonds: 0 };
        cur.name = v.name; cur.pic = v.pic;
        cur.damage += v.damage; cur.crowns += v.crowns; cur.gifts += v.gifts; cur.diamonds += v.diamonds;
        data[v.userId] = cur; save();
      },
      topByDamage: (n) => Object.values(data).sort((a, b) => b.damage - a.damage).slice(0, n).map((v) => ({ userId: v.userId, name: v.name, damage: v.damage, crowns: v.crowns })),
      logMatch: (r) => { fs.appendFileSync('data/telemetry.csv', Object.values(r).join(',') + '\n'); },
      close: () => undefined,
    };
  }
}
