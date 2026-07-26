import type { AppDatabase } from "./db";

export interface ShutdownServer {
  close(callback?: (error?: Error) => void): void;
  closeIdleConnections?(): void;
  closeAllConnections?(): void;
}

export interface ServerShutdownOptions {
  server: ShutdownServer;
  database: AppDatabase;
  cleanups?: ReadonlyArray<() => void | Promise<void>>;
  forceCloseAfterMs?: number;
}

const DEFAULT_FORCE_CLOSE_AFTER_MS = 5000;

export function createServerShutdown(options: ServerShutdownOptions): () => Promise<void> {
  let shutdownPromise: Promise<void> | undefined;

  return () => {
    shutdownPromise ??= runServerShutdown(options);
    return shutdownPromise;
  };
}

async function runServerShutdown(options: ServerShutdownOptions): Promise<void> {
  const failures: unknown[] = [];
  const serverCompletion = closeServer(
    options.server,
    options.forceCloseAfterMs ?? DEFAULT_FORCE_CLOSE_AFTER_MS
  );

  for (const cleanup of options.cleanups ?? []) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error);
    }
  }

  try {
    await serverCompletion;
  } catch (error) {
    failures.push(error);
  }

  try {
    if (options.database.isOpen) {
      options.database.close();
    }
  } catch (error) {
    failures.push(error);
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, "API server shutdown failed");
  }
}

function closeServer(server: ShutdownServer, forceCloseAfterMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(forceTimer);
      if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") {
        reject(error);
        return;
      }
      resolve();
    };
    const forceTimer = setTimeout(() => {
      try {
        server.closeAllConnections?.();
        finish();
      } catch (error) {
        finish(error);
      }
    }, Math.max(1, forceCloseAfterMs));
    forceTimer.unref?.();

    try {
      server.close((error) => finish(error));
      server.closeIdleConnections?.();
    } catch (error) {
      finish(error);
    }
  });
}
