import type { Express, Response } from "express";
import type { AppDatabase } from "../db";
import {
  clearRecommendationFeedback,
  previewRecommendationFeedbackClear,
  upsertRecommendationFeedback
} from "../services/recommendationFeedback";
import {
  ApiError,
  validateRecommendationFeedbackClearScope,
  validateRecommendationFeedbackInput
} from "../validation";

export function registerFeedbackRoutes(app: Express, db: AppDatabase): void {
  app.post("/api/recommendation-feedback", (request, response) => {
    handle(response, () => upsertRecommendationFeedback(
      db,
      validateRecommendationFeedbackInput(request.body)
    ));
  });

  app.get("/api/recommendation-feedback/clear-preview", (request, response) => {
    handle(response, () => previewRecommendationFeedbackClear(
      db,
      validateRecommendationFeedbackClearScope(request.query)
    ));
  });

  app.delete("/api/recommendation-feedback", (request, response) => {
    handle(response, () => clearRecommendationFeedback(
      db,
      validateRecommendationFeedbackClearScope(request.query)
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
