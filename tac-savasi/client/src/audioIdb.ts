// Tiny IndexedDB wrapper so music files picked in the console survive reloads.
// Only the two music slots are persisted (small count, user intent is explicit).
const DB = 'tac-audio';
const STORE = 'files';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function idbSave(name: string, blob: Blob, filename?: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const r = tx(db, 'readwrite').put({ blob, filename: filename ?? '' }, name);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
  db.close();
}

export interface SavedAudio { name: string; blob: Blob; filename: string }

export async function idbLoadAll(): Promise<SavedAudio[]> {
  try {
    const db = await openDb();
    const rows: SavedAudio[] = await new Promise((resolve, reject) => {
      const out: SavedAudio[] = [];
      const cursor = tx(db, 'readonly').openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve(out);
        const v = c.value as Blob | { blob?: Blob; filename?: string };
        if (v instanceof Blob) out.push({ name: String(c.key), blob: v, filename: '' });
        else if (v?.blob instanceof Blob) out.push({ name: String(c.key), blob: v.blob, filename: String(v.filename ?? '') });
        c.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });
    db.close();
    return rows;
  } catch {
    return [];
  }
}

export async function idbClear(name?: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const store = tx(db, 'readwrite');
      const r = name ? store.delete(name) : store.clear();
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
    db.close();
  } catch { /* yoksa sorun yok */ }
}
