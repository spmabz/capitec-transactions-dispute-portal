import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(rootDir, "data", "disputes.db");

const candidates = [dbPath, `${dbPath}-shm`, `${dbPath}-wal`];
const dryRun = process.argv.includes("--dry-run");

const existing = candidates.filter((file) => fs.existsSync(file));

if (dryRun) {
  if (existing.length === 0) {
    console.log(`No database files found at ${dbPath}`);
  } else {
    console.log("Would remove:");
    for (const file of existing) {
      console.log(`- ${file}`);
    }
  }

  process.exit(0);
}

for (const file of existing) {
  fs.rmSync(file, { force: true });
}

console.log(existing.length > 0 ? `Database reset. Removed ${existing.length} file(s).` : `No database files found at ${dbPath}`);
console.log("Start the app again to recreate and reseed the database.");
