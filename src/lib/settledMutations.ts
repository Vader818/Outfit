export interface SettledMutations<T> {
  succeeded: T[];
  failed: T[];
  failureReasons: unknown[];
}

export async function settleMutations<T>(
  items: readonly T[],
  mutate: (item: T, index: number) => unknown | PromiseLike<unknown>
): Promise<SettledMutations<T>> {
  const results = await Promise.allSettled(
    items.map((item, index) => Promise.resolve().then(() => mutate(item, index)))
  );
  const succeeded: T[] = [];
  const failed: T[] = [];
  const failureReasons: unknown[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      succeeded.push(items[index]);
      return;
    }
    failed.push(items[index]);
    failureReasons.push(result.reason);
  });

  return { succeeded, failed, failureReasons };
}
