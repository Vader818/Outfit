import path from "node:path";
import { describe, expect, it } from "vitest";
import { readLatestTaobaoCapture, type CaptureFileSystem } from "../server/services/taobaoCapture";

function fakeFileSystem(files: Record<string, { text: string; mtimeMs: number; isFile?: boolean }>): CaptureFileSystem {
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
        })
      ]
    });
    expect((result.payload as { items: unknown[] }).items).toHaveLength(1);
    expect(JSON.parse(result.jsonText)).toEqual(result.payload);
    expect(result.filterSummary).toEqual({
      originalItems: 4,
      keptItems: 1,
      skippedRefunded: 1,
      skippedNonApparel: 2
    });
    expect(fileSystem.readFileSync(path.join("captures", "newest.json"), "utf8")).toBe(newestText);
  });

  it("reports when no JSON artifact exists", () => {
    expect(() => readLatestTaobaoCapture("captures", fakeFileSystem({
      "notes.txt": { text: "skip me", mtimeMs: 300 }
    }))).toThrow("没有找到 Selenium 采集产物");
  });
});
