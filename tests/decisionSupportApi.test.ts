import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, type AppDatabase } from "../server/db";
import { registerDecisionSupportRoutes } from "../server/routes/decisionSupport";
import { createApiApp } from "../server/routes";
import { previewTaobaoImport } from "../server/services/importTaobao";
import type { TaobaoCapturedBatch } from "../src/shared/types";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("decision support routes", () => {
  it("inherits the main app session and same-origin protections", async () => {
    const db = createDatabase(":memory:");
    const baseUrl = await startMainApp(db);

    const unauthenticated = await fetch(`${baseUrl}/api/insights/value`);
    expect(unauthenticated.status).toBe(401);

    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { ...jsonHeaders(), origin: baseUrl, "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ username: "decisionowner", password: "local-passphrase-2026" })
    });
    expect(registration.status).toBe(201);
    const cookie = registration.headers.get("set-cookie")?.split(";", 1)[0];
    expect(cookie).toBeTruthy();

    const authenticated = await fetch(`${baseUrl}/api/insights/value`, {
      headers: { cookie: cookie ?? "" }
    });
    expect(authenticated.status).toBe(200);

    const crossSite = await fetch(`${baseUrl}/api/purchase-checks/taobao-candidate`, {
      method: "POST",
      headers: {
        ...jsonHeaders(),
        cookie: cookie ?? "",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site"
      },
      body: JSON.stringify(purchaseRequest())
    });
    expect(crossSite.status).toBe(403);
  });

  it("registers all four planned APIs and applies feedback immediately", async () => {
    const db = createDatabase(":memory:");
    ensureM5Tables(db);
    const first = insertGarment(db, "蓝色休闲衬衫");
    const second = insertGarment(db, "蓝色休闲衬衫");
    const baseUrl = await startApp(db);

    const valueResponse = await fetch(`${baseUrl}/api/insights/value`);
    expect(valueResponse.status).toBe(200);
    await expect(valueResponse.json()).resolves.toMatchObject({ generatedAt: expect.any(String) });

    const beforeFeedback = await fetch(`${baseUrl}/api/garments/${first}/similar`);
    expect(beforeFeedback.status).toBe(200);
    await expect(beforeFeedback.json()).resolves.toEqual([
      expect.objectContaining({ garment: expect.objectContaining({ id: second }), similarity: 100 })
    ]);

    const garmentFeedback = await fetch(`${baseUrl}/api/similarity-feedback`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        subject: { kind: "garment", garmentId: second },
        comparedGarmentId: first,
        verdict: "not-duplicate"
      })
    });
    expect(garmentFeedback.status).toBe(200);
    await expect(garmentFeedback.json()).resolves.toMatchObject({
      subjectKey: `garment:${Math.min(first, second)}`,
      comparedGarmentId: Math.max(first, second),
      verdict: "not-duplicate"
    });
    await expect((await fetch(`${baseUrl}/api/garments/${first}/similar`)).json()).resolves.toEqual([]);

    const request = purchaseRequest();
    const purchase = await fetch(`${baseUrl}/api/purchase-checks/taobao-candidate`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(request)
    });
    expect(purchase.status).toBe(200);
    const purchaseResult = await purchase.json() as { subjectKey: string; possibleDuplicates: unknown[] };
    expect(purchaseResult.subjectKey).toMatch(/^candidate:v1:[a-f0-9]{64}$/);
    expect(purchaseResult.possibleDuplicates.length).toBeGreaterThan(0);

    const candidateFeedback = await fetch(`${baseUrl}/api/similarity-feedback`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        subject: { kind: "taobao-candidate", ...request },
        comparedGarmentId: first,
        verdict: "not-duplicate"
      })
    });
    expect(candidateFeedback.status).toBe(200);
    await expect(candidateFeedback.json()).resolves.toMatchObject({
      subjectKey: purchaseResult.subjectKey,
      comparedGarmentId: first,
      verdict: "not-duplicate"
    });
    const checkedAgain = await (await fetch(`${baseUrl}/api/purchase-checks/taobao-candidate`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(request)
    })).json() as { possibleDuplicates: Array<{ garment: { id: number } }> };
    expect(checkedAgain.possibleDuplicates.map((match) => match.garment.id)).not.toContain(first);
  });

  it("returns structured validation and not-found errors without trusting client keys or extra fields", async () => {
    const db = createDatabase(":memory:");
    ensureM5Tables(db);
    const first = insertGarment(db, "蓝色休闲衬衫");
    const baseUrl = await startApp(db);
    const request = purchaseRequest();

    const forged = await fetch(`${baseUrl}/api/purchase-checks/taobao-candidate`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ ...request, subjectKey: "candidate:v1:forged" })
    });
    expect(forged.status).toBe(400);
    await expect(forged.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR", message: expect.stringMatching(/subjectKey/) }
    });

    const forgedFeedback = await fetch(`${baseUrl}/api/similarity-feedback`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        subject: { kind: "taobao-candidate", ...request, path: "D:\\capture.json" },
        comparedGarmentId: first,
        verdict: "duplicate"
      })
    });
    expect(forgedFeedback.status).toBe(400);
    await expect(forgedFeedback.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR", message: expect.stringMatching(/path/) }
    });

    const unknownGarment = await fetch(`${baseUrl}/api/garments/999999/similar`);
    expect(unknownGarment.status).toBe(404);
    await expect(unknownGarment.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });

    const invalidId = await fetch(`${baseUrl}/api/garments/not-a-number/similar`);
    expect(invalidId.status).toBe(400);
    await expect(invalidId.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});

async function startApp(db: AppDatabase): Promise<string> {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  registerDecisionSupportRoutes(app, db);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test server address");
  return `http://127.0.0.1:${address.port}`;
}

async function startMainApp(db: AppDatabase): Promise<string> {
  const server = createApiApp(db).listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test server address");
  return `http://127.0.0.1:${address.port}`;
}

function purchaseRequest(): { batch: TaobaoCapturedBatch; sourceItemKey: string } {
  const batch: TaobaoCapturedBatch = {
    source: "taobao-bookmarklet",
    pageType: "item-detail",
    capturedAt: "2026-07-13T01:00:00.000Z",
    pageUrl: "https://item.taobao.com/item.htm?id=10001",
    items: [{
      pageType: "item-detail",
      itemId: "10001",
      title: "NIKE 蓝色休闲衬衫男士长袖上衣",
      sku: "蓝色 / M",
      itemUrl: "https://item.taobao.com/item.htm?id=10001",
      detailTitle: "NIKE 蓝色休闲衬衫男士长袖上衣",
      detailProps: [{ name: "品牌", value: "NIKE" }]
    }]
  };
  const preview = previewTaobaoImport(batch);
  if (preview.candidates.length !== 1) throw new Error("route fixture did not classify as one garment");
  return { batch, sourceItemKey: preview.candidates[0].sourceItemKey };
}

function insertGarment(db: AppDatabase, name: string): number {
  return Number(db.prepare(`
    INSERT INTO garments (
      brand, name, raw_name, category, color, warmth, seasons, styles, formality,
      materials, patterns, tags, image_url, owned, confirmed, excluded, confidence,
      notes, origin
    ) VALUES ('NIKE', ?, ?, 'top', 'blue', 'medium', '["spring","autumn"]',
      '["casual"]', 'casual', '[]', '[]', '[]', '', 1, 1, 0, 1, '', 'manual')
  `).run(name, name).lastInsertRowid);
}

function jsonHeaders(): Record<string, string> {
  return { "content-type": "application/json" };
}

function ensureM5Tables(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS garment_similarity_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_key TEXT NOT NULL,
      compared_garment_id INTEGER NOT NULL,
      verdict TEXT NOT NULL CHECK (verdict IN ('duplicate', 'not-duplicate')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(subject_key, compared_garment_id),
      FOREIGN KEY(compared_garment_id) REFERENCES garments(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS garment_embeddings (
      model_id TEXT NOT NULL,
      garment_id INTEGER NOT NULL,
      vector_blob BLOB NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(model_id, garment_id),
      FOREIGN KEY(garment_id) REFERENCES garments(id) ON DELETE CASCADE
    );
  `);
}
