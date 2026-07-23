export interface KeyedSerialQueue<Key> {
  run<Value>(key: Key, operation: () => Promise<Value>): Promise<Value>;
  has(key: Key): boolean;
}

export function createKeyedSerialQueue<Key>(): KeyedSerialQueue<Key> {
  const tails = new Map<Key, Promise<void>>();

  return {
    run<Value>(key: Key, operation: () => Promise<Value>): Promise<Value> {
      const previous = tails.get(key) ?? Promise.resolve();
      const result = previous
        .catch(() => undefined)
        .then(operation);
      const tail = result.then(
        () => undefined,
        () => undefined
      );
      tails.set(key, tail);
      return result.finally(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
    },
    has(key: Key): boolean {
      return tails.has(key);
    }
  };
}
