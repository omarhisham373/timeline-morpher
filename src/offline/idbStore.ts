import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { OutboxItem, OutboxStore } from "./types";

interface FieldNotesDB extends DBSchema {
  outbox: { key: string; value: OutboxItem; indexes: { byCreatedAt: number } };
}

export const DB_NAME = "masaro-field-notes";
const DB_VERSION = 1;

/**
 * IndexedDB-backed outbox. Audio is stored as a Blob directly (structured
 * clone), so a recording survives reloads, crashes and airplane mode.
 */
export class IdbOutboxStore implements OutboxStore {
  private db: Promise<IDBPDatabase<FieldNotesDB>>;

  constructor(factory?: IDBFactory) {
    if (factory) (globalThis as { indexedDB?: IDBFactory }).indexedDB ??= factory;
    this.db = openDB<FieldNotesDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore("outbox", { keyPath: "id" });
        store.createIndex("byCreatedAt", "createdAt");
      },
    });
  }

  async put(item: OutboxItem) {
    try {
      await (await this.db).put("outbox", item);
    } catch (err) {
      if (err instanceof DOMException && err.name === "QuotaExceededError") {
        throw new Error("Device storage is full — free up space or sync existing notes first.");
      }
      throw err;
    }
  }
  async get(id: string) {
    return (await this.db).get("outbox", id);
  }
  async list() {
    return (await this.db).getAllFromIndex("outbox", "byCreatedAt");
  }
  async delete(id: string) {
    await (await this.db).delete("outbox", id);
  }
}

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}
