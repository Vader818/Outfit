import express, { type Request, type Response } from "express";
import { AUTH_COOKIE_NAME, SESSION_TTL_SECONDS, authenticateUser, createFirstUser, createSession, deleteSession, getAuthStatus, getUserForSession } from "./auth";
import type { AppDatabase, GarmentUpdate } from "./db";
import type { WeatherSnapshot } from "../src/shared/types";
import { deleteGarment, exportOutfitData, getCachedWeather, getPersonalProfile, getWardrobeInsights, importTaobaoBatchIntoDb, listGarments, listRecentlyWornGarmentIds, listRecommendationRuns, listWearLogs, savePersonalProfile, saveRecommendationRun, saveWeatherCache, saveWearLog, updateGarment } from "./db";
import { previewTaobaoImport } from "./services/importTaobao";
import { recommendOutfits } from "./services/recommend";
import { cancelTaobaoCaptureJob, getTaobaoCaptureJob, readLatestTaobaoCapture, readTaobaoCaptureJobArtifact, startTaobaoCaptureJob, startTaobaoItemCapture, startTaobaoOrderCapture } from "./services/taobaoCapture";
import { buildEstimatedWeather, fetchWeather } from "./services/weather";
import { ApiError, validateAuthCredentials, validateCaptureJobRequest, validateGarmentUpdate, validatePersonalProfile, validateRecommendationRequest, validateWeatherQuery, validateWearLogRequest } from "./validation";

export function createApiApp(db: AppDatabase): express.Express {
  const app = express();
  app.use(express.json({ limit: "5mb" }));

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
      const user = authenticateUser(db, validateAuthCredentials(request.body));
      setSessionCookie(response, createSession(db, user.id));
      response.json({ hasAccount: true, user });
    } catch (error) {
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
    handle(response, () => startTaobaoOrderCapture(request.body));
  });

  app.post("/api/capture/taobao-item", (request, response) => {
    handle(response, () => {
      validateCaptureJobRequest({ ...(request.body || {}), mode: "item-detail" });
      return startTaobaoItemCapture(request.body);
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

  app.get("/api/profile", (_request, response) => {
    handle(response, () => getPersonalProfile(db));
  });

  app.put("/api/profile", (request, response) => {
    handle(response, () => savePersonalProfile(db, validatePersonalProfile(request.body)));
  });

  app.put("/api/garments/:id", (request, response) => {
    handle(response, () => updateGarment(db, Number(request.params.id), validateGarmentUpdate(request.body) as GarmentUpdate));
  });

  app.delete("/api/garments/:id", (request, response) => {
    try {
      deleteGarment(db, Number(request.params.id));
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
      const latitude = Number(request.query.latitude);
      const longitude = Number(request.query.longitude);
      validateWeatherQuery(latitude, longitude);
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
      saveRecommendationRun(db, { ...request.body, userProfile: effectiveProfile }, result);
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

function sendError(response: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : "服务器错误";
  const status = error instanceof ApiError ? error.status : 400;
  const code = error instanceof ApiError ? error.code : "BAD_REQUEST";
  const details = error instanceof ApiError ? error.details : undefined;
  response.status(status).json({
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details })
    }
  });
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
