// SQLite kalıcılık: profiller, sezon toplamları, olay günlüğü (Master Plan §0, §5.8)
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openStore(file = "data/vadi.sqlite") {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles(
      userId TEXT PRIMARY KEY, name TEXT, avatarUrl TEXT,
      totalDiamonds INTEGER DEFAULT 0, bestSingle INTEGER DEFAULT 0,
      bestTier INTEGER DEFAULT 1, streams INTEGER DEFAULT 0,
      firstSeen INTEGER, lastSeen INTEGER
    );
    CREATE TABLE IF NOT EXISTS events(
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, type TEXT, userId TEXT, payload TEXT
    );
    CREATE TABLE IF NOT EXISTS snapshots(
      id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, state TEXT
    );
  `);
  return {
    db,
    upsertGift({ userId, name, avatarUrl, total, bestSingle, bestTier, now }) {
      db.prepare(`
        INSERT INTO profiles(userId,name,avatarUrl,totalDiamonds,bestSingle,bestTier,streams,firstSeen,lastSeen)
        VALUES(?,?,?,?,?,?,1,?,?)
        ON CONFLICT(userId) DO UPDATE SET
          name=excluded.name,
          avatarUrl=COALESCE(excluded.avatarUrl, avatarUrl),
          totalDiamonds=totalDiamonds+excluded.totalDiamonds,
          bestSingle=max(bestSingle,excluded.bestSingle),
          bestTier=max(bestTier,excluded.bestTier),
          lastSeen=excluded.lastSeen
      `).run(userId, name, avatarUrl ?? "", total, bestSingle, bestTier, now, now);
    },
    touchJoin({ userId, name, now }) {
      db.prepare(`
        INSERT INTO profiles(userId,name,totalDiamonds,bestSingle,bestTier,streams,firstSeen,lastSeen)
        VALUES(?,?,0,0,1,1,?,?)
        ON CONFLICT(userId) DO UPDATE SET name=excluded.name, lastSeen=excluded.lastSeen
      `).run(userId, name, now, now);
    },
    leaderboard(limit = 7) {
      return db.prepare(`SELECT userId,name,totalDiamonds FROM profiles ORDER BY totalDiamonds DESC LIMIT ?`).all(limit);
    },
    log(type, userId, payload) {
      db.prepare(`INSERT INTO events(ts,type,userId,payload) VALUES(?,?,?,?)`)
        .run(Date.now(), type, userId ?? "", JSON.stringify(payload ?? {}));
    },
    snapshot(state) {
      db.prepare(`INSERT INTO snapshots(ts,state) VALUES(?,?)`).run(Date.now(), JSON.stringify(state));
    },
    close() { db.close(); },
  };
}
