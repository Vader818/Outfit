import express, { type Request, type Response } from "express";
import helmet from "helmet";
import { AUTH_COOKIE_NAME, SESSION_TTL_SECONDS, authenticateUser, createFirstUser, createSession, deleteSession, getAuthStatus, getUserForSession } from "./auth";
import type { AppDatabase, GarmentUpdate, ThumbnailRefreshOptions } from "./db";
import type { WeatherSnapshot } from "../src/shared/types";
import { deleteGarment, exportOutfitData, getCachedWeather, getPersonalProfile, getWardrobeInsights, importTaobaoBatchIntoDb, listGarments, listRecentlyWornGarmentIds, listRecommendationRuns, listWearLogs, refreshGarmentThumbnails, savePersonalProfile, saveRecommendationRun, saveWeatherCache, saveWearLog, updateGarment } from "./db";
import { previewTaobaoImport } from "./services/importTaobao";
import { recommendOutfits } from "./services/recommend";
import { cancelTaobaoCaptureJob, getTaobaoCaptureJob, readLatestTaobaoCapture, readTaobaoCaptureJobArtifact, startTaobaoCaptureJob } from "./services/taobaoCapture";
import { defaultThumbnailOutputDir, defaultThumbnailPublicBasePath } from "./services/thumbnails";
import { createGarmentCutout, createGarmentVisionTags, getVisionModelResponse, startVisionModelDownload, startVisionModelVerification, type VisionServiceOptions } from "./services/vision";
import { buildEstimatedWeather, fetchWeather } from "./services/weather";
import { ApiError, validateAuthCredentials, validateCaptureJobRequest, validateGarmentUpdate, validatePersonalProfile, validatePositiveIntegerParam, validateRecommendationRequest, validateWeatherQuery, validateWearLogRequest } from "./validation";

export interface ApiAppOptions {
  thumbnailCaptureRoot?: string;
  thumbnailOutputDir?: string;
  thumbnailMaxDownloads?: number;
  thumbnailDelayMs?: number;
  visionModelRoot?: string;
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
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"]
      }
    },
    referrerPolicy: { policy: "no-referrer" }
  }));
  app.use(express.json({ limit: "5mb" }));
  app.use(rejectUntrustedMutatingRequests);
  app.use(defaultThumbnailPublicBasePath(), express.static(options.thumbnailOutputDir || defaultThumbnailOutputDir()));

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

  app.post("/api/import/taobao-batch", (request, response) => {
    handle(response, () => importTaobaoBatchIntoDb(db, request.body));
  });

  app.post("/api/import/taobao-preview", (request, response) => {
    handle(response, () => previewTaobaoImport(request.body));
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

  app.get("/api/garments", (_request, response) => {
    handle(response, () => listGarments(db));
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

  app.put("/api/garments/:id", (request, response) => {
    handle(response, () => updateGarment(db, validatePositiveIntegerParam(request.params.id), validateGarmentUpdate(request.body) as GarmentUpdate));
  });

  app.delete("/api/garments/:id", (request, response) => {
    try {
      deleteGarment(db, validatePositiveIntegerParam(request.params.id));
      response.status(204).end();
    } catch (error) {
      sendError(response, error);
    }
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
    handle(response, () => getWardrobeInsights(db));
  });

  app.get("/api/export", (_request, response) => {
    handle(response, () => exportOutfitData(db));
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
      const garments = listGarments(db).filter((garment) => garment.owned && !garment.excluded);
      const recentlyWornGarmentIds = Array.from(new Set([
        ...recommendationRequest.recentlyWornGarmentIds,
        ...listRecentlyWornGarmentIds(db)
      ]));
      const effectiveProfile = recommendationRequest.userProfile ?? getPersonalProfile(db);
      const result = recommendOutfits({
        garments,
        weather: recommendationRequest.weather,
        occasion: recommendationRequest.occasion,
        recentlyWornGarmentIds,
        userProfile: effectiveProfile
      });
      saveRecommendationRun(db, { ...recommendationRequest, userProfile: effectiveProfile }, result);
      return result;
    });
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

function visionOptions(options: ApiAppOptions): VisionServiceOptions {
  return {
    modelRoot: options.visionModelRoot,
    thumbnailOutputDir: options.thumbnailOutputDir,
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
      return decodeURIComponent(rawValue.join("="));
    }
  }
  return undefined;
}

function legacyCaptureDisabled(): ApiError {
  return new ApiError("LEGACY_CAPTURE_DISABLED", "旧版 detached 采集接口已禁用，请使用 /api/capture/jobs。", 410);
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
