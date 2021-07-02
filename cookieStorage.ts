export class Storage {
  #data = new Map<string, string>();

  get length(): number {
    return this.#data.size;
  }

  key(index: number): string | null {
    return [...this.#data.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.#data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#data.set(key, value);
  }

  removeItem(key: string): void {
    this.#data.delete(key);
  }

  clear(): void {
    this.#data.clear;
  }

  keys() {
    return this.#data.keys();
  }

  entries() {
    return this.#data.entries();
  }

  hydrate(entries: Iterable<readonly [string, string]>) {
    for (const [key, value] of entries) {
      this.#data.set(key, value);
    }
  }
}
