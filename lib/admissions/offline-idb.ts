import { openDB, type IDBPDatabase } from "idb";
import type { AdmissionsOfflinePackV1, OfflinePendingOpV1 } from "./offline-pack-types";
import {
  ADMISSIONS_IDB,
  ADMISSIONS_LS_OUTBOX_KEY,
  ADMISSIONS_LS_PACK_KEY,
  ADMISSIONS_SS_OUTBOX_KEY,
  ADMISSIONS_SS_PACK_KEY,
  IDB_KEY_CURRENT,
  IDB_OUTBOX_STORE,
  IDB_PACK_STORE,
} from "./offline-pack-types";

let dbPromise: Promise<IDBPDatabase> | null = null;

const LS_PACK_MAX_CHARS = 4_500_000;

function canUseIndexedDB(): boolean {
  return typeof indexedDB !== "undefined";
}

type StorageKind = "local" | "session";
type SafeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorage(kind: StorageKind): SafeStorage | null {
  try {
    const store = kind === "local" ? localStorage : sessionStorage;
    const testKey = "__wtp_storage_test__";
    store.setItem(testKey, "1");
    store.removeItem(testKey);
    return store;
  } catch {
    return null;
  }
}

function packKey(kind: StorageKind): string {
  return kind === "local" ? ADMISSIONS_LS_PACK_KEY : ADMISSIONS_SS_PACK_KEY;
}

function outboxKey(kind: StorageKind): string {
  return kind === "local" ? ADMISSIONS_LS_OUTBOX_KEY : ADMISSIONS_SS_OUTBOX_KEY;
}

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(ADMISSIONS_IDB, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(IDB_PACK_STORE)) {
          db.createObjectStore(IDB_PACK_STORE);
        }
        if (!db.objectStoreNames.contains(IDB_OUTBOX_STORE)) {
          db.createObjectStore(IDB_OUTBOX_STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

function lsGetPack(): AdmissionsOfflinePackV1 | null {
  for (const kind of ["local", "session"] as const) {
    const store = getStorage(kind);
    if (!store) continue;
    try {
      const raw = store.getItem(packKey(kind));
      if (!raw) continue;
      return JSON.parse(raw) as AdmissionsOfflinePackV1;
    } catch {
      continue;
    }
  }
  return null;
}

function lsSetPack(pack: AdmissionsOfflinePackV1): void {
  const raw = JSON.stringify(pack);
  if (raw.length > LS_PACK_MAX_CHARS) {
    throw new Error(
      "Offline pack is too large for localStorage fallback (~4.5MB). Try a browser with IndexedDB or reduce event size."
    );
  }
  const local = getStorage("local");
  if (local) {
    local.setItem(ADMISSIONS_LS_PACK_KEY, raw);
    return;
  }
  const session = getStorage("session");
  if (session) {
    session.setItem(ADMISSIONS_SS_PACK_KEY, raw);
    return;
  }
  throw new Error(
    "Neither IndexedDB, localStorage, nor sessionStorage is available. Use a normal browser window with storage enabled."
  );
}

function lsRemovePack(): void {
  for (const kind of ["local", "session"] as const) {
    const store = getStorage(kind);
    if (!store) continue;
    try {
      store.removeItem(packKey(kind));
    } catch {
      /* ignore */
    }
  }
}

function lsListOutbox(): OfflinePendingOpV1[] {
  const byId = new Map<string, OfflinePendingOpV1>();
  for (const kind of ["local", "session"] as const) {
    const store = getStorage(kind);
    if (!store) continue;
    try {
      const raw = store.getItem(outboxKey(kind));
      if (!raw) continue;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) continue;
      for (const item of parsed as OfflinePendingOpV1[]) {
        if (!item?.id) continue;
        byId.set(item.id, item);
      }
    } catch {
      continue;
    }
  }
  return Array.from(byId.values());
}

function lsSetOutbox(ops: OfflinePendingOpV1[]): void {
  const raw = JSON.stringify(ops);
  if (raw.length > LS_PACK_MAX_CHARS) {
    throw new Error("Offline queue is too large for localStorage fallback. Sync pending scans, then try again.");
  }
  const local = getStorage("local");
  if (local) {
    local.setItem(ADMISSIONS_LS_OUTBOX_KEY, raw);
    return;
  }
  const session = getStorage("session");
  if (session) {
    session.setItem(ADMISSIONS_SS_OUTBOX_KEY, raw);
    return;
  }
  throw new Error(
    "Neither IndexedDB, localStorage, nor sessionStorage is available for the offline queue."
  );
}

function lsClearOutbox(): void {
  for (const kind of ["local", "session"] as const) {
    const store = getStorage(kind);
    if (!store) continue;
    try {
      store.removeItem(outboxKey(kind));
    } catch {
      /* ignore */
    }
  }
}

export async function idbGetPack(): Promise<AdmissionsOfflinePackV1 | null> {
  if (canUseIndexedDB()) {
    try {
      const db = await getDb();
      const fromIdb = (await db.get(IDB_PACK_STORE, IDB_KEY_CURRENT)) ?? null;
      if (fromIdb) return fromIdb;
    } catch {
      /* fall through to localStorage */
    }
  }
  return lsGetPack();
}

export async function idbSetPack(pack: AdmissionsOfflinePackV1): Promise<void> {
  let savedInIdb = false;
  if (canUseIndexedDB()) {
    try {
      const db = await getDb();
      await db.put(IDB_PACK_STORE, pack, IDB_KEY_CURRENT);
      savedInIdb = true;
      lsRemovePack();
    } catch {
      /* IndexedDB quota or transient error — fall back */
    }
  }
  if (!savedInIdb) {
    lsSetPack(pack);
  }
}

export async function idbClearAdmissionsData(): Promise<void> {
  if (canUseIndexedDB()) {
    try {
      const db = await getDb();
      const tx = db.transaction([IDB_PACK_STORE, IDB_OUTBOX_STORE], "readwrite");
      await tx.objectStore(IDB_PACK_STORE).delete(IDB_KEY_CURRENT);
      await tx.objectStore(IDB_OUTBOX_STORE).clear();
      await tx.done;
    } catch {
      /* still clear localStorage */
    }
  }
  lsRemovePack();
  lsClearOutbox();
}

export async function idbListOutbox(): Promise<OfflinePendingOpV1[]> {
  const fromLs = lsListOutbox();
  if (!canUseIndexedDB()) return fromLs;
  try {
    const db = await getDb();
    const fromIdb = (await db.getAll(IDB_OUTBOX_STORE)) as OfflinePendingOpV1[];
    const byId = new Map<string, OfflinePendingOpV1>();
    for (const o of fromIdb) byId.set(o.id, o);
    for (const o of fromLs) {
      if (!byId.has(o.id)) byId.set(o.id, o);
    }
    return Array.from(byId.values());
  } catch {
    return fromLs;
  }
}

export async function idbAddOutbox(op: OfflinePendingOpV1): Promise<void> {
  if (canUseIndexedDB()) {
    try {
      const db = await getDb();
      const fromLs = lsListOutbox();
      for (const o of fromLs) {
        await db.put(IDB_OUTBOX_STORE, o);
      }
      if (fromLs.length) lsClearOutbox();
      await db.put(IDB_OUTBOX_STORE, op);
      return;
    } catch {
      /* fall through */
    }
  }
  const list = lsListOutbox();
  list.push(op);
  lsSetOutbox(list);
}

export async function idbRemoveOutboxIds(ids: string[]): Promise<void> {
  const idSet = new Set(ids);
  if (canUseIndexedDB()) {
    try {
      const db = await getDb();
      const tx = db.transaction(IDB_OUTBOX_STORE, "readwrite");
      for (const id of ids) {
        await tx.store.delete(id);
      }
      await tx.done;
      const list = lsListOutbox().filter((o) => !idSet.has(o.id));
      if (list.length === 0) lsClearOutbox();
      else lsSetOutbox(list);
      return;
    } catch {
      /* fall through */
    }
  }
  const list = lsListOutbox().filter((o) => !idSet.has(o.id));
  lsSetOutbox(list);
}

export async function idbClearOutbox(): Promise<void> {
  if (canUseIndexedDB()) {
    try {
      const db = await getDb();
      await db.clear(IDB_OUTBOX_STORE);
    } catch {
      /* still clear LS */
    }
  }
  lsClearOutbox();
}
