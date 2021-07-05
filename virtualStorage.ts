const _storage = Symbol.for("[[storage]]");
const _hydrated = Symbol.for("[[hydrated]]");
const _data = Symbol.for("[[data]]");
const _set = Symbol.for("[[set]]");
const _deleted = Symbol.for("[[deleted]]");

const _customInspect = Symbol.for("Deno.customInspect");

class Storage {
  [_hydrated] = new Set<string>();
  [_data] = new Map<string, string>();
  [_set] = new Set<string>();
  [_deleted] = new Set<string>();

  /** Returns the number of key/value pairs currently present in the list
   * associated with the object. */
  get length(): number {
    return this[_data].size;
  }

  /** Returns the name of the _nth_ key in the list, or `null` if _n_ is greater
   * than or equal to the number of key/value pairs in the object. */
  key(index: number): string | null {
    return [...this[_data].keys()][index] ?? null;
  }

  /** Returns the current value associated with the given key, or `null` if the
   * given key does not exist in the list associated with the object. */
  getItem(key: string): string | null {
    return this[_data].get(key) ?? null;
  }

  /** Sets the value of the pair identified by key to value, creating a new
   * key/value pair if none existed for key previously.
   *
   * Throws a `QuotaExceededError` DOMException exception if the new value
   * couldn't be set. (Setting could fail if, e.g., the user has disabled
   * storage for the site, or if the quota has been exceeded.) */
  setItem(key: string, value: string): void {
    this[_data].set(key, value);
    this[_set].add(key);
    this[_deleted].delete(key);
  }

  /** Removes the key/value pair with the given key from the list associated
   * with the object, if a key/value pair with the given key exists. */
  removeItem(key: string): void {
    if (this[_data].has(key)) {
      this[_data].delete(key);
      this[_set].delete(key);
      if (this[_hydrated].has(key)) {
        this[_deleted].add(key);
      }
    }
  }

  /** Empties the list associated with the object of all key/value pairs, if
   * there are any. */
  clear(): void {
    this[_set].clear();
    for (const key in this[_data].keys()) {
      this[_deleted].add(key);
    }
    this[_data].clear();
  }

  [_customInspect](
    inspect: typeof Deno.inspect,
    options?: Deno.InspectOptions,
  ) {
    return `${this.constructor.name} ${
      inspect({ length: this.length }, options)
    }`;
  }
}

class StorageManager {
  [_storage] = new Storage();

  /** Return an iterable of the keys currently within the store. */
  keys(): IterableIterator<string> {
    return this[_storage][_data].keys();
  }

  /** Return any keys that have been set since the last hydration of the
   * store. */
  set(): IterableIterator<string> {
    return this[_storage][_set].values();
  }

  /** Return any keys that have been deleted since the last hydration of the
   * store. */
  deleted(): IterableIterator<string> {
    return this[_storage][_deleted].values();
  }

  /** Populate the store with the values supplied. This will not clear out any
   * current values, other than overwriting any values of keys that already
   * exist in the store. */
  hydrate(entries: Iterable<readonly [string, string]>): void {
    this[_storage][_set].clear();
    this[_storage][_deleted].clear();
    for (const [key, value] of entries) {
      this[_storage][_hydrated].add(key);
      this[_storage][_data].set(key, value);
    }
  }

  [_customInspect](
    inspect: typeof Deno.inspect,
    options?: Deno.InspectOptions,
  ) {
    return `${this.constructor.name} ${
      inspect({ "[[storage]]": this[_storage] }, options)
    }`;
  }
}

const localManager = new StorageManager();
const sessionManager = new StorageManager();

/** Return the local storage manager. */
export function getLocalStorageManager(): StorageManager {
  return localManager;
}

/** Return the session storage manager. */
export function getSessionStorageManager(): StorageManager {
  return sessionManager;
}

export interface InstallGlobalsOptions {
  /** Install virtual storage as `localStorage`. Defaults to `true`. */
  local?: boolean;
  /** If `true` it will overwrite any existing globals. Defaults to `false`. */
  overwrite?: boolean;
  /** Install virtual storage as `sessionStorage`. Defaults to `true`. */
  session?: boolean;
}

/** Install virtual storage globally. By default this will install a global
 * `localStorage` and `sessionStorage` if they don't already exist in the global
 * scope. This can be changed by passing options. */
export function installGlobals(options: InstallGlobalsOptions = {}): void {
  console.log("installGlobals", options);
  const { local = true, overwrite = false, session = true } = options;
  if (local) {
    if (!("localStorage" in globalThis) || overwrite) {
      Object.defineProperty(globalThis, "localStorage", {
        value: localManager[_storage],
        writable: false,
        enumerable: true,
        configurable: true,
      });
    }
  }
  if (session) {
    if (!("sessionStorage" in globalThis) || overwrite) {
      Object.defineProperty(globalThis, "sessionStorage", {
        value: sessionManager[_storage],
        writable: false,
        enumerable: true,
        configurable: true,
      });
    }
  }
}

/** Create a new instance of virtual storage and associated manager, which are
 * returned as a tuple, with the first element being the DOM API storage
 * instance and the second being the API for managing the virtual storage. */
export function createVirtualStorage(): [Storage, StorageManager] {
  const manager = new StorageManager();
  return [manager[_storage], manager];
}
