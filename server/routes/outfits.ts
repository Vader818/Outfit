import type { Express, Response } from "express";
import type { AppDatabase } from "../db";
import {
  applySavedOutfitReplacement,
  archiveSavedOutfit,
  createSavedOutfit,
  getSavedOutfit,
  listSavedOutfits,
  saveRecommendationCandidate,
  updateSavedOutfit
} from "../services/savedOutfits";
import {
  ApiError,
  validateSaveRecommendationCandidate,
  validatePositiveIntegerParam,
  validateSavedOutfitCreate,
  validateSavedOutfitReplacement,
  validateSavedOutfitUpdate,
  validateUuidParam
} from "../validation";

export function registerOutfitRoutes(app: Express, db: AppDatabase): void {
  app.get("/api/outfits", (request, response) => {
    handle(response, () => listSavedOutfits(db, {
      scope: isTruthyQueryFlag(request.query.archived) ? "archived" : "active"
    }));
  });

  app.post("/api/outfits", (request, response) => {
    try {
      response.status(201).json(createSavedOutfit(db, validateSavedOutfitCreate(request.body)));
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/api/recommendation-candidates/:candidateId/save", (request, response) => {
    try {
      response.status(201).json(saveRecommendationCandidate(
        db,
        validateUuidParam(request.params.candidateId, "candidateId"),
        validateSaveRecommendationCandidate(request.body)
      ));
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get("/api/outfits/:id", (request, response) => {
    handle(response, () => getSavedOutfit(
      db,
      validatePositiveIntegerParam(request.params.id, "outfitId")
    ));
  });

  app.post("/api/outfits/:id/replacements", (request, response) => {
    try {
      response.status(201).json(applySavedOutfitReplacement(
        db,
        validatePositiveIntegerParam(request.params.id, "outfitId"),
        validateSavedOutfitReplacement(request.body)
      ));
    } catch (error) {
      sendError(response, error);
    }
  });

  app.put("/api/outfits/:id", (request, response) => {
    handle(response, () => updateSavedOutfit(
      db,
      validatePositiveIntegerParam(request.params.id, "outfitId"),
      validateSavedOutfitUpdate(request.body)
    ));
  });

  app.post("/api/outfits/:id/archive", (request, response) => {
    handle(response, () => archiveSavedOutfit(
      db,
      validatePositiveIntegerParam(request.params.id, "outfitId")
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

function isTruthyQueryFlag(value: unknown): boolean {
  return value === "1" || value === "true";
}
