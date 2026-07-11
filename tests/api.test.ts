import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase, type AppDatabase } from "../server/db";
import { createApiApp } from "../server/routes";

vi.mock("node:child_process", () => ({
  spawn: vi.fn()
}));

const servers: Array<{ close: (callback?: () => void) => void }> = [];
const spawnMock = vi.mocked(spawn);
let nextTestUserId = 0;
let spawnedChild: {
  pid: number;
  unref: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  stdout: { on: ReturnType<typeof vi.fn> };
  stderr: { on: ReturnType<typeof vi.fn> };
};

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
  spawnedChild = {
    pid: 4321,
    unref: vi.fn(),
    kill: vi.fn(),
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() }
  };
  spawnMock.mockReturnValue(spawnedChild as never);
});

afterEach(async () => {
  spawnMock.mockClear();
  delete process.env.OUTFIT_TAOBAO_ITEM_CAPTURE_ENGINE;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
  it("sets baseline browser security headers", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const contentSecurityPolicy = response.headers.get("content-security-policy") || "";
    expect(contentSecurityPolicy).toContain("img-src 'self' data: https://*.alicdn.com https://*.taobaocdn.com");
  });

  it("supports first-run registration, login, status, and logout", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const initialStatus = await fetch(`${baseUrl}/api/auth/status`);
    expect(initialStatus.status).toBe(200);
    expect(await initialStatus.json()).toEqual({ hasAccount: false, user: null });

    const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ username: "local_user", password: "correct-password" })
    });
    const registerCookie = sessionCookie(registerResponse);
    expect(registerResponse.status).toBe(201);
    expect(registerCookie).toMatch(/^outfit_session=/);
    expect(await registerResponse.json()).toEqual({
      hasAccount: true,
      user: { id: 1, username: "local_user" }
    });

    const duplicateResponse = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ username: "second_user", password: "correct-password" })
    });
    expect(duplicateResponse.status).toBe(409);
    expect(await duplicateResponse.json()).toMatchObject({
      error: { code: "ACCOUNT_EXISTS" }
    });

    const badLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ username: "local_user", password: "wrong-password" })
    });
    expect(badLoginResponse.status).toBe(401);
    expect(await badLoginResponse.json()).toMatchObject({
      error: { code: "INVALID_CREDENTIALS" }
    });

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ username: "LOCAL_USER", password: "correct-password" })
    });
    const loginCookie = sessionCookie(loginResponse);
    expect(loginResponse.status).toBe(200);
    expect(loginCookie).toMatch(/^outfit_session=/);
    expect(await loginResponse.json()).toEqual({
      hasAccount: true,
      user: { id: 1, username: "local_user" }
    });

    const authenticatedStatus = await fetch(`${baseUrl}/api/auth/status`, {
      headers: { cookie: loginCookie }
    });
    expect(await authenticatedStatus.json()).toEqual({
      hasAccount: true,
      user: { id: 1, username: "local_user" }
    });

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { cookie: loginCookie }
    });
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.headers.get("set-cookie")).toContain("Max-Age=0");

    const loggedOutStatus = await fetch(`${baseUrl}/api/auth/status`, {
      headers: { cookie: loginCookie }
    });
    expect(await loggedOutStatus.json()).toEqual({ hasAccount: true, user: null });
  });

  it("requires a valid local session for existing data APIs", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const unauthenticatedExport = await fetch(`${baseUrl}/api/export`);
    expect(unauthenticatedExport.status).toBe(401);
    const authCookie = await registerTestUser(baseUrl);

    const unauthenticatedResponse = await fetch(`${baseUrl}/api/garments`);
    expect(unauthenticatedResponse.status).toBe(401);
    expect(await unauthenticatedResponse.json()).toMatchObject({
      error: { code: "UNAUTHENTICATED" }
    });

    const authenticatedResponse = await fetch(`${baseUrl}/api/garments`, {
      headers: { cookie: authCookie }
    });
    expect(authenticatedResponse.status).toBe(200);
    expect(await authenticatedResponse.json()).toEqual([]);

    await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { cookie: authCookie }
    });

    const afterLogoutResponse = await fetch(`${baseUrl}/api/garments`, {
      headers: { cookie: authCookie }
    });
    expect(afterLogoutResponse.status).toBe(401);
  });

  it("treats malformed session cookies as unauthenticated instead of crashing", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    await registerTestUser(baseUrl);
    const malformedCookie = "outfit_session=%E0%A4%A";

    const statusResponse = await fetch(`${baseUrl}/api/auth/status`, {
      headers: { cookie: malformedCookie }
    });
    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toMatchObject({ hasAccount: true, user: null });

    const garmentsResponse = await fetch(`${baseUrl}/api/garments`, {
      headers: { cookie: malformedCookie }
    });
    expect(garmentsResponse.status).toBe(401);
    expect(await garmentsResponse.json()).toMatchObject({
      error: { code: "UNAUTHENTICATED" }
    });
  });

  it("rate limits repeated failed login attempts", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    await registerTestUser(baseUrl);

    let lastResponse: Response | null = null;
    for (let index = 0; index < 6; index += 1) {
      lastResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ username: `test_user_${nextTestUserId}`, password: "wrong-password" })
      });
    }

    expect(lastResponse?.status).toBe(429);
    expect(await lastResponse!.json()).toMatchObject({
      error: { code: "LOGIN_RATE_LIMITED" }
    });
  });

  it("rejects mutating API requests from untrusted origins", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const response = await fetch(`${baseUrl}/api/wear-logs`, {
      method: "POST",
      headers: {
        ...jsonHeaders(authCookie),
        origin: "https://evil.example"
      },
      body: JSON.stringify({ garmentIds: [1], context: {} })
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "ORIGIN_NOT_ALLOWED" }
    });
  });

  it("validates weather coordinate ranges and garment id params", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const weatherResponse = await fetch(`${baseUrl}/api/weather?latitude=91&longitude=116`, {
      headers: { cookie: authCookie }
    });
    expect(weatherResponse.status).toBe(400);
    expect(await weatherResponse.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR", message: expect.stringContaining("latitude") }
    });

    const garmentResponse = await fetch(`${baseUrl}/api/garments/NaN`, {
      method: "PUT",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ confirmed: true })
    });
    expect(garmentResponse.status).toBe(400);
    expect(await garmentResponse.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR", message: expect.stringContaining("id") }
    });
  });

  it("returns client errors for malformed imports and missing garments", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const importResponse = await fetch(`${baseUrl}/api/import/taobao-preview`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ source: "taobao-bookmarklet" })
    });
    expect(importResponse.status).toBe(400);
    expect(await importResponse.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR", message: expect.stringContaining("items") }
    });

    const malformedItemResponse = await fetch(`${baseUrl}/api/import/taobao-preview`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ items: [null] })
    });
    expect(malformedItemResponse.status).toBe(400);
    expect(await malformedItemResponse.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR", message: expect.stringContaining("items[0]") }
    });

    const updateResponse = await fetch(`${baseUrl}/api/garments/999`, {
      method: "PUT",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ confirmed: true })
    });
    expect(updateResponse.status).toBe(404);
    expect(await updateResponse.json()).toMatchObject({
      error: { code: "NOT_FOUND", message: "衣服不存在" }
    });

    const deleteResponse = await fetch(`${baseUrl}/api/garments/999`, {
      method: "DELETE",
      headers: jsonHeaders(authCookie)
    });
    expect(deleteResponse.status).toBe(404);
    expect(await deleteResponse.json()).toMatchObject({
      error: { code: "NOT_FOUND", message: "衣服不存在" }
    });
  });

  it("hides unexpected internal error details from API responses", async () => {
    const brokenDb = {
      prepare: () => {
        throw new Error("C:\\secret\\outfit.sqlite is locked");
      }
    } as unknown as AppDatabase;
    const app = createApiApp(brokenDb);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${baseUrl}/api/auth/status`);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "服务器错误"
      }
    });
  });

  it("hides legacy detached Taobao Selenium capture APIs", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const ordersResponse = await fetch(`${baseUrl}/api/capture/taobao-orders`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ maxPages: 2, loginWait: 45 })
    });
    expect(ordersResponse.status).toBe(410);
    expect(await ordersResponse.json()).toMatchObject({
      error: { code: "LEGACY_CAPTURE_DISABLED" }
    });

    const itemResponse = await fetch(`${baseUrl}/api/capture/taobao-item`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ url: "https://item.taobao.com/item.htm?id=808", loginWait: 30 })
    });
    expect(itemResponse.status).toBe(410);
    expect(await itemResponse.json()).toMatchObject({
      error: { code: "LEGACY_CAPTURE_DISABLED" }
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects item Selenium capture requests without an item URL", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const response = await fetch(`${baseUrl}/api/capture/taobao-item`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ url: "not a url" })
    });

    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({
      error: {
        code: "LEGACY_CAPTURE_DISABLED"
      }
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("starts capture jobs and reads artifacts by job id", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const startResponse = await fetch(`${baseUrl}/api/capture/jobs`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ mode: "orders", maxPages: 2, loginWait: 45 })
    });
    const job = await startResponse.json() as { id: string; status: string; outputDir: string; pid: number };

    expect(startResponse.status).toBe(200);
    expect(job).toMatchObject({
      status: "running",
      pid: 4321,
      outputDir: expect.stringContaining("output/taobao-captures/"),
      logPath: expect.stringContaining("capture.log")
    });
    expect(job.id).toMatch(/^cap_/);
    expect(spawnMock).toHaveBeenLastCalledWith(
      "python",
      expect.arrayContaining(["scripts/taobao_order_selenium_capture.py", "--max-pages", "2", "--login-wait", "45", "--output-dir", job.outputDir]),
      expect.objectContaining({ cwd: process.cwd(), stdio: expect.anything() })
    );
    const spawnOptions = spawnMock.mock.calls.at(-1)?.[2] as { stdio: unknown[] };
    expect(spawnOptions.stdio[1]).not.toBe("ignore");
    expect(spawnOptions.stdio[2]).not.toBe("ignore");

    const conflictResponse = await fetch(`${baseUrl}/api/capture/jobs`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ mode: "orders", maxPages: 1, loginWait: 30 })
    });
    expect(conflictResponse.status).toBe(409);
    expect(await conflictResponse.json()).toMatchObject({
      error: { code: "CAPTURE_JOB_RUNNING" }
    });

    mkdirSync(job.outputDir, { recursive: true });
    const payload = {
      source: "taobao-selenium-order-list",
      pageType: "order-list",
      items: [
        {
          itemId: "1",
          title: "UTIMUS纯棉短袖T恤男女同款夏季透气上衣",
          status: "交易成功"
        }
      ]
    };
    writeFileSync(path.join(job.outputDir, "capture.json"), JSON.stringify(payload), "utf8");

    const artifactResponse = await fetch(`${baseUrl}/api/capture/jobs/${job.id}/artifact?wardrobeOnly=1`, {
      headers: { cookie: authCookie }
    });
    const artifact = await artifactResponse.json();

    expect(artifactResponse.status).toBe(200);
    expect(artifact).toMatchObject({
      jobId: job.id,
      fileName: "capture.json",
      payload: {
        items: [expect.objectContaining({ itemId: "1" })]
      },
      filterSummary: {
        keptItems: 1
      }
    });
  });

  it("starts item-detail capture jobs with Selenium by default", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);
    const itemUrl = "https://item.taobao.com/item.htm?id=808";

    const startResponse = await fetch(`${baseUrl}/api/capture/jobs`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ mode: "item-detail", url: itemUrl, loginWait: 60 })
    });
    const job = await startResponse.json() as { id: string; engine: string; outputDir: string; message: string };

    expect(startResponse.status).toBe(200);
    expect(job).toMatchObject({
      engine: "selenium",
      message: expect.stringContaining("Selenium")
    });
    expect(spawnMock).toHaveBeenLastCalledWith(
      "python",
      expect.arrayContaining(["scripts/taobao_selenium_capture.py", "--url", itemUrl, "--login-wait", "60", "--output-dir", job.outputDir]),
      expect.objectContaining({ cwd: process.cwd(), shell: false })
    );

    await fetch(`${baseUrl}/api/capture/jobs/${job.id}/cancel`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });
  });

  it("starts item-detail capture jobs with Playwright when configured", async () => {
    process.env.OUTFIT_TAOBAO_ITEM_CAPTURE_ENGINE = "playwright";
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);
    const itemUrl = "https://detail.tmall.com/item.htm?id=909";

    const startResponse = await fetch(`${baseUrl}/api/capture/jobs`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ mode: "item-detail", url: itemUrl, loginWait: 45 })
    });
    const job = await startResponse.json() as { id: string; engine: string; outputDir: string; message: string };

    expect(startResponse.status).toBe(200);
    expect(job).toMatchObject({
      engine: "playwright",
      message: expect.stringContaining("Playwright")
    });
    expect(spawnMock).toHaveBeenLastCalledWith(
      process.execPath,
      expect.arrayContaining(["scripts/taobao_playwright_capture.mjs", "--url", itemUrl, "--login-wait", "45", "--output-dir", job.outputDir]),
      expect.objectContaining({ cwd: process.cwd(), shell: false })
    );

    await fetch(`${baseUrl}/api/capture/jobs/${job.id}/cancel`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });
  });

  it("starts item-detail capture jobs with Playwright when requested by the client", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);
    const itemUrl = "https://item.taobao.com/item.htm?id=1001";

    let job: { id: string; engine: string; outputDir: string; message: string } | null = null;
    try {
      const startResponse = await fetch(`${baseUrl}/api/capture/jobs`, {
        method: "POST",
        headers: jsonHeaders(authCookie),
        body: JSON.stringify({ mode: "item-detail", url: itemUrl, loginWait: 60, engine: "playwright" })
      });
      job = await startResponse.json() as { id: string; engine: string; outputDir: string; message: string };

      expect(startResponse.status).toBe(200);
      expect(job).toMatchObject({
        engine: "playwright",
        message: expect.stringContaining("Playwright")
      });
      expect(spawnMock).toHaveBeenLastCalledWith(
        process.execPath,
        expect.arrayContaining(["scripts/taobao_playwright_capture.mjs", "--url", itemUrl, "--login-wait", "60", "--output-dir", job.outputDir]),
        expect.objectContaining({ cwd: process.cwd(), shell: false })
      );
    } finally {
      if (job?.id) {
        await fetch(`${baseUrl}/api/capture/jobs/${job.id}/cancel`, {
          method: "POST",
          headers: jsonHeaders(authCookie)
        });
      }
    }
  });

  it("rejects capture engine on order jobs because orders always use Selenium", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const response = await fetch(`${baseUrl}/api/capture/jobs`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ mode: "orders", maxPages: 2, loginWait: 30, engine: "playwright" })
    });
    const body = await response.json();
    if (response.status === 200 && typeof body.id === "string") {
      await fetch(`${baseUrl}/api/capture/jobs/${body.id}/cancel`, {
        method: "POST",
        headers: jsonHeaders(authCookie)
      });
    }

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: { code: "VALIDATION_ERROR", message: expect.stringContaining("商品详情") }
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("keeps orders on Selenium even when item-detail Playwright is configured", async () => {
    process.env.OUTFIT_TAOBAO_ITEM_CAPTURE_ENGINE = "playwright";
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const startResponse = await fetch(`${baseUrl}/api/capture/jobs`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ mode: "orders", maxPages: 2, loginWait: 30 })
    });
    const job = await startResponse.json() as { id: string; engine: string; outputDir: string };

    expect(startResponse.status).toBe(200);
    expect(job.engine).toBe("selenium");
    expect(spawnMock).toHaveBeenLastCalledWith(
      "python",
      expect.arrayContaining(["scripts/taobao_order_selenium_capture.py", "--max-pages", "2", "--login-wait", "30", "--output-dir", job.outputDir]),
      expect.objectContaining({ cwd: process.cwd(), shell: false })
    );

    await fetch(`${baseUrl}/api/capture/jobs/${job.id}/cancel`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });
  });

  it("rejects invalid item-detail capture engine values before spawning", async () => {
    process.env.OUTFIT_TAOBAO_ITEM_CAPTURE_ENGINE = "chrome";
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const response = await fetch(`${baseUrl}/api/capture/jobs`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ mode: "item-detail", url: "https://item.taobao.com/item.htm?id=808", loginWait: 30 })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "CAPTURE_ENGINE_INVALID" }
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects non-integer capture job numeric options before spawning Selenium", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const response = await fetch(`${baseUrl}/api/capture/jobs`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ mode: "orders", maxPages: 1.5, loginWait: 30 })
    });
    const body = await response.json();
    if (response.status === 200 && typeof body.id === "string") {
      await fetch(`${baseUrl}/api/capture/jobs/${body.id}/cancel`, {
        method: "POST",
        headers: jsonHeaders(authCookie)
      });
    }

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: { code: "VALIDATION_ERROR", message: expect.stringContaining("maxPages") }
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("marks capture jobs failed when Selenium cannot be spawned", async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    spawnedChild.on.mockImplementation((event: string, callback: (...args: unknown[]) => void) => {
      listeners.set(event, callback);
      return spawnedChild;
    });
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const startResponse = await fetch(`${baseUrl}/api/capture/jobs`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ mode: "orders", maxPages: 1, loginWait: 30 })
    });
    const job = await startResponse.json() as { id: string };
    const errorListener = listeners.get("error");
    if (errorListener) {
      errorListener(new Error("spawn python ENOENT"));
    } else {
      await fetch(`${baseUrl}/api/capture/jobs/${job.id}/cancel`, {
        method: "POST",
        headers: jsonHeaders(authCookie)
      });
    }

    expect(errorListener).toEqual(expect.any(Function));

    const statusResponse = await fetch(`${baseUrl}/api/capture/jobs/${job.id}`, {
      headers: { cookie: authCookie }
    });
    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toMatchObject({
      status: "failed",
      error: expect.stringContaining("spawn python ENOENT")
    });

    const nextResponse = await fetch(`${baseUrl}/api/capture/jobs`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ mode: "orders", maxPages: 1, loginWait: 30 })
    });
    const nextJob = await nextResponse.json() as { id?: string };
    if (nextResponse.status === 200 && nextJob.id) {
      await fetch(`${baseUrl}/api/capture/jobs/${nextJob.id}/cancel`, {
        method: "POST",
        headers: jsonHeaders(authCookie)
      });
    }
    expect(nextResponse.status).toBe(200);
  });

  it("cancels a running capture job and allows a new one to start", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const startResponse = await fetch(`${baseUrl}/api/capture/jobs`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ mode: "orders", maxPages: 1, loginWait: 30 })
    });
    const job = await startResponse.json() as { id: string };

    const cancelResponse = await fetch(`${baseUrl}/api/capture/jobs/${job.id}/cancel`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });
    expect(cancelResponse.status).toBe(200);
    expect(await cancelResponse.json()).toMatchObject({ status: "cancelled" });
    expect(spawnedChild.kill).toHaveBeenCalled();

    const nextResponse = await fetch(`${baseUrl}/api/capture/jobs`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ mode: "orders", maxPages: 1, loginWait: 30 })
    });
    expect(nextResponse.status).toBe(200);
  });

  it("previews a Taobao import without writing garments", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const response = await fetch(`${baseUrl}/api/import/taobao-preview`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({
        source: "taobao-selenium-order-list",
        items: [
          {
            itemId: "1001",
            title: "UTIMUS纯棉短袖T恤男女同款夏季透气上衣",
            status: "交易成功"
          },
          {
            itemId: "1002",
            title: "羊毛围巾秋冬保暖柔软百搭",
            status: "交易成功"
          },
          {
            itemId: "2001",
            title: "手机壳保护套",
            status: "交易成功"
          },
          {
            itemId: "3001",
            title: "黑色直筒牛仔裤",
            status: "退款成功",
            refundText: "退款成功"
          }
        ]
      })
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      summary: {
        totalItems: 4,
        uniqueItems: 4,
        skippedRefunded: 1,
        skippedNonApparel: 1,
        createdGarments: 2
      },
      duplicateCount: 0,
      candidates: [
        expect.objectContaining({ name: expect.stringContaining("T恤"), category: "top", confidence: expect.any(Number) }),
        expect.objectContaining({ name: expect.stringContaining("围巾"), category: "accessory", confidence: expect.any(Number) })
      ],
      skipped: [
        expect.objectContaining({ reason: "non-apparel" }),
        expect.objectContaining({ reason: "refunded" })
      ]
    });

    expect(await (await fetch(`${baseUrl}/api/garments`, { headers: { cookie: authCookie } })).json()).toEqual([]);
  });

  it("imports Taobao items, updates garments, and returns recommendations", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const importResponse = await fetch(`${baseUrl}/api/import/taobao-batch`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify(payload)
    });
    expect(importResponse.status).toBe(200);
    expect(await importResponse.json()).toMatchObject({ summary: { createdGarments: 4 } });

    const garmentsResponse = await fetch(`${baseUrl}/api/garments`, {
      headers: { cookie: authCookie }
    });
    const garments = (await garmentsResponse.json()) as Array<{ id: number; confirmed: boolean; itemUrl?: string; detailUrl?: string }>;
    expect(garments).toHaveLength(4);
    expect(garments.every((garment) => garment.confirmed === false)).toBe(true);
    expect(garments.some((garment) => garment.itemUrl === "https://item.taobao.com/item.htm?id=1")).toBe(true);

    const linkedGarment = garments.find((garment) => garment.itemUrl || garment.detailUrl);
    expect(linkedGarment).toBeTruthy();
    const updateResponse = await fetch(`${baseUrl}/api/garments/${linkedGarment?.id}`, {
      method: "PUT",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ confirmed: true })
    });
    const updatedGarment = await updateResponse.json();
    expect(updatedGarment).toMatchObject({ confirmed: true });
    expect(updatedGarment.itemUrl || updatedGarment.detailUrl).toBeTruthy();

    const invalidUpdate = await fetch(`${baseUrl}/api/garments/${linkedGarment?.id}`, {
      method: "PUT",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ category: "hat" })
    });
    expect(invalidUpdate.status).toBe(400);
    expect(await invalidUpdate.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: expect.stringContaining("category")
      }
    });

    const recommendationRequest = {
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
    };
    const incompleteRecommendationResponse = await fetch(`${baseUrl}/api/recommendations`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify(recommendationRequest)
    });
    expect(await incompleteRecommendationResponse.json()).toMatchObject({
      outfits: [],
      missingSlots: ["top", "bottom", "dress"]
    });

    for (const garment of garments.filter((garment) => garment.id !== linkedGarment?.id)) {
      const confirmResponse = await fetch(`${baseUrl}/api/garments/${garment.id}`, {
        method: "PUT",
        headers: jsonHeaders(authCookie),
        body: JSON.stringify({ confirmed: true })
      });
      expect(confirmResponse.status).toBe(200);
    }

    const recommendationResponse = await fetch(`${baseUrl}/api/recommendations`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify(recommendationRequest)
    });
    const recommendation = await recommendationResponse.json();
    expect(recommendation.outfits).toHaveLength(1);
    expect(recommendation.outfits[0].items.length).toBeGreaterThanOrEqual(3);
    expect(recommendation.missingSlots).toEqual([]);
  });

  it("deletes a garment from the wardrobe", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    await fetch(`${baseUrl}/api/import/taobao-batch`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify(payload)
    });

    const garmentsResponse = await fetch(`${baseUrl}/api/garments`, {
      headers: { cookie: authCookie }
    });
    const garments = (await garmentsResponse.json()) as Array<{ id: number }>;
    const deletedId = garments[0].id;

    const deleteResponse = await fetch(`${baseUrl}/api/garments/${deletedId}`, {
      method: "DELETE",
      headers: { cookie: authCookie }
    });
    expect(deleteResponse.status).toBe(204);

    const afterDeleteResponse = await fetch(`${baseUrl}/api/garments`, {
      headers: { cookie: authCookie }
    });
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
    const authCookie = await registerTestUser(baseUrl);

    const response = await fetch(`${baseUrl}/api/wear-logs`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
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

  it("stores a local personal profile and returns it for recommendations", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const defaultProfileResponse = await fetch(`${baseUrl}/api/profile`, {
      headers: { cookie: authCookie }
    });
    expect(defaultProfileResponse.status).toBe(200);
    expect(await defaultProfileResponse.json()).toEqual({});

    const emptySaveResponse = await fetch(`${baseUrl}/api/profile`, {
      method: "PUT",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({})
    });
    expect(emptySaveResponse.status).toBe(200);
    expect(await emptySaveResponse.json()).toEqual({});
    expect(db.prepare("SELECT value FROM app_settings WHERE key = 'personalProfile'").get())
      .toMatchObject({ value: "{}" });

    const saveResponse = await fetch(`${baseUrl}/api/profile`, {
      method: "PUT",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({
        heightCm: 176,
        weightKg: 57,
        bodyType: "slim-tall",
        skinTone: "dark-yellow",
        colorDisposition: "cool-clean",
        temperatureSensitivity: "runs-cold",
        preferredColors: ["white", "blue"],
        avoidedColors: ["yellow", "brown"],
        preferredStyles: ["smart-casual"]
      })
    });
    expect(saveResponse.status).toBe(200);
    expect(await saveResponse.json()).toMatchObject({
      temperatureSensitivity: "runs-cold",
      preferredColors: ["white", "blue"],
      avoidedColors: ["yellow", "brown"]
    });

    const invalidResponse = await fetch(`${baseUrl}/api/profile`, {
      method: "PUT",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ heightCm: 60 })
    });
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR", message: expect.stringContaining("heightCm") }
    });
  });

  it("creates manual garments as confirmed wardrobe items without accepting source-state forgery", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);
    const manual = (name: string, category: "top" | "bottom" | "shoes") => ({
      name,
      category,
      color: "black",
      warmth: "medium",
      seasons: ["spring", "summer", "autumn", "winter"],
      styles: ["casual"],
      formality: "casual"
    });

    const forgedResponse = await fetch(`${baseUrl}/api/garments`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ ...manual("伪造上装", "top"), confirmed: false })
    });
    expect(forgedResponse.status).toBe(400);
    expect(await forgedResponse.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR", message: expect.stringContaining("confirmed") }
    });

    const created = [];
    for (const input of [manual("手工上装", "top"), manual("手工下装", "bottom"), manual("手工鞋履", "shoes")]) {
      const response = await fetch(`${baseUrl}/api/garments`, {
        method: "POST",
        headers: jsonHeaders(authCookie),
        body: JSON.stringify(input)
      });
      expect(response.status).toBe(201);
      created.push(await response.json());
    }

    expect(created[0]).toMatchObject({
      name: "手工上装",
      owned: true,
      confirmed: true,
      excluded: false,
      confidence: 1
    });
    expect(created[0]).not.toHaveProperty("sourceOrderItemId");
    expect(db.prepare("SELECT source_order_item_id, owned, confirmed, excluded FROM garments WHERE id = ?")
      .get(created[0].id)).toEqual({ source_order_item_id: null, owned: 1, confirmed: 1, excluded: 0 });

    const recommendationResponse = await fetch(`${baseUrl}/api/recommendations`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ weather: recommendationWeather, occasion: "casual" })
    });
    expect(recommendationResponse.status).toBe(200);
    const recommendation = await recommendationResponse.json();
    expect(recommendation.outfits.length).toBeGreaterThan(0);
    expect(recommendation.outfits[0].items.map((item: { id: number }) => item.id))
      .toEqual(expect.arrayContaining(created.map((item) => item.id)));
  });

  it("updates garment detail fields and exposes local history insights and export data", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    await fetch(`${baseUrl}/api/import/taobao-batch`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify(payload)
    });
    const garments = (await (await fetch(`${baseUrl}/api/garments`, { headers: { cookie: authCookie } })).json()) as Array<{ id: number; category: string }>;
    const top = garments.find((garment) => garment.category === "top") ?? garments[0];

    const updateResponse = await fetch(`${baseUrl}/api/garments/${top.id}`, {
      method: "PUT",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({
        size: "M",
        materials: ["cotton"],
        patterns: ["solid"],
        tags: ["挺括", "层次"],
        confirmed: true
      })
    });
    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toMatchObject({
      size: "M",
      materials: ["cotton"],
      patterns: ["solid"],
      tags: ["挺括", "层次"]
    });

    for (const garment of garments.filter((garment) => garment.id !== top.id)) {
      const confirmResponse = await fetch(`${baseUrl}/api/garments/${garment.id}`, {
        method: "PUT",
        headers: jsonHeaders(authCookie),
        body: JSON.stringify({ confirmed: true })
      });
      expect(confirmResponse.status).toBe(200);
    }

    await fetch(`${baseUrl}/api/wear-logs`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ garmentIds: [top.id], context: { outfitId: "outfit-1", occasion: "casual" } })
    });
    await fetch(`${baseUrl}/api/recommendations`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ occasion: "casual", weather: recommendationWeather })
    });

    const wearLogs = await (await fetch(`${baseUrl}/api/wear-logs`, { headers: { cookie: authCookie } })).json();
    expect(wearLogs).toEqual([expect.objectContaining({ garmentIds: [top.id], context: expect.objectContaining({ outfitId: "outfit-1" }) })]);

    const recommendationRuns = await (await fetch(`${baseUrl}/api/recommendation-runs`, { headers: { cookie: authCookie } })).json();
    expect(recommendationRuns[0]).toMatchObject({ input: expect.any(Object), result: expect.any(Object) });

    const insights = await (await fetch(`${baseUrl}/api/insights`, { headers: { cookie: authCookie } })).json();
    expect(insights).toMatchObject({
      totalGarments: 4,
      ownedGarments: 4,
      categoryDistribution: expect.objectContaining({ top: expect.any(Number) }),
      colorDistribution: expect.any(Object),
      mostWorn: [expect.objectContaining({ id: top.id, wearCount: 1 })],
      neverWorn: expect.any(Array)
    });

    const exported = await (await fetch(`${baseUrl}/api/export`, { headers: { cookie: authCookie } })).json();
    expect(exported).toMatchObject({
      version: 2,
      schemaVersion: 1,
      features: ["versioned-migrations", "recommendation-candidates"],
      profile: expect.any(Object),
      garments: expect.arrayContaining([expect.objectContaining({ id: top.id, tags: ["挺括", "层次"] })]),
      wearLogs: expect.any(Array),
      recommendationRuns: expect.any(Array),
      sourceOrderItems: expect.any(Array),
      recommendationCandidates: expect.arrayContaining([
        expect.objectContaining({
          candidateId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
          runId: expect.any(Number),
          outfitSignature: expect.stringMatching(/^[a-f0-9]{64}$/),
          itemIds: expect.any(Array)
        })
      ])
    });
  });

  it("returns clot​​hy-style wardrobe analysis insights", async () => {
    const db = createDatabase(":memory:");
    const insert = db.prepare(`
      INSERT INTO garments (
        name, raw_name, category, color, warmth, seasons, styles, formality,
        image_url, owned, confirmed, excluded, confidence, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const firstTop = insert.run(
      "白色挺括衬衫",
      "白色挺括衬衫",
      "top",
      "white",
      "light",
      JSON.stringify(["spring", "summer"]),
      JSON.stringify(["smart-casual", "minimal"]),
      "smart-casual",
      "",
      1,
      1,
      0,
      0.9,
      ""
    );
    insert.run("蓝色休闲T恤", "蓝色休闲T恤", "top", "blue", "light", JSON.stringify(["spring", "summer"]), JSON.stringify(["casual"]), "casual", "", 1, 0, 0, 0.7, "");
    insert.run("黑色针织衫", "黑色针织衫", "top", "black", "warm", JSON.stringify(["autumn", "winter"]), JSON.stringify(["casual"]), "casual", "", 1, 0, 0, 0.8, "");
    insert.run("深蓝直筒牛仔裤", "深蓝直筒牛仔裤", "bottom", "blue", "medium", JSON.stringify(["spring", "autumn"]), JSON.stringify(["casual"]), "casual", "", 1, 1, 0, 0.85, "");
    insert.run("白色运动鞋", "白色运动鞋", "shoes", "white", "light", JSON.stringify(["spring", "summer"]), JSON.stringify(["sport"]), "sport", "", 1, 1, 0, 0.8, "");

    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    await fetch(`${baseUrl}/api/profile`, {
      method: "PUT",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({
        heightCm: 176,
        weightKg: 57,
        bodyType: "slim-tall",
        skinTone: "dark-yellow",
        colorDisposition: "cool-clean",
        temperatureSensitivity: "neutral",
        preferredColors: ["white", "blue"],
        avoidedColors: ["yellow", "brown"],
        preferredStyles: ["smart-casual"]
      })
    });
    await fetch(`${baseUrl}/api/wear-logs`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ garmentIds: [Number(firstTop.lastInsertRowid)], context: { occasion: "smart-casual" } })
    });

    const response = await fetch(`${baseUrl}/api/insights`, { headers: { cookie: authCookie } });
    expect(response.status).toBe(200);
    const insights = await response.json();

    expect(insights).toMatchObject({
      totalGarments: 5,
      seasonDistribution: {
        spring: 4,
        summer: 3,
        autumn: 2,
        winter: 1
      },
      styleDistribution: expect.objectContaining({
        casual: 3,
        "smart-casual": 1
      }),
      formalityDistribution: expect.objectContaining({
        casual: 3,
        "smart-casual": 1,
        sport: 1
      }),
      styleTendency: {
        dominantStyles: expect.arrayContaining([expect.objectContaining({ key: "casual", count: 3 })]),
        dominantFormalities: expect.arrayContaining([expect.objectContaining({ key: "casual", count: 3 })])
      },
      health: {
        level: "needs-attention",
        components: expect.objectContaining({
          coreCompleteness: expect.any(Number),
          seasonCoverage: expect.any(Number),
          styleCoverage: expect.any(Number),
          confirmationRate: expect.any(Number),
          utilizationRate: expect.any(Number)
        })
      }
    });
    expect(insights.health.score).toBeLessThan(70);
    expect(insights.insightSuggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: expect.stringContaining("上装") }),
      expect.objectContaining({ title: expect.stringContaining("待确认") })
    ]));
    expect(insights.shoppingSuggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: expect.stringContaining("外套") }),
      expect.objectContaining({ title: expect.stringContaining("鞋履") })
    ]));
    expect(insights.bodySuggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: expect.stringContaining("瘦高") }),
      expect.objectContaining({ title: expect.stringContaining("肤色") })
    ]));
  });

  it("stores only the sanitized recommendation request in history", async () => {
    const db = createDatabase(":memory:");
    const insert = db.prepare(`
      INSERT INTO garments (
        name, category, color, warmth, seasons, styles, formality,
        image_url, owned, confirmed, excluded, confidence, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run("白色T恤", "top", "white", "light", JSON.stringify(["summer"]), JSON.stringify(["casual"]), "casual", "", 1, 1, 0, 0.9, "");
    insert.run("深蓝牛仔裤", "bottom", "blue", "medium", JSON.stringify(["spring", "autumn"]), JSON.stringify(["casual"]), "casual", "", 1, 1, 0, 0.9, "");
    insert.run("白色运动鞋", "shoes", "white", "light", JSON.stringify(["summer"]), JSON.stringify(["casual"]), "casual", "", 1, 1, 0, 0.9, "");

    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const response = await fetch(`${baseUrl}/api/recommendations`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({
        occasion: "casual",
        weather: recommendationWeather,
        debugToken: "do-not-store",
        recentlyWornGarmentIds: ["bad", 999, 999],
        userProfile: {
          preferredColors: ["white", "blue"]
        }
      })
    });
    expect(response.status).toBe(200);

    const runs = await (await fetch(`${baseUrl}/api/recommendation-runs`, {
      headers: { cookie: authCookie }
    })).json() as Array<{ input: Record<string, unknown> }>;

    expect(runs[0].input).toEqual({
      weather: recommendationWeather,
      occasion: "casual",
      recentlyWornGarmentIds: [999],
      userProfile: expect.objectContaining({
        preferredColors: ["white", "blue"]
      })
    });
    expect(runs[0].input).not.toHaveProperty("debugToken");
  });

  it("persists globally unique candidate identities with stable cross-run signatures", async () => {
    const db = createDatabase(":memory:");
    const insert = db.prepare(`
      INSERT INTO garments (
        name, category, color, warmth, seasons, styles, formality,
        image_url, owned, confirmed, excluded, confidence, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run("白色T恤", "top", "white", "light", '["summer"]', '["casual"]', "casual", "", 1, 1, 0, 0.9, "");
    insert.run("蓝色衬衫", "top", "blue", "light", '["summer"]', '["casual"]', "casual", "", 1, 1, 0, 0.8, "");
    insert.run("深蓝牛仔裤", "bottom", "blue", "medium", '["spring","autumn"]', '["casual"]', "casual", "", 1, 1, 0, 0.9, "");
    insert.run("白色运动鞋", "shoes", "white", "light", '["summer"]', '["casual"]', "casual", "", 1, 1, 0, 0.9, "");

    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);
    const requestRecommendation = async (occasion: string, date: string) => {
      const response = await fetch(`${baseUrl}/api/recommendations`, {
        method: "POST",
        headers: jsonHeaders(authCookie),
        body: JSON.stringify({
          occasion,
          weather: { ...recommendationWeather, date },
          runId: 999,
          candidateId: "client-forged-candidate",
          outfitSignature: "client-forged-signature"
        })
      });
      expect(response.status).toBe(200);
      return await response.json() as {
        runId: number;
        outfits: Array<{
          id: string;
          candidateId: string;
          outfitSignature: string;
          score: number;
          matchPercent?: number;
          scoreBreakdown?: Record<string, number>;
          reasons: string[];
          items: Array<{ id: number }>;
        }>;
      };
    };

    const first = await requestRecommendation("casual", "2026-07-01");
    const second = await requestRecommendation("formal", "2026-07-02");
    const allOutfits = [...first.outfits, ...second.outfits];
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(first.runId).toBeGreaterThan(0);
    expect(second.runId).toBeGreaterThan(first.runId);
    expect(allOutfits.length).toBeGreaterThanOrEqual(2);
    expect(new Set(allOutfits.map((outfit) => outfit.candidateId)).size).toBe(allOutfits.length);
    expect(allOutfits.every((outfit) => uuidPattern.test(outfit.candidateId))).toBe(true);
    expect(allOutfits.every((outfit) => outfit.id === outfit.candidateId)).toBe(true);
    expect(allOutfits.every((outfit) => /^[a-f0-9]{64}$/.test(outfit.outfitSignature))).toBe(true);

    const firstByItems = new Map(first.outfits.map((outfit) => [
      outfit.items.map((item) => item.id).sort((left, right) => left - right).join(","),
      outfit.outfitSignature
    ]));
    for (const outfit of second.outfits) {
      const itemKey = outfit.items.map((item) => item.id).sort((left, right) => left - right).join(",");
      expect(outfit.outfitSignature).toBe(firstByItems.get(itemKey));
    }

    const rows = db.prepare(`
      SELECT candidate_id, run_id, signature, rank, item_ids_json, score_snapshot
      FROM recommendation_candidates
      ORDER BY run_id, rank
    `).all() as Array<{
      candidate_id: string;
      run_id: number;
      signature: string;
      rank: number;
      item_ids_json: string;
      score_snapshot: string;
    }>;
    expect(rows).toHaveLength(allOutfits.length);
    for (const result of [first, second]) {
      result.outfits.forEach((outfit, index) => {
        const row = rows.find((candidate) => candidate.candidate_id === outfit.candidateId);
        expect(row).toMatchObject({
          run_id: result.runId,
          signature: outfit.outfitSignature,
          rank: index + 1
        });
        expect(JSON.parse(row!.item_ids_json)).toEqual(outfit.items.map((item) => item.id));
        expect(JSON.parse(row!.score_snapshot)).toMatchObject({
          score: outfit.score,
          matchPercent: outfit.matchPercent,
          scoreBreakdown: outfit.scoreBreakdown,
          reasons: outfit.reasons
        });
      });
    }
    const storedRuns = db.prepare(`
      SELECT id, input_json, result_json
      FROM recommendation_runs
      ORDER BY id
    `).all() as Array<{ id: number; input_json: string; result_json: string }>;
    expect(storedRuns.map((run) => run.id)).toEqual([first.runId, second.runId]);
    storedRuns.forEach((row, index) => {
      const input = JSON.parse(row.input_json);
      expect(input).not.toHaveProperty("runId");
      expect(input).not.toHaveProperty("candidateId");
      expect(input).not.toHaveProperty("outfitSignature");
      const storedResult = JSON.parse(row.result_json);
      const responseResult = [first, second][index];
      expect(storedResult.runId).toBe(responseResult.runId);
      expect(storedResult.outfits.map((outfit: { candidateId: string }) => outfit.candidateId)).toEqual(
        responseResult.outfits.map((outfit) => outfit.candidateId)
      );
    });
  });

  it("rejects invalid wear log payloads", async () => {
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const response = await fetch(`${baseUrl}/api/wear-logs`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ garmentIds: [] })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "garmentIds 必须是非空数字数组"
      }
    });
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
    const authCookie = await registerTestUser(baseUrl);

    await fetch(`${baseUrl}/api/wear-logs`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ garmentIds: [1], context: { outfitId: "outfit-previous" } })
    });

    const recommendationResponse = await fetch(`${baseUrl}/api/recommendations`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
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
    const authCookie = await registerTestUser(baseUrl);

    const response = await fetch(`${baseUrl}/api/import/taobao-batch`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
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

    const garmentsResponse = await fetch(`${baseUrl}/api/garments`, {
      headers: { cookie: authCookie }
    });
    const garments = (await garmentsResponse.json()) as Array<{ name: string; detailUrl?: string; imageUrl?: string }>;
    expect(garments).toHaveLength(1);
    expect(garments[0]).toMatchObject({
      name: "蓝色透气运动鞋 夏季 轻便跑步休闲鞋",
      detailUrl: "https://item.taobao.com/item.htm?id=808",
      imageUrl: "https://img.alicdn.com/shoe.jpg"
    });
  });

  it("refreshes local garment thumbnails from captured Taobao image candidates with download limits", async () => {
    const realFetch = globalThis.fetch.bind(globalThis);
    const captureRoot = mkdtempSync(path.join(tmpdir(), "outfit-captures-test-"));
    const thumbnailOutputDir = mkdtempSync(path.join(tmpdir(), "outfit-thumbs-test-"));
    const db = createDatabase(":memory:");
    const app = createApiApp(db, {
      thumbnailCaptureRoot: captureRoot,
      thumbnailOutputDir,
      thumbnailDelayMs: 0,
      thumbnailMaxDownloads: 3
    });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl, realFetch);
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes("tiny")) {
        return new Response(pngBody(91, 14), {
          status: 200,
          headers: { "content-type": "image/png" }
        });
      }
      return new Response(pngBody(900, 700), {
        status: 200,
        headers: { "content-type": "image/png" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const importResponse = await realFetch(`${baseUrl}/api/import/taobao-batch`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({
        source: "taobao-selenium-order-list",
        pageType: "order-list",
        items: [
          {
            itemId: "sample-item-1",
            orderId: "order-example-1",
            title: "361男鞋运动鞋2026夏季篮球文化鞋跑步潮流休闲鞋",
            sku: "颜色分类: 曜石黑/银白色; 鞋码: 42",
            status: "交易成功",
            itemUrl: "https://item.taobao.com/item.htm?id=sample-item-1",
            imageUrl: "https://gw.alicdn.com/imgextra/i2/12345/O1CN01platform-2-tps-80-36.png"
          }
        ]
      })
    });
    expect(importResponse.status).toBe(200);
    const captureDir = path.join(captureRoot, "cap_test");
    mkdirSync(captureDir, { recursive: true });
    writeFileSync(path.join(captureDir, "capture.json"), JSON.stringify({
      source: "taobao-selenium",
      pageType: "item-detail",
      pageUrl: "https://item.taobao.com/item.htm?id=sample-item-1",
      items: [
        {
          itemId: "sample-item-1",
          detailTitle: "Example running shoes",
          detailImages: [
            "https://img.alicdn.com/imgextra/i4/34567/O1CN01tiny_!!sample-item_pic.jpg",
            "https://gw.alicdn.com/bao/uploaded/i4/34567/O1CN01shoe.jpg"
          ]
        }
      ]
    }), "utf8");

    const refreshResponse = await realFetch(`${baseUrl}/api/garments/thumbnails/refresh`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });
    const refreshBody = await refreshResponse.json();
    const garments = await (await realFetch(`${baseUrl}/api/garments`, {
      headers: { cookie: authCookie }
    })).json() as Array<{ imageUrl: string }>;
    const unauthenticatedThumbnailResponse = await realFetch(`${baseUrl}${garments[0].imageUrl}`);
    const thumbnailResponse = await realFetch(`${baseUrl}${garments[0].imageUrl}`, {
      headers: { cookie: authCookie }
    });

    expect(refreshResponse.status).toBe(200);
    expect(refreshBody).toMatchObject({ scanned: 1, attemptedDownloads: 2, updated: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(garments[0].imageUrl).toBe("/api/garment-thumbnails/garment-1-sample-item-1.png");
    expect(unauthenticatedThumbnailResponse.status).toBe(401);
    expect(thumbnailResponse.status).toBe(200);
    expect(thumbnailResponse.headers.get("content-type")).toContain("image/png");
  });

  it("returns selectable thumbnail candidates from the garment source and matching captures only", async () => {
    const captureRoot = mkdtempSync(path.join(tmpdir(), "outfit-candidates-test-"));
    const db = createDatabase(":memory:");
    const fixture = seedThumbnailSelectionFixture(db);
    const captureDir = path.join(captureRoot, "manual-shirt");
    mkdirSync(captureDir, { recursive: true });
    writeFileSync(path.join(captureDir, "capture.json"), JSON.stringify({
      source: "taobao-selenium",
      pageType: "item-detail",
      items: [
        {
          itemId: fixture.itemId,
          imageUrl: fixture.captureUrl,
          detailImages: [
            fixture.captureDetailUrl,
            "https://example.com/capture-outside.jpg",
            "data:image/png;base64,AAAA",
            "http://127.0.0.1/private.jpg"
          ]
        },
        {
          itemId: "other-item",
          imageUrl: "https://img.alicdn.com/imgextra/i6/100/O1CN01other_item_pic.jpg",
          detailImages: ["https://img.alicdn.com/imgextra/i6/100/O1CN01other-detail.jpg"]
        }
      ]
    }), "utf8");
    const app = createApiApp(db, { thumbnailCaptureRoot: captureRoot });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const response = await fetch(`${baseUrl}/api/garments/${fixture.garmentId}/thumbnail-candidates`, {
      headers: { cookie: authCookie }
    });
    const body = await response.json() as {
      garmentId: number;
      currentImageUrl: string;
      candidates: Array<{ url: string; source: string; score: number; selected: boolean }>;
    };
    const urls = body.candidates.map((candidate) => candidate.url);
    const scores = body.candidates.map((candidate) => candidate.score);

    expect(response.status).toBe(200);
    expect(body.garmentId).toBe(fixture.garmentId);
    expect(body.currentImageUrl).toBe(fixture.currentUrl);
    expect(urls).toEqual(expect.arrayContaining([
      fixture.currentUrl,
      fixture.orderUrl,
      fixture.detailUrl,
      fixture.captureUrl,
      fixture.captureDetailUrl
    ]));
    expect(urls).not.toEqual(expect.arrayContaining([
      "https://example.com/not-allowed.jpg",
      "https://example.com/capture-outside.jpg",
      "data:image/png;base64,AAAA",
      "file:///tmp/local.jpg",
      "http://127.0.0.1/private.jpg",
      "https://img.alicdn.com/imgextra/i6/100/O1CN01other_item_pic.jpg"
    ]));
    expect(body.candidates.find((candidate) => candidate.url === fixture.currentUrl)).toMatchObject({ source: "current", selected: true });
    expect(body.candidates.find((candidate) => candidate.url === fixture.orderUrl)).toMatchObject({ source: "order" });
    expect(body.candidates.find((candidate) => candidate.url === fixture.detailUrl)).toMatchObject({ source: "detail" });
    expect(body.candidates.find((candidate) => candidate.url === fixture.captureUrl)).toMatchObject({ source: "capture" });
    for (let index = 1; index < scores.length; index += 1) {
      expect(scores[index - 1]).toBeGreaterThanOrEqual(scores[index]);
    }
  });

  it("rejects selecting a garment thumbnail URL outside that garment candidate set", async () => {
    const realFetch = globalThis.fetch.bind(globalThis);
    const captureRoot = mkdtempSync(path.join(tmpdir(), "outfit-candidates-test-"));
    const thumbnailOutputDir = mkdtempSync(path.join(tmpdir(), "outfit-thumbs-test-"));
    const db = createDatabase(":memory:");
    const fixture = seedThumbnailSelectionFixture(db);
    const app = createApiApp(db, {
      thumbnailCaptureRoot: captureRoot,
      thumbnailOutputDir,
      thumbnailDelayMs: 0
    });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl, realFetch);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await realFetch(`${baseUrl}/api/garments/${fixture.garmentId}/thumbnail`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ imageUrl: "https://img.alicdn.com/imgextra/i9/999/O1CN01not-owned.jpg" })
    });
    const body = await response.json();
    const garments = await (await realFetch(`${baseUrl}/api/garments`, { headers: { cookie: authCookie } })).json() as Array<{ imageUrl?: string; cutoutImageUrl?: string }>;

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(garments[0]).toMatchObject({
      imageUrl: fixture.currentUrl,
      cutoutImageUrl: "/api/garment-thumbnails/old-cutout.png"
    });
  });

  it("selects a garment thumbnail by downloading the chosen candidate and clearing stale cutout", async () => {
    const realFetch = globalThis.fetch.bind(globalThis);
    const captureRoot = mkdtempSync(path.join(tmpdir(), "outfit-candidates-test-"));
    const thumbnailOutputDir = mkdtempSync(path.join(tmpdir(), "outfit-thumbs-test-"));
    const db = createDatabase(":memory:");
    const fixture = seedThumbnailSelectionFixture(db);
    const app = createApiApp(db, {
      thumbnailCaptureRoot: captureRoot,
      thumbnailOutputDir,
      thumbnailDelayMs: 0
    });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl, realFetch);
    const fetchMock = vi.fn(async () => new Response(pngBody(900, 700), {
      status: 200,
      headers: { "content-type": "image/png" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await realFetch(`${baseUrl}/api/garments/${fixture.garmentId}/thumbnail`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ imageUrl: fixture.detailUrl })
    });
    const body = await response.json() as { imageUrl?: string; cutoutImageUrl?: string };
    const garments = await (await realFetch(`${baseUrl}/api/garments`, { headers: { cookie: authCookie } })).json() as Array<{ imageUrl?: string; cutoutImageUrl?: string }>;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(fixture.detailUrl, expect.any(Object));
    expect(body.imageUrl).toBe("/api/garment-thumbnails/garment-1-manual-shirt.png");
    expect(body.cutoutImageUrl).toBeUndefined();
    expect(garments[0]).toMatchObject({
      imageUrl: "/api/garment-thumbnails/garment-1-manual-shirt.png"
    });
    expect(garments[0].cutoutImageUrl).toBeUndefined();
  });

  it("reports thumbnail download failures without changing the garment image", async () => {
    const realFetch = globalThis.fetch.bind(globalThis);
    const captureRoot = mkdtempSync(path.join(tmpdir(), "outfit-candidates-test-"));
    const thumbnailOutputDir = mkdtempSync(path.join(tmpdir(), "outfit-thumbs-test-"));
    const db = createDatabase(":memory:");
    const fixture = seedThumbnailSelectionFixture(db);
    const app = createApiApp(db, {
      thumbnailCaptureRoot: captureRoot,
      thumbnailOutputDir,
      thumbnailDelayMs: 0
    });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl, realFetch);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not an image", {
      status: 200,
      headers: { "content-type": "text/plain" }
    })));

    const response = await realFetch(`${baseUrl}/api/garments/${fixture.garmentId}/thumbnail`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ imageUrl: fixture.detailUrl })
    });
    const body = await response.json();
    const garments = await (await realFetch(`${baseUrl}/api/garments`, { headers: { cookie: authCookie } })).json() as Array<{ imageUrl?: string; cutoutImageUrl?: string }>;

    expect(response.status).toBe(502);
    expect(body).toMatchObject({ error: { code: "THUMBNAIL_DOWNLOAD_FAILED" } });
    expect(garments[0]).toMatchObject({
      imageUrl: fixture.currentUrl,
      cutoutImageUrl: "/api/garment-thumbnails/old-cutout.png"
    });
  });

  it("reports local vision model status and starts explicit download jobs", async () => {
    const modelRoot = mkdtempSync(path.join(tmpdir(), "outfit-models-test-"));
    const db = createDatabase(":memory:");
    const app = createApiApp(db, {
      visionModelRoot: modelRoot,
      visionDevice: "dml",
      rembgProvider: "cuda"
    });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const statusResponse = await fetch(`${baseUrl}/api/vision/models`, {
      headers: { cookie: authCookie }
    });
    const status = await statusResponse.json() as { models: Array<{ id: string; installed: boolean; path: string }> };

    expect(statusResponse.status).toBe(200);
    expect(status.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "rembg-isnet", installed: false, path: expect.stringContaining("rembg") }),
      expect.objectContaining({ id: "clip-vit-base-patch32", installed: false, path: expect.stringContaining("clip-vit-base-patch32") })
    ]));

    const downloadResponse = await fetch(`${baseUrl}/api/vision/models/rembg-isnet/download`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });
    const downloadJob = await downloadResponse.json() as { id: string; modelId: string; status: string; message: string };

    expect(downloadResponse.status).toBe(200);
    expect(downloadJob).toMatchObject({
      modelId: "rembg-isnet",
      status: "running",
      message: expect.stringContaining("本地模型下载")
    });
    expect(downloadJob.id).toMatch(/^vision_/);
    expect(spawnMock).toHaveBeenLastCalledWith(
      process.execPath,
      expect.arrayContaining(["scripts/models.mjs", "download", "rembg"]),
      expect.objectContaining({
        cwd: process.cwd(),
        env: expect.objectContaining({
          OUTFIT_MODEL_ROOT: modelRoot,
          OUTFIT_VISION_DEVICE: "dml",
          OUTFIT_REMBG_PROVIDER: "cuda"
        })
      })
    );
    expect(spawnedChild.stdout.on).toHaveBeenCalledWith("data", expect.any(Function));
    expect(spawnedChild.stderr.on).toHaveBeenCalledWith("data", expect.any(Function));
  });

  it("defaults web-triggered vision verification jobs to explicit local GPU backends", async () => {
    const modelRoot = mkdtempSync(path.join(tmpdir(), "outfit-models-test-"));
    const listeners = new Map<string, (code?: number) => void>();
    spawnedChild.on.mockImplementation((event: string, callback: (code?: number) => void) => {
      listeners.set(event, callback);
      return spawnedChild;
    });
    const db = createDatabase(":memory:");
    const app = createApiApp(db, { visionModelRoot: modelRoot });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const response = await fetch(`${baseUrl}/api/vision/models/clip-vit-base-patch32/verify`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });

    expect(response.status).toBe(200);
    expect(spawnMock).toHaveBeenLastCalledWith(
      process.execPath,
      expect.arrayContaining(["scripts/models.mjs", "verify", "clip"]),
      expect.objectContaining({
        env: expect.objectContaining({
          OUTFIT_MODEL_ROOT: modelRoot,
          OUTFIT_VISION_DEVICE: "dml",
          OUTFIT_REMBG_PROVIDER: "cuda"
        })
      })
    );
    listeners.get("close")?.(0);
  });

  it("reuses running vision jobs and reports succeeded or failed jobs in model status", async () => {
    const modelRoot = mkdtempSync(path.join(tmpdir(), "outfit-models-test-"));
    const listeners = new Map<string, (code?: number) => void>();
    spawnedChild.on.mockImplementation((event: string, callback: (code?: number) => void) => {
      listeners.set(event, callback);
      return spawnedChild;
    });
    const db = createDatabase(":memory:");
    const app = createApiApp(db, { visionModelRoot: modelRoot });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const firstResponse = await fetch(`${baseUrl}/api/vision/models/clip-vit-base-patch32/download`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });
    const firstJob = await firstResponse.json() as { id: string; status: string };
    const secondResponse = await fetch(`${baseUrl}/api/vision/models/clip-vit-base-patch32/download`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });
    const secondJob = await secondResponse.json() as { id: string; status: string };

    expect(secondJob.id).toBe(firstJob.id);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    listeners.get("close")?.(1);
    const failedStatusResponse = await fetch(`${baseUrl}/api/vision/models`, {
      headers: { cookie: authCookie }
    });
    const failedStatus = await failedStatusResponse.json() as { models: Array<{ id: string; job?: { status: string; error?: string } }> };

    expect(failedStatus.models.find((model) => model.id === "clip-vit-base-patch32")?.job).toMatchObject({
      id: firstJob.id,
      status: "failed",
      error: expect.stringContaining("模型下载失败")
    });

    const verifyListeners = new Map<string, (code?: number) => void>();
    spawnedChild.on.mockImplementation((event: string, callback: (code?: number) => void) => {
      verifyListeners.set(event, callback);
      return spawnedChild;
    });
    const verifyResponse = await fetch(`${baseUrl}/api/vision/models/clip-vit-base-patch32/verify`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });
    const verifyJob = await verifyResponse.json() as { id: string; status: string; message: string };

    expect(verifyJob).toMatchObject({
      status: "running",
      message: expect.stringContaining("验证")
    });
    expect(spawnMock).toHaveBeenLastCalledWith(
      process.execPath,
      expect.arrayContaining(["scripts/models.mjs", "verify", "clip"]),
      expect.objectContaining({ env: expect.objectContaining({ OUTFIT_MODEL_ROOT: modelRoot }) })
    );

    verifyListeners.get("close")?.(0);
    const succeededStatusResponse = await fetch(`${baseUrl}/api/vision/models`, {
      headers: { cookie: authCookie }
    });
    const succeededStatus = await succeededStatusResponse.json() as { models: Array<{ id: string; job?: { id: string; status: string } }> };

    expect(succeededStatus.models.find((model) => model.id === "clip-vit-base-patch32")?.job).toMatchObject({
      id: verifyJob.id,
      status: "succeeded"
    });
  });

  it("generates cutout images from local thumbnails and stores visual metadata", async () => {
    const modelRoot = mkdtempSync(path.join(tmpdir(), "outfit-models-test-"));
    const thumbnailOutputDir = mkdtempSync(path.join(tmpdir(), "outfit-thumbs-test-"));
    const rembgDir = path.join(modelRoot, "rembg");
    mkdirSync(rembgDir, { recursive: true });
    writeFileSync(path.join(rembgDir, "isnet-general-use.onnx"), "fake-model", "utf8");
    writeFileSync(path.join(thumbnailOutputDir, "garment-1-shirt.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const db = createDatabase(":memory:");
    db.prepare(`
      INSERT INTO garments (
        name, category, color, warmth, seasons, styles, formality,
        image_url, owned, confirmed, excluded, confidence, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("白色衬衫", "top", "white", "light", JSON.stringify(["spring"]), JSON.stringify(["smart-casual"]), "smart-casual", "/api/garment-thumbnails/garment-1-shirt.png", 1, 1, 0, 0.9, "");
    const app = createApiApp(db, {
      thumbnailOutputDir,
      visionModelRoot: modelRoot,
      runRembg: async ({ outputPath }) => {
        writeFileSync(outputPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      }
    });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const response = await fetch(`${baseUrl}/api/garments/1/cutout`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });
    const body = await response.json() as { cutoutImageUrl?: string };
    const garments = await (await fetch(`${baseUrl}/api/garments`, { headers: { cookie: authCookie } })).json() as Array<{ cutoutImageUrl?: string; visionUpdatedAt?: string }>;

    expect(response.status).toBe(200);
    expect(body.cutoutImageUrl).toBe("/api/garment-thumbnails/garment-1-shirt-cutout.png");
    expect(garments[0]).toMatchObject({
      cutoutImageUrl: "/api/garment-thumbnails/garment-1-shirt-cutout.png",
      visionUpdatedAt: expect.any(String)
    });
  });

  it("downloads a local thumbnail before generating a cutout for remote garment images", async () => {
    const realFetch = globalThis.fetch.bind(globalThis);
    const modelRoot = mkdtempSync(path.join(tmpdir(), "outfit-models-test-"));
    const thumbnailOutputDir = mkdtempSync(path.join(tmpdir(), "outfit-thumbs-test-"));
    const rembgDir = path.join(modelRoot, "rembg");
    mkdirSync(rembgDir, { recursive: true });
    writeFileSync(path.join(rembgDir, "isnet-general-use.onnx"), "fake-model", "utf8");
    const db = createDatabase(":memory:");
    const sourceResult = db.prepare(`
      INSERT INTO source_order_items (
        external_key, source, page_type, item_id, title, sku, image_url,
        detail_images, is_apparel
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "remote-shirt-source",
      "taobao-selenium-order-list",
      "order-list",
      "remote-shirt",
      "白色衬衫",
      "颜色分类: 白色",
      "https://gw.alicdn.com/bao/uploaded/i1/12345/O1CN01shirt.jpg",
      JSON.stringify([]),
      1
    );
    db.prepare(`
      INSERT INTO garments (
        source_order_item_id, name, category, color, warmth, seasons, styles,
        formality, image_url, owned, confirmed, excluded, confidence, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(sourceResult.lastInsertRowid),
      "白色衬衫",
      "top",
      "white",
      "light",
      JSON.stringify(["spring"]),
      JSON.stringify(["smart-casual"]),
      "smart-casual",
      "https://gw.alicdn.com/bao/uploaded/i1/12345/O1CN01shirt.jpg",
      1,
      1,
      0,
      0.9,
      ""
    );
    const runRembg = vi.fn(async ({ outputPath }) => {
      writeFileSync(outputPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });
    const app = createApiApp(db, {
      thumbnailOutputDir,
      thumbnailDelayMs: 0,
      visionModelRoot: modelRoot,
      runRembg
    });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl, realFetch);
    const fetchMock = vi.fn(async () => new Response(pngBody(900, 700), {
      status: 200,
      headers: { "content-type": "image/png" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await realFetch(`${baseUrl}/api/garments/1/cutout`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });
    const body = await response.json() as { cutoutImageUrl?: string };
    const garments = await (await realFetch(`${baseUrl}/api/garments`, { headers: { cookie: authCookie } })).json() as Array<{ imageUrl?: string; cutoutImageUrl?: string }>;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://gw.alicdn.com/bao/uploaded/i1/12345/O1CN01shirt.jpg", expect.any(Object));
    expect(runRembg).toHaveBeenCalledWith(expect.objectContaining({
      inputPath: path.join(thumbnailOutputDir, "garment-1-remote-shirt.png")
    }));
    expect(garments[0].imageUrl).toBe("/api/garment-thumbnails/garment-1-remote-shirt.png");
    expect(body.cutoutImageUrl).toBe("/api/garment-thumbnails/garment-1-remote-shirt-cutout.png");
    expect(garments[0].cutoutImageUrl).toBe("/api/garment-thumbnails/garment-1-remote-shirt-cutout.png");
  });

  it("runs the default rembg wrapper with Python for garment cutouts", async () => {
    const modelRoot = mkdtempSync(path.join(tmpdir(), "outfit-models-test-"));
    const thumbnailOutputDir = mkdtempSync(path.join(tmpdir(), "outfit-thumbs-test-"));
    const rembgDir = path.join(modelRoot, "rembg");
    mkdirSync(rembgDir, { recursive: true });
    writeFileSync(path.join(rembgDir, "isnet-general-use.onnx"), "fake-model", "utf8");
    writeFileSync(path.join(thumbnailOutputDir, "garment-1-shirt.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    spawnedChild.on.mockImplementation((event: string, callback: (code?: number) => void) => {
      if (event === "close") {
        const args = spawnMock.mock.calls.at(-1)?.[1] as string[] | undefined;
        const outputIndex = args?.indexOf("--output") ?? -1;
        if (args && outputIndex >= 0) {
          writeFileSync(args[outputIndex + 1], Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        }
        callback(0);
      }
      return spawnedChild;
    });
    const db = createDatabase(":memory:");
    db.prepare(`
      INSERT INTO garments (
        name, category, color, warmth, seasons, styles, formality,
        image_url, owned, confirmed, excluded, confidence, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("白色衬衫", "top", "white", "light", JSON.stringify(["spring"]), JSON.stringify(["smart-casual"]), "smart-casual", "/api/garment-thumbnails/garment-1-shirt.png", 1, 1, 0, 0.9, "");
    const app = createApiApp(db, {
      thumbnailOutputDir,
      visionModelRoot: modelRoot,
      rembgProvider: "cuda"
    });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const response = await fetch(`${baseUrl}/api/garments/1/cutout`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });

    expect(response.status).toBe(200);
    expect(spawnMock).toHaveBeenLastCalledWith(
      process.env.PYTHON || "python",
      expect.arrayContaining(["scripts/vision_rembg.py", "--input", path.join(thumbnailOutputDir, "garment-1-shirt.png"), "--provider", "cuda"]),
      expect.objectContaining({ cwd: process.cwd() })
    );
  });

  it("runs the default CLIP wrapper with the requested local GPU device", async () => {
    const modelRoot = mkdtempSync(path.join(tmpdir(), "outfit-models-test-"));
    const thumbnailOutputDir = mkdtempSync(path.join(tmpdir(), "outfit-thumbs-test-"));
    const clipDir = path.join(modelRoot, "huggingface", "Xenova", "clip-vit-base-patch32");
    mkdirSync(path.join(clipDir, "onnx"), { recursive: true });
    writeFileSync(path.join(clipDir, "config.json"), "{}", "utf8");
    writeFileSync(path.join(clipDir, "preprocessor_config.json"), "{}", "utf8");
    writeFileSync(path.join(clipDir, "special_tokens_map.json"), "{}", "utf8");
    writeFileSync(path.join(clipDir, "tokenizer.json"), "{}", "utf8");
    writeFileSync(path.join(clipDir, "tokenizer_config.json"), "{}", "utf8");
    writeFileSync(path.join(clipDir, "vocab.json"), "{}", "utf8");
    writeFileSync(path.join(clipDir, "merges.txt"), "", "utf8");
    writeFileSync(path.join(clipDir, "onnx", "model_quantized.onnx"), "fake-model", "utf8");
    writeFileSync(path.join(thumbnailOutputDir, "garment-1-shirt.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    spawnedChild.stdout.on.mockImplementation((event: string, callback: (chunk: string) => void) => {
      if (event === "data") {
        callback(JSON.stringify({
          category: "top",
          styles: ["smart-casual"],
          patterns: ["solid"],
          tags: ["cotton"],
          scores: [{ label: "top", score: 0.9 }]
        }));
      }
      return spawnedChild.stdout;
    });
    spawnedChild.on.mockImplementation((event: string, callback: (code?: number) => void) => {
      if (event === "close") callback(0);
      return spawnedChild;
    });
    const db = createDatabase(":memory:");
    db.prepare(`
      INSERT INTO garments (
        name, category, color, warmth, seasons, styles, formality,
        image_url, owned, confirmed, excluded, confidence, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("白色衬衫", "top", "white", "light", JSON.stringify(["spring"]), JSON.stringify(["casual"]), "casual", "/api/garment-thumbnails/garment-1-shirt.png", 1, 1, 0, 0.9, "");
    const app = createApiApp(db, { thumbnailOutputDir, visionModelRoot: modelRoot, visionDevice: "dml" });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const response = await fetch(`${baseUrl}/api/garments/1/vision-tags`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });

    expect(response.status).toBe(200);
    expect(spawnMock).toHaveBeenLastCalledWith(
      process.execPath,
      expect.arrayContaining(["scripts/vision_tags.mjs", "--image", path.join(thumbnailOutputDir, "garment-1-shirt.png"), "--device", "dml"]),
      expect.objectContaining({ cwd: process.cwd() })
    );
  });

  it("does not save a cutout URL when rembg exits without writing output", async () => {
    const modelRoot = mkdtempSync(path.join(tmpdir(), "outfit-models-test-"));
    const thumbnailOutputDir = mkdtempSync(path.join(tmpdir(), "outfit-thumbs-test-"));
    const rembgDir = path.join(modelRoot, "rembg");
    mkdirSync(rembgDir, { recursive: true });
    writeFileSync(path.join(rembgDir, "isnet-general-use.onnx"), "fake-model", "utf8");
    writeFileSync(path.join(thumbnailOutputDir, "garment-1-shirt.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const db = createDatabase(":memory:");
    db.prepare(`
      INSERT INTO garments (
        name, category, color, warmth, seasons, styles, formality,
        image_url, owned, confirmed, excluded, confidence, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("白色衬衫", "top", "white", "light", JSON.stringify(["spring"]), JSON.stringify(["smart-casual"]), "smart-casual", "/api/garment-thumbnails/garment-1-shirt.png", 1, 1, 0, 0.9, "");
    const app = createApiApp(db, {
      thumbnailOutputDir,
      visionModelRoot: modelRoot,
      runRembg: async () => undefined
    });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const response = await fetch(`${baseUrl}/api/garments/1/cutout`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });
    const garments = await (await fetch(`${baseUrl}/api/garments`, { headers: { cookie: authCookie } })).json() as Array<{ cutoutImageUrl?: string }>;

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { code: "VISION_OUTPUT_MISSING", message: expect.stringContaining("去背景输出文件") }
    });
    expect(garments[0].cutoutImageUrl).toBeUndefined();
  });

  it("returns tag suggestions without overwriting garment fields", async () => {
    const modelRoot = mkdtempSync(path.join(tmpdir(), "outfit-models-test-"));
    const clipDir = path.join(modelRoot, "huggingface", "Xenova", "clip-vit-base-patch32");
    mkdirSync(path.join(clipDir, "onnx"), { recursive: true });
    writeFileSync(path.join(clipDir, "config.json"), "{}", "utf8");
    writeFileSync(path.join(clipDir, "preprocessor_config.json"), "{}", "utf8");
    writeFileSync(path.join(clipDir, "special_tokens_map.json"), "{}", "utf8");
    writeFileSync(path.join(clipDir, "tokenizer.json"), "{}", "utf8");
    writeFileSync(path.join(clipDir, "tokenizer_config.json"), "{}", "utf8");
    writeFileSync(path.join(clipDir, "vocab.json"), "{}", "utf8");
    writeFileSync(path.join(clipDir, "merges.txt"), "", "utf8");
    writeFileSync(path.join(clipDir, "onnx", "model_quantized.onnx"), "fake-model", "utf8");
    const db = createDatabase(":memory:");
    db.prepare(`
      INSERT INTO garments (
        name, category, color, warmth, seasons, styles, formality,
        image_url, owned, confirmed, excluded, confidence, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("黑色短靴", "shoes", "black", "medium", JSON.stringify(["autumn"]), JSON.stringify(["casual"]), "casual", "/api/garment-thumbnails/garment-1-boot.png", 1, 1, 0, 0.9, "");
    const app = createApiApp(db, {
      visionModelRoot: modelRoot,
      inferVisionTags: async () => ({
        category: "shoes",
        styles: ["formal"],
        patterns: ["solid"],
        tags: ["leather"],
        scores: [{ label: "shoes", score: 0.93 }]
      })
    });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const response = await fetch(`${baseUrl}/api/garments/1/vision-tags`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });
    const suggestion = await response.json();
    const garments = await (await fetch(`${baseUrl}/api/garments`, { headers: { cookie: authCookie } })).json() as Array<{ category: string; styles: string[]; patterns?: string[]; tags?: string[]; visionTags?: unknown }>;

    expect(response.status).toBe(200);
    expect(suggestion).toMatchObject({
      category: "shoes",
      styles: ["formal"],
      tags: ["leather"],
      scores: [expect.objectContaining({ label: "shoes" })]
    });
    expect(garments[0]).toMatchObject({
      category: "shoes",
      styles: ["casual"],
      patterns: [],
      tags: [],
      visionTags: suggestion
    });
  });

  it("fails vision actions clearly when the required local model is missing", async () => {
    const modelRoot = mkdtempSync(path.join(tmpdir(), "outfit-models-test-"));
    const db = createDatabase(":memory:");
    db.prepare(`
      INSERT INTO garments (
        name, category, color, warmth, seasons, styles, formality,
        image_url, owned, confirmed, excluded, confidence, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("白色T恤", "top", "white", "light", JSON.stringify(["summer"]), JSON.stringify(["casual"]), "casual", "/api/garment-thumbnails/garment-1-shirt.png", 1, 1, 0, 0.9, "");
    const app = createApiApp(db, { visionModelRoot: modelRoot });
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl);

    const cutoutResponse = await fetch(`${baseUrl}/api/garments/1/cutout`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });
    const response = await fetch(`${baseUrl}/api/garments/1/vision-tags`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });

    expect(cutoutResponse.status).toBe(409);
    expect(await cutoutResponse.json()).toMatchObject({
      error: {
        code: "VISION_MODEL_MISSING",
        message: expect.stringContaining("rembg-isnet")
      }
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VISION_MODEL_MISSING",
        message: expect.stringContaining("clip-vit-base-patch32")
      }
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
    const authCookie = await registerTestUser(baseUrl, realFetch);

    const first = await realFetch(`${baseUrl}/api/weather?latitude=39.9042&longitude=116.4074`, {
      headers: { cookie: authCookie }
    });
    const second = await realFetch(`${baseUrl}/api/weather?latitude=39.9042&longitude=116.4074`, {
      headers: { cookie: authCookie }
    });

    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ summary: "小雨" });
    expect(await second.json()).toMatchObject({ summary: "小雨" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns estimated weather when Open-Meteo fails before anything is cached", async () => {
    const realFetch = globalThis.fetch.bind(globalThis);
    const fetchMock = vi.fn(async () => new Response("Bad Gateway", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl, realFetch);

    const response = await realFetch(`${baseUrl}/api/weather?latitude=39.9042&longitude=116.4074`, {
      headers: { cookie: authCookie }
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      weatherCode: 3,
      summary: expect.stringContaining("估算")
    });
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns stale cached weather when Open-Meteo fails after the cache expires", async () => {
    const realFetch = globalThis.fetch.bind(globalThis);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
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
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const db = createDatabase(":memory:");
    const app = createApiApp(db);
    const server = app.listen(0);
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const authCookie = await registerTestUser(baseUrl, realFetch);

    const first = await realFetch(`${baseUrl}/api/weather?latitude=39.9042&longitude=116.4074`, {
      headers: { cookie: authCookie }
    });
    expect(first.status).toBe(200);
    db.prepare("UPDATE weather_cache SET fetched_at = ?").run("2020-01-01T00:00:00.000Z");

    const second = await realFetch(`${baseUrl}/api/weather?latitude=39.9042&longitude=116.4074`, {
      headers: { cookie: authCookie }
    });

    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ summary: "小雨" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function jsonHeaders(cookie?: string): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(cookie ? { cookie } : {})
  };
}

function seedThumbnailSelectionFixture(db: AppDatabase): {
  garmentId: number;
  itemId: string;
  currentUrl: string;
  orderUrl: string;
  detailUrl: string;
  captureUrl: string;
  captureDetailUrl: string;
} {
  const itemId = "manual-shirt";
  const currentUrl = "https://img.alicdn.com/imgextra/i1/100/O1CN01current_item_pic.jpg";
  const orderUrl = "https://gw.alicdn.com/bao/uploaded/i2/100/O1CN01order.jpg";
  const detailUrl = "https://img.alicdn.com/imgextra/i3/100/O1CN01detail.jpg";
  const captureUrl = "https://img.alicdn.com/imgextra/i4/100/O1CN01capture_item_pic.jpg";
  const captureDetailUrl = "https://img.alicdn.com/imgextra/i5/100/O1CN01capture-detail.jpg";
  const sourceResult = db.prepare(`
    INSERT INTO source_order_items (
      external_key, source, page_type, item_id, title, sku, image_url,
      detail_images, is_apparel
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `thumbnail-source-${Math.random()}`,
    "taobao-selenium-order-list",
    "order-list",
    itemId,
    "白色衬衫",
    "颜色分类: 白色",
    orderUrl,
    JSON.stringify([
      detailUrl,
      "https://example.com/not-allowed.jpg",
      "file:///tmp/local.jpg"
    ]),
    1
  );
  const garmentResult = db.prepare(`
    INSERT INTO garments (
      source_order_item_id, name, raw_name, category, color, warmth, seasons, styles,
      formality, image_url, cutout_image_url, owned, confirmed, excluded, confidence, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    Number(sourceResult.lastInsertRowid),
    "白色衬衫",
    "白色衬衫",
    "top",
    "white",
    "light",
    JSON.stringify(["spring"]),
    JSON.stringify(["smart-casual"]),
    "smart-casual",
    currentUrl,
    "/api/garment-thumbnails/old-cutout.png",
    1,
    1,
    0,
    0.9,
    ""
  );
  return {
    garmentId: Number(garmentResult.lastInsertRowid),
    itemId,
    currentUrl,
    orderUrl,
    detailUrl,
    captureUrl,
    captureDetailUrl
  };
}

async function registerTestUser(baseUrl: string, fetcher: typeof fetch = fetch): Promise<string> {
  nextTestUserId += 1;
  const response = await fetcher(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      username: `test_user_${nextTestUserId}`,
      password: "test-password"
    })
  });
  expect(response.status).toBe(201);
  return sessionCookie(response);
}

function sessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toEqual(expect.any(String));
  return setCookie!.split(";")[0];
}

function makePng(width: number, height: number): Uint8Array {
  const bytes = Buffer.alloc(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 2;
  return bytes;
}

function pngBody(width: number, height: number): ArrayBuffer {
  const bytes = makePng(width, height);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
