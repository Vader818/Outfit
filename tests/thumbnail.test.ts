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
      imageUrl: "https://gw.alicdn.com/imgextra/i2/12345/O1CN01platform-2-tps-80-36.png",
      detailImages: [
        "https://img.alicdn.com/imgextra/i4/12345/O1CN01logo-2-tps-91-14.png",
        "https://gw.alicdn.com/imgextra/i1/23456/O1CN01store-2-tps-120-60.png",
        "https://img.alicdn.com/imgextra/i4/34567/O1CN01product_!!sample-item_pic.jpg",
        "https://gw.alicdn.com/bao/uploaded/i4/34567/O1CN01fallback-34567.jpg"
      ]
    });

    expect(ranked[0].url).toBe("https://img.alicdn.com/imgextra/i4/34567/O1CN01product_!!sample-item_pic.jpg");
    expect(ranked.map((candidate) => candidate.url)).not.toContain("https://gw.alicdn.com/imgextra/i2/12345/O1CN01platform-2-tps-80-36.png");
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
      itemId: "sample-item-1",
      category: "shoes",
      title: "361男鞋运动鞋2026夏季篮球文化鞋跑步潮流休闲鞋",
      sku: "颜色分类: 曜石黑/银白色",
      candidates: [
        "https://img.alicdn.com/imgextra/i3/34567/O1CN01tiny-banner_!!sample-item_pic.jpg",
        "https://gw.alicdn.com/bao/uploaded/i3/34567/O1CN01shoe.jpg",
        "https://img.alicdn.com/imgextra/i3/34567/O1CN01backup.jpg"
      ],
      outputDir,
      publicBasePath: "/api/garment-thumbnails",
      maxDownloads: 2,
      delayMs: 0,
      fetcher: fetchMock
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      sourceUrl: "https://gw.alicdn.com/bao/uploaded/i3/34567/O1CN01shoe.jpg",
      localUrl: "/api/garment-thumbnails/garment-42-sample-item-1.png"
    });
    expect(existsSync(join(outputDir, "garment-42-sample-item-1.png"))).toBe(true);
  });

  it("rejects non-Taobao and private thumbnail URLs before fetching", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "outfit-thumb-test-"));
    const fetchMock = vi.fn(async () => new Response(pngBody(900, 700), {
      status: 200,
      headers: { "content-type": "image/png" }
    }));

    const result = await downloadGarmentThumbnail({
      garmentId: 7,
      category: "top",
      title: "白色衬衫",
      candidates: [
        "http://127.0.0.1/private.jpg",
        "http://localhost/private.jpg",
        "https://192.168.1.20/private.jpg",
        "file:///tmp/private.jpg",
        "data:image/png;base64,AAAA",
        "https://example.com/remote.jpg"
      ],
      outputDir,
      publicBasePath: "/api/garment-thumbnails",
      maxDownloads: 6,
      delayMs: 0,
      fetcher: fetchMock
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not follow thumbnail redirects to private addresses", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "outfit-thumb-test-"));
    const failures: Array<{ reason: string; detail?: string }> = [];
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/private.png" }
    }));

    const result = await downloadGarmentThumbnail({
      garmentId: 17,
      category: "top",
      title: "白色衬衫",
      candidates: ["https://img.alicdn.com/imgextra/i1/123/O1CN01shirt.jpg"],
      outputDir,
      publicBasePath: "/api/garment-thumbnails",
      delayMs: 0,
      fetcher: fetchMock,
      onFailure: (event) => failures.push(event)
    });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://img.alicdn.com/imgextra/i1/123/O1CN01shirt.jpg",
      expect.objectContaining({ redirect: "manual" })
    );
    expect(failures).toContainEqual(expect.objectContaining({
      reason: "blocked_address",
      detail: "http://127.0.0.1/private.png"
    }));
    expect(existsSync(join(outputDir, "garment-17-unknown.png"))).toBe(false);
  });

  it("rejects thumbnail downloads with an oversized content length", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "outfit-thumb-test-"));
    const fetchMock = vi.fn(async () => new Response(pngBody(900, 700), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-length": String(6 * 1024 * 1024)
      }
    }));

    const result = await downloadGarmentThumbnail({
      garmentId: 8,
      category: "top",
      title: "白色衬衫",
      candidates: ["https://img.alicdn.com/imgextra/i1/123/O1CN01shirt.jpg"],
      outputDir,
      publicBasePath: "/api/garment-thumbnails",
      delayMs: 0,
      fetcher: fetchMock
    });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(existsSync(join(outputDir, "garment-8-unknown.png"))).toBe(false);
  });

  it("aborts thumbnail streams that exceed the configured byte limit", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "outfit-thumb-test-"));
    const fetchMock = vi.fn(async () => new Response(pngBody(900, 700), {
      status: 200,
      headers: { "content-type": "image/png" }
    }));
    const failures: string[] = [];

    const result = await downloadGarmentThumbnail({
      garmentId: 9,
      category: "top",
      title: "白色衬衫",
      candidates: ["https://img.alicdn.com/imgextra/i1/123/O1CN01shirt.jpg"],
      outputDir,
      publicBasePath: "/api/garment-thumbnails",
      maxBytes: 16,
      delayMs: 0,
      fetcher: fetchMock,
      onFailure: (event) => failures.push(event.reason)
    });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(failures).toContain("size_limit_exceeded");
    expect(existsSync(join(outputDir, "garment-9-unknown.png"))).toBe(false);
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
