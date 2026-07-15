import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDatabase,
  importTaobaoBatchIntoDb,
  listGarments,
  type AppDatabase
} from "../server/db";
import { registerGarmentRoutes } from "../server/routes/garments";
import { validateGarmentUpdate } from "../server/validation";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("existing garment manual purchase price", () => {
  it("accepts only non-negative safe integer cents in a garment update", () => {
    expect(validateGarmentUpdate({ purchasePriceCents: 12_345 })).toEqual({
      purchasePriceCents: 12_345
    });

    for (const purchasePriceCents of [-1, 1.5, "12345", Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => validateGarmentUpdate({ purchasePriceCents })).toThrow(
        "purchasePriceCents 必须是非负安全整数"
      );
    }
  });

  it("sets CNY/manual through the public API and protects the price from a Taobao reimport", async () => {
    const db = createDatabase(":memory:");
    const firstBatch = taobaoBatch("399.00");
    importTaobaoBatchIntoDb(db, firstBatch);
    const garment = listGarments(db)[0];
    expect(garment).toMatchObject({
      purchasePriceCents: 39_900,
      currency: "CNY",
      costSource: "taobao"
    });
    const baseUrl = await startGarmentApi(db);

    const response = await fetch(`${baseUrl}/api/garments/${garment.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ purchasePriceCents: 12_345 })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: garment.id,
      purchasePriceCents: 12_345,
      currency: "CNY",
      costSource: "manual"
    });
    expect(db.prepare(`
      SELECT purchase_price_cents, currency, cost_source
      FROM garments
      WHERE id = ?
    `).get(garment.id)).toEqual({
      purchase_price_cents: 12_345,
      currency: "CNY",
      cost_source: "manual"
    });

    importTaobaoBatchIntoDb(db, taobaoBatch("499.00"));

    expect(listGarments(db)[0]).toMatchObject({
      purchasePriceCents: 12_345,
      currency: "CNY",
      costSource: "manual"
    });
  });

  it("rejects an invalid public price without changing the stored Taobao value", async () => {
    const db = createDatabase(":memory:");
    importTaobaoBatchIntoDb(db, taobaoBatch("399.00"));
    const garment = listGarments(db)[0];
    const baseUrl = await startGarmentApi(db);

    const response = await fetch(`${baseUrl}/api/garments/${garment.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ purchasePriceCents: 123.45 })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "purchasePriceCents 必须是非负安全整数"
      }
    });
    expect(listGarments(db)[0]).toMatchObject({
      purchasePriceCents: 39_900,
      currency: "CNY",
      costSource: "taobao"
    });
  });
});

async function startGarmentApi(db: AppDatabase): Promise<string> {
  const app = express();
  app.use(express.json());
  registerGarmentRoutes(app, db);
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test server address");
  return `http://127.0.0.1:${address.port}`;
}

function taobaoBatch(payment: string) {
  return {
    source: "taobao-bookmarklet",
    pageType: "order-list" as const,
    items: [{
      itemId: "manual-price-target",
      orderId: "manual-price-order",
      orderTime: "2026-01-02 08:30:00",
      title: "黑色羊毛大衣女秋冬厚款外套",
      quantity: 1,
      payment,
      status: "交易成功"
    }]
  };
}
