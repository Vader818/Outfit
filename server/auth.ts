import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AuthStatus, AuthUser } from "../src/shared/types";
import type { AppDatabase } from "./db";
import { ApiError } from "./validation";

export const AUTH_COOKIE_NAME = "outfit_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

interface UserRow {
  id: number;
  username: string;
  username_normalized: string;
  password_hash: string;
  password_salt: string;
}

interface SessionUserRow {
  id: number;
  username: string;
  expires_at: string;
}

export function getAuthStatus(db: AppDatabase, sessionToken?: string): AuthStatus {
  return {
    hasAccount: hasAccount(db),
    user: getUserForSession(db, sessionToken)
  };
}

export function hasAccount(db: AppDatabase): boolean {
  const row = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  return row.count > 0;
}

export function createFirstUser(db: AppDatabase, input: { username: string; password: string }): AuthUser {
  if (hasAccount(db)) {
    throw new ApiError("ACCOUNT_EXISTS", "已经创建过本地账号", 409);
  }
  const salt = randomBytes(16).toString("base64url");
  const passwordHash = hashPassword(input.password, salt);
  const normalized = normalizeUsername(input.username);
  const result = db.prepare(`
    INSERT INTO users (username, username_normalized, password_hash, password_salt)
    VALUES (?, ?, ?, ?)
  `).run(input.username, normalized, passwordHash, salt);
  return {
    id: Number(result.lastInsertRowid),
    username: input.username
  };
}

export function authenticateUser(db: AppDatabase, input: { username: string; password: string }): AuthUser {
  const row = db.prepare("SELECT * FROM users WHERE username_normalized = ?")
    .get(normalizeUsername(input.username)) as UserRow | undefined;
  if (!row || !verifyPassword(input.password, row.password_salt, row.password_hash)) {
    throw new ApiError("INVALID_CREDENTIALS", "用户名或密码错误", 401);
  }
  return toAuthUser(row);
}

export function createSession(db: AppDatabase, userId: number, now = new Date()): string {
  deleteExpiredSessions(db, now);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(hashToken(token), userId, expiresAt);
  return token;
}

export function getUserForSession(db: AppDatabase, sessionToken?: string, now = new Date()): AuthUser | null {
  if (!sessionToken) return null;
  const row = db.prepare(`
    SELECT users.id, users.username, sessions.expires_at
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
  `).get(hashToken(sessionToken)) as SessionUserRow | undefined;
  if (!row) return null;
  if (Date.parse(row.expires_at) <= now.getTime()) {
    deleteSession(db, sessionToken);
    return null;
  }
  return {
    id: row.id,
    username: row.username
  };
}

export function deleteSession(db: AppDatabase, sessionToken?: string): void {
  if (!sessionToken) return;
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(sessionToken));
}

function deleteExpiredSessions(db: AppDatabase, now: Date): void {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now.toISOString());
}

function normalizeUsername(username: string): string {
  return username.toLowerCase();
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    username: row.username
  };
}
