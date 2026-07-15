import { afterEach, describe, expect, it } from "vitest";
import { archiveGarment, createDatabase, listGarments, type AppDatabase } from "../server/db";
import { createApiApp } from "../server/routes";
import { recommendOutfits } from "../server/services/recommend";
import { persistRecommendationSnapshot } from "../server/services/recommendationCandidates";
import {
  applySavedOutfitReplacement,
  archiveSavedOutfit,
  createSavedOutfit,
  getSavedOutfit,
  listSavedOutfits,
  saveRecommendationCandidate,
  updateSavedOutfit
} from "../server/services/savedOutfits";

const servers: Array<{ close: (callback?: () => void) => void }> = [];
let nextUsername = 0;

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.close(() => resolve());
  })));
});

describe("saved outfits service", () => {
  it("creates, edits, reopens, and soft archives an outfit while preserving garment snapshots", () => {
    const db = createDatabase(":memory:");
    const topId = insertGarment(db, { name: "白色衬衫", brand: "无印良品", category: "top", imageUrl: "/api/garment-assets/11/content" });
    const bottomId = insertGarment(db, { name: "黑色长裤", brand: "优衣库", category: "bottom" });
    const accessoryId = insertGarment(db, { name: "银色项链", category: "accessory" });

    const created = createSavedOutfit(db, {
      name: "周一通勤",
      notes: "薄外套可选",
      favorite: false,
      items: [
        { garmentId: topId, slot: "top", position: 0 },
        { garmentId: bottomId, slot: "bottom", position: 0 },
        { garmentId: accessoryId, slot: "accessory", position: 0 }
      ]
    });

    expect(created).toMatchObject({
      id: expect.any(Number),
      name: "周一通勤",
      notes: "薄外套可选",
      source: "manual",
      favorite: false,
      items: [
        expect.objectContaining({
          outfitId: created.id,
          garmentId: topId,
          slot: "top",
          position: 0,
          garmentSnapshot: {
            id: topId,
            name: "白色衬衫",
            brand: "无印良品",
            category: "top",
            imageUrl: "/api/garment-assets/11/content"
          }
        }),
        expect.objectContaining({ garmentId: bottomId, slot: "bottom", position: 0 }),
        expect.objectContaining({ garmentId: accessoryId, slot: "accessory", position: 0 })
      ],
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    });
    expect(listSavedOutfits(db)).toEqual([created]);

    db.prepare("UPDATE garments SET name = ?, image_url = ? WHERE id = ?")
      .run("已改名衬衫", "/api/garment-assets/12/content", topId);
    archiveGarment(db, topId);
    const reopened = getSavedOutfit(db, created.id);
    expect(reopened.items[0].garmentSnapshot).toMatchObject({
      id: topId,
      name: "白色衬衫",
      imageUrl: "/api/garment-assets/11/content"
    });

    const updated = updateSavedOutfit(db, created.id, {
      name: "周一通勤（雨天）",
      notes: "加伞",
      favorite: true
    });
    expect(updated).toMatchObject({
      id: created.id,
      name: "周一通勤（雨天）",
      notes: "加伞",
      favorite: true,
      source: "manual"
    });

    const archived = archiveSavedOutfit(db, created.id);
    expect(archived.archivedAt).toEqual(expect.any(String));
    expect(listSavedOutfits(db)).toEqual([]);
    expect(listSavedOutfits(db, { scope: "archived" })).toEqual([archived]);
    expect(getSavedOutfit(db, created.id)).toEqual(archived);
    expect(db.prepare("SELECT COUNT(*) AS count FROM saved_outfit_items WHERE outfit_id = ?").get(created.id))
      .toEqual({ count: 3 });
  });

  it("validates outfit completeness and rolls back failed create or item replacement atomically", () => {
    const db = createDatabase(":memory:");
    const topId = insertGarment(db, { name: "针织衫", category: "top" });
    const bottomId = insertGarment(db, { name: "直筒裤", category: "bottom" });
    const shoeId = insertGarment(db, { name: "乐福鞋", category: "shoes" });

    expect(() => createSavedOutfit(db, {
      name: "不完整搭配",
      items: [{ garmentId: topId, slot: "top", position: 0 }]
    })).toThrow(/上装.*下装|完整/i);
    expect(() => createSavedOutfit(db, {
      name: "错误位置",
      items: [
        { garmentId: topId, slot: "top", position: 0 },
        { garmentId: 999_999, slot: "bottom", position: 0 }
      ]
    })).toThrow(/衣服不存在|衣物不存在|garment/i);
    expect(db.prepare("SELECT COUNT(*) AS count FROM saved_outfits").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM saved_outfit_items").get()).toEqual({ count: 0 });

    const created = createSavedOutfit(db, {
      name: "基础搭配",
      items: [
        { garmentId: topId, slot: "top", position: 0 },
        { garmentId: bottomId, slot: "bottom", position: 0 },
        { garmentId: shoeId, slot: "shoes", position: 0 }
      ]
    });
    expect(() => updateSavedOutfit(db, created.id, {
      name: "不应落盘",
      items: [
        { garmentId: topId, slot: "top", position: 0 },
        { garmentId: bottomId, slot: "bottom", position: 0 },
        { garmentId: shoeId, slot: "bottom", position: 1 }
      ]
    })).toThrow(/类别|slot|位置/i);

    expect(getSavedOutfit(db, created.id)).toMatchObject({
      name: "基础搭配",
      items: [
        expect.objectContaining({ garmentId: topId, slot: "top" }),
        expect.objectContaining({ garmentId: bottomId, slot: "bottom" }),
        expect.objectContaining({ garmentId: shoeId, slot: "shoes" })
      ]
    });
  });

  it("saves a recommendation by UUID from its trusted historical snapshot after source garments change", () => {
    const db = createDatabase(":memory:");
    const topId = insertGarment(db, { name: "推荐时白衬衫", brand: "原品牌", category: "top" });
    const bottomId = insertGarment(db, { name: "推荐时黑长裤", category: "bottom" });
    const candidateId = "11111111-1111-4111-8111-111111111111";
    persistTestCandidate(db, candidateId);

    db.prepare("UPDATE garments SET name = ?, brand = ? WHERE id = ?").run("后来改名", "后来品牌", topId);
    archiveGarment(db, topId);

    const saved = saveRecommendationCandidate(db, candidateId, {});
    expect(saved).toMatchObject({
      name: expect.stringMatching(/2026-07-11.*日常/),
      source: "recommendation",
      sourceCandidateId: candidateId,
      favorite: false,
      items: [
        expect.objectContaining({
          garmentId: topId,
          slot: "top",
          garmentSnapshot: expect.objectContaining({ name: "推荐时白衬衫", brand: "原品牌" })
        }),
        expect.objectContaining({ garmentId: bottomId, slot: "bottom" })
      ]
    });

    const custom = saveRecommendationCandidate(db, candidateId, {
      name: "下周照穿",
      notes: "配棕色腰带",
      favorite: true
    });
    expect(custom).toMatchObject({
      name: "下周照穿",
      notes: "配棕色腰带",
      favorite: true,
      sourceCandidateId: candidateId
    });
  });

  it("rejects a damaged candidate snapshot without leaving a partial saved outfit", () => {
    const db = createDatabase(":memory:");
    insertGarment(db, { name: "白色上装", category: "top" });
    insertGarment(db, { name: "黑色下装", category: "bottom" });
    const candidateId = "22222222-2222-4222-8222-222222222222";
    persistTestCandidate(db, candidateId);
    db.prepare("UPDATE recommendation_candidates SET item_ids_json = '[999999]' WHERE candidate_id = ?")
      .run(candidateId);

    expect(() => saveRecommendationCandidate(db, candidateId, {})).toThrow(/候选.*快照|snapshot/i);
    expect(db.prepare("SELECT COUNT(*) AS count FROM saved_outfits").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM saved_outfit_items").get()).toEqual({ count: 0 });
  });

  it("creates a traceable replacement version without mutating the original outfit", () => {
    const db = createDatabase(":memory:");
    const originalTopId = insertGarment(db, { name: "原白衬衫", category: "top" });
    const replacementTopId = insertGarment(db, { name: "替换蓝衬衫", category: "top" });
    const bottomId = insertGarment(db, { name: "原黑长裤", category: "bottom" });
    const original = createSavedOutfit(db, {
      name: "原始通勤搭配",
      notes: "原始备注",
      items: [
        { garmentId: originalTopId, slot: "top", position: 0 },
        { garmentId: bottomId, slot: "bottom", position: 0 }
      ]
    });

    const derived = applySavedOutfitReplacement(db, original.id, {
      targetGarmentId: originalTopId,
      replacementGarmentId: replacementTopId,
      name: "蓝衬衫版本"
    });
    expect(derived).toMatchObject({
      name: "蓝衬衫版本",
      source: "replacement",
      derivedFromOutfitId: original.id,
      notes: "原始备注",
      items: [
        expect.objectContaining({
          garmentId: replacementTopId,
          slot: "top",
          garmentSnapshot: expect.objectContaining({ id: replacementTopId, name: "替换蓝衬衫" })
        }),
        expect.objectContaining({
          garmentId: bottomId,
          garmentSnapshot: expect.objectContaining({ id: bottomId, name: "原黑长裤" })
        })
      ]
    });
    expect(getSavedOutfit(db, original.id)).toEqual(original);

    updateSavedOutfit(db, derived.id, { name: "派生版本改名" });
    archiveSavedOutfit(db, derived.id);
    expect(getSavedOutfit(db, original.id)).toEqual(original);
    expect(getSavedOutfit(db, derived.id)).toMatchObject({
      name: "派生版本改名",
      archivedAt: expect.any(String),
      derivedFromOutfitId: original.id
    });
  });

  it("rejects invalid replacement targets or garments without creating a version", () => {
    const db = createDatabase(":memory:");
    const topId = insertGarment(db, { name: "原上装", category: "top" });
    const bottomId = insertGarment(db, { name: "原下装", category: "bottom" });
    const wrongCategoryId = insertGarment(db, { name: "另一条下装", category: "bottom" });
    const excludedTopId = insertGarment(db, { name: "已排除上装", category: "top" });
    db.prepare("UPDATE garments SET excluded = 1 WHERE id = ?").run(excludedTopId);
    const original = createSavedOutfit(db, {
      name: "基础版本",
      items: [
        { garmentId: topId, slot: "top", position: 0 },
        { garmentId: bottomId, slot: "bottom", position: 0 }
      ]
    });

    expect(() => applySavedOutfitReplacement(db, original.id, {
      targetGarmentId: 999_999,
      replacementGarmentId: wrongCategoryId
    })).toThrow(/目标|原搭配/i);
    expect(() => applySavedOutfitReplacement(db, original.id, {
      targetGarmentId: topId,
      replacementGarmentId: wrongCategoryId
    })).toThrow(/类别|位置/i);
    expect(() => applySavedOutfitReplacement(db, original.id, {
      targetGarmentId: topId,
      replacementGarmentId: excludedTopId
    })).toThrow(/排除|推荐/i);
    expect(db.prepare("SELECT COUNT(*) AS count FROM saved_outfits").get()).toEqual({ count: 1 });
    expect(getSavedOutfit(db, original.id)).toEqual(original);
  });
});

describe("saved outfits API", () => {
  it("exposes authenticated CRUD and archive routes without accepting provenance forgery", async () => {
    const db = createDatabase(":memory:");
    const topId = insertGarment(db, { name: "白色衬衫", category: "top" });
    const bottomId = insertGarment(db, { name: "深蓝长裤", category: "bottom" });
    const { baseUrl, authCookie } = await startAuthenticatedApp(db);

    const unauthenticated = await fetch(`${baseUrl}/api/outfits`);
    expect(unauthenticated.status).toBe(401);

    const forged = await fetch(`${baseUrl}/api/outfits`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({
        name: "伪造来源",
        source: "replacement",
        derivedFromOutfitId: 123,
        items: []
      })
    });
    expect(forged.status).toBe(400);
    await expect(forged.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    const crossSite = await fetch(`${baseUrl}/api/outfits`, {
      method: "POST",
      headers: { ...jsonHeaders(authCookie), origin: "https://attacker.example" },
      body: JSON.stringify({ name: "跨站", items: [] })
    });
    expect(crossSite.status).toBe(403);

    const createResponse = await fetch(`${baseUrl}/api/outfits`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({
        name: "周末散步",
        items: [
          { garmentId: topId, slot: "top", position: 0 },
          { garmentId: bottomId, slot: "bottom", position: 0 }
        ]
      })
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { id: number };

    const listed = await (await fetch(`${baseUrl}/api/outfits`, {
      headers: { cookie: authCookie }
    })).json() as Array<{ id: number }>;
    expect(listed.map((outfit) => outfit.id)).toEqual([created.id]);

    const updateResponse = await fetch(`${baseUrl}/api/outfits/${created.id}`, {
      method: "PUT",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ name: "周末散步（已改名）", favorite: true })
    });
    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      id: created.id,
      name: "周末散步（已改名）",
      favorite: true
    });

    const archiveResponse = await fetch(`${baseUrl}/api/outfits/${created.id}/archive`, {
      method: "POST",
      headers: jsonHeaders(authCookie)
    });
    expect(archiveResponse.status).toBe(200);
    await expect(archiveResponse.json()).resolves.toMatchObject({ id: created.id, archivedAt: expect.any(String) });

    await expect((await fetch(`${baseUrl}/api/outfits`, {
      headers: { cookie: authCookie }
    })).json()).resolves.toEqual([]);
    const archived = await (await fetch(`${baseUrl}/api/outfits?archived=1`, {
      headers: { cookie: authCookie }
    })).json() as Array<{ id: number }>;
    expect(archived.map((outfit) => outfit.id)).toEqual([created.id]);
    const reopened = await fetch(`${baseUrl}/api/outfits/${created.id}`, {
      headers: { cookie: authCookie }
    });
    expect(reopened.status).toBe(200);
    await expect(reopened.json()).resolves.toMatchObject({ id: created.id, name: "周末散步（已改名）" });
  });

  it("saves recommendation candidates through strict UUID and body validation", async () => {
    const db = createDatabase(":memory:");
    insertGarment(db, { name: "白色衬衫", category: "top" });
    insertGarment(db, { name: "黑色长裤", category: "bottom" });
    const candidateId = "33333333-3333-4333-8333-333333333333";
    persistTestCandidate(db, candidateId);
    const { baseUrl, authCookie } = await startAuthenticatedApp(db);

    const invalidUuid = await fetch(`${baseUrl}/api/recommendation-candidates/not-a-uuid/save`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: "{}"
    });
    expect(invalidUuid.status).toBe(400);
    await expect(invalidUuid.json()).resolves.toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    const unknownUuid = await fetch(`${baseUrl}/api/recommendation-candidates/44444444-4444-4444-8444-444444444444/save`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: "{}"
    });
    expect(unknownUuid.status).toBe(404);

    const forged = await fetch(`${baseUrl}/api/recommendation-candidates/${candidateId}/save`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ source: "manual", items: [], derivedFromOutfitId: 99 })
    });
    expect(forged.status).toBe(400);

    const response = await fetch(`${baseUrl}/api/recommendation-candidates/${candidateId}/save`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({ name: "保存的首选", favorite: true })
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      name: "保存的首选",
      source: "recommendation",
      sourceCandidateId: candidateId,
      favorite: true
    });
  });

  it("creates replacement versions through the authenticated outfit route", async () => {
    const db = createDatabase(":memory:");
    const topId = insertGarment(db, { name: "白色上装", category: "top" });
    const replacementId = insertGarment(db, { name: "蓝色上装", category: "top" });
    const bottomId = insertGarment(db, { name: "黑色下装", category: "bottom" });
    const original = createSavedOutfit(db, {
      name: "原搭配",
      items: [
        { garmentId: topId, slot: "top", position: 0 },
        { garmentId: bottomId, slot: "bottom", position: 0 }
      ]
    });
    const { baseUrl, authCookie } = await startAuthenticatedApp(db);

    const response = await fetch(`${baseUrl}/api/outfits/${original.id}/replacements`, {
      method: "POST",
      headers: jsonHeaders(authCookie),
      body: JSON.stringify({
        targetGarmentId: topId,
        replacementGarmentId: replacementId,
        name: "蓝色版本"
      })
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      name: "蓝色版本",
      source: "replacement",
      derivedFromOutfitId: original.id
    });
    expect(getSavedOutfit(db, original.id)).toEqual(original);
  });
});

function insertGarment(db: AppDatabase, input: {
  name: string;
  category: "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";
  brand?: string;
  imageUrl?: string;
}): number {
  const result = db.prepare(`
    INSERT INTO garments (
      brand, name, raw_name, category, color, warmth, seasons, styles, formality,
      image_url, owned, confirmed, excluded, confidence, notes, origin
    ) VALUES (?, ?, ?, ?, 'black', 'medium', '["spring","autumn"]', '["casual"]',
      'casual', ?, 1, 1, 0, 1, '', 'manual')
  `).run(input.brand ?? "", input.name, input.name, input.category, input.imageUrl ?? "");
  return Number(result.lastInsertRowid);
}

function persistTestCandidate(db: AppDatabase, candidateId: string): void {
  const input = {
    weather: {
      date: "2026-07-11",
      temperature: 25,
      apparentTemperature: 26,
      precipitationProbability: 10,
      windSpeed: 8,
      weatherCode: 1,
      summary: "晴"
    },
    occasion: "casual" as const,
    recentlyWornGarmentIds: []
  };
  const recommendation = recommendOutfits(
    { garments: listGarments(db), ...input },
    { candidateIdFactory: () => candidateId }
  );
  expect(recommendation.outfits).toHaveLength(1);
  persistRecommendationSnapshot(db, input, recommendation);
}

async function startAuthenticatedApp(db: AppDatabase): Promise<{ baseUrl: string; authCookie: string }> {
  const app = createApiApp(db);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test server address");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: `saved_outfits_${++nextUsername}`,
      password: "correct-password"
    })
  });
  expect(response.status).toBe(201);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("missing auth cookie");
  return { baseUrl, authCookie: cookie };
}

function jsonHeaders(authCookie: string): Record<string, string> {
  return {
    "content-type": "application/json",
    cookie: authCookie
  };
}
