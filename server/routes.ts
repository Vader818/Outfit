import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { AUTH_COOKIE_NAME, SESSION_TTL_SECONDS, authenticateUser, createFirstUser, createSession, deleteSession, getAuthStatus, getUserForSession } from "./auth";
import type { AppDatabase, ThumbnailRefreshOptions } from "./db";
import type { WeatherSnapshot } from "../src/shared/types";
import { commitTaobaoImport, getCachedWeather, getPersonalProfile, getWardrobeInsights, listGarmentThumbnailCandidates, listGarments, listRecentlyWornGarmentIds, listRecommendationRuns, listWearLogs, previewTaobaoImportForDb, refreshGarmentThumbnails, savePersonalProfile, saveWeatherCache, saveWearLog, selectGarmentThumbnail } from "./db";
import { buildOutfitExportV2, previewOutfitExportZip, writeOutfitExportZip } from "./services/export";
import { recommendOutfits } from "./services/recommend";
import { persistRecommendationSnapshot } from "./services/recommendationCandidates";
import { validateRecommendationConstraints } from "./services/recommendationConstraints";
import { getRecommendationFeedbackInsights, listOutfitPairStats } from "./services/recommendationFeedback";
import { cancelTaobaoCaptureJob, getTaobaoCaptureJob, readLatestTaobaoCapture, readTaobaoCaptureJobArtifact, startTaobaoCaptureJob } from "./services/taobaoCapture";
import { defaultThumbnailOutputDir, defaultThumbnailPublicBasePath } from "./services/thumbnails";
import { createGarmentCutout, createGarmentVisionTags, getVisionModelResponse, startVisionModelDownload, startVisionModelVerification, type VisionServiceOptions } from "./services/vision";
import { buildEstimatedWeather, fetchWeather } from "./services/weather";
import { ApiError, validateAuthCredentials, validateCaptureJobRequest, validatePersonalProfile, validatePositiveIntegerParam, validateRecommendationRequest, validateTaobaoImportCommitRequest, validateThumbnailSelectionRequest, validateWeatherQuery, validateWearLogRequest } from "./validation";
import { registerGarmentRoutes } from "./routes/garments";
import { registerOutfitRoutes } from "./routes/outfits";
import { registerFeedbackRoutes } from "./routes/feedback";

export interface ApiAppOptions {
  thumbnailCaptureRoot?: string;
  thumbnailOutputDir?: string;
  thumbnailMaxDownloads?: number;
  thumbnailMaxDownloadsPerGarment?: number;
  thumbnailDelayMs?: number;
  garmentAssetRoot?: string;
  visionModelRoot?: string;
  visionDevice?: VisionServiceOptions["visionDevice"];
  rembgProvider?: VisionServiceOptions["rembgProvider"];
  runRembg?: VisionServiceOptions["runRembg"];
  inferVisionTags?: VisionServiceOptions["inferVisionTags"];
}

export function createApiApp(db: AppDatabase, options: ApiAppOptions = {}): express.Express {
  const app = express();
  const loginRateLimiter = createLoginRateLimiter();
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https://*.alicdn.com", "https://*.taobaocdn.com"],
        connectSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"]
      }
    },
    referrerPolicy: { policy: "no-referrer" }
  }));
  app.use(express.json({ limit: "5mb" }));
  app.use(rejectUntrustedMutatingRequests);

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/auth/status", (request, response) => {
    handle(response, () => getAuthStatus(db, readSessionCookie(request)));
  });

  app.post("/api/auth/register", (request, response) => {
    try {
      const user = createFirstUser(db, validateAuthCredentials(request.body));
      setSessionCookie(response, createSession(db, user.id));
      response.status(201).json({ hasAccount: true, user });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/auth/login", (request, response) => {
    try {
      const credentials = validateAuthCredentials(request.body);
      loginRateLimiter.assertAllowed(request, credentials.username);
      const user = authenticateUser(db, credentials);
      loginRateLimiter.reset(request, credentials.username);
      setSessionCookie(response, createSession(db, user.id));
      response.json({ hasAccount: true, user });
    } catch (error) {
      if (error instanceof ApiError && error.code === "INVALID_CREDENTIALS") {
        try {
          const credentials = validateAuthCredentials(request.body);
          loginRateLimiter.recordFailure(request, credentials.username);
        } catch {
          // Validation errors are handled by the original error response.
        }
      }
      sendError(response, error);
    }
  });

  app.post("/api/auth/logout", (request, response) => {
    deleteSession(db, readSessionCookie(request));
    clearSessionCookie(response);
    response.json({ ok: true });
  });

  app.use("/api", (request, response, next) => {
    const user = getUserForSession(db, readSessionCookie(request));
    if (!user) {
      sendError(response, new ApiError("UNAUTHENTICATED", "请先登录", 401));
      return;
    }
    next();
  });

  app.use(defaultThumbnailPublicBasePath(), express.static(options.thumbnailOutputDir || defaultThumbnailOutputDir()));
  registerGarmentRoutes(app, db, { assetRoot: options.garmentAssetRoot });
  registerOutfitRoutes(app, db);
  registerFeedbackRoutes(app, db);

  app.post("/api/import/taobao-batch", (request, response) => {
    handle(response, () => {
      throw legacyImportDisabled();
    });
  });

  app.post("/api/import/taobao-preview", (request, response) => {
    handle(response, () => previewTaobaoImportForDb(db, request.body));
  });

  app.post("/api/import/taobao-commit", (request, response) => {
    handle(response, () => commitTaobaoImport(db, validateTaobaoImportCommitRequest(request.body)));
  });

  app.post("/api/capture/taobao-orders", (request, response) => {
    handle(response, () => {
      throw legacyCaptureDisabled();
    });
  });

  app.post("/api/capture/taobao-item", (request, response) => {
    handle(response, () => {
      throw legacyCaptureDisabled();
    });
  });

  app.post("/api/capture/jobs", (request, response) => {
    handle(response, () => startTaobaoCaptureJob(validateCaptureJobRequest(request.body)));
  });

  app.get("/api/capture/jobs/:id", (request, response) => {
    handle(response, () => getTaobaoCaptureJob(request.params.id));
  });

  app.post("/api/capture/jobs/:id/cancel", (request, response) => {
    handle(response, () => cancelTaobaoCaptureJob(request.params.id));
  });

  app.get("/api/capture/jobs/:id/artifact", (request, response) => {
    handle(response, () => readTaobaoCaptureJobArtifact(request.params.id, {
      wardrobeOnly: isTruthyQueryFlag(request.query.wardrobeOnly)
    }));
  });

  app.get("/api/capture/taobao-latest", (request, response) => {
    handle(response, () => readLatestTaobaoCapture(undefined, undefined, {
      wardrobeOnly: isTruthyQueryFlag(request.query.wardrobeOnly)
    }));
  });

  app.get("/api/vision/models", (_request, response) => {
    void handleAsync(response, () => getVisionModelResponse(visionOptions(options)));
  });

  app.post("/api/vision/models/:id/download", (request, response) => {
    handle(response, () => startVisionModelDownload(request.params.id, visionOptions(options)));
  });

  app.post("/api/vision/models/:id/verify", (request, response) => {
    handle(response, () => startVisionModelVerification(request.params.id, visionOptions(options)));
  });

  app.post("/api/garments/thumbnails/refresh", (request, response) => {
    void handleAsync(response, () => refreshGarmentThumbnails(db, thumbnailRefreshOptions(options, request.body)));
  });

  app.get("/api/garments/:id/thumbnail-candidates", (request, response) => {
    void handleAsync(response, () => listGarmentThumbnailCandidates(db, validatePositiveIntegerParam(request.params.id), thumbnailSelectionOptions(options)));
  });

  app.post("/api/garments/:id/thumbnail", (request, response) => {
    void handleAsync(response, () => {
      const input = validateThumbnailSelectionRequest(request.body);
      return selectGarmentThumbnail(db, validatePositiveIntegerParam(request.params.id), input.imageUrl, thumbnailSelectionOptions(options));
    });
  });

  app.post("/api/garments/:id/cutout", (request, response) => {
    void handleAsync(response, () => createGarmentCutout(db, validatePositiveIntegerParam(request.params.id), visionOptions(options)));
  });

  app.post("/api/garments/:id/vision-tags", (request, response) => {
    void handleAsync(response, () => createGarmentVisionTags(db, validatePositiveIntegerParam(request.params.id), visionOptions(options)));
  });

  app.get("/api/profile", (_request, response) => {
    handle(response, () => getPersonalProfile(db));
  });

  app.put("/api/profile", (request, response) => {
    handle(response, () => savePersonalProfile(db, validatePersonalProfile(request.body)));
  });

  app.post("/api/wear-logs", (request, response) => {
    handle(response, () => {
      const wearLog = validateWearLogRequest(request.body);
      saveWearLog(db, wearLog.garmentIds, wearLog.context);
      return { ok: true };
    });
  });

  app.get("/api/wear-logs", (_request, response) => {
    handle(response, () => listWearLogs(db));
  });

  app.get("/api/recommendation-runs", (_request, response) => {
    handle(response, () => listRecommendationRuns(db));
  });

  app.get("/api/insights", (_request, response) => {
    handle(response, () => ({
      ...getWardrobeInsights(db),
      feedbackSummary: getRecommendationFeedbackInsights(db)
    }));
  });

  app.get("/api/export", (request, response) => {
    const format = request.query.format;
    if (format === undefined || format === "json") {
      handle(response, () => buildOutfitExportV2(db));
      return;
    }
    if (format !== "zip") {
      sendError(response, new ApiError(
        "INVALID_EXPORT_FORMAT",
        "导出格式只支持 json 或 zip",
        400
      ));
      return;
    }
    if (isTruthyQueryFlag(request.query.preview)) {
      void handleAsync(response, () => previewOutfitExportZip(db, {
        assetRoot: options.garmentAssetRoot
      }));
      return;
    }

    const exportDate = new Date().toISOString().slice(0, 10);
    response.status(200);
    response.setHeader("Content-Type", "application/zip");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="outfit-complete-backup-${exportDate}.zip"`
    );
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    void writeOutfitExportZip(db, response, {
      assetRoot: options.garmentAssetRoot
    }).catch((error: unknown) => {
      if (!response.headersSent) {
        sendError(response, error);
        return;
      }
      response.destroy(error instanceof Error ? error : new Error("ZIP 导出失败"));
    });
  });

  app.get("/api/weather", async (request, response) => {
    try {
      const { latitude, longitude } = validateWeatherQuery(request.query.latitude, request.query.longitude);
      const cached = getCachedWeather(db, latitude, longitude);
      if (cached) {
        response.json(cached);
        return;
      }
      let weather: WeatherSnapshot;
      try {
        weather = await fetchWeather(latitude, longitude);
      } catch {
        const staleCached = getCachedWeather(db, latitude, longitude, Number.POSITIVE_INFINITY);
        if (staleCached) {
          response.json(staleCached);
          return;
        }
        weather = buildEstimatedWeather(latitude, longitude);
      }
      saveWeatherCache(db, latitude, longitude, weather);
      response.json(weather);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/recommendations", (request, response) => {
    handle(response, () => {
      const recommendationRequest = validateRecommendationRequest(request.body);
      const garments = listGarments(db, { scope: "all" });
      const constraints = validateRecommendationConstraints(garments, recommendationRequest);
      const recentlyWornGarmentIds = Array.from(new Set([
        ...(recommendationRequest.recentlyWornGarmentIds ?? []),
        ...listRecentlyWornGarmentIds(db)
      ]));
      const effectiveProfile = recommendationRequest.userProfile ?? getPersonalProfile(db);
      const result = recommendOutfits({
        garments,
        weather: recommendationRequest.weather,
        occasion: recommendationRequest.occasion,
        recentlyWornGarmentIds,
        userProfile: effectiveProfile,
        pairStats: listOutfitPairStats(db),
        ...constraints
      });
      return persistRecommendationSnapshot(
        db,
        { ...recommendationRequest, userProfile: effectiveProfile },
        result
      );
    });
  });

  app.use((error: unknown, request: Request, response: Response, next: NextFunction) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    const parserError = error && typeof error === "object"
      ? error as { type?: unknown; status?: unknown }
      : {};
    if (parserError.type === "entity.too.large" || parserError.status === 413) {
      const imageUpload = request.method === "PUT" && /^\/api\/garments\/[^/]+\/image$/.test(request.path);
      sendError(response, new ApiError(
        imageUpload ? "IMAGE_TOO_LARGE" : "PAYLOAD_TOO_LARGE",
        imageUpload ? "图片不能超过 5 MB" : "请求内容过大",
        413
      ));
      return;
    }
    if (parserError.type === "entity.parse.failed") {
      sendError(response, new ApiError("INVALID_JSON", "请求 JSON 无法解析", 400));
      return;
    }
    sendError(response, error);
  });

  return app;
}

function handle<T>(response: Response, callback: () => T): void {
  try {
    response.json(callback());
  } catch (error) {
    sendError(response, error);
  }
}

async function handleAsync<T>(response: Response, callback: () => Promise<T>): Promise<void> {
  try {
    response.json(await callback());
  } catch (error) {
    sendError(response, error);
  }
}

function thumbnailRefreshOptions(options: ApiAppOptions, body: unknown): ThumbnailRefreshOptions {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  return {
    captureRoot: options.thumbnailCaptureRoot,
    outputDir: options.thumbnailOutputDir,
    maxTotalDownloads: boundedNumber(record.maxDownloads, options.thumbnailMaxDownloads ?? 8, 1, 24),
    maxDownloadsPerGarment: boundedNumber(record.maxDownloadsPerGarment, 4, 1, 6),
    delayMs: boundedNumber(record.delayMs, options.thumbnailDelayMs ?? 900, 0, 5000)
  };
}

function thumbnailSelectionOptions(options: ApiAppOptions): ThumbnailRefreshOptions {
  return {
    captureRoot: options.thumbnailCaptureRoot,
    outputDir: options.thumbnailOutputDir,
    maxDownloadsPerGarment: 1,
    delayMs: options.thumbnailDelayMs ?? 0
  };
}

function visionOptions(options: ApiAppOptions): VisionServiceOptions {
  return {
    modelRoot: options.visionModelRoot,
    thumbnailCaptureRoot: options.thumbnailCaptureRoot,
    thumbnailOutputDir: options.thumbnailOutputDir,
    thumbnailDelayMs: options.thumbnailDelayMs,
    thumbnailMaxDownloadsPerGarment: options.thumbnailMaxDownloadsPerGarment,
    visionDevice: options.visionDevice,
    rembgProvider: options.rembgProvider,
    runRembg: options.runRembg,
    inferVisionTags: options.inferVisionTags
  };
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function sendError(response: Response, error: unknown): void {
  const message = error instanceof ApiError ? error.message : "服务器错误";
  const status = error instanceof ApiError ? error.status : 500;
  const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
  const details = error instanceof ApiError ? error.details : undefined;
  response.status(status).json({
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details })
    }
  });
}

function rejectUntrustedMutatingRequests(request: Request, response: Response, next: () => void): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    next();
    return;
  }
  if (isTrustedMutatingRequest(request)) {
    next();
    return;
  }
  sendError(response, new ApiError("ORIGIN_NOT_ALLOWED", "请求来源不被允许", 403));
}

function isTrustedMutatingRequest(request: Request): boolean {
  const fetchSite = request.headers["sec-fetch-site"];
  if (fetchSite === "cross-site") return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const requestHost = request.headers.host || "";
    if (parsed.host === requestHost) return true;
    return isLocalHostname(parsed.hostname) && isLocalRequestHost(requestHost);
  } catch {
    return false;
  }
}

function isLocalRequestHost(value: string): boolean {
  const host = value.split(":")[0]?.replace(/^\[/, "").replace(/\]$/, "") || "";
  return isLocalHostname(host);
}

function isLocalHostname(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function createLoginRateLimiter(): {
  assertAllowed: (request: Request, username: string) => void;
  recordFailure: (request: Request, username: string) => void;
  reset: (request: Request, username: string) => void;
} {
  const failures = new Map<string, { count: number; firstFailureAt: number }>();
  const maxFailures = 5;
  const windowMs = 15 * 60 * 1000;

  function key(request: Request, username: string): string {
    return `${username.toLowerCase()}|${request.socket.remoteAddress || "unknown"}`;
  }

  function currentEntry(request: Request, username: string): { count: number; firstFailureAt: number } | undefined {
    const entryKey = key(request, username);
    const entry = failures.get(entryKey);
    if (!entry) return undefined;
    if (Date.now() - entry.firstFailureAt > windowMs) {
      failures.delete(entryKey);
      return undefined;
    }
    return entry;
  }

  return {
    assertAllowed(request, username) {
      const entry = currentEntry(request, username);
      if (entry && entry.count >= maxFailures) {
        throw new ApiError("LOGIN_RATE_LIMITED", "登录失败次数过多，请稍后再试", 429);
      }
    },
    recordFailure(request, username) {
      const entryKey = key(request, username);
      const entry = currentEntry(request, username);
      if (!entry) {
        failures.set(entryKey, { count: 1, firstFailureAt: Date.now() });
        return;
      }
      entry.count += 1;
      failures.set(entryKey, entry);
    },
    reset(request, username) {
      failures.delete(key(request, username));
    }
  };
}

function isTruthyQueryFlag(value: unknown): boolean {
  return value === "1" || value === "true";
}

function readSessionCookie(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const pair of header.split(";")) {
    const [rawName, ...rawValue] = pair.trim().split("=");
    if (rawName === AUTH_COOKIE_NAME) {
      return safeDecodeCookieValue(rawValue.join("="));
    }
  }
  return undefined;
}

function safeDecodeCookieValue(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function legacyCaptureDisabled(): ApiError {
  return new ApiError("LEGACY_CAPTURE_DISABLED", "旧版 detached 采集接口已禁用，请使用 /api/capture/jobs。", 410);
}

function legacyImportDisabled(): ApiError {
  return new ApiError("LEGACY_IMPORT_DISABLED", "旧版直写导入接口已禁用，请使用 /api/import/taobao-preview 和 /api/import/taobao-commit。", 410);
}

function setSessionCookie(response: Response, token: string): void {
  response.setHeader("Set-Cookie", [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Max-Age=${SESSION_TTL_SECONDS}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax"
  ].join("; "));
}

function clearSessionCookie(response: Response): void {
  response.setHeader("Set-Cookie", [
    `${AUTH_COOKIE_NAME}=`,
    "Max-Age=0",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax"
  ].join("; "));
}
