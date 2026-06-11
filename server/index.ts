import { createDatabase } from "./db";
import { createApiApp } from "./routes";

const port = Number(process.env.PORT || 8788);
const db = createDatabase();
const app = createApiApp(db);

app.listen(port, "127.0.0.1", () => {
  console.log(`Outfit API listening on http://127.0.0.1:${port}`);
});
