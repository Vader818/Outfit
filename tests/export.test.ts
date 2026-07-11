import { describe, expect, it } from "vitest";
import { createDatabase, savePersonalProfile } from "../server/db";
import {
  OUTFIT_EXPORT_V2_FEATURES,
  buildOutfitExportV2,
  validateOutfitExport
} from "../server/services/export";
import {
  attachCandidateIdentities,
  persistRecommendationSnapshot
} from "../server/services/recommendationCandidates";
import type { Garment, RecommendationScoreBreakdown, WeatherSnapshot } from "../src/shared/types";

const FIXED_NOW = new Date("2026-07-11T06:00:00.000Z");
const weather: WeatherSnapshot = {
  date: "2026-07-11",
  temperature: 25,
  apparentTemperature: 26,
  precipitationProbability: 10,
  windSpeed: 8,
  weatherCode: 1,
  summary: "晴"
};
const scoreBreakdown: RecommendationScoreBreakdown = {
  slotCompleteness: 20,
  weatherComfort: 7,
  season: 12,
  occasion: 21,
  pairCompatibility: 10,
  colorHarmony: 12,
  recentWear: 0,
  itemConfidence: 8,
  userPreference: 0,
  bodyProportion: 0,
  colorSuitability: 0
};

function garment(id: number, category: Garment["category"]): Garment {
  return {
    id,
    brand: "",
    name: `${category}-${id}`,
    rawName: `${category}-${id}`,
    category,
    color: "black",
    warmth: "medium",
    seasons: ["summer"],
    styles: ["casual"],
    formality: "casual",
    imageUrl: "",
    owned: true,
    confirmed: true,
    excluded: false,
    confidence: 0.8
  };
}

describe("OutfitExportV2", () => {
  it("recognizes a legacy V1 fixture without rewriting it and rejects unknown versions", () => {
    const fixture = {
      version: 1 as const,
      exportedAt: "2026-01-01T00:00:00.000Z",
      profile: {},
      garments: [],
      sourceOrderItems: [],
      wearLogs: [],
      recommendationRuns: []
    };

    expect(validateOutfitExport(fixture)).toBe(fixture);
    for (const invalid of [null, {}, { version: 0 }, { version: 3 }, { version: "2" }]) {
      expect(() => validateOutfitExport(invalid)).toThrow(/unsupported export version/i);
    }
    expect(() => validateOutfitExport({ ...fixture, garments: [{}] })).toThrow(/garments/i);
    expect(() => validateOutfitExport({ ...fixture, wearLogs: [{}] })).toThrow(/wearLogs/i);
    expect(() => validateOutfitExport({
      ...fixture,
      wearLogs: [{ id: 1, garmentIds: [], wornAt: "2026-01-01T00:00:00.000Z" }]
    })).toThrow(/wearLogs/i);
    expect(() => validateOutfitExport({
      ...fixture,
      recommendationRuns: [{ id: 1, createdAt: "2026-01-01T00:00:00.000Z" }]
    })).toThrow(/recommendationRuns/i);
    expect(() => validateOutfitExport({
      ...fixture,
      version: 2,
      schemaVersion: 1,
      features: [],
      recommendationCandidates: [{}]
    })).toThrow(/recommendationCandidates/i);
    expect(() => validateOutfitExport({
      ...fixture,
      version: 2,
      schemaVersion: 1,
      features: [],
      recommendationCandidates: [{
        candidateId: "candidate",
        runId: 1,
        outfitSignature: "signature",
        rank: 1,
        itemIds: [],
        createdAt: "2026-01-01T00:00:00.000Z"
      }]
    })).toThrow(/recommendationCandidates/i);
  });

  it("builds a deterministic V2 envelope with every V1 business field and M0 data", () => {
    const db = createDatabase(":memory:");
    const profile = savePersonalProfile(db, {
      temperatureSensitivity: "neutral",
      preferredColors: ["blue"],
      avoidedColors: [],
      preferredStyles: ["casual"]
    });
    const items = [garment(1, "top"), garment(2, "bottom"), garment(3, "shoes")];
    const outfits = attachCandidateIdentities([{
      score: 90,
      matchPercent: 75,
      scoreBreakdown,
      items,
      reasons: ["测试理由"],
      alternatives: []
    }], () => "11111111-1111-4111-8111-111111111111");
    const result = persistRecommendationSnapshot(db, { occasion: "casual" }, {
      weather,
      occasion: "casual",
      missingSlots: [],
      outfits
    });

    const exported = buildOutfitExportV2(db, { now: () => FIXED_NOW });
    const again = buildOutfitExportV2(db, { now: () => FIXED_NOW });

    expect(exported).toEqual({
      version: 2,
      schemaVersion: 1,
      exportedAt: FIXED_NOW.toISOString(),
      features: OUTFIT_EXPORT_V2_FEATURES,
      profile,
      garments: [],
      sourceOrderItems: [],
      wearLogs: [],
      recommendationRuns: [{
        id: result.runId,
        input: { occasion: "casual" },
        result,
        createdAt: expect.any(String)
      }],
      recommendationCandidates: [{
        candidateId: outfits[0].candidateId,
        runId: result.runId,
        outfitSignature: outfits[0].outfitSignature,
        rank: 1,
        itemIds: [1, 2, 3],
        scoreSnapshot: {
          score: 90,
          matchPercent: 75,
          scoreBreakdown,
          reasons: ["测试理由"]
        },
        createdAt: expect.any(String)
      }]
    });
    expect(JSON.stringify(again, null, 2)).toBe(JSON.stringify(exported, null, 2));
  });

  it("exports all history instead of reusing UI list limits", () => {
    const db = createDatabase(":memory:");
    const insertWear = db.prepare(`
      INSERT INTO wear_logs (garment_ids, context, worn_at)
      VALUES (?, ?, ?)
    `);
    for (let id = 1; id <= 1001; id += 1) {
      insertWear.run(JSON.stringify([id]), JSON.stringify({ sequence: id }), new Date(id * 1000).toISOString());
    }
    const insertRun = db.prepare(`
      INSERT INTO recommendation_runs (input_json, result_json, created_at)
      VALUES (?, ?, ?)
    `);
    for (let id = 1; id <= 201; id += 1) {
      insertRun.run(JSON.stringify({ sequence: id }), JSON.stringify({ sequence: id }), new Date(id * 1000).toISOString());
    }

    const exported = buildOutfitExportV2(db, { now: () => FIXED_NOW });

    expect(exported.wearLogs).toHaveLength(1001);
    expect(exported.wearLogs[0].id).toBe(1001);
    expect(exported.wearLogs.at(-1)?.id).toBe(1);
    expect(exported.recommendationRuns).toHaveLength(201);
    expect(exported.recommendationRuns[0].id).toBe(201);
    expect(exported.recommendationRuns.at(-1)?.id).toBe(1);
  });

  it("reads the complete export from one database snapshot", () => {
    const db = createDatabase(":memory:");
    const transactionStates: boolean[] = [];
    const monitoredDb = new Proxy(db, {
      get(target, property) {
        if (property === "prepare") {
          return (sql: string) => {
            transactionStates.push(target.isTransaction);
            return target.prepare(sql);
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      }
    });

    buildOutfitExportV2(monitoredDb, { now: () => FIXED_NOW });

    expect(transactionStates.length).toBeGreaterThan(0);
    expect(transactionStates.every(Boolean)).toBe(true);
    expect(db.isTransaction).toBe(false);
  });

  it("fails with table, row, and column context instead of hiding damaged JSON", () => {
    const runDb = createDatabase(":memory:");
    const run = runDb.prepare(`
      INSERT INTO recommendation_runs (input_json, result_json)
      VALUES ('not-json', '{}')
    `).run();
    expect(() => buildOutfitExportV2(runDb)).toThrow(
      new RegExp(`recommendation_runs.*${String(run.lastInsertRowid)}.*input_json`, "i")
    );

    const candidateDb = createDatabase(":memory:");
    const candidateRun = candidateDb.prepare(`
      INSERT INTO recommendation_runs (input_json, result_json)
      VALUES ('{}', '{}')
    `).run();
    candidateDb.exec("PRAGMA ignore_check_constraints = ON");
    candidateDb.prepare(`
      INSERT INTO recommendation_candidates (
        candidate_id, run_id, signature, rank, item_ids_json, score_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run("damaged", Number(candidateRun.lastInsertRowid), "signature", 1, "not-json", "{}");
    candidateDb.exec("PRAGMA ignore_check_constraints = OFF");
    expect(() => buildOutfitExportV2(candidateDb)).toThrow(
      /recommendation_candidates.*damaged.*item_ids_json/i
    );

    const garmentDb = createDatabase(":memory:");
    const garmentRow = garmentDb.prepare(`
      INSERT INTO garments (
        name, category, color, warmth, seasons, styles, formality,
        materials, patterns, tags
      ) VALUES ('damaged garment', 'top', 'black', 'medium', 'not-json', '[]', 'casual', '[]', '[]', '[]')
    `).run();
    expect(() => buildOutfitExportV2(garmentDb)).toThrow(
      new RegExp(`garments.*${String(garmentRow.lastInsertRowid)}.*seasons`, "i")
    );
    garmentDb.prepare("UPDATE garments SET seasons = '[]', styles = '{}' WHERE id = ?")
      .run(Number(garmentRow.lastInsertRowid));
    expect(() => buildOutfitExportV2(garmentDb)).toThrow(
      new RegExp(`garments.*${String(garmentRow.lastInsertRowid)}.*styles.*string array`, "i")
    );
    garmentDb.prepare("UPDATE garments SET styles = '[]', seasons = '[\"monsoon\"]' WHERE id = ?")
      .run(Number(garmentRow.lastInsertRowid));
    expect(() => buildOutfitExportV2(garmentDb)).toThrow(
      new RegExp(`garments.*${String(garmentRow.lastInsertRowid)}.*seasons.*valid season`, "i")
    );
    garmentDb.prepare(`
      UPDATE garments
      SET seasons = '[]', vision_tags = '{"category":"hat","styles":[],"patterns":[],"tags":[],"scores":[]}'
      WHERE id = ?
    `).run(Number(garmentRow.lastInsertRowid));
    expect(() => buildOutfitExportV2(garmentDb)).toThrow(
      new RegExp(`garments.*${String(garmentRow.lastInsertRowid)}.*vision_tags.*GarmentCategory`, "i")
    );
    garmentDb.prepare(`
      UPDATE garments
      SET vision_tags = NULL, category = 'hat'
      WHERE id = ?
    `).run(Number(garmentRow.lastInsertRowid));
    expect(() => buildOutfitExportV2(garmentDb)).toThrow(/garments.*invalid garment/i);

    const profileDb = createDatabase(":memory:");
    profileDb.prepare(`
      INSERT INTO app_settings (key, value)
      VALUES ('personalProfile', '[]')
    `).run();
    expect(() => buildOutfitExportV2(profileDb)).toThrow(
      /app_settings.*personalProfile.*value.*object/i
    );
    profileDb.prepare(`
      UPDATE app_settings
      SET value = '{"temperatureSensitivity":["neutral"]}'
      WHERE key = 'personalProfile'
    `).run();
    expect(() => buildOutfitExportV2(profileDb)).toThrow(
      /app_settings.*personalProfile.*temperatureSensitivity/i
    );
  });

  it("never exports account credentials, sessions, or weather cache", () => {
    const db = createDatabase(":memory:");
    const user = db.prepare(`
      INSERT INTO users (username, username_normalized, password_hash, password_salt)
      VALUES ('owner', 'owner', 'SECRET_HASH', 'SECRET_SALT')
    `).run();
    db.prepare(`
      INSERT INTO sessions (token_hash, user_id, expires_at)
      VALUES ('SECRET_TOKEN', ?, '2099-01-01T00:00:00.000Z')
    `).run(Number(user.lastInsertRowid));
    db.prepare(`
      INSERT INTO weather_cache (cache_key, latitude, longitude, payload)
      VALUES ('secret-weather', 1, 2, '{"secret":"SECRET_WEATHER"}')
    `).run();

    const json = JSON.stringify(buildOutfitExportV2(db, { now: () => FIXED_NOW }));

    expect(json).not.toContain("SECRET_HASH");
    expect(json).not.toContain("SECRET_SALT");
    expect(json).not.toContain("SECRET_TOKEN");
    expect(json).not.toContain("SECRET_WEATHER");
  });
});
