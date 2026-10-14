import "server-only";

/** Only successes are cached. Copies prevent one caller from modifying another's result. */
export class MarketCache {
  private readonly values = new Map<string, { expiresAt: number; value: unknown }>();
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor(private readonly now: () => number, private readonly maxEntries = 256) {}

  async read<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const existing = this.values.get(key);
    if (existing && existing.expiresAt > this.now()) return structuredClone(existing.value) as T;
    this.values.delete(key);
    const inFlight = this.pending.get(key);
    if (inFlight) return structuredClone(await inFlight) as T;
    const work = load().then((value) => {
      if (this.values.size >= this.maxEntries) this.values.delete(this.values.keys().next().value!);
      this.values.set(key, { expiresAt: this.now() + ttlMs, value: structuredClone(value) });
      return value;
    });
    this.pending.set(key, work);
    try { return structuredClone(await work); }
    finally { this.pending.delete(key); }
  }
}
