import type { AppDatabase } from "../server/db";
import {
  createServerShutdown,
  type ShutdownServer
} from "../server/lifecycle";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("API server lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shuts down the HTTP server, background jobs, and database exactly once", async () => {
    let closeCallback: ((error?: Error) => void) | undefined;
    const server = {
      close: vi.fn((callback?: (error?: Error) => void) => {
        closeCallback = callback;
      }),
      closeIdleConnections: vi.fn(),
      closeAllConnections: vi.fn()
    } satisfies ShutdownServer;
    const database = {
      isOpen: true,
      close: vi.fn(function (this: { isOpen: boolean }) {
        this.isOpen = false;
      })
    } as unknown as AppDatabase;
    const cleanup = vi.fn();
    const shutdown = createServerShutdown({
      server,
      database,
      cleanups: [cleanup],
      forceCloseAfterMs: 1000
    });

    const first = shutdown();
    const second = shutdown();

    expect(second).toBe(first);
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(server.closeIdleConnections).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(database.close).not.toHaveBeenCalled();

    closeCallback?.();
    await Promise.all([first, second]);

    expect(database.close).toHaveBeenCalledTimes(1);
    expect(database.isOpen).toBe(false);
    expect(server.closeAllConnections).not.toHaveBeenCalled();
  });

  it("forces lingering connections closed before closing the database", async () => {
    vi.useFakeTimers();
    const server = {
      close: vi.fn(),
      closeIdleConnections: vi.fn(),
      closeAllConnections: vi.fn()
    } satisfies ShutdownServer;
    const database = {
      isOpen: true,
      close: vi.fn(function (this: { isOpen: boolean }) {
        this.isOpen = false;
      })
    } as unknown as AppDatabase;
    const shutdown = createServerShutdown({
      server,
      database,
      forceCloseAfterMs: 25
    });

    const completion = shutdown();
    await vi.advanceTimersByTimeAsync(25);
    await completion;

    expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(database.close).toHaveBeenCalledTimes(1);
  });
});
