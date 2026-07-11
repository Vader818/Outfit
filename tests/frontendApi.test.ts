import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_REQUIRED_EVENT, ApiClientError, analyzeGarmentVisionTags, archiveGarment, commitTaobaoImport, createGarment, createGarmentCutout, downloadCompleteBackup, downloadVisionModel, exportLocalData, getAuthStatus, getCaptureJob, getCaptureJobArtifact, getGarmentThumbnailCandidates, getGarments, getInsights, getPersonalProfile, getRecommendationRuns, getVisionModels, getWearLogs, login, logout, previewCompleteBackup, previewTaobaoImport, readLatestTaobaoCapture, register, restoreGarment, savePersonalProfile, selectGarmentThumbnail, startCaptureJob, startTaobaoItemCapture, startTaobaoOrderCapture, uploadGarmentImage, verifyVisionModel } from "../src/api";

describe("frontend API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses local auth endpoints with same-origin credentials", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ hasAccount: false, user: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ hasAccount: true, user: { id: 1, username: "local_user" } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ hasAccount: true, user: { id: 1, username: "local_user" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAuthStatus()).resolves.toEqual({ hasAccount: false, user: null });
    await expect(register({ username: "local_user", password: "correct-password" })).resolves.toMatchObject({
      user: { username: "local_user" }
    });
    await expect(login({ username: "local_user", password: "correct-password" })).resolves.toMatchObject({
      user: { username: "local_user" }
    });
    await expect(logout()).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/auth/status", expect.objectContaining({
      method: "GET",
      credentials: "same-origin"
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/register", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ username: "local_user", password: "correct-password" })
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/auth/login", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ username: "local_user", password: "correct-password" })
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/auth/logout", expect.objectContaining({
      method: "POST",
      credentials: "same-origin"
    }));
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
        engine: "selenium",
        status: "running",
        pid: 4321,
        outputDir: "output/taobao-captures/cap_123"
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "cap_123",
        mode: "orders",
        engine: "selenium",
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

  it("posts requested Playwright engine for item-detail capture jobs", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "cap_playwright",
      mode: "item-detail",
      engine: "playwright",
      status: "running",
      pid: 4322,
      outputDir: "output/taobao-captures/cap_playwright"
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startCaptureJob({
      mode: "item-detail",
      url: "https://item.taobao.com/item.htm?id=808",
      loginWait: 60,
      engine: "playwright"
    })).resolves.toMatchObject({
      id: "cap_playwright",
      engine: "playwright"
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/capture/jobs", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        mode: "item-detail",
        url: "https://item.taobao.com/item.htm?id=808",
        loginWait: 60,
        engine: "playwright"
      })
    }));
  });

  it("uses local vision model and garment vision endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        modelRoot: "output/models",
        models: [],
        jobs: []
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "vision_1",
        modelId: "rembg-isnet",
        status: "running",
        message: "本地模型下载已启动",
        startedAt: "2026-06-18T00:00:00.000Z",
        updatedAt: "2026-06-18T00:00:00.000Z"
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "vision_2",
        modelId: "clip-vit-base-patch32",
        status: "running",
        message: "本地模型验证已启动",
        startedAt: "2026-06-18T00:00:00.000Z",
        updatedAt: "2026-06-18T00:00:00.000Z"
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 1,
        name: "白衬衫",
        cutoutImageUrl: "/api/garment-thumbnails/garment-1-cutout.png"
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        category: "top",
        styles: ["smart-casual"],
        patterns: ["solid"],
        tags: ["cotton"],
        scores: []
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getVisionModels()).resolves.toMatchObject({ modelRoot: "output/models" });
    await expect(downloadVisionModel("rembg-isnet")).resolves.toMatchObject({ id: "vision_1" });
    await expect(verifyVisionModel("clip-vit-base-patch32")).resolves.toMatchObject({ id: "vision_2" });
    await expect(createGarmentCutout(1)).resolves.toMatchObject({ cutoutImageUrl: expect.stringContaining("cutout") });
    await expect(analyzeGarmentVisionTags(1)).resolves.toMatchObject({ tags: ["cotton"] });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/vision/models", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/vision/models/rembg-isnet/download", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/vision/models/clip-vit-base-patch32/verify", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/garments/1/cutout", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/garments/1/vision-tags", expect.objectContaining({ method: "POST" }));
  });

  it("uses garment thumbnail candidate and selection endpoints", async () => {
    const selectedUrl = "https://img.alicdn.com/imgextra/i1/100/O1CN01detail.jpg";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        garmentId: 7,
        currentImageUrl: "https://img.alicdn.com/imgextra/i1/100/O1CN01current.jpg",
        candidates: [
          { url: selectedUrl, source: "detail", score: 120, selected: false }
        ]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 7,
        name: "白衬衫",
        imageUrl: "/api/garment-thumbnails/garment-7-manual-shirt.png"
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getGarmentThumbnailCandidates(7)).resolves.toMatchObject({
      garmentId: 7,
      candidates: [expect.objectContaining({ source: "detail" })]
    });
    await expect(selectGarmentThumbnail(7, selectedUrl)).resolves.toMatchObject({
      imageUrl: "/api/garment-thumbnails/garment-7-manual-shirt.png"
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/garments/7/thumbnail-candidates", expect.objectContaining({
      method: "GET",
      credentials: "same-origin"
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/garments/7/thumbnail", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ imageUrl: selectedUrl })
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

  it("surfaces API error messages from failed garment requests", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: "衣橱 API 失败"
    }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getGarments()).rejects.toThrow("衣橱 API 失败");

    expect(fetchMock).toHaveBeenCalledWith("/api/garments", expect.objectContaining({
      credentials: "same-origin"
    }));
  });

  it("preserves structured API errors and announces expired sessions", async () => {
    const dispatchEvent = vi.fn();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: {
        code: "UNAUTHENTICATED",
        message: "请先登录",
        details: { reason: "expired" }
      }
    }), { status: 401 }));
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("fetch", fetchMock);

    const error = await getGarments().catch((requestError) => requestError);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      name: "ApiClientError",
      message: "请先登录",
      status: 401,
      code: "UNAUTHENTICATED",
      details: { reason: "expired" }
    });
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({ type: AUTH_REQUIRED_EVENT });
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

  it("creates a manual garment through the authenticated JSON endpoint", async () => {
    const response = {
      id: 77,
      brand: "",
      rawName: "手工衬衫",
      imageUrl: "",
      owned: true,
      confirmed: true,
      excluded: false,
      confidence: 1
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      name: "手工衬衫",
      category: "top" as const,
      color: "blue",
      warmth: "light" as const,
      seasons: ["spring", "summer"] as Array<"spring" | "summer">,
      styles: ["casual"],
      formality: "casual" as const
    };

    await expect(createGarment(input)).resolves.toMatchObject({ id: 77, confirmed: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/garments", expect.objectContaining({
      method: "POST",
      body: JSON.stringify(input)
    }));
  });

  it("uses reviewed ingestion, archive, restore, archived listing, and raw image endpoints", async () => {
    const garment = {
      id: 77,
      origin: "manual",
      brand: "",
      name: "手工衬衫",
      rawName: "手工衬衫",
      category: "top",
      color: "blue",
      warmth: "light",
      seasons: ["spring"],
      styles: ["casual"],
      formality: "casual",
      imageUrl: "/api/garment-assets/9/content",
      owned: true,
      confirmed: true,
      excluded: false,
      confidence: 1
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ ...garment, archivedAt: "2026-07-11T00:00:00.000Z" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...garment, archivedAt: "2026-07-11T00:00:00.000Z" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(garment), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(garment), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        batchId: "batch-1",
        summary: { totalDecisions: 1, included: 1, created: 1, updated: 0, refundSynced: 0, unchanged: 0, skipped: 0 },
        items: [{ sourceItemKey: "v2:key", disposition: "create", garmentId: 77 }]
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const blob = new Blob(["safe-image"], { type: "image/webp" });
    const batch = { source: "taobao-bookmarklet", items: [{ title: "白色衬衫" }] };
    const decisions = [{ sourceItemKey: "v2:key", include: true }];

    await expect(getGarments({ archived: true })).resolves.toHaveLength(1);
    await expect(archiveGarment(77)).resolves.toMatchObject({ archivedAt: expect.any(String) });
    await expect(restoreGarment(77)).resolves.toMatchObject({ id: 77 });
    await expect(uploadGarmentImage(77, blob)).resolves.toMatchObject({ imageUrl: expect.stringContaining("garment-assets") });
    await expect(commitTaobaoImport({ batch, decisions })).resolves.toMatchObject({ summary: { created: 1 } });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/garments?archived=1", expect.objectContaining({ credentials: "same-origin" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/garments/77/archive", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/garments/77/restore", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/garments/77/image", expect.objectContaining({
      method: "PUT",
      body: blob,
      headers: expect.objectContaining({ "content-type": "image/webp" })
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/import/taobao-commit", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ batch, decisions })
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
      .mockResolvedValueOnce(new Response(JSON.stringify({
        version: 2,
        schemaVersion: 1,
        exportedAt: "2026-07-11T06:00:00.000Z",
        features: ["versioned-migrations", "recommendation-candidates"],
        profile: {},
        garments: [],
        sourceOrderItems: [],
        wearLogs: [],
        recommendationRuns: [],
        recommendationCandidates: []
      }), { status: 200 }));
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
    await expect(exportLocalData()).resolves.toMatchObject({ version: 2, schemaVersion: 1 });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/profile", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/profile", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/wear-logs", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/recommendation-runs", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/insights", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(6, "/api/export", expect.objectContaining({ method: "GET" }));
  });

  it("previews a complete backup before downloading the ZIP blob", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        assetCount: 3,
        includedAssetCount: 2,
        assetBytes: 4096,
        includedAssetBytes: 3072,
        estimatedBytes: 8192,
        warnings: [{ code: "ASSET_UNAVAILABLE", assetId: 9, message: "asset unavailable" }]
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(new Blob(["PK-safe-backup"], { type: "application/zip" }), {
        status: 200,
        headers: {
          "content-type": "application/zip",
          "content-disposition": 'attachment; filename="outfit-complete-backup-2026-07-11.zip"'
        }
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(previewCompleteBackup()).resolves.toMatchObject({
      assetCount: 3,
      includedAssetCount: 2,
      estimatedBytes: 8192,
      warnings: [{ assetId: 9 }]
    });
    const downloaded = await downloadCompleteBackup();
    expect(downloaded.fileName).toBe("outfit-complete-backup-2026-07-11.zip");
    expect(downloaded.blob.type).toBe("application/zip");
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/export?format=zip&preview=1", expect.objectContaining({
      method: "GET",
      credentials: "same-origin"
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/export?format=zip", expect.objectContaining({
      method: "GET",
      credentials: "same-origin"
    }));
  });
});
