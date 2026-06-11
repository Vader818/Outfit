import { afterEach, describe, expect, it, vi } from "vitest";
import { readLatestTaobaoCapture, startTaobaoItemCapture, startTaobaoOrderCapture } from "../src/api";

describe("frontend API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts Taobao order Selenium capture options", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      started: true,
      mode: "orders",
      pid: 4321,
      outputDir: "output/taobao-captures"
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startTaobaoOrderCapture({ maxPages: 2, loginWait: 45 })).resolves.toMatchObject({
      started: true,
      mode: "orders"
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/capture/taobao-orders", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ maxPages: 2, loginWait: 45 })
    }));
  });

  it("posts Taobao item Selenium capture URL", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      started: true,
      mode: "item-detail",
      pid: 4322,
      outputDir: "output/taobao-captures"
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startTaobaoItemCapture({
      url: "https://item.taobao.com/item.htm?id=808",
      loginWait: 30
    })).resolves.toMatchObject({
      started: true,
      mode: "item-detail"
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/capture/taobao-item", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ url: "https://item.taobao.com/item.htm?id=808", loginWait: 30 })
    }));
  });

  it("loads the latest Taobao Selenium capture artifact", async () => {
    const payload = { source: "taobao-selenium", items: [{ itemId: "808" }] };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      outputDir: "output/taobao-captures",
      fileName: "808-20260611-140600.json",
      path: "output/taobao-captures/808-20260611-140600.json",
      jsonText: JSON.stringify(payload, null, 2),
      payload
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readLatestTaobaoCapture()).resolves.toMatchObject({
      outputDir: "output/taobao-captures",
      fileName: "808-20260611-140600.json",
      payload
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/capture/taobao-latest", expect.objectContaining({
      method: "GET"
    }));
  });

  it("requests wardrobe-only filtering for the latest Taobao capture when asked", async () => {
    const payload = { source: "taobao-selenium-order-list", items: [{ itemId: "808" }] };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      outputDir: "output/taobao-captures",
      fileName: "taobao-orders-20260611-152934.json",
      path: "output/taobao-captures/taobao-orders-20260611-152934.json",
      jsonText: JSON.stringify(payload, null, 2),
      payload,
      filterSummary: {
        originalItems: 8,
        keptItems: 3,
        skippedRefunded: 1,
        skippedNonApparel: 4
      }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readLatestTaobaoCapture({ wardrobeOnly: true })).resolves.toMatchObject({
      payload,
      filterSummary: {
        originalItems: 8,
        keptItems: 3,
        skippedRefunded: 1,
        skippedNonApparel: 4
      }
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/capture/taobao-latest?wardrobeOnly=1", expect.objectContaining({
      method: "GET"
    }));
  });

  it("posts wear logs with garment ids and optional context", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 15 }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const recordWearLog = (await import("../src/api") as {
      recordWearLog?: (input: {
        garmentIds: number[];
        context?: Record<string, unknown>;
      }) => Promise<unknown>;
    }).recordWearLog;

    expect(recordWearLog).toEqual(expect.any(Function));

    await expect(recordWearLog?.({
      garmentIds: [101, 202],
      context: {
        outfitId: "outfit-1",
        occasion: "smart-casual"
      }
    })).resolves.toMatchObject({ id: 15 });

    expect(fetchMock).toHaveBeenCalledWith("/api/wear-logs", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        garmentIds: [101, 202],
        context: {
          outfitId: "outfit-1",
          occasion: "smart-casual"
        }
      })
    }));
  });
});
