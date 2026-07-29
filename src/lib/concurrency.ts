export const REFRESH_CONCURRENCY = 12;
export const ACTION_CONCURRENCY = 6;

export async function runLimited<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const next = index;
      index += 1;
      await worker(items[next], next);
    }
  });
  await Promise.all(workers);
}

/**
 * Serializes work for the same key while allowing different keys to run in
 * parallel. Rejections never poison the queue for later work.
 */
export class KeyedSerialQueue<Key> {
  private readonly tails = new Map<Key, Promise<void>>();

  async run<Result>(key: Key, task: () => Promise<Result>): Promise<Result> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.tails.set(key, tail);

    await previous.catch(() => undefined);
    try {
      return await task();
    } finally {
      release();
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    }
  }
}
