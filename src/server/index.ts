import { createApp } from "./app";
import { config } from "./config";
import { createDatabase } from "./db";
import { seedDatabase } from "./seed";

const db = createDatabase(config.dbPath);
seedDatabase(db);

const app = createApp(db, config.clientDistDir);

app.listen(config.port, () => {
  console.log(`Transactions dispute portal running on port ${config.port}`);
});
