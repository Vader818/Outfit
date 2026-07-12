import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, createManualGarment, getGarmentById } from "../server/db";
import { registerGarmentRoutes } from "../server/routes/garments";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("public garment update image boundary", () => {
  it.each([
    ["absolute path", "D:\\private\\wardrobe\\coat.jpg"],
    ["data URL", "data:image/png;base64,cHJpdmF0ZQ=="],
    ["arbitrary HTTPS URL", "https://attacker.example/private.jpg"],
    ["garment asset URL", "/api/garment-assets/123/content"]
  ])("rejects imageUrl supplied as %s without partially applying other fields", async (_label, imageUrl) => {
    const fixture = await startGarmentApi();

    const response = await fetch(`${fixture.baseUrl}/api/garments/${fixture.garmentId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "不应保存的新名称", imageUrl })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "GARMENT_IMAGE_UPDATE_FORBIDDEN",
        message: expect.stringContaining("专用图片上传接口"),
        details: {
          field: "imageUrl",
          endpoint: `/api/garments/${fixture.garmentId}/image`
        }
      }
    });
    expect(getGarmentById(fixture.db, fixture.garmentId)).toMatchObject({
      name: "原始名称",
      imageUrl: ""
    });
  });

  it("continues to update normal public garment fields", async () => {
    const fixture = await startGarmentApi();

    const response = await fetch(`${fixture.baseUrl}/api/garments/${fixture.garmentId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "更新后的名称",
        notes: "正常公开字段仍可更新",
        confirmed: false
      })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: fixture.garmentId,
      name: "更新后的名称",
      notes: "正常公开字段仍可更新",
      confirmed: false,
      imageUrl: ""
    });
  });
});

async function startGarmentApi() {
  const db = createDatabase(":memory:");
  const garment = createManualGarment(db, {
    name: "原始名称",
    category: "top",
    color: "black",
    warmth: "medium",
    seasons: ["autumn"],
    styles: ["casual"],
    formality: "casual"
  });
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
  return {
    db,
    garmentId: garment.id,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}
