import type { Express, Response } from "express";
import type { AppDatabase } from "../db";
import {
  createWearEvent,
  deleteWearEvent,
  listWearEvents,
  updateWearEvent
} from "../services/wearEvents";
import {
  createOutfitPlan,
  deleteOutfitPlan,
  listOutfitPlans,
  markOutfitPlanWorn,
  updateOutfitPlan
} from "../services/outfitPlanner";
import { ApiError, validatePositiveIntegerParam } from "../validation";

export function registerPlannerRoutes(app: Express, db: AppDatabase): void {
  app.get("/api/wear-events", (request, response) => {
    handle(response, () => listWearEvents(db, request.query));
  });

  app.post("/api/wear-events", (request, response) => {
    try {
      response.status(201).json(createWearEvent(db, request.body));
    } catch (error) {
      sendError(response, error);
    }
  });

  app.put("/api/wear-events/:id", (request, response) => {
    handle(response, () => updateWearEvent(
      db,
      validatePositiveIntegerParam(request.params.id, "wearEventId"),
      request.body
    ));
  });

  app.delete("/api/wear-events/:id", (request, response) => {
    handle(response, () => deleteWearEvent(
      db,
      validatePositiveIntegerParam(request.params.id, "wearEventId")
    ));
  });

  app.get("/api/outfit-plans", (request, response) => {
    handle(response, () => listOutfitPlans(db, request.query));
  });

  app.post("/api/outfit-plans", (request, response) => {
    try {
      response.status(201).json(createOutfitPlan(db, request.body));
    } catch (error) {
      sendError(response, error);
    }
  });

  app.put("/api/outfit-plans/:id", (request, response) => {
    handle(response, () => updateOutfitPlan(
      db,
      validatePositiveIntegerParam(request.params.id, "outfitPlanId"),
      request.body
    ));
  });

  app.delete("/api/outfit-plans/:id", (request, response) => {
    handle(response, () => deleteOutfitPlan(
      db,
      validatePositiveIntegerParam(request.params.id, "outfitPlanId")
    ));
  });

  app.post("/api/outfit-plans/:id/mark-worn", (request, response) => {
    handle(response, () => markOutfitPlanWorn(
      db,
      validatePositiveIntegerParam(request.params.id, "outfitPlanId"),
      request.body
    ));
  });
}

function handle<T>(response: Response, callback: () => T): void {
  try {
    response.json(callback());
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
