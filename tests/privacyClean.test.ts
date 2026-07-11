import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("privacy clean script", () => {
  it("plans sensitive local data cleanup without confirming deletion by default", async () => {
    const moduleUrl = new URL("../scripts/privacy-clean.mjs", import.meta.url).href;
    const privacyClean = await import(moduleUrl) as {
      buildPrivacyCleanPlan: (root: string) => Array<{ relativePath: string; sensitive: boolean; requiresExtraConfirmation: boolean; kind: string }>;
      parsePrivacyCleanArgs: (args: string[]) => { confirm: boolean; includeLoginState: boolean };
    };

    const args = privacyClean.parsePrivacyCleanArgs([]);
    const plan = privacyClean.buildPrivacyCleanPlan("D:\\JavaWork\\Outfit");

    expect(args).toEqual({ confirm: false, includeLoginState: false });
    expect(plan).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relativePath: "output/chrome-taobao-profile",
        sensitive: true,
        requiresExtraConfirmation: true,
        kind: "directory"
      }),
      expect.objectContaining({
        relativePath: "output/playwright-taobao-profile",
        sensitive: true,
        requiresExtraConfirmation: true,
        kind: "directory"
      }),
      expect.objectContaining({
        relativePath: "output/taobao-captures",
        sensitive: true,
        requiresExtraConfirmation: false
      }),
      expect.objectContaining({
        relativePath: "data/outfit.sqlite*",
        sensitive: true,
        requiresExtraConfirmation: false
      })
    ]));
  });

  it("requires both flags before cleaning either Selenium or Playwright login state", async () => {
    const moduleUrl = new URL("../scripts/privacy-clean.mjs", import.meta.url).href;
    const privacyClean = await import(moduleUrl) as {
      parsePrivacyCleanArgs: (args: string[]) => { confirm: boolean; includeLoginState: boolean };
      buildPrivacyCleanPlan: (root: string) => Array<{ relativePath: string; requiresExtraConfirmation: boolean }>;
      shouldCleanTarget: (
        target: { requiresExtraConfirmation: boolean },
        args: { confirm: boolean; includeLoginState: boolean }
      ) => boolean;
    };

    const plan = privacyClean.buildPrivacyCleanPlan("D:\\JavaWork\\Outfit");
    const loginTargets = [
      "output/chrome-taobao-profile",
      "output/playwright-taobao-profile"
    ].map((relativePath) => plan.find((target) => target.relativePath === relativePath));
    expect(loginTargets.every(Boolean)).toBe(true);

    for (const loginStateTarget of loginTargets) {
      if (!loginStateTarget) throw new Error("missing login-state cleanup target");
      expect(privacyClean.shouldCleanTarget(loginStateTarget, privacyClean.parsePrivacyCleanArgs([]))).toBe(false);
      expect(privacyClean.shouldCleanTarget(loginStateTarget, privacyClean.parsePrivacyCleanArgs(["--include-login-state"]))).toBe(false);
      expect(privacyClean.shouldCleanTarget(loginStateTarget, privacyClean.parsePrivacyCleanArgs(["--confirm"]))).toBe(false);
      expect(privacyClean.shouldCleanTarget(
        loginStateTarget,
        privacyClean.parsePrivacyCleanArgs(["--confirm", "--include-login-state"])
      )).toBe(true);
    }
  });

  it("previews both login profiles without invoking cleanup", async () => {
    const moduleUrl = new URL("../scripts/privacy-clean.mjs", import.meta.url).href;
    const privacyClean = await import(moduleUrl) as {
      buildPrivacyCleanPlan: (root: string) => Array<{ absolutePath: string; requiresExtraConfirmation: boolean }>;
      parsePrivacyCleanArgs: (args: string[]) => { confirm: boolean; includeLoginState: boolean };
      formatPrivacyCleanPlan: (
        plan: Array<{ absolutePath: string; description?: string; requiresExtraConfirmation: boolean }>,
        args: { confirm: boolean; includeLoginState: boolean }
      ) => string;
    };
    const plan = privacyClean.buildPrivacyCleanPlan("D:\\JavaWork\\Outfit");
    const preview = privacyClean.formatPrivacyCleanPlan(plan, privacyClean.parsePrivacyCleanArgs([]));
    const confirmedWithoutLogin = privacyClean.formatPrivacyCleanPlan(
      plan,
      privacyClean.parsePrivacyCleanArgs(["--confirm"])
    );
    const confirmedWithLogin = privacyClean.formatPrivacyCleanPlan(
      plan,
      privacyClean.parsePrivacyCleanArgs(["--confirm", "--include-login-state"])
    );

    for (const profile of ["chrome-taobao-profile", "playwright-taobao-profile"]) {
      expect(preview.split("\n").find((line) => line.includes(profile))).toContain("仅提示");
      expect(confirmedWithoutLogin.split("\n").find((line) => line.includes(profile))).toContain("仅提示");
      expect(confirmedWithLogin.split("\n").find((line) => line.includes(profile))).toContain("将删除");
    }
    expect(preview).toContain("不会删除任何文件");
    expect(confirmedWithoutLogin).toContain("保留 Selenium 与 Playwright 淘宝登录态");
  });

  it("rejects a lexically local target whose real path escapes through a junction", async () => {
    const moduleUrl = new URL("../scripts/privacy-clean.mjs", import.meta.url).href;
    const privacyClean = await import(moduleUrl) as {
      isInsideRoot: (root: string, targetPath: string) => boolean;
    };
    const root = path.resolve("D:\\JavaWork\\Outfit");
    const redirectedData = path.resolve(root, "data");
    const outsideData = path.resolve("D:\\Outside\\outfit-data");
    const realpath = vi.spyOn(fs.realpathSync, "native").mockImplementation(((candidate: fs.PathLike) => {
      const resolved = path.resolve(String(candidate));
      if (resolved === redirectedData) return outsideData;
      return resolved;
    }) as typeof fs.realpathSync.native);

    try {
      expect(privacyClean.isInsideRoot(root, redirectedData)).toBe(false);
      expect(privacyClean.isInsideRoot(root, path.resolve(root, "output"))).toBe(true);
      expect(privacyClean.isInsideRoot(root, path.resolve(root, "..", "outside"))).toBe(false);
    } finally {
      realpath.mockRestore();
    }
  });
});
