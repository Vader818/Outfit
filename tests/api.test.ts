import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../server/db";
import { createApiApp } from "../server/routes";

vi.mock("node:child_process", () => ({
  spawn: vi.fn()
}));

const servers: Array<{ close: (callback?: () => void) => void }> = [];
const spawnMock = vi.mocked(spawn);

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

const recommendationWeather = {
  date: "2026-05-03",
  temperature: 20,
  apparentTemperature: 20,
  precipitationProbability: 10,
  windSpeed: 8,
  weatherCode: 1,
  summary: "晴"
};

beforeEach(() => {
  spawnMock.mockReturnValue({ pid: 4321, unref: vi.fn() } as never);
});

afterEach(async () => {
  spawnMock.mockClear();
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
  it("starts Taobao Selenium captures without waiting for the browser run", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const ordersResponse = await fetch(`${baseUrl}/api/capture/taobao-orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ maxPages: 2, loginWait: 45 })
    });
    expect(ordersResponse.status).toBe(200);
    expect(await ordersResponse.json()).toMatchObject({
      started: true,
      mode: "orders",
      pid: 4321,
      outputDir: "output/taobao-captures"
    });
    expect(spawnMock).toHaveBeenLastCalledWith(
      "python",
      ["scripts/taobao_order_selenium_capture.py", "--max-pages", "2", "--login-wait", "45"],
      expect.objectContaining({ cwd: process.cwd(), detached: true, stdio: "ignore" })
    );

    const itemResponse = await fetch(`${baseUrl}/api/capture/taobao-item`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://item.taobao.com/item.htm?id=808", loginWait: 30 })
    });
    expect(itemResponse.status).toBe(200);
    expect(await itemResponse.json()).toMatchObject({
      started: true,
      mode: "item-detail",
      pid: 4321,
      outputDir: "output/taobao-captures"
    });
    expect(spawnMock).toHaveBeenLastCalledWith(
      "python",
      ["scripts/taobao_selenium_capture.py", "--url", "https://item.taobao.com/item.htm?id=808", "--login-wait", "30"],
      expect.objectContaining({ cwd: process.cwd(), detached: true, stdio: "ignore" })
    );
  });

  it("rejects item Selenium capture requests without an item URL", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${baseUrl}/api/capture/taobao-item`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "not a url" })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "请输入有效的淘宝或天猫商品链接" });
    expect(spawnMock).not.toHaveBeenCalled();
  });

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

  it("records wear logs with context", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${baseUrl}/api/wear-logs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        garmentIds: [1, 2, 3],
        context: {
          outfitId: "outfit-1",
          occasion: "casual",
          weather: recommendationWeather
        }
      })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const row = db.prepare("SELECT garment_ids, context FROM wear_logs").get() as { garment_ids: string; context: string };
    expect(JSON.parse(row.garment_ids)).toEqual([1, 2, 3]);
    expect(JSON.parse(row.context)).toMatchObject({ outfitId: "outfit-1", occasion: "casual" });
  });

  it("rejects invalid wear log payloads", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${baseUrl}/api/wear-logs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ garmentIds: [] })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "garmentIds 必须是非空数字数组" });
  });

  it("uses recent wear logs when ranking recommendations", async () => {
    const db = createDatabase(":memory:");
    const insert = db.prepare(`
      INSERT INTO garments (
        name, category, color, warmth, seasons, styles, formality,
        image_url, owned, confirmed, excluded, confidence, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run("常穿黑色T恤", "top", "black", "medium", JSON.stringify(["spring", "summer"]), JSON.stringify(["casual"]), "casual", "", 1, 1, 0, 0.99, "");
    insert.run("干净白色T恤", "top", "white", "medium", JSON.stringify(["spring", "summer"]), JSON.stringify(["casual"]), "casual", "", 1, 1, 0, 0.4, "");
    insert.run("深蓝直筒牛仔裤", "bottom", "blue", "medium", JSON.stringify(["spring", "autumn"]), JSON.stringify(["casual"]), "casual", "", 1, 1, 0, 0.8, "");
    insert.run("白色运动鞋", "shoes", "white", "light", JSON.stringify(["spring", "summer"]), JSON.stringify(["casual"]), "casual", "", 1, 1, 0, 0.8, "");

    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    await fetch(`${baseUrl}/api/wear-logs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ garmentIds: [1], context: { outfitId: "outfit-previous" } })
    });

    const recommendationResponse = await fetch(`${baseUrl}/api/recommendations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        occasion: "casual",
        weather: recommendationWeather
      })
    });
    const recommendation = await recommendationResponse.json();

    expect(recommendation.outfits[0].items.some((item: { id: number }) => item.id === 1)).toBe(false);
    expect(recommendation.outfits[0].items.some((item: { id: number }) => item.id === 2)).toBe(true);
    expect(recommendation.outfits[0].reasons.join(" ")).toMatch(/最近|重复|换穿/);
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
