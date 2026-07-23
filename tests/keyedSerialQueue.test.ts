import { describe, expect, it } from "vitest";
import { createKeyedSerialQueue } from "../src/lib/keyedSerialQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("keyed serial queue", () => {
  it("同一键严格按提交顺序运行，不同键可以并行", async () => {
    const queue = createKeyedSerialQueue<number>();
    const firstGate = deferred<void>();
    const events: string[] = [];

    const first = queue.run(1, async () => {
      events.push("first:start");
      await firstGate.promise;
      events.push("first:end");
      return "first";
    });
    const second = queue.run(1, async () => {
      events.push("second:start");
      return "second";
    });
    const otherKey = queue.run(2, async () => {
      events.push("other:start");
      return "other";
    });

    await otherKey;
    expect(events).toEqual(["first:start", "other:start"]);
    expect(queue.has(1)).toBe(true);

    firstGate.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(events).toEqual(["first:start", "other:start", "first:end", "second:start"]);
    expect(queue.has(1)).toBe(false);
  });

  it("前一项失败不会阻塞同键后续操作", async () => {
    const queue = createKeyedSerialQueue<string>();
    const failure = new Error("planned");

    const failed = queue.run("garment", async () => {
      throw failure;
    });
    const recovered = queue.run("garment", async () => "saved");

    await expect(failed).rejects.toBe(failure);
    await expect(recovered).resolves.toBe("saved");
    expect(queue.has("garment")).toBe(false);
  });
});
