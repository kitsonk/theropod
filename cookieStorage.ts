export class Storage {
  #data = new Map<string, string>();
  #set = new Set<string>();
  #deleted = new Set<string>();

  get length(): number {
    console.log("get length");
    return this.#data.size;
  }

  key(index: number): string | null {
    console.log(`key()`, { index });
    return [...this.#data.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    console.log(`getItem()`, { key });
    return this.#data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    console.log("setItem()", { key, value });
    this.#data.set(key, value);
    this.#set.add(key);
    this.#deleted.delete(key);
  }

  removeItem(key: string): void {
    console.log("removeItem()", { key });
    if (this.#data.has(key)) {
      console.log("  has");
      this.#data.delete(key);
      this.#deleted.add(key);
      this.#set.delete(key);
    }
  }

  clear(): void {
    console.log("clear()");
    this.#set.clear();
    for (const key in this.#data.keys()) {
      this.#deleted.add(key);
    }
    this.#data.clear();
  }

  keys() {
    console.log("keys()", [...this.#data.keys()]);
    return this.#data.keys();
  }

  keysSet() {
    console.log("keysSet()", [...this.#set.values()]);
    return this.#set.values();
  }

  keysDeleted() {
    console.log("keysDeleted()", [...this.#deleted.values()]);
    return this.#deleted.values();
  }

  hydrate(entries: Iterable<readonly [string, string]>) {
    console.log("hydrate()");
    for (const [key, value] of entries) {
      console.log("->", { key, value });
      this.#data.set(key, value);
    }
  }
}
