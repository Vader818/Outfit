import { afterEach, describe, expect, it, vi } from "vitest";
import { exportLocalData, getCaptureJob, getCaptureJobArtifact, getInsights, getPersonalProfile, getRecommendationRuns, getWearLogs, previewTaobaoImport, readLatestTaobaoCapture, savePersonalProfile, startCaptureJob, startTaobaoItemCapture, startTaobaoOrderCapture } from "../src/api";

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

  it("uses capture job endpoints for stateful Selenium runs", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "cap_123",
        mode: "orders",
        status: "running",
        pid: 4321,
        outputDir: "output/taobao-captures/cap_123"
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "cap_123",
        mode: "orders",
        status: "succeeded",
        pid: 4321,
        outputDir: "output/taobao-captures/cap_123"
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        jobId: "cap_123",
        outputDir: "output/taobao-captures/cap_123",
        fileName: "capture.json",
        path: "output/taobao-captures/cap_123/capture.json",
        jsonText: "{}",
        payload: {},
        filterSummary: {
          originalItems: 1,
          keptItems: 1,
          skippedRefunded: 0,
          skippedNonApparel: 0
        }
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startCaptureJob({ mode: "orders", maxPages: 2, loginWait: 45 })).resolves.toMatchObject({
      id: "cap_123",
      status: "running"
    });
    await expect(getCaptureJob("cap_123")).resolves.toMatchObject({ status: "succeeded" });
    await expect(getCaptureJobArtifact("cap_123", { wardrobeOnly: true })).resolves.toMatchObject({
      jobId: "cap_123",
      filterSummary: { keptItems: 1 }
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/capture/jobs", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ mode: "orders", maxPages: 2, loginWait: 45 })
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/capture/jobs/cap_123", expect.objectContaining({
      method: "GET"
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/capture/jobs/cap_123/artifact?wardrobeOnly=1", expect.objectContaining({
      method: "GET"
    }));
  });

  it("previews Taobao imports before writing them", async () => {
    const payload = { source: "taobao-bookmarklet", items: [{ title: "黑色T恤" }] };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      batchId: "batch",
      summary: {
        totalItems: 1,
        uniqueItems: 1,
        skippedRefunded: 0,
        skippedNonApparel: 0,
        createdGarments: 1
      },
      duplicateCount: 0,
      candidates: [{ name: "黑色T恤", category: "top", confidence: 0.8 }],
      skipped: []
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(previewTaobaoImport(payload)).resolves.toMatchObject({
      summary: { createdGarments: 1 },
      candidates: [expect.objectContaining({ category: "top" })]
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/import/taobao-preview", expect.objectContaining({
      method: "POST",
      body: JSON.stringify(payload)
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

  it("uses profile, history, insights, and export endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        heightCm: 176,
        weightKg: 57,
        bodyType: "slim-tall",
        skinTone: "dark-yellow"
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        heightCm: 176,
        weightKg: 57,
        bodyType: "slim-tall",
        skinTone: "dark-yellow",
        preferredColors: ["white", "blue"]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, garmentIds: [101], context: {}, wornAt: "2026-06-12T00:00:00.000Z" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 2, input: {}, result: {}, createdAt: "2026-06-12T00:00:00.000Z" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ totalGarments: 4, mostWorn: [], neverWorn: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: 1, garments: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPersonalProfile()).resolves.toMatchObject({ bodyType: "slim-tall" });
    await expect(savePersonalProfile({
      heightCm: 176,
      weightKg: 57,
      bodyType: "slim-tall",
      skinTone: "dark-yellow",
      preferredColors: ["white", "blue"]
    })).resolves.toMatchObject({ preferredColors: ["white", "blue"] });
    await expect(getWearLogs()).resolves.toHaveLength(1);
    await expect(getRecommendationRuns()).resolves.toHaveLength(1);
    await expect(getInsights()).resolves.toMatchObject({ totalGarments: 4 });
    await expect(exportLocalData()).resolves.toMatchObject({ version: 1 });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/profile", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/profile", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/wear-logs", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/recommendation-runs", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/insights", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(6, "/api/export", expect.objectContaining({ method: "GET" }));
  });
});
