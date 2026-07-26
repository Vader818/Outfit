import { describe, expect, it } from "vitest";
import { createExclusiveActionLock } from "../src/lib/exclusiveAction";

describe("exclusive action lock", () => {
  it("拒绝重叠动作，且只有当前持有者能够释放锁", () => {
    const lock = createExclusiveActionLock<string>();

    expect(lock.current()).toBeNull();
    expect(lock.tryAcquire("history")).toBe(true);
    expect(lock.current()).toBe("history");

    expect(lock.tryAcquire("export")).toBe(false);
    expect(lock.release("export")).toBe(false);
    expect(lock.current()).toBe("history");

    expect(lock.release("history")).toBe(true);
    expect(lock.current()).toBeNull();
    expect(lock.release("history")).toBe(false);

    expect(lock.tryAcquire("export")).toBe(true);
    expect(lock.current()).toBe("export");
  });
});
