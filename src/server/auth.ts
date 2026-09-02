import { createHash, scryptSync, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import type { RequestHandler } from "express";
import type { CustomerProfile, SessionResponse } from "@shared/types";
import type { AppDatabase } from "./db";

const sessionDurationInHours = 8;

type CustomerRow = {
  id: string;
  display_name: string;
  email: string;
  password_hash: string;
  account_id: string;
  product_name: string;
  account_number_masked: string;
};

function mapCustomer(row: CustomerRow): CustomerProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    account: {
      id: row.account_id,
      productName: row.product_name,
      accountNumberMasked: row.account_number_masked
    }
  };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string) {
  const salt = "capitec-dispute-portal-demo-v1";
  return scryptSync(password, salt, 64).toString("hex");
}

function findCustomer(db: AppDatabase, whereClause: string, value: string): CustomerRow | undefined {
  return db
    .prepare(
      `
        SELECT c.id, c.display_name, c.email, c.password_hash,
          a.id AS account_id, a.product_name, a.account_number_masked
        FROM customers c
        INNER JOIN accounts a ON a.customer_id = c.id
        WHERE ${whereClause}
        ORDER BY a.id ASC
        LIMIT 1
      `
    )
    .get(value) as CustomerRow | undefined;
}

export function authenticateCustomer(db: AppDatabase, email: string, password: string): CustomerProfile | null {
  const row = findCustomer(db, "c.email = ?", email.toLowerCase());
  if (!row) {
    return null;
  }

  const suppliedHash = Buffer.from(hashPassword(password), "hex");
  const storedHash = Buffer.from(row.password_hash, "hex");
  if (suppliedHash.length !== storedHash.length || !timingSafeEqual(suppliedHash, storedHash)) {
    return null;
  }

  return mapCustomer(row);
}

export function createSession(db: AppDatabase, customer: CustomerProfile): SessionResponse {
  const accessToken = nanoid(48);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + sessionDurationInHours * 60 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO sessions (id, customer_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(nanoid(), customer.id, hashToken(accessToken), expiresAt, createdAt);

  return { accessToken, expiresAt, customer };
}

export function getSession(db: AppDatabase, accessToken: string): CustomerProfile | null {
  const row = db
    .prepare(
      `
        SELECT c.id, c.display_name, c.email, c.password_hash,
          a.id AS account_id, a.product_name, a.account_number_masked
        FROM sessions s
        INNER JOIN customers c ON c.id = s.customer_id
        INNER JOIN accounts a ON a.customer_id = c.id
        WHERE s.token_hash = ? AND s.expires_at > ?
        ORDER BY a.id ASC
        LIMIT 1
      `
    )
    .get(hashToken(accessToken), new Date().toISOString()) as CustomerRow | undefined;

  return row ? mapCustomer(row) : null;
}

export function deleteSession(db: AppDatabase, accessToken: string) {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(accessToken));
}

export function requireSession(db: AppDatabase): RequestHandler {
  return (request, response, next) => {
    const authorization = request.header("authorization");
    const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
    const customer = accessToken ? getSession(db, accessToken) : null;

    if (!customer) {
      response.status(401).json({ message: "Sign in to access your dispute workspace." });
      return;
    }

    response.locals.customer = customer;
    response.locals.accessToken = accessToken;
    next();
  };
}
