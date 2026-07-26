import { describe, expect, it } from "vitest";
import { createLatestRequestGate } from "../src/lib/latestRequest";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("latest request gate", () => {
  it("只允许后发请求在乱序完成时提交状态", async () => {
    const gate = createLatestRequestGate();
    const first = deferred<string>();
    const second = deferred<string>();
    const committed: string[] = [];

    const run = async (result: Promise<string>) => {
      const request = gate.begin();
      const value = await result;
      if (request.isCurrent()) committed.push(value);
    };

    const firstRun = run(first.promise);
    const secondRun = run(second.promise);
    second.resolve("new");
    await secondRun;
    first.resolve("old");
    await firstRun;

    expect(committed).toEqual(["new"]);
  });

  it("新 token 会立即使旧 token 失效", () => {
    const gate = createLatestRequestGate();
    const first = gate.begin();
    expect(first.isCurrent()).toBe(true);

    const second = gate.begin();

    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it("输入变化可以在不启动新请求时使当前 token 失效", () => {
    const gate = createLatestRequestGate();
    const request = gate.begin();

    gate.invalidate();

    expect(request.isCurrent()).toBe(false);
  });
});
