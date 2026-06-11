import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../server/db";
import { createApiApp } from "../server/routes";

const servers: Array<{ close: (callback?: () => void) => void }> = [];

const payload = {
  source: "taobao-bookmarklet",
  items: [
    {
      orderId: "1234567890123",
      title: "黑色羊毛大衣 女 秋冬 厚款",
      sku: "颜色分类: 黑色; 尺码: M",
      status: "交易成功",
      imageUrl: "https://img.alicdn.com/coat.jpg",
      itemUrl: "https://item.taobao.com/item.htm?id=1"
    },
    {
      orderId: "1234567890124",
      title: "米白高领毛衣",
      sku: "颜色分类: 米白",
      status: "交易成功"
    },
    {
      orderId: "1234567890125",
      title: "深蓝直筒牛仔裤",
      sku: "颜色分类: 深蓝",
      status: "交易成功"
    },
    {
      orderId: "1234567890126",
      title: "黑色短靴",
      sku: "颜色分类: 黑色",
      status: "交易成功"
    }
  ]
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        })
    )
  );
});

describe("API routes", () => {
  it("imports Taobao items, updates garments, and returns recommendations", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const importResponse = await fetch(`${baseUrl}/api/import/taobao-batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    expect(importResponse.status).toBe(200);
    expect(await importResponse.json()).toMatchObject({ summary: { createdGarments: 4 } });

    const garmentsResponse = await fetch(`${baseUrl}/api/garments`);
    const garments = (await garmentsResponse.json()) as Array<{ id: number; confirmed: boolean; itemUrl?: string; detailUrl?: string }>;
    expect(garments).toHaveLength(4);
    expect(garments.some((garment) => garment.itemUrl === "https://item.taobao.com/item.htm?id=1")).toBe(true);

    const linkedGarment = garments.find((garment) => garment.itemUrl || garment.detailUrl);
    expect(linkedGarment).toBeTruthy();
    const updateResponse = await fetch(`${baseUrl}/api/garments/${linkedGarment?.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmed: true })
    });
    const updatedGarment = await updateResponse.json();
    expect(updatedGarment).toMatchObject({ confirmed: true });
    expect(updatedGarment.itemUrl || updatedGarment.detailUrl).toBeTruthy();

    const recommendationResponse = await fetch(`${baseUrl}/api/recommendations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        occasion: "casual",
        weather: {
          date: "2026-01-03",
          temperature: 6,
          apparentTemperature: 4,
          precipitationProbability: 78,
          windSpeed: 22,
          weatherCode: 61,
          summary: "小雨"
        }
      })
    });
    const recommendation = await recommendationResponse.json();
    expect(recommendation.outfits).toHaveLength(1);
    expect(recommendation.outfits[0].items.length).toBeGreaterThanOrEqual(3);
  });

  it("deletes a garment from the wardrobe", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    await fetch(`${baseUrl}/api/import/taobao-batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const garmentsResponse = await fetch(`${baseUrl}/api/garments`);
    const garments = (await garmentsResponse.json()) as Array<{ id: number }>;
    const deletedId = garments[0].id;

    const deleteResponse = await fetch(`${baseUrl}/api/garments/${deletedId}`, {
      method: "DELETE"
    });
    expect(deleteResponse.status).toBe(204);

    const afterDeleteResponse = await fetch(`${baseUrl}/api/garments`);
    const afterDelete = (await afterDeleteResponse.json()) as Array<{ id: number }>;
    expect(afterDelete).toHaveLength(3);
    expect(afterDelete.some((item) => item.id === deletedId)).toBe(false);
  });

  it("accepts detail captures and returns detail links on garments", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${baseUrl}/api/import/taobao-batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "taobao-bookmarklet",
        pageType: "item-detail",
        pageUrl: "https://item.taobao.com/item.htm?id=808",
        items: [
          {
            itemId: "808",
            detailUrl: "https://item.taobao.com/item.htm?id=808",
            detailTitle: "蓝色透气运动鞋 夏季 轻便跑步休闲鞋",
            detailProps: [{ name: "颜色分类", value: "蓝色" }],
            detailImages: ["https://img.alicdn.com/shoe.jpg"]
          }
        ]
      })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ summary: { createdGarments: 1 } });

    const garmentsResponse = await fetch(`${baseUrl}/api/garments`);
    const garments = (await garmentsResponse.json()) as Array<{ name: string; detailUrl?: string; imageUrl?: string }>;
    expect(garments).toHaveLength(1);
    expect(garments[0]).toMatchObject({
      name: "蓝色透气运动鞋 夏季 轻便跑步休闲鞋",
      detailUrl: "https://item.taobao.com/item.htm?id=808",
      imageUrl: "https://img.alicdn.com/shoe.jpg"
    });
  });

  it("serves repeated weather requests from SQLite cache", async () => {
    const realFetch = globalThis.fetch.bind(globalThis);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      current: {
        time: "2026-01-03T09:00",
        temperature_2m: 6,
        apparent_temperature: 4,
        precipitation: 1,
        weather_code: 61,
        wind_speed_10m: 22
      },
      daily: {
        time: ["2026-01-03"],
        precipitation_probability_max: [78],
        weather_code: [61]
      }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const first = await realFetch(`${baseUrl}/api/weather?latitude=39.9042&longitude=116.4074`);
    const second = await realFetch(`${baseUrl}/api/weather?latitude=39.9042&longitude=116.4074`);

    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ summary: "小雨" });
    expect(await second.json()).toMatchObject({ summary: "小雨" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
