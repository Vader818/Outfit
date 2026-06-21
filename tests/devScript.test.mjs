import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dev script", () => {
  it("terminates the Windows npm process tree during shutdown", () => {
    const script = readFileSync(new URL("../scripts/dev.mjs", import.meta.url), "utf8");

    expect(script).toMatch(/taskkill/);
    expect(script).toMatch(/"\/t"/);
    expect(script).toMatch(/child\.pid/);
  });
});
