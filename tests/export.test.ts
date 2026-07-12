import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { archiveGarment, createDatabase, savePersonalProfile, type AppDatabase } from "../server/db";
import {
  OUTFIT_EXPORT_V2_FEATURES,
  buildOutfitExportV2,
  previewOutfitExportZip,
  writeOutfitExportZip,
  validateOutfitExport
} from "../server/services/export";
import { saveGarmentImageAsset } from "../server/services/garmentAssets";
import {
  applySavedOutfitReplacement,
  archiveSavedOutfit,
  createSavedOutfit
} from "../server/services/savedOutfits";
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
  colorSuitability: 0,
  learnedPreference: 0
};

function garment(id: number, category: Garment["category"]): Garment {
  return {
    id,
    origin: "manual",
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
    availabilityStatus: "available",
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
      sourceOrderItems: [{ detail_props: "not-json" }]
    })).toThrow(/sourceOrderItems/i);
    expect(() => validateOutfitExport({
      ...fixture,
      version: 2,
      schemaVersion: 2,
      features: [],
      recommendationCandidates: [{}]
    })).toThrow(/recommendationCandidates/i);
    const legacyV2WithoutAssets = {
      ...fixture,
      version: 2 as const,
      schemaVersion: 1,
      features: ["versioned-migrations"],
      recommendationCandidates: []
    };
    expect(validateOutfitExport(legacyV2WithoutAssets)).toBe(legacyV2WithoutAssets);
    const m3V2 = {
      ...legacyV2WithoutAssets,
      schemaVersion: 4,
      features: [...legacyV2WithoutAssets.features, "feedback-availability"],
      recommendationFeedback: [{
        id: 1,
        candidateId: "candidate",
        verdict: "liked",
        rating: 5,
        actuallyWorn: true,
        reasonCodes: [],
        comment: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }],
      outfitPairStats: [{
        garmentAId: 1,
        garmentBId: 2,
        likes: 1,
        dislikes: 0,
        wornCount: 1,
        totalFeedback: 1,
        signal: 3,
        updatedAt: "2026-01-01T00:00:00.000Z"
      }],
      garmentAvailabilityEvents: [{
        id: 1,
        garmentId: 1,
        previousStatus: "available",
        status: "laundry",
        changedAt: "2026-01-01T00:00:00.000Z"
      }]
    };
    expect(validateOutfitExport(m3V2)).toBe(m3V2);
    expect(() => validateOutfitExport({
      ...m3V2,
      recommendationFeedback: [{
        ...m3V2.recommendationFeedback[0],
        reasonCodes: ["invented"]
      }]
    })).toThrow(/recommendationFeedback/i);
    expect(() => validateOutfitExport({
      ...m3V2,
      garmentAvailabilityEvents: [{
        ...m3V2.garmentAvailabilityEvents[0],
        status: "lost"
      }]
    })).toThrow(/garmentAvailabilityEvents/i);
    const v2WithAsset = {
      ...legacyV2WithoutAssets,
      schemaVersion: 2,
      features: [...legacyV2WithoutAssets.features, "garment-assets"],
      garmentAssets: [{
        id: 7,
        garmentId: 3,
        kind: "primary",
        mimeType: "image/webp",
        byteSize: 128,
        width: 10,
        height: 12,
        sha256: "a".repeat(64),
        active: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        archivePath: "assets/7.webp"
      }]
    };
    expect(validateOutfitExport(v2WithAsset)).toBe(v2WithAsset);
    for (const archivePath of ["../7.webp", "/assets/7.webp", "C:\\private\\7.webp", "assets/8.webp"]) {
      expect(() => validateOutfitExport({
        ...v2WithAsset,
        garmentAssets: [{ ...v2WithAsset.garmentAssets[0], archivePath }]
      })).toThrow(/garmentAssets/i);
    }
    expect(() => validateOutfitExport({
      ...fixture,
      version: 2,
      schemaVersion: 2,
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
      replacements: []
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
      schemaVersion: 4,
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
      }],
      garmentAssets: [],
      savedOutfits: [],
      recommendationFeedback: [],
      outfitPairStats: [],
      garmentAvailabilityEvents: []
    });
    expect(JSON.stringify(again, null, 2)).toBe(JSON.stringify(exported, null, 2));
  });

  it("exports every feedback, pair stat, and availability event in deterministic order", () => {
    const db = createDatabase(":memory:");
    const firstGarmentId = insertAssetGarment(db, "第一件");
    const secondGarmentId = insertAssetGarment(db, "第二件");
    const thirdGarmentId = insertAssetGarment(db, "第三件");
    const runId = Number(db.prepare(`
      INSERT INTO recommendation_runs (input_json, result_json, created_at)
      VALUES ('{}', '{}', '2026-07-11T05:00:00.000Z')
    `).run().lastInsertRowid);
    const insertCandidate = db.prepare(`
      INSERT INTO recommendation_candidates (
        candidate_id, run_id, signature, rank, item_ids_json, score_snapshot, created_at
      ) VALUES (?, ?, ?, ?, ?, '{}', ?)
    `);
    insertCandidate.run(
      "candidate-later",
      runId,
      "signature-later",
      1,
      JSON.stringify([secondGarmentId, thirdGarmentId]),
      "2026-07-11T05:01:00.000Z"
    );
    insertCandidate.run(
      "candidate-earlier",
      runId,
      "signature-earlier",
      2,
      JSON.stringify([firstGarmentId, thirdGarmentId]),
      "2026-07-11T05:02:00.000Z"
    );

    const insertFeedback = db.prepare(`
      INSERT INTO recommendation_feedback (
        candidate_id, verdict, rating, actually_worn, reason_codes_json, comment,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const laterFeedbackId = Number(insertFeedback.run(
      "candidate-later",
      "disliked",
      2,
      0,
      JSON.stringify(["too-warm", "color"]),
      "太热",
      "2026-07-11T07:00:00.000Z",
      "2026-07-11T07:01:00.000Z"
    ).lastInsertRowid);
    const earlierFeedbackId = Number(insertFeedback.run(
      "candidate-earlier",
      "liked",
      5,
      1,
      "[]",
      "",
      "2026-07-11T06:00:00.000Z",
      "2026-07-11T06:01:00.000Z"
    ).lastInsertRowid);

    const insertPairStat = db.prepare(`
      INSERT INTO outfit_pair_stats (
        garment_a_id, garment_b_id, likes, dislikes, worn_count,
        total_feedback, signal, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertPairStat.run(secondGarmentId, thirdGarmentId, 0, 1, 0, 1, -2, "2026-07-11T07:01:00.000Z");
    insertPairStat.run(firstGarmentId, thirdGarmentId, 1, 0, 1, 1, 3, "2026-07-11T06:01:00.000Z");

    db.prepare("UPDATE garments SET availability_status = 'laundry' WHERE id = ?")
      .run(secondGarmentId);
    const insertAvailability = db.prepare(`
      INSERT INTO garment_availability_events (
        garment_id, previous_status, status, changed_at
      ) VALUES (?, ?, ?, ?)
    `);
    const laterEventId = Number(insertAvailability.run(
      secondGarmentId,
      "available",
      "laundry",
      "2026-07-11T09:00:00.000Z"
    ).lastInsertRowid);
    db.prepare("UPDATE garments SET availability_status = 'repair' WHERE id = ?")
      .run(firstGarmentId);
    const earlierEventId = Number(insertAvailability.run(
      firstGarmentId,
      "available",
      "repair",
      "2026-07-11T08:00:00.000Z"
    ).lastInsertRowid);

    const exported = buildOutfitExportV2(db, { now: () => FIXED_NOW });

    expect(exported.schemaVersion).toBe(4);
    expect(exported.features).toContain("feedback-availability");
    expect(exported.recommendationFeedback).toEqual([
      {
        id: earlierFeedbackId,
        candidateId: "candidate-earlier",
        verdict: "liked",
        rating: 5,
        actuallyWorn: true,
        reasonCodes: [],
        comment: "",
        createdAt: "2026-07-11T06:00:00.000Z",
        updatedAt: "2026-07-11T06:01:00.000Z"
      },
      {
        id: laterFeedbackId,
        candidateId: "candidate-later",
        verdict: "disliked",
        rating: 2,
        actuallyWorn: false,
        reasonCodes: ["too-warm", "color"],
        comment: "太热",
        createdAt: "2026-07-11T07:00:00.000Z",
        updatedAt: "2026-07-11T07:01:00.000Z"
      }
    ]);
    expect(exported.outfitPairStats).toEqual([
      {
        garmentAId: firstGarmentId,
        garmentBId: thirdGarmentId,
        likes: 1,
        dislikes: 0,
        wornCount: 1,
        totalFeedback: 1,
        signal: 3,
        updatedAt: "2026-07-11T06:01:00.000Z"
      },
      {
        garmentAId: secondGarmentId,
        garmentBId: thirdGarmentId,
        likes: 0,
        dislikes: 1,
        wornCount: 0,
        totalFeedback: 1,
        signal: -2,
        updatedAt: "2026-07-11T07:01:00.000Z"
      }
    ]);
    expect(exported.garmentAvailabilityEvents).toEqual([
      {
        id: earlierEventId,
        garmentId: firstGarmentId,
        previousStatus: "available",
        status: "repair",
        changedAt: "2026-07-11T08:00:00.000Z"
      },
      {
        id: laterEventId,
        garmentId: secondGarmentId,
        previousStatus: "available",
        status: "laundry",
        changedAt: "2026-07-11T09:00:00.000Z"
      }
    ]);
    expect(validateOutfitExport(exported)).toBe(exported);
  });

  it("rejects damaged feedback reason JSON with table, row, and column context", () => {
    const db = createDatabase(":memory:");
    const firstGarmentId = insertAssetGarment(db, "反馈衣物一");
    const secondGarmentId = insertAssetGarment(db, "反馈衣物二");
    const runId = Number(db.prepare(`
      INSERT INTO recommendation_runs (input_json, result_json)
      VALUES ('{}', '{}')
    `).run().lastInsertRowid);
    db.prepare(`
      INSERT INTO recommendation_candidates (
        candidate_id, run_id, signature, rank, item_ids_json, score_snapshot
      ) VALUES ('damaged-feedback', ?, 'signature', 1, ?, '{}')
    `).run(runId, JSON.stringify([firstGarmentId, secondGarmentId]));
    const feedbackId = Number(db.prepare(`
      INSERT INTO recommendation_feedback (
        candidate_id, reason_codes_json, comment, created_at, updated_at
      ) VALUES ('damaged-feedback', '[]', '', ?, ?)
    `).run(FIXED_NOW.toISOString(), FIXED_NOW.toISOString()).lastInsertRowid);

    db.exec("PRAGMA ignore_check_constraints = ON");
    db.prepare("UPDATE recommendation_feedback SET reason_codes_json = 'not-json' WHERE id = ?")
      .run(feedbackId);
    db.exec("PRAGMA ignore_check_constraints = OFF");
    expect(() => buildOutfitExportV2(db)).toThrow(
      new RegExp(`recommendation_feedback.*${feedbackId}.*reason_codes_json`, "i")
    );

    db.exec("PRAGMA ignore_check_constraints = ON");
    db.prepare("UPDATE recommendation_feedback SET reason_codes_json = '[\"invented\"]' WHERE id = ?")
      .run(feedbackId);
    db.exec("PRAGMA ignore_check_constraints = OFF");
    expect(() => buildOutfitExportV2(db)).toThrow(
      new RegExp(`recommendation_feedback.*${feedbackId}.*reason_codes_json.*FeedbackReason`, "i")
    );
  });

  it("exports active, archived, and derived saved outfits with immutable snapshots", () => {
    const db = createDatabase(":memory:");
    const insertGarment = db.prepare(`
      INSERT INTO garments (
        brand, name, raw_name, category, color, warmth, seasons, styles, formality,
        image_url, owned, confirmed, excluded, confidence, notes, origin
      ) VALUES (?, ?, ?, ?, 'black', 'medium', '["spring","autumn"]', '["casual"]',
        'casual', ?, 1, 1, 0, 1, '', 'manual')
    `);
    const originalTopId = Number(insertGarment.run(
      "原品牌",
      "原白衬衫",
      "原白衬衫",
      "top",
      "/api/garment-assets/11/content"
    ).lastInsertRowid);
    const replacementTopId = Number(insertGarment.run(
      "新品牌",
      "蓝衬衫",
      "蓝衬衫",
      "top",
      "/api/garment-assets/12/content"
    ).lastInsertRowid);
    const bottomId = Number(insertGarment.run(
      "",
      "黑长裤",
      "黑长裤",
      "bottom",
      ""
    ).lastInsertRowid);
    const original = createSavedOutfit(db, {
      name: "原始搭配",
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
    archiveSavedOutfit(db, original.id);
    db.prepare("UPDATE garments SET name = '后来改名', image_url = '' WHERE id = ?").run(originalTopId);
    archiveGarment(db, originalTopId);

    const exported = buildOutfitExportV2(db, { now: () => FIXED_NOW });
    expect(exported.savedOutfits).toHaveLength(2);
    const exportedOriginal = exported.savedOutfits!.find((outfit) => outfit.id === original.id);
    const exportedDerived = exported.savedOutfits!.find((outfit) => outfit.id === derived.id);
    expect(exportedOriginal).toMatchObject({
      id: original.id,
      archivedAt: expect.any(String),
      items: [
        expect.objectContaining({
          garmentId: originalTopId,
          garmentSnapshot: {
            id: originalTopId,
            name: "原白衬衫",
            brand: "原品牌",
            category: "top",
            imageUrl: "/api/garment-assets/11/content"
          }
        }),
        expect.objectContaining({ garmentId: bottomId })
      ]
    });
    expect(exportedDerived).toMatchObject({
      id: derived.id,
      source: "replacement",
      derivedFromOutfitId: original.id,
      items: [
        expect.objectContaining({ garmentId: replacementTopId }),
        expect.objectContaining({ garmentId: bottomId })
      ]
    });
    expect(validateOutfitExport(exported)).toBe(exported);
    expect(exported.features).toContain("saved-outfits");
  });

  it("rejects damaged or non-portable saved outfit snapshots", () => {
    const db = createDatabase(":memory:");
    const outfitId = Number(db.prepare(`
      INSERT INTO saved_outfits (name, notes, source, favorite)
      VALUES ('unsafe snapshot', '', 'manual', 0)
    `).run().lastInsertRowid);
    const item = db.prepare(`
      INSERT INTO saved_outfit_items (outfit_id, garment_id, slot, position, garment_snapshot)
      VALUES (?, NULL, 'top', 0, ?)
    `);
    const itemId = Number(item.run(outfitId, JSON.stringify({
      id: 99,
      name: "私密路径",
      brand: "",
      category: "top",
      imageUrl: "C:\\Users\\owner\\secret.webp"
    })).lastInsertRowid);
    expect(() => buildOutfitExportV2(db)).toThrow(
      /saved_outfit_items.*garment_snapshot.*imageUrl.*portable/i
    );

    db.prepare("UPDATE saved_outfit_items SET garment_snapshot = ? WHERE id = ?")
      .run(JSON.stringify({ id: 99, name: "缺少字段", category: "top", imageUrl: "" }), itemId);
    expect(() => buildOutfitExportV2(db)).toThrow(
      /saved_outfit_items.*garment_snapshot.*shape|saved_outfit_items.*invalid/i
    );
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

  it("rejects absolute filesystem paths and embedded image bytes from JSON backups", () => {
    const garmentDb = createDatabase(":memory:");
    const row = garmentDb.prepare(`
      INSERT INTO garments (
        name, category, color, warmth, seasons, styles, formality,
        materials, patterns, tags, image_url
      ) VALUES ('private path', 'top', 'black', 'medium', '[]', '[]', 'casual', '[]', '[]', '[]', ?)
    `).run("C:\\Users\\owner\\secret.webp");
    expect(() => buildOutfitExportV2(garmentDb)).toThrow(
      new RegExp(`garments.*${String(row.lastInsertRowid)}.*image_url.*portable`, "i")
    );
    garmentDb.prepare("UPDATE garments SET image_url = ? WHERE id = ?")
      .run("data:image/png;base64,SECRET_BYTES", Number(row.lastInsertRowid));
    expect(() => buildOutfitExportV2(garmentDb)).toThrow(/garments.*image_url.*portable/i);
    for (const unsafeReference of [
      "https://",
      "//C:/Users/owner/secret.webp",
      "/api/garment-assets/../../private",
      "/api/garment-assets/%252e%252e/private",
      "https://example.invalid/data:image/png;base64,SECRET_BYTES",
      " https://img.alicdn.com/space.webp "
    ]) {
      garmentDb.prepare("UPDATE garments SET image_url = ? WHERE id = ?")
        .run(unsafeReference, Number(row.lastInsertRowid));
      expect(() => buildOutfitExportV2(garmentDb), unsafeReference).toThrow(
        /garments.*image_url.*portable/i
      );
    }
    garmentDb.prepare("UPDATE garments SET image_url = ? WHERE id = ?")
      .run("/api/garment-thumbnails/local.webp", Number(row.lastInsertRowid));
    expect(JSON.stringify(buildOutfitExportV2(garmentDb))).not.toContain("SECRET_BYTES");

    const sourceDb = createDatabase(":memory:");
    const source = sourceDb.prepare(`
      INSERT INTO source_order_items (external_key, source, title, image_url, detail_images)
      VALUES ('source-private', 'test', 'private source', ?, ?)
    `).run("file:///C:/Users/owner/secret.webp", JSON.stringify(["https://img.alicdn.com/safe.webp"]));
    expect(() => buildOutfitExportV2(sourceDb)).toThrow(
      new RegExp(`source_order_items.*${String(source.lastInsertRowid)}.*image_url.*portable`, "i")
    );
    sourceDb.prepare("UPDATE source_order_items SET image_url = ?, detail_images = ? WHERE id = ?")
      .run(
        "https://img.alicdn.com/safe.webp",
        JSON.stringify(["data:image/png;base64,SECRET_SOURCE_BYTES"]),
        Number(source.lastInsertRowid)
      );
    expect(() => buildOutfitExportV2(sourceDb)).toThrow(/source_order_items.*detail_images.*portable/i);
  });

  it("always exports all active and inactive asset metadata without storage keys or image bytes", async () => {
    const db = createDatabase(":memory:");
    const garmentId = insertAssetGarment(db, "归档资产衣物");
    const assetRoot = await retainedAssetRoot();
    const firstUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const secondUuid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const firstInput = await testImage("png", 20, 21);
    const first = await saveGarmentImageAsset(db, garmentId, firstInput, "image/png", {
      assetRoot,
      uuidFactory: () => firstUuid
    });
    const second = await saveGarmentImageAsset(db, garmentId, await testImage("webp", 30, 31), "image/webp", {
      assetRoot,
      uuidFactory: () => secondUuid
    });
    db.prepare("UPDATE garments SET archived_at = ? WHERE id = ?")
      .run("2026-07-11T08:00:00.000Z", garmentId);

    const exported = buildOutfitExportV2(db, { now: () => FIXED_NOW });
    const json = JSON.stringify(exported);

    expect(exported.features).toContain("garment-assets");
    expect(exported.garments).toHaveLength(1);
    expect(exported.garments[0]).toMatchObject({ id: garmentId, archivedAt: "2026-07-11T08:00:00.000Z" });
    expect(exported.garmentAssets).toEqual([
      expect.objectContaining({
        id: first.asset.id,
        garmentId,
        active: false,
        archivePath: `assets/${first.asset.id}.webp`
      }),
      expect.objectContaining({
        id: second.asset.id,
        garmentId,
        active: true,
        archivePath: `assets/${second.asset.id}.webp`
      })
    ]);
    for (const asset of exported.garmentAssets ?? []) {
      expect(asset).not.toHaveProperty("storageKey");
      expect(asset).not.toHaveProperty("filePath");
      expect(asset).not.toHaveProperty("bytes");
    }
    expect(json).not.toContain(assetRoot);
    expect(json).not.toContain(firstUuid);
    expect(json).not.toContain(secondUuid);
    expect(json).not.toContain(firstInput.toString("base64"));
    expect(validateOutfitExport(exported)).toBe(exported);
  });

  it("streams a ZIP with fixed safe entry names and numeric asset IDs instead of storage keys", async () => {
    const db = createDatabase(":memory:");
    const garmentId = insertAssetGarment(db, "完整备份衣物");
    const assetRoot = await retainedAssetRoot();
    const firstUuid = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const secondUuid = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const first = await saveGarmentImageAsset(db, garmentId, await testImage("jpeg", 17, 19), "image/jpeg", {
      assetRoot,
      uuidFactory: () => firstUuid
    });
    const second = await saveGarmentImageAsset(db, garmentId, await testImage("png", 23, 29), "image/png", {
      assetRoot,
      uuidFactory: () => secondUuid
    });

    const preview = await previewOutfitExportZip(db, { assetRoot, now: () => FIXED_NOW });
    expect(preview).toMatchObject({
      assetCount: 2,
      includedAssetCount: 2,
      warnings: []
    });
    expect(preview.estimatedBytes).toBeGreaterThanOrEqual(first.asset.byteSize + second.asset.byteSize);

    const sourceFilesBefore = (await readdir(assetRoot)).sort();
    const { bytes, manifest } = await streamZip(db, assetRoot);
    expect((await readdir(assetRoot)).sort()).toEqual(sourceFilesBefore);
    expect(sourceFilesBefore.every((name) => name.endsWith(".webp"))).toBe(true);
    const entries = parseZipEntries(bytes);
    const names = [...entries.keys()].sort();
    expect(names).toEqual([
      `assets/${first.asset.id}.webp`,
      `assets/${second.asset.id}.webp`,
      "manifest.json",
      "outfit-export-v2.json"
    ].sort());
    for (const name of names) {
      expect(name).not.toMatch(/^[A-Za-z]:|^[/\\]/);
      expect(name).not.toContain("\\");
      expect(name.split("/")).not.toContain("..");
      expect(name).not.toContain(firstUuid);
      expect(name).not.toContain(secondUuid);
    }
    expect(createHash("sha256").update(entries.get(`assets/${first.asset.id}.webp`)! ).digest("hex"))
      .toBe(first.asset.sha256);
    expect(createHash("sha256").update(entries.get(`assets/${second.asset.id}.webp`)! ).digest("hex"))
      .toBe(second.asset.sha256);

    const exported = JSON.parse(entries.get("outfit-export-v2.json")!.toString("utf8"));
    const archivedManifest = JSON.parse(entries.get("manifest.json")!.toString("utf8"));
    expect(exported.garmentAssets).toHaveLength(2);
    expect(JSON.stringify(exported)).not.toContain("storage_key");
    expect(archivedManifest).toEqual(manifest);
    expect(manifest).toMatchObject({ assetCount: 2, includedAssetCount: 2, warnings: [] });
  });

  it("warns and skips missing, corrupt, and unsafe asset rows without leaking physical paths", async () => {
    const db = createDatabase(":memory:");
    const assetRoot = await retainedAssetRoot();
    const validGarment = insertAssetGarment(db, "有效资产");
    const validUuid = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const valid = await saveGarmentImageAsset(db, validGarment, await testImage("png", 14, 16), "image/png", {
      assetRoot,
      uuidFactory: () => validUuid
    });

    const missingUuid = "11111111-2222-4333-8444-555555555555";
    const corruptUuid = "66666666-7777-4888-8999-aaaaaaaaaaaa";
    const missingId = insertRawAsset(db, insertAssetGarment(db, "缺失资产"), `${missingUuid}.webp`, {
      byteSize: 20,
      sha256: "1".repeat(64)
    });
    const corruptBytes = await testImage("webp", 11, 13);
    await writeFile(join(assetRoot, `${corruptUuid}.webp`), corruptBytes);
    const corruptId = insertRawAsset(db, insertAssetGarment(db, "损坏资产"), `${corruptUuid}.webp`, {
      byteSize: corruptBytes.byteLength,
      sha256: "2".repeat(64)
    });
    const outsidePath = join(dirname(assetRoot), "private-outside.webp");
    const outsideBytes = await testImage("webp", 9, 9);
    await writeFile(outsidePath, outsideBytes);
    const unsafeStorageKey = "../private-outside.webp";
    const unsafeId = insertRawAsset(db, insertAssetGarment(db, "越界资产"), unsafeStorageKey, {
      byteSize: outsideBytes.byteLength,
      sha256: createHash("sha256").update(outsideBytes).digest("hex")
    });

    const preview = await previewOutfitExportZip(db, { assetRoot, now: () => FIXED_NOW });
    expect(preview).toMatchObject({ assetCount: 4, includedAssetCount: 1 });
    expect(preview.warnings.map((warning) => warning.assetId).sort((a, b) => a - b)).toEqual(
      [missingId, corruptId, unsafeId].sort((a, b) => a - b)
    );
    expect(preview.warnings.every((warning) => warning.code === "ASSET_UNAVAILABLE")).toBe(true);
    const previewJson = JSON.stringify(preview);
    expect(previewJson).not.toContain(assetRoot);
    expect(previewJson).not.toContain(outsidePath);
    expect(previewJson).not.toContain(missingUuid);
    expect(previewJson).not.toContain(corruptUuid);
    expect(previewJson).not.toContain(unsafeStorageKey);

    const { bytes, manifest } = await streamZip(db, assetRoot);
    const entries = parseZipEntries(bytes);
    expect(entries.has(`assets/${valid.asset.id}.webp`)).toBe(true);
    expect(entries.has(`assets/${missingId}.webp`)).toBe(false);
    expect(entries.has(`assets/${corruptId}.webp`)).toBe(false);
    expect(entries.has(`assets/${unsafeId}.webp`)).toBe(false);
    expect(manifest.warnings).toEqual(preview.warnings);
    expect(JSON.stringify(manifest)).not.toContain(assetRoot);
    expect(JSON.stringify(manifest)).not.toContain(outsidePath);
    expect(JSON.stringify(manifest)).not.toContain(unsafeStorageKey);
  });
});

function insertAssetGarment(db: AppDatabase, name: string): number {
  const result = db.prepare(`
    INSERT INTO garments (
      name, raw_name, category, color, warmth, seasons, styles, formality,
      image_url, owned, confirmed, excluded, confidence, notes, origin
    ) VALUES (?, ?, 'top', 'black', 'medium', '["spring"]', '["casual"]',
      'casual', '', 1, 1, 0, 1, '', 'manual')
  `).run(name, name);
  return Number(result.lastInsertRowid);
}

function insertRawAsset(
  db: AppDatabase,
  garmentId: number,
  storageKey: string,
  values: { byteSize: number; sha256: string }
): number {
  db.exec("PRAGMA ignore_check_constraints = ON");
  try {
    const result = db.prepare(`
      INSERT INTO garment_assets (
        garment_id, kind, storage_key, mime_type, byte_size, width, height, sha256, active
      ) VALUES (?, 'primary', ?, 'image/webp', ?, 1, 1, ?, 1)
    `).run(garmentId, storageKey, values.byteSize, values.sha256);
    return Number(result.lastInsertRowid);
  } finally {
    db.exec("PRAGMA ignore_check_constraints = OFF");
  }
}

async function retainedAssetRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "outfit-export-assets-test-"));
  await mkdir(root, { recursive: true });
  return root;
}

async function testImage(format: "jpeg" | "png" | "webp", width: number, height: number): Promise<Buffer> {
  const pipeline = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 30, g: 100, b: 190, alpha: 1 }
    }
  });
  if (format === "jpeg") return pipeline.jpeg().toBuffer();
  if (format === "png") return pipeline.png().toBuffer();
  return pipeline.webp().toBuffer();
}

async function streamZip(db: AppDatabase, assetRoot: string) {
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  const ended = new Promise<Buffer>((resolve, reject) => {
    output.once("end", () => resolve(Buffer.concat(chunks)));
    output.once("error", reject);
  });
  const manifest = await writeOutfitExportZip(db, output, {
    assetRoot,
    now: () => FIXED_NOW
  });
  return { bytes: await ended, manifest };
}

function parseZipEntries(zip: Buffer): Map<string, Buffer> {
  const endSignature = 0x06054b50;
  let endOffset = -1;
  for (let offset = zip.length - 22; offset >= Math.max(0, zip.length - 65_557); offset -= 1) {
    if (zip.readUInt32LE(offset) === endSignature) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("ZIP end-of-central-directory not found");
  const entryCount = zip.readUInt16LE(endOffset + 10);
  let centralOffset = zip.readUInt32LE(endOffset + 16);
  const entries = new Map<string, Buffer>();

  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(centralOffset) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory entry");
    }
    const compressionMethod = zip.readUInt16LE(centralOffset + 10);
    const compressedSize = zip.readUInt32LE(centralOffset + 20);
    const uncompressedSize = zip.readUInt32LE(centralOffset + 24);
    const nameLength = zip.readUInt16LE(centralOffset + 28);
    const extraLength = zip.readUInt16LE(centralOffset + 30);
    const commentLength = zip.readUInt16LE(centralOffset + 32);
    const localOffset = zip.readUInt32LE(centralOffset + 42);
    const name = zip.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString("utf8");
    if (zip.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error("Invalid ZIP local entry");
    }
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = zip.subarray(dataOffset, dataOffset + compressedSize);
    const content = compressionMethod === 0
      ? Buffer.from(compressed)
      : compressionMethod === 8
        ? inflateRawSync(compressed)
        : (() => { throw new Error(`Unsupported ZIP compression method ${compressionMethod}`); })();
    if (content.byteLength !== uncompressedSize) throw new Error("ZIP entry size mismatch");
    entries.set(name, content);
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
