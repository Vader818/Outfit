import express, { type Request, type Response } from "express";
import type { AppDatabase, GarmentUpdate } from "./db";
import type { WeatherSnapshot } from "../src/shared/types";
import { deleteGarment, getCachedWeather, importTaobaoBatchIntoDb, listGarments, listRecentlyWornGarmentIds, saveRecommendationRun, saveWeatherCache, saveWearLog, updateGarment } from "./db";
import { previewTaobaoImport } from "./services/importTaobao";
import { recommendOutfits } from "./services/recommend";
import { cancelTaobaoCaptureJob, getTaobaoCaptureJob, readLatestTaobaoCapture, readTaobaoCaptureJobArtifact, startTaobaoCaptureJob, startTaobaoItemCapture, startTaobaoOrderCapture } from "./services/taobaoCapture";
import { buildEstimatedWeather, fetchWeather } from "./services/weather";
import { ApiError, validateCaptureJobRequest, validateGarmentUpdate, validateRecommendationRequest, validateWeatherQuery, validateWearLogRequest } from "./validation";

export function createApiApp(db: AppDatabase): express.Express {
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
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
      const result = recommendOutfits({
        garments,
        weather: recommendationRequest.weather,
        occasion: recommendationRequest.occasion,
        recentlyWornGarmentIds,
        userProfile: recommendationRequest.userProfile
      });
      saveRecommendationRun(db, request.body, result);
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
