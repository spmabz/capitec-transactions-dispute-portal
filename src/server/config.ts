import path from "node:path";

const rootDir = process.cwd();

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dataDir: path.join(rootDir, "data"),
  dbPath: process.env.DB_PATH ?? path.join(rootDir, "data", "disputes.db"),
  clientDistDir: path.join(rootDir, "dist", "client")
};
