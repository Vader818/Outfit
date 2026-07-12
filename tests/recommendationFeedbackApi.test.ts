import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase, type AppDatabase } from "../server/db";
import { createApiApp } from "../server/routes";
import { upsertRecommendationFeedback } from "../server/services/recommendationFeedback";

const CANDIDATE_WITH_FEEDBACK = "11111111-1111-4111-8111-111111111111";
const CANDIDATE_WITHOUT_FEEDBACK = "22222222-2222-4222-8222-222222222222";
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe("recommendation feedback candidate API", () => {
  it("requires authentication and returns either the persisted feedback or null", async () => {
    const db = createDatabase(":memory:");
    const top = insertGarment(db, "白衬衫", "top");
    const bottom = insertGarment(db, "黑长裤", "bottom");
    insertCandidate(db, CANDIDATE_WITH_FEEDBACK, [top, bottom]);
    insertCandidate(db, CANDIDATE_WITHOUT_FEEDBACK, [top, bottom]);
    upsertRecommendationFeedback(db, {
      candidateId: CANDIDATE_WITH_FEEDBACK,
      verdict: "disliked",
      rating: 2,
      actuallyWorn: true,
      reasonCodes: ["fit"],
      comment: "版型不适合"
    });
    const { baseUrl, authCookie } = await startAuthenticatedApp(db);

    const unauthenticated = await fetch(
      `${baseUrl}/api/recommendation-feedback/${CANDIDATE_WITH_FEEDBACK}`
    );
    expect(unauthenticated.status).toBe(401);

    const persisted = await fetch(
      `${baseUrl}/api/recommendation-feedback/${CANDIDATE_WITH_FEEDBACK}`,
      { headers: { cookie: authCookie } }
    );
    expect(persisted.status).toBe(200);
    await expect(persisted.json()).resolves.toMatchObject({
      candidateId: CANDIDATE_WITH_FEEDBACK,
      verdict: "disliked",
      rating: 2,
      actuallyWorn: true,
      reasonCodes: ["fit"],
      comment: "版型不适合",
      wearLogId: expect.any(Number)
    });

    const clearedFields = await fetch(`${baseUrl}/api/recommendation-feedback`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: authCookie,
        origin: "http://127.0.0.1"
      },
      body: JSON.stringify({
        candidateId: CANDIDATE_WITH_FEEDBACK,
        verdict: "liked",
        rating: null,
        actuallyWorn: false,
        reasonCodes: [],
        comment: ""
      })
    });
    expect(clearedFields.status).toBe(200);
    const clearedBody = await clearedFields.json() as {
      feedback: Record<string, unknown>;
    };
    expect(clearedBody.feedback).toMatchObject({
      candidateId: CANDIDATE_WITH_FEEDBACK,
      verdict: "liked",
      actuallyWorn: true,
      reasonCodes: [],
      comment: ""
    });
    expect(clearedBody.feedback).not.toHaveProperty("rating");

    const reopened = await fetch(
      `${baseUrl}/api/recommendation-feedback/${CANDIDATE_WITH_FEEDBACK}`,
      { headers: { cookie: authCookie } }
    );
    expect(reopened.status).toBe(200);
    const reopenedBody = await reopened.json();
    expect(reopenedBody).toMatchObject({
      verdict: "liked",
      actuallyWorn: true,
      reasonCodes: [],
      comment: ""
    });
    expect(reopenedBody).not.toHaveProperty("rating");

    const empty = await fetch(
      `${baseUrl}/api/recommendation-feedback/${CANDIDATE_WITHOUT_FEEDBACK}`,
      { headers: { cookie: authCookie } }
    );
    expect(empty.status).toBe(200);
    await expect(empty.json()).resolves.toBeNull();
  });
});

function insertGarment(db: AppDatabase, name: string, category: string): number {
  return Number(db.prepare(`
    INSERT INTO garments (
      name, category, color, warmth, seasons, styles, formality, confirmed
    ) VALUES (?, ?, 'black', 'medium', '["spring"]', '["casual"]', 'casual', 1)
  `).run(name, category).lastInsertRowid);
}

function insertCandidate(db: AppDatabase, candidateId: string, itemIds: number[]): void {
  const runId = Number(db.prepare(`
    INSERT INTO recommendation_runs (input_json, result_json) VALUES ('{}', '{}')
  `).run().lastInsertRowid);
  db.prepare(`
    INSERT INTO recommendation_candidates (
      candidate_id, run_id, signature, rank, item_ids_json, score_snapshot
    ) VALUES (?, ?, ?, 1, ?, '{}')
  `).run(candidateId, runId, `signature-${candidateId}`, JSON.stringify(itemIds));
}

async function startAuthenticatedApp(db: AppDatabase): Promise<{ baseUrl: string; authCookie: string }> {
  const server = createApiApp(db).listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test server address");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1"
    },
    body: JSON.stringify({ username: "feedback_reader", password: "correct-password" })
  });
  expect(response.status).toBe(201);
  const authCookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!authCookie) throw new Error("missing auth cookie");
  return { baseUrl, authCookie };
}
