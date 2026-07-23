import { createDatabase } from "./db";
import { createServerShutdown } from "./lifecycle";
import { createApiApp } from "./routes";
import { clearTaobaoCaptureJobs } from "./services/taobaoCapture";
import { clearVisionJobs } from "./services/vision";

const port = Number(process.env.PORT || 8788);
const db = createDatabase(process.env.OUTFIT_DATABASE_PATH || undefined);
const app = createApiApp(db);

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Outfit API listening on http://127.0.0.1:${port}`);
});
const shutdown = createServerShutdown({
  server,
  database: db,
  cleanups: [clearTaobaoCaptureJobs, clearVisionJobs]
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.log(`Received ${signal}; shutting down Outfit API...`);
    void shutdown()
      .then(() => {
        console.log("Outfit API shutdown complete.");
      })
      .catch((error) => {
        console.error("Outfit API shutdown failed.", error);
        process.exitCode = 1;
      });
  });
}
