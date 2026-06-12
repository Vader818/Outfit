import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import {
  downloadGarmentThumbnail,
  rankThumbnailCandidates,
  readImageInfo
} from "../server/services/thumbnails";

describe("thumbnail candidate ranking", () => {
  it("prioritizes real product pictures over Taobao platform and logo assets", () => {
    const ranked = rankThumbnailCandidates({
      category: "shoes",
      title: "TANZ 001 天方361男鞋运动鞋2026夏季篮球文化鞋潮流跑步休闲鞋",
      sku: "颜色分类: 曜石黑/银白色; 鞋码: 42",
      imageUrl: "https://gw.alicdn.com/imgextra/i2/O1CN01IBkgQN26Fy77Dv9zk_!!6000000007633-2-tps-80-36.png",
      detailImages: [
        "https://img.alicdn.com/imgextra/i4/O1CN018GrFIW1Zx7vwjt3Jg_!!6000000003260-2-tps-91-14.png",
        "https://gw.alicdn.com/imgextra/i1/O1CN01VD9Iap25oweneR31D_!!6000000007574-2-tps-120-60.png",
        "https://img.alicdn.com/imgextra/i4/363607599/O1CN01noILpD260OqjdMQz6_!!4611686018427385391-0-item_pic.jpg",
        "https://gw.alicdn.com/bao/uploaded/i4/363607599/O1CN01lA6h4g260Oq99PxN3-363607599.jpg"
      ]
    });

    expect(ranked[0].url).toBe("https://img.alicdn.com/imgextra/i4/363607599/O1CN01noILpD260OqjdMQz6_!!4611686018427385391-0-item_pic.jpg");
    expect(ranked.map((candidate) => candidate.url)).not.toContain("https://gw.alicdn.com/imgextra/i2/O1CN01IBkgQN26Fy77Dv9zk_!!6000000007633-2-tps-80-36.png");
  });
});

describe("thumbnail image probing and download", () => {
  it("reads dimensions from PNG bytes", () => {
    expect(readImageInfo(makePng(640, 480))).toEqual({
      format: "png",
      width: 640,
      height: 480
    });
  });

  it("downloads only a small number of candidates and stores the first valid garment image", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "outfit-thumb-test-"));
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes("tiny-banner")) {
        return new Response(pngBody(91, 14), {
          status: 200,
          headers: { "content-type": "image/png" }
        });
      }
      return new Response(pngBody(900, 700), {
        status: 200,
        headers: { "content-type": "image/png" }
      });
    });

    const result = await downloadGarmentThumbnail({
      garmentId: 42,
      itemId: "1041553367966",
      category: "shoes",
      title: "361男鞋运动鞋2026夏季篮球文化鞋跑步潮流休闲鞋",
      sku: "颜色分类: 曜石黑/银白色",
      candidates: [
        "https://img.alicdn.com/imgextra/i3/363607599/O1CN01tiny-banner_!!4611686018427385391-0-item_pic.jpg",
        "https://gw.alicdn.com/bao/uploaded/i3/363607599/O1CN01shoe.jpg",
        "https://img.alicdn.com/imgextra/i3/363607599/O1CN01backup.jpg"
      ],
      outputDir,
      publicBasePath: "/api/garment-thumbnails",
      maxDownloads: 2,
      delayMs: 0,
      fetcher: fetchMock
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      sourceUrl: "https://gw.alicdn.com/bao/uploaded/i3/363607599/O1CN01shoe.jpg",
      localUrl: "/api/garment-thumbnails/garment-42-1041553367966.png"
    });
    expect(existsSync(join(outputDir, "garment-42-1041553367966.png"))).toBe(true);
  });
});

function makePng(width: number, height: number): Uint8Array {
  const bytes = Buffer.alloc(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 2;
  return bytes;
}

function pngBody(width: number, height: number): ArrayBuffer {
  const bytes = makePng(width, height);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
