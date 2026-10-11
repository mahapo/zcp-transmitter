// IndexedDB with promises, as little of it as the history needs.

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error);
  });
}

/** Opens a database, creating whichever of `stores` it lacks. A store's `keyPath` makes its keys count up by themselves. */
export function openDatabase(name: string, version: number, stores: Record<string, { keyPath?: string }>): Promise<IDBDatabase> {
  const request = indexedDB.open(name, version);
  request.onupgradeneeded = () => {
    for (const [store, { keyPath }] of Object.entries(stores)) {
      if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, keyPath ? { keyPath, autoIncrement: true } : undefined);
    }
  };
  return done(request);
}

/** Runs `work` on the named stores in one transaction and resolves with its result once everything is written. */
export async function transact<T>(
  database: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  work: (stores: IDBObjectStore[]) => Promise<T> | T,
): Promise<T> {
  const transaction = database.transaction(stores, mode);
  const ended = finished(transaction);
  const result = await work(stores.map((store) => transaction.objectStore(store)));
  await ended;
  return result;
}

export const request = done;
