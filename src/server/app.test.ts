// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createDatabase } from "./db";
import { seedDatabase } from "./seed";

let server: Server;
let baseUrl: string;
let tempDir: string;
let accessToken: string;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dispute-portal-app-"));
  const db = createDatabase(path.join(tempDir, "test.db"));
  seedDatabase(db);

  const app = createApp(db);
  server = app.listen(0);
  await once(server, "listening");

  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  const signInResponse = await fetch(`${baseUrl}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "sifiso@example.com", password: "capitec-demo-2026" })
  });
  const session = (await signInResponse.json()) as { accessToken: string };
  accessToken = session.accessToken;
});

afterAll(async () => {
  if (server.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function postDispute(body: unknown) {
  return fetch(`${baseUrl}/api/disputes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body)
  });
}

describe("dispute API", () => {
  it("creates a dispute for an eligible transaction", async () => {
    const response = await postDispute({
      transactionId: "txn-groceries-001",
      reasonCode: "unauthorised",
      description: "I did not authorise this point of sale purchase and need it investigated."
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { dispute: { status: string } };
    expect(body.dispute.status).toBe("under_review");
  });

  it("returns 400 for an invalid payload", async () => {
    const response = await postDispute({ transactionId: "txn-fuel-002", reasonCode: "unauthorised", description: "too short" });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { issues: unknown[] };
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("returns 404 for an unknown transaction", async () => {
    const response = await postDispute({
      transactionId: "txn-missing",
      reasonCode: "other",
      description: "This transaction id does not exist in the seeded dataset at all."
    });

    expect(response.status).toBe(404);
  });

  it("returns 409 when an active dispute already exists", async () => {
    const response = await postDispute({
      transactionId: "txn-fuel-002",
      reasonCode: "duplicate",
      description: "This transaction is already under review and should not accept another active case."
    });

    expect(response.status).toBe(409);
  });

  it("returns a JSON 404 for unknown API routes", async () => {
    const response = await fetch(`${baseUrl}/api/not-a-route`);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
  });
});
