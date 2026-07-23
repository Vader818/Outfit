import { describe, expect, it } from "vitest";
import { settleMutations } from "../src/lib/settledMutations";

describe("settleMutations", () => {
  it("等待所有变更结束，并按输入顺序区分成功与失败项", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let completed = false;

    const pending = settleMutations([101, 102], async (id) => {
      if (id === 101) {
        await firstCanFinish;
        return;
      }
      throw new Error("第二件失败");
    }).then((result) => {
      completed = true;
      return result;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(completed).toBe(false);

    releaseFirst?.();
    const result = await pending;
    expect(result.succeeded).toEqual([101]);
    expect(result.failed).toEqual([102]);
    expect(result.failureReasons).toEqual([expect.objectContaining({ message: "第二件失败" })]);
  });

  it("把同步异常也作为单项失败收集，而不是提前中断其余变更", async () => {
    const visited: number[] = [];
    const result = await settleMutations([1, 2, 3], (id) => {
      visited.push(id);
      if (id === 2) throw new Error("同步失败");
      return Promise.resolve();
    });

    expect(visited).toEqual([1, 2, 3]);
    expect(result.succeeded).toEqual([1, 3]);
    expect(result.failed).toEqual([2]);
  });
});
