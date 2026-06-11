import express, { type Request, type Response } from "express";
import type { AppDatabase, GarmentUpdate } from "./db";
import { deleteGarment, getCachedWeather, importTaobaoBatchIntoDb, listGarments, saveRecommendationRun, saveWeatherCache, updateGarment } from "./db";
import { recommendOutfits } from "./services/recommend";
import { fetchWeather } from "./services/weather";

export function createApiApp(db: AppDatabase): express.Express {
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.post("/api/import/taobao-batch", (request, response) => {
    handle(response, () => importTaobaoBatchIntoDb(db, request.body));
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
      const weather = await fetchWeather(latitude, longitude);
      saveWeatherCache(db, latitude, longitude, weather);
      response.json(weather);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/recommendations", (request, response) => {
    handle(response, () => {
      const garments = listGarments(db).filter((garment) => garment.owned && !garment.excluded);
      const result = recommendOutfits({
        garments,
        weather: request.body.weather,
        occasion: request.body.occasion || "casual",
        recentlyWornGarmentIds: request.body.recentlyWornGarmentIds || []
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
