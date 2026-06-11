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

  it("reports when no JSON artifact exists", () => {
    expect(() => readLatestTaobaoCapture("captures", fakeFileSystem({
      "notes.txt": { text: "skip me", mtimeMs: 300 }
    }))).toThrow("没有找到 Selenium 采集产物");
  });
});
