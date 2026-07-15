import type { UserConfig } from "vite";
import { describe, expect, it } from "vitest";
import config from "../vite.config";

describe("Vite API proxy origin contract", () => {
  it("preserves the browser-facing Host for strict same-origin validation", () => {
    const proxy = (config as UserConfig).server?.proxy?.["/api"];

    expect(proxy).toEqual(expect.objectContaining({
      target: "http://127.0.0.1:8788",
      changeOrigin: false
    }));
  });
});
