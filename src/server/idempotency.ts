import "server-only";

/**
 * Tiny in-memory idempotency cache so an outbox retry that reaches the server
 * twice (response lost on a flaky link) returns the same result instead of
 * re-running the LLM. Per-instance only — a real deployment would use a KV store.
 */
export class IdempotencyCache<T> {
  private map = new Map<string, { at: number; value: T }>();
  constructor(private readonly ttlMs = 10 * 60_000, private readonly max = 500) {}

  get(key: string | null): T | undefined {
    if (!key) return undefined;
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string | null, value: T) {
    if (!key) return;
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value!);
    this.map.set(key, { at: Date.now(), value });
  }
}
