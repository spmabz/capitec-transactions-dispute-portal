import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config";

export function createDatabase(dbPath = config.dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      account_number_masked TEXT NOT NULL,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      merchant_name TEXT NOT NULL,
      branch_name TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      account_number_masked TEXT NOT NULL,
      reference TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('posted', 'pending')),
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS disputes (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      reason_code TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('submitted', 'under_review', 'resolved', 'rejected')),
      resolution_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dispute_events (
      id TEXT PRIMARY KEY,
      dispute_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(dispute_id) REFERENCES disputes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_disputes_transaction_id ON disputes(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
    CREATE INDEX IF NOT EXISTS idx_dispute_events_dispute_id ON dispute_events(dispute_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
  `);

  // Backfill databases created before customer scoping was introduced.
  const transactionColumns = db.prepare("PRAGMA table_info(transactions)").all() as Array<{ name: string }>;
  if (!transactionColumns.some((column) => column.name === "customer_id")) {
    db.exec("ALTER TABLE transactions ADD COLUMN customer_id TEXT");
  }
  if (!transactionColumns.some((column) => column.name === "account_id")) {
    db.exec("ALTER TABLE transactions ADD COLUMN account_id TEXT");
  }

  const disputeColumns = db.prepare("PRAGMA table_info(disputes)").all() as Array<{ name: string }>;
  if (!disputeColumns.some((column) => column.name === "customer_id")) {
    db.exec("ALTER TABLE disputes ADD COLUMN customer_id TEXT");
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_accounts_customer_id ON accounts(customer_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions(customer_id);
    CREATE INDEX IF NOT EXISTS idx_disputes_customer_id ON disputes(customer_id);
  `);

  return db;
}

export type AppDatabase = ReturnType<typeof createDatabase>;
