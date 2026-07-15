import type { Express, Response } from "express";
import type { AppDatabase } from "../db";
import {
  archiveTrip,
  completeTrip,
  createTrip,
  createTripPackingItem,
  defaultTripWeatherForecast,
  deleteTripPackingItem,
  generateTrip,
  getTrip,
  listTrips,
  recalculateTripSelection,
  refreshTripWeather,
  replaceTripDays,
  updateTrip,
  updateTripPackingItem,
  type TripWeatherForecast
} from "../services/tripPlanner";
import { ApiError, ValidationError, validatePositiveIntegerParam } from "../validation";

export interface TripRouteOptions {
  fetchForecast?: TripWeatherForecast;
}

export function registerTripRoutes(
  app: Express,
  db: AppDatabase,
  options: TripRouteOptions = {}
): void {
  const fetchForecast = options.fetchForecast ?? defaultTripWeatherForecast;

  app.get("/api/trips", (request, response) => {
    handle(response, () => listTrips(db, parseTripListQuery(request.query)));
  });

  app.post("/api/trips", (request, response) => {
    handleCreated(response, () => createTrip(db, request.body));
  });

  app.get("/api/trips/:id", (request, response) => {
    handle(response, () => getTrip(db, tripId(request.params.id)));
  });

  app.put("/api/trips/:id", (request, response) => {
    handle(response, () => updateTrip(db, tripId(request.params.id), request.body));
  });

  app.delete("/api/trips/:id", (request, response) => {
    handle(response, () => {
      assertEmptyBody(request.body, "归档旅行");
      return archiveTrip(db, tripId(request.params.id));
    });
  });

  app.put("/api/trips/:id/days", (request, response) => {
    handle(response, () => replaceTripDays(db, tripId(request.params.id), request.body));
  });

  app.post("/api/trips/:id/weather/refresh", (request, response) => {
    void handleAsync(response, async () => {
      assertEmptyBody(request.body, "刷新旅行天气");
      return refreshTripWeather(db, tripId(request.params.id), { fetchForecast });
    });
  });

  app.post("/api/trips/:id/generate", (request, response) => {
    handle(response, () => generateTrip(db, tripId(request.params.id), request.body ?? {}));
  });

  app.post("/api/trips/:id/selections/:selectionId/recalculate", (request, response) => {
    handle(response, () => recalculateTripSelection(
      db,
      tripId(request.params.id),
      validatePositiveIntegerParam(request.params.selectionId, "selectionId"),
      request.body
    ));
  });

  app.post("/api/trips/:id/packing", (request, response) => {
    handleCreated(response, () => createTripPackingItem(
      db,
      tripId(request.params.id),
      request.body
    ));
  });

  app.put("/api/trips/:id/packing/:itemId", (request, response) => {
    handle(response, () => updateTripPackingItem(
      db,
      tripId(request.params.id),
      validatePositiveIntegerParam(request.params.itemId, "packingItemId"),
      request.body
    ));
  });

  app.delete("/api/trips/:id/packing/:itemId", (request, response) => {
    handle(response, () => {
      assertEmptyBody(request.body, "删除旅行装箱项");
      deleteTripPackingItem(
        db,
        tripId(request.params.id),
        validatePositiveIntegerParam(request.params.itemId, "packingItemId")
      );
      return { ok: true as const };
    });
  });

  app.post("/api/trips/:id/complete", (request, response) => {
    handle(response, () => completeTrip(db, tripId(request.params.id), request.body));
  });
}

function tripId(value: unknown): number {
  return validatePositiveIntegerParam(value, "tripId");
}

function parseTripListQuery(value: unknown): { archived?: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("旅行列表查询必须是对象");
  }
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).find((field) => field !== "archived");
  if (unknown) throw new ValidationError(`旅行列表查询不允许字段 ${unknown}`);
  if (record.archived === undefined) return {};
  if (record.archived !== "1") throw new ValidationError("archived 只能是 1");
  return { archived: true };
}

function assertEmptyBody(value: unknown, label: string): void {
  if (value === undefined || value === null) return;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${label}请求体必须为空对象`);
  }
  const fields = Object.keys(value as Record<string, unknown>);
  if (fields.length) throw new ValidationError(`${label}不允许字段 ${fields[0]}`);
}

function handle<T>(response: Response, callback: () => T): void {
  try {
    response.json(callback());
  } catch (error) {
    sendError(response, error);
  }
}

function handleCreated<T>(response: Response, callback: () => T): void {
  try {
    response.status(201).json(callback());
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
