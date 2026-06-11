import express, { type Request, type Response } from "express";
import type { AppDatabase, GarmentUpdate } from "./db";
import type { WeatherSnapshot } from "../src/shared/types";
import { deleteGarment, getCachedWeather, importTaobaoBatchIntoDb, listGarments, listRecentlyWornGarmentIds, saveRecommendationRun, saveWeatherCache, saveWearLog, updateGarment } from "./db";
import { recommendOutfits } from "./services/recommend";
import { readLatestTaobaoCapture, startTaobaoItemCapture, startTaobaoOrderCapture } from "./services/taobaoCapture";
import { buildEstimatedWeather, fetchWeather } from "./services/weather";

export function createApiApp(db: AppDatabase): express.Express {
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.post("/api/import/taobao-batch", (request, response) => {
    handle(response, () => importTaobaoBatchIntoDb(db, request.body));
  });

  app.post("/api/capture/taobao-orders", (request, response) => {
    handle(response, () => startTaobaoOrderCapture(request.body));
  });

  app.post("/api/capture/taobao-item", (request, response) => {
    handle(response, () => startTaobaoItemCapture(request.body));
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
    handle(response, () => updateGarment(db, Number(request.params.id), request.body as GarmentUpdate));
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
      const garmentIds = normalizeGarmentIds(request.body.garmentIds);
      if (!garmentIds.length) {
        throw new Error("garmentIds 必须是非空数字数组");
      }
      saveWearLog(db, garmentIds, request.body.context ?? null);
      return { ok: true };
    });
  });

  app.get("/api/weather", async (request, response) => {
    try {
      const latitude = Number(request.query.latitude);
      const longitude = Number(request.query.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        response.status(400).json({ error: "latitude 和 longitude 必须是数字" });
        return;
      }
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
      const garments = listGarments(db).filter((garment) => garment.owned && !garment.excluded);
      const recentlyWornGarmentIds = Array.from(new Set([
        ...normalizeGarmentIds(request.body.recentlyWornGarmentIds),
        ...listRecentlyWornGarmentIds(db)
      ]));
      const result = recommendOutfits({
        garments,
        weather: request.body.weather,
        occasion: request.body.occasion || "casual",
        recentlyWornGarmentIds
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
  response.status(400).json({ error: message });
}

function normalizeGarmentIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((id): id is number => Number.isInteger(id) && id > 0)));
}

function isTruthyQueryFlag(value: unknown): boolean {
  return value === "1" || value === "true";
}
