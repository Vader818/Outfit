import { describe, expect, it } from "vitest";

describe("privacy clean script", () => {
  it("plans sensitive local data cleanup without confirming deletion by default", async () => {
    const moduleUrl = new URL("../scripts/privacy-clean.mjs", import.meta.url).href;
    const privacyClean = await import(moduleUrl) as {
      buildPrivacyCleanPlan: (root: string) => Array<{ relativePath: string; sensitive: boolean; requiresExtraConfirmation: boolean }>;
      parsePrivacyCleanArgs: (args: string[]) => { confirm: boolean; includeLoginState: boolean };
    };

    const args = privacyClean.parsePrivacyCleanArgs([]);
    const plan = privacyClean.buildPrivacyCleanPlan("D:\\JavaWork\\Outfit");

    expect(args).toEqual({ confirm: false, includeLoginState: false });
    expect(plan).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relativePath: "output/chrome-taobao-profile",
        sensitive: true,
        requiresExtraConfirmation: true
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

  it("requires an explicit login-state flag in addition to confirm before cleaning the Selenium profile", async () => {
    const moduleUrl = new URL("../scripts/privacy-clean.mjs", import.meta.url).href;
    const privacyClean = await import(moduleUrl) as {
      parsePrivacyCleanArgs: (args: string[]) => { confirm: boolean; includeLoginState: boolean };
      shouldCleanTarget: (
        target: { requiresExtraConfirmation: boolean },
        args: { confirm: boolean; includeLoginState: boolean }
      ) => boolean;
    };

    const loginStateTarget = { requiresExtraConfirmation: true };

    expect(privacyClean.shouldCleanTarget(loginStateTarget, privacyClean.parsePrivacyCleanArgs(["--confirm"]))).toBe(false);
    expect(privacyClean.shouldCleanTarget(loginStateTarget, privacyClean.parsePrivacyCleanArgs(["--confirm", "--include-login-state"]))).toBe(true);
  });
});
