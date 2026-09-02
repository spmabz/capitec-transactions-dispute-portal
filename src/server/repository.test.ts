// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "./db";
import { PortalRepository } from "./repository";
import { seedDatabase } from "./seed";

const tempDirs: string[] = [];
const sifisoCustomerId = "cust-sifiso";
const leboCustomerId = "cust-lebo";

afterEach(() => {
  tempDirs.splice(0).forEach((directory) => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
});

function createRepository() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dispute-portal-"));
  tempDirs.push(tempDir);

  const db = createDatabase(path.join(tempDir, "test.db"));
  seedDatabase(db);

  return new PortalRepository(db);
}

describe("PortalRepository", () => {
  it("returns dashboard metrics with seeded history", () => {
    const repository = createRepository();
    const summary = repository.getSummary(sifisoCustomerId);

    expect(summary.transactions.length).toBeGreaterThan(0);
    expect(summary.disputes.length).toBeGreaterThan(0);
    expect(summary.metrics.activeDisputes).toBeGreaterThanOrEqual(1);
  });

  it("creates a dispute for an eligible transaction", () => {
    const repository = createRepository();

    const dispute = repository.createDispute(sifisoCustomerId, {
      transactionId: "txn-groceries-001",
      reasonCode: "unauthorised",
      description: "I did not authorise this point of sale purchase and need it investigated."
    });

    expect(dispute.status).toBe("under_review");
    expect(dispute.events.map((event) => event.eventType)).toEqual(["submitted", "under_review"]);

    const transaction = repository.listTransactions(sifisoCustomerId).find((item) => item.id === "txn-groceries-001");
    expect(transaction?.disputeCount).toBe(1);
    expect(transaction?.eligibility.eligible).toBe(false);
  });

  it("rejects duplicate active disputes", () => {
    const repository = createRepository();

    expect(() =>
      repository.createDispute(sifisoCustomerId, {
        transactionId: "txn-fuel-002",
        reasonCode: "duplicate",
        description: "This transaction is already under review and should not accept another active case."
      })
    ).toThrow(/active dispute/i);
  });

  it("does not expose another customer's transactions or disputes", () => {
    const repository = createRepository();

    expect(repository.listTransactions(leboCustomerId).map((transaction) => transaction.id)).toEqual(
      expect.arrayContaining(["txn-lebo-groceries-001"])
    );
    expect(repository.listTransactions(leboCustomerId).map((transaction) => transaction.id)).not.toContain("txn-groceries-001");
    expect(repository.listDisputes(leboCustomerId)).toEqual([]);

    expect(() =>
      repository.createDispute(leboCustomerId, {
        transactionId: "txn-groceries-001",
        reasonCode: "unauthorised",
        description: "I should not be able to create a dispute for another customer's transaction."
      })
    ).toThrow(/not found/i);
  });
});
