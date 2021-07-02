export class Storage {
  #data = new Map<string, string>();
  #set = new Set<string>();
  #deleted = new Set<string>();

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
    this.#set.add(key);
    this.#deleted.delete(key);
  }

  removeItem(key: string): void {
    if (this.#data.has(key)) {
      this.#data.delete(key);
      this.#deleted.add(key);
      this.#set.delete(key);
    }
  }

  clear(): void {
    this.#set.clear();
    for (const key in this.#data.keys()) {
      this.#deleted.add(key);
    }
    this.#data.clear();
  }

  keys() {
    return this.#data.keys();
  }

  keysSet() {
    return this.#set.values();
  }

  keysDeleted() {
    return this.#deleted.values();
  }

  hydrate(entries: Iterable<readonly [string, string]>) {
    for (const [key, value] of entries) {
      this.#data.set(key, value);
    }
  }
}
