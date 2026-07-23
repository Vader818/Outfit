import type { Request } from "express";
import { ApiError } from "./validation";

export interface LoginRateLimiterOptions {
  maxFailures?: number;
  windowMs?: number;
  maxEntries?: number;
  now?: () => number;
}

export interface LoginRateLimiter {
  assertAllowed(request: Request, username: string): void;
  recordFailure(request: Request, username: string): void;
  reset(request: Request, username: string): void;
  size(): number;
}

const DEFAULT_MAX_FAILURES = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 1024;

export function createLoginRateLimiter(options: LoginRateLimiterOptions = {}): LoginRateLimiter {
  const failures = new Map<string, { count: number; firstFailureAt: number }>();
  const maxFailures = positiveInteger(options.maxFailures, DEFAULT_MAX_FAILURES);
  const windowMs = positiveInteger(options.windowMs, DEFAULT_WINDOW_MS);
  const maxEntries = positiveInteger(options.maxEntries, DEFAULT_MAX_ENTRIES);
  const now = options.now ?? Date.now;

  function key(request: Request, username: string): string {
    return `${username.toLowerCase()}|${request.socket.remoteAddress || "unknown"}`;
  }

  function sweepExpired(currentTime: number): void {
    for (const [entryKey, entry] of failures) {
      if (currentTime - entry.firstFailureAt >= windowMs) {
        failures.delete(entryKey);
      }
    }
  }

  function currentEntry(request: Request, username: string): { count: number; firstFailureAt: number } | undefined {
    const currentTime = now();
    sweepExpired(currentTime);
    return failures.get(key(request, username));
  }

  function evictOldestEntry(): void {
    let oldestKey: string | undefined;
    let oldestTimestamp = Number.POSITIVE_INFINITY;
    for (const [entryKey, entry] of failures) {
      if (entry.firstFailureAt < oldestTimestamp) {
        oldestKey = entryKey;
        oldestTimestamp = entry.firstFailureAt;
      }
    }
    if (oldestKey !== undefined) {
      failures.delete(oldestKey);
    }
  }

  return {
    assertAllowed(request, username) {
      const entry = currentEntry(request, username);
      if (entry && entry.count >= maxFailures) {
        throw new ApiError("LOGIN_RATE_LIMITED", "登录失败次数过多，请稍后再试", 429);
      }
    },
    recordFailure(request, username) {
      const entryKey = key(request, username);
      const entry = currentEntry(request, username);
      if (!entry) {
        if (failures.size >= maxEntries) {
          evictOldestEntry();
        }
        failures.set(entryKey, { count: 1, firstFailureAt: now() });
        return;
      }
      entry.count += 1;
      failures.set(entryKey, entry);
    },
    reset(request, username) {
      failures.delete(key(request, username));
    },
    size() {
      sweepExpired(now());
      return failures.size;
    }
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0
    ? Math.floor(Number(value))
    : fallback;
}
