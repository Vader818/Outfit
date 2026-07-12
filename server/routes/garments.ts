import express, { type Express, type Response } from "express";
import type { AppDatabase, GarmentUpdate } from "../db";
import {
  archiveGarment,
  createManualGarment,
  deleteGarment,
  getGarmentById,
  listGarments,
  restoreGarment,
  updateGarment
} from "../db";
import {
  MAX_GARMENT_IMAGE_BYTES,
  readActiveGarmentAsset,
  saveGarmentImageAsset
} from "../services/garmentAssets";
import { setGarmentAvailability } from "../services/garmentAvailability";
import {
  ApiError,
  validateGarmentAvailabilityRequest,
  validateGarmentUpdate,
  validateManualGarmentCreate,
  validatePositiveIntegerParam
} from "../validation";

export interface GarmentRouteOptions {
  assetRoot?: string;
}

export function registerGarmentRoutes(
  app: Express,
  db: AppDatabase,
  options: GarmentRouteOptions = {}
): void {
  app.put(
    "/api/garments/:id/image",
    express.raw({ type: () => true, limit: MAX_GARMENT_IMAGE_BYTES }),
    (request, response) => {
      void handleAsync(response, async () => {
        const garmentId = validatePositiveIntegerParam(request.params.id);
        const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
        await saveGarmentImageAsset(
          db,
          garmentId,
          body,
          request.headers["content-type"] || "",
          { assetRoot: options.assetRoot }
        );
        return getGarmentById(db, garmentId);
      });
    }
  );

  app.get("/api/garment-assets/:id/content", (request, response) => {
    void (async () => {
      try {
        const content = await readActiveGarmentAsset(
          db,
          validatePositiveIntegerParam(request.params.id),
          { assetRoot: options.assetRoot }
        );
        response.status(200);
        response.setHeader("Content-Type", content.asset.mimeType);
        response.setHeader("Content-Length", String(content.bytes.byteLength));
        response.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("ETag", `"${content.asset.sha256}"`);
        response.send(content.bytes);
      } catch (error) {
        sendError(response, error);
      }
    })();
  });

  app.get("/api/garments", (request, response) => {
    handle(response, () => listGarments(db, {
      scope: isTruthyQueryFlag(request.query.archived) ? "archived" : "active"
    }));
  });

  app.post("/api/garments", (request, response) => {
    try {
      response.status(201).json(createManualGarment(db, validateManualGarmentCreate(request.body)));
    } catch (error) {
      sendError(response, error);
    }
  });

  app.put("/api/garments/:id", (request, response) => {
    handle(response, () => updateGarment(
      db,
      validatePositiveIntegerParam(request.params.id),
      validateGarmentUpdate(request.body) as GarmentUpdate
    ));
  });

  app.post("/api/garments/:id/availability", (request, response) => {
    handle(response, () => setGarmentAvailability(
      db,
      validatePositiveIntegerParam(request.params.id, "garmentId"),
      validateGarmentAvailabilityRequest(request.body).status
    ));
  });

  app.post("/api/garments/:id/archive", (request, response) => {
    handle(response, () => archiveGarment(db, validatePositiveIntegerParam(request.params.id)));
  });

  app.post("/api/garments/:id/restore", (request, response) => {
    handle(response, () => restoreGarment(db, validatePositiveIntegerParam(request.params.id)));
  });

  app.delete("/api/garments/:id", (request, response) => {
    try {
      deleteGarment(db, validatePositiveIntegerParam(request.params.id));
      response.setHeader("Deprecation", "true");
      response.setHeader(
        "Link",
        `</api/garments/${request.params.id}/archive>; rel="successor-version"`
      );
      response.status(204).end();
    } catch (error) {
      sendError(response, error);
    }
  });
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
