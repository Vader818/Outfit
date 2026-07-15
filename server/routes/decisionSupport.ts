import type { Express, Response } from "express";
import type { AppDatabase } from "../db";
import { ApiError, ValidationError } from "../validation";
import type { SimilarityFeedbackInput, TaobaoCapturedBatch } from "../../src/shared/types";
import {
  canonicalizeGarmentFeedbackPair,
  listSimilarGarments,
  upsertSimilarityFeedback
} from "../services/garmentSimilarity";
import {
  checkTaobaoPurchaseCandidate,
  resolveTaobaoPurchaseCandidate
} from "../services/purchaseCheck";
import { getWardrobeValueInsights } from "../services/wardrobeValue";

const FEEDBACK_FIELDS = new Set(["subject", "comparedGarmentId", "verdict"]);
const GARMENT_SUBJECT_FIELDS = new Set(["kind", "garmentId"]);
const CANDIDATE_SUBJECT_FIELDS = new Set(["kind", "batch", "sourceItemKey"]);

export function registerDecisionSupportRoutes(app: Express, db: AppDatabase): void {
  app.get("/api/insights/value", (_request, response) => {
    handle(response, () => getWardrobeValueInsights(db));
  });

  app.post("/api/purchase-checks/taobao-candidate", (request, response) => {
    handle(response, () => checkTaobaoPurchaseCandidate(db, request.body));
  });

  app.get("/api/garments/:id/similar", (request, response) => {
    handle(response, () => listSimilarGarments(db, validatePositiveIntegerParam(request.params.id, "garmentId")));
  });

  app.post("/api/similarity-feedback", (request, response) => {
    handle(response, () => {
      const input = validateSimilarityFeedbackInput(request.body);
      if (input.subject.kind === "garment") {
        return upsertSimilarityFeedback(db, {
          ...canonicalizeGarmentFeedbackPair(input.subject.garmentId, input.comparedGarmentId),
          verdict: input.verdict
        });
      }
      const resolved = resolveTaobaoPurchaseCandidate({
        batch: input.subject.batch,
        sourceItemKey: input.subject.sourceItemKey
      });
      return upsertSimilarityFeedback(db, {
        subjectKey: resolved.subjectKey,
        comparedGarmentId: input.comparedGarmentId,
        verdict: input.verdict
      });
    });
  });
}

function validateSimilarityFeedbackInput(payload: unknown): SimilarityFeedbackInput {
  const record = requireRecord(payload, "相似度反馈");
  assertExactKeys(record, FEEDBACK_FIELDS, "");
  const subject = requireRecord(record.subject, "subject");
  if (subject.kind === "garment") {
    assertExactKeys(subject, GARMENT_SUBJECT_FIELDS, "subject");
    return {
      subject: {
        kind: "garment",
        garmentId: validatePositiveIntegerValue(subject.garmentId, "subject.garmentId")
      },
      comparedGarmentId: validatePositiveIntegerValue(record.comparedGarmentId, "comparedGarmentId"),
      verdict: validateVerdict(record.verdict)
    };
  }
  if (subject.kind === "taobao-candidate") {
    assertExactKeys(subject, CANDIDATE_SUBJECT_FIELDS, "subject");
    return {
      subject: {
        kind: "taobao-candidate",
        batch: subject.batch as TaobaoCapturedBatch,
        sourceItemKey: subject.sourceItemKey as string
      },
      comparedGarmentId: validatePositiveIntegerValue(record.comparedGarmentId, "comparedGarmentId"),
      verdict: validateVerdict(record.verdict)
    };
  }
  throw new ValidationError("subject.kind 必须是 garment 或 taobao-candidate");
}

function validateVerdict(value: unknown): SimilarityFeedbackInput["verdict"] {
  if (value !== "duplicate" && value !== "not-duplicate") {
    throw new ValidationError("verdict 必须是 duplicate 或 not-duplicate");
  }
  return value;
}

function validatePositiveIntegerParam(value: string | undefined, field: string): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new ValidationError(`${field} 必须是正整数`);
  }
  return validatePositiveIntegerValue(Number(value), field);
}

function validatePositiveIntegerValue(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new ValidationError(`${field} 必须是正整数`);
  }
  return Number(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${path} 必须是 JSON 对象`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>, path: string): void {
  const unknown = Object.keys(record).filter((key) => !allowed.has(key)).sort();
  if (unknown.length === 0) return;
  throw new ValidationError(`未知字段：${unknown.map((key) => path ? `${path}.${key}` : key).join(", ")}`);
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
