import type { Request } from "express";
import { createLoginRateLimiter } from "../server/loginRateLimiter";
import { describe, expect, it } from "vitest";

function requestFrom(remoteAddress: string): Request {
  return {
    socket: { remoteAddress }
  } as unknown as Request;
}

describe("login rate limiter", () => {
  it("preserves the five-failure limit for the same username and address", () => {
    const limiter = createLoginRateLimiter();
    const request = requestFrom("127.0.0.1");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      limiter.recordFailure(request, "Local_User");
    }

    expect(() => limiter.assertAllowed(request, "local_user")).toThrowError(
      expect.objectContaining({ code: "LOGIN_RATE_LIMITED", status: 429 })
    );
    limiter.reset(request, "LOCAL_USER");
    expect(() => limiter.assertAllowed(request, "local_user")).not.toThrow();
  });

  it("sweeps expired usernames and caps unique failure entries", () => {
    let now = 0;
    const limiter = createLoginRateLimiter({
      now: () => now,
      windowMs: 100,
      maxEntries: 3
    });
    const request = requestFrom("127.0.0.1");

    limiter.recordFailure(request, "one");
    now += 1;
    limiter.recordFailure(request, "two");
    now += 1;
    limiter.recordFailure(request, "three");
    now += 1;
    limiter.recordFailure(request, "four");

    expect(limiter.size()).toBe(3);

    now = 200;
    limiter.recordFailure(request, "fresh");
    expect(limiter.size()).toBe(1);
  });
});
