// Small settings in localStorage. Storage can be missing or full, so nothing here ever throws.

export function load<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : { ...fallback, ...(JSON.parse(stored) as Partial<T>) };
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The setting just does not survive a reload.
  }
}
