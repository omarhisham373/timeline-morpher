import type { OutboxItem, OutboxStore } from "./types";

/** In-memory store for tests and as a fallback when IndexedDB is unavailable (private mode, SSR). */
export class MemoryOutboxStore implements OutboxStore {
  private items = new Map<string, OutboxItem>();
  async put(item: OutboxItem) {
    this.items.set(item.id, { ...item });
  }
  async get(id: string) {
    const v = this.items.get(id);
    return v ? { ...v } : undefined;
  }
  async list() {
    return [...this.items.values()].map((v) => ({ ...v })).sort((a, b) => a.createdAt - b.createdAt);
  }
  async delete(id: string) {
    this.items.delete(id);
  }
}
