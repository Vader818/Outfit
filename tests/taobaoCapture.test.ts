import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readLatestTaobaoCapture, type CaptureFileSystem } from "../server/services/taobaoCapture";

function fakeFileSystem(files: Record<string, { text: string; mtimeMs: number; isFile?: boolean; size?: number }>): CaptureFileSystem {
  return {
    readdirSync: () => Object.keys(files),
    statSync: (filePath) => {
      const file = files[path.basename(filePath)];
      if (!file) {
        const error = new Error("missing file") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }
      return {
        mtimeMs: file.mtimeMs,
        size: file.size ?? Buffer.byteLength(file.text, "utf8"),
        isFile: () => file.isFile !== false
      };
    },
    readFileSync: (filePath) => {
      const file = files[path.basename(filePath)];
      if (!file) throw new Error("missing file");
      return file.text;
    }
  };
}

describe("Taobao Selenium capture artifacts", () => {
  it("reads the newest JSON artifact from the capture output directory", () => {
    const newestPayload = { source: "taobao-selenium-order-list", items: [{ itemId: "2" }] };
    const newestText = JSON.stringify(newestPayload, null, 2);

    const result = readLatestTaobaoCapture("captures", fakeFileSystem({
      "old.json": { text: JSON.stringify({ items: [{ itemId: "1" }] }), mtimeMs: 100 },
      "notes.txt": { text: "skip me", mtimeMs: 300 },
      "newest.json": { text: newestText, mtimeMs: 200 }
    }));

    expect(result).toMatchObject({
      outputDir: "captures",
      fileName: "newest.json",
      path: path.join("captures", "newest.json"),
      jsonText: newestText,
      payload: newestPayload
    });
  });

  it("reads Playwright item-detail artifacts with the same artifact reader", () => {
    const playwrightPayload = {
      source: "taobao-playwright-item-detail",
      pageType: "item-detail",
      items: [
        {
          pageType: "item-detail",
          itemId: "808",
          detailUrl: "https://item.taobao.com/item.htm?id=808",
          detailTitle: "Example shirt",
          detailProps: [{ name: "品牌", value: "UTIMUS" }],
          detailDescription: "夏季透气短袖。",
          detailImages: ["https://img.alicdn.com/example.jpg"],
          detailRawText: "品牌 UTIMUS 夏季透气短袖。"
        }
      ]
    };
    const jsonText = JSON.stringify(playwrightPayload, null, 2);

    const result = readLatestTaobaoCapture("captures", fakeFileSystem({
      "808-20260621-120000.json": { text: jsonText, mtimeMs: 200 }
    }));

    expect(result).toMatchObject({
      fileName: "808-20260621-120000.json",
      jsonText,
      payload: playwrightPayload
    });
  });

  it("can return a wardrobe-only copy of the newest capture without rewriting the artifact", () => {
    const newestPayload = {
      source: "taobao-selenium-order-list",
      pageType: "order-list",
      items: [
        {
          itemId: "1",
          orderId: "9000000000000000001",
          title: "2026-06-01 UTIMUS 订单详情 交易成功 UTIMUS纯棉短袖T恤男女同款夏季透气上衣 [交易快照] 黑色;M",
          status: "交易成功"
        },
        {
          itemId: "2",
          orderId: "9000000000000000002",
          title: "2026-06-01 讯迪旗舰店 订单详情 交易成功 适用红米手机壳保护套全包镜头防摔外壳",
          status: "交易成功"
        },
        {
          itemId: "3",
          orderId: "9000000000000000003",
          title: "2026-06-01 配饰店 订单详情 交易成功 羊毛围巾秋冬保暖柔软百搭",
          status: "交易成功"
        },
        {
          itemId: "4",
          orderId: "9000000000000000004",
          title: "2026-06-01 BOSIE 订单详情 交易关闭 BOSIE宽松直筒牛仔裤春秋通勤长裤 [交易快照] 蓝色;M",
          status: "交易关闭",
          refundText: "退款成功"
        }
      ]
    };
    const newestText = JSON.stringify(newestPayload, null, 2);
    const fileSystem = fakeFileSystem({
      "newest.json": { text: newestText, mtimeMs: 200 }
    });

    const result = readLatestTaobaoCapture("captures", fileSystem, { wardrobeOnly: true });

    expect(result.payload).toMatchObject({
      source: "taobao-selenium-order-list",
      pageType: "order-list",
      items: [
        expect.objectContaining({
          itemId: "1",
          title: expect.stringContaining("UTIMUS纯棉短袖T恤")
        }),
        expect.objectContaining({
          itemId: "3",
          title: expect.stringContaining("羊毛围巾")
        }),
        expect.objectContaining({
          itemId: "4",
          refundText: "退款成功"
        })
      ]
    });
    expect((result.payload as { items: unknown[] }).items).toHaveLength(3);
    expect(JSON.parse(result.jsonText)).toEqual(result.payload);
    expect(result.filterSummary).toEqual({
      originalItems: 4,
      keptItems: 3,
      skippedRefunded: 0,
      skippedNonApparel: 1
    });
    expect(fileSystem.readFileSync(path.join("captures", "newest.json"), "utf8")).toBe(newestText);
  });

  it("reads the newest JSON artifact from capture job subdirectories", () => {
    const newestPayload = {
      source: "taobao-selenium",
      pageType: "item-detail",
      items: [{ itemId: "730265944941", detailTitle: "ASICS GEL-1130 男女运动鞋老爹鞋" }]
    };
    const newestText = JSON.stringify(newestPayload, null, 2);
    const subdir = path.join("captures", "cap_mqajq2fs_dc2e4804");
    const newestPath = path.join(subdir, "730265944941-20260612-143024.json");
    const fileSystem: CaptureFileSystem = {
      readdirSync: (directory) => {
        if (directory === "captures") return ["old.json", "cap_mqajq2fs_dc2e4804"];
        if (directory === subdir) return ["730265944941-20260612-143024.json"];
        return [];
      },
      statSync: (filePath) => {
        if (filePath === path.join("captures", "old.json")) {
          return { mtimeMs: 100, isFile: () => true };
        }
        if (filePath === subdir) {
          return { mtimeMs: 300, isFile: () => false, isDirectory: () => true };
        }
        if (filePath === newestPath) {
          return { mtimeMs: 300, isFile: () => true };
        }
        throw new Error(`unexpected stat path ${filePath}`);
      },
      readFileSync: (filePath) => {
        if (filePath === path.join("captures", "old.json")) return JSON.stringify({ items: [{ itemId: "old" }] });
        if (filePath === newestPath) return newestText;
        throw new Error(`unexpected read path ${filePath}`);
      }
    };

    const result = readLatestTaobaoCapture("captures", fileSystem);

    expect(result).toMatchObject({
      outputDir: "captures",
      fileName: "730265944941-20260612-143024.json",
      path: newestPath,
      jsonText: newestText,
      payload: newestPayload
    });
  });

  it("reports when no JSON artifact exists", () => {
    expect(() => readLatestTaobaoCapture("captures", fakeFileSystem({
      "notes.txt": { text: "skip me", mtimeMs: 300 }
    }))).toThrow("没有找到 Selenium 采集产物");
  });

  it("rejects oversized JSON artifacts before parsing", () => {
    expect(() => readLatestTaobaoCapture("captures", fakeFileSystem({
      "huge.json": { text: "{}", mtimeMs: 300, size: 20 * 1024 * 1024 + 1 }
    }))).toThrow(/超过/);
  });

  it("does not follow a symlinked subdirectory outside the capture root", (context) => {
    const captureRoot = mkdtempSync(path.join(tmpdir(), "outfit-capture-root-"));
    const outsideRoot = mkdtempSync(path.join(tmpdir(), "outfit-capture-outside-"));
    writeFileSync(path.join(captureRoot, "safe.json"), JSON.stringify({ source: "safe" }), "utf8");
    writeFileSync(path.join(outsideRoot, "secret.json"), JSON.stringify({ source: "outside" }), "utf8");
    try {
      symlinkSync(
        outsideRoot,
        path.join(captureRoot, "linked"),
        process.platform === "win32" ? "junction" : "dir"
      );
    } catch (error) {
      if (["EPERM", "EACCES", "UNKNOWN"].includes((error as NodeJS.ErrnoException).code || "")) {
        context.skip();
        return;
      }
      throw error;
    }

    const result = readLatestTaobaoCapture(captureRoot);

    expect(result.fileName).toBe("safe.json");
    expect(result.payload).toEqual({ source: "safe" });
  });

  it("rejects a capture root that is itself a symbolic link", (context) => {
    const outsideRoot = mkdtempSync(path.join(tmpdir(), "outfit-capture-root-target-"));
    const parent = mkdtempSync(path.join(tmpdir(), "outfit-capture-root-link-"));
    const linkedRoot = path.join(parent, "captures");
    writeFileSync(path.join(outsideRoot, "secret.json"), JSON.stringify({ source: "outside" }), "utf8");
    try {
      symlinkSync(
        outsideRoot,
        linkedRoot,
        process.platform === "win32" ? "junction" : "dir"
      );
    } catch (error) {
      if (["EPERM", "EACCES", "UNKNOWN"].includes((error as NodeJS.ErrnoException).code || "")) {
        context.skip();
        return;
      }
      throw error;
    }

    expect(() => readLatestTaobaoCapture(linkedRoot)).toThrowError(
      expect.objectContaining({ code: "CAPTURE_ARTIFACT_UNSAFE" })
    );
  });
});
