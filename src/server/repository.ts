import { differenceInCalendarDays } from "date-fns";
import { nanoid } from "nanoid";
import type { CreateDisputeInput, DisputeEvent, DisputeRecord, Transaction, TransactionWithEligibility } from "@shared/types";
import type { AppDatabase } from "./db";

const activeDisputeStates = new Set(["submitted", "under_review"]);
const disputeWindowInDays = 60;

type TransactionRow = {
  id: string;
  merchant_name: string;
  branch_name: string;
  amount_cents: number;
  currency: string;
  transaction_date: string;
  account_number_masked: string;
  reference: string;
  description: string;
  category: string;
  status: "posted" | "pending";
  dispute_count: number;
  active_dispute_count: number;
};

type DisputeRow = {
  id: string;
  transaction_id: string;
  reason_code: any;
  description: string;
  status: any;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
  merchant_name: string;
  branch_name: string;
  amount_cents: number;
  currency: string;
  transaction_date: string;
  account_number_masked: string;
  reference: string;
  transaction_description: string;
  category: string;
  transaction_status: "posted" | "pending";
};

function mapTransaction(row: TransactionRow): TransactionWithEligibility {
  const transaction: Transaction = {
    id: row.id,
    merchantName: row.merchant_name,
    branchName: row.branch_name,
    amountCents: row.amount_cents,
    currency: row.currency,
    transactionDate: row.transaction_date,
    accountNumberMasked: row.account_number_masked,
    reference: row.reference,
    description: row.description,
    category: row.category,
    status: row.status
  };

  const hasActiveDispute = row.active_dispute_count > 0;
  const ageInDays = differenceInCalendarDays(new Date(), new Date(row.transaction_date));

  let reason: string | null = null;
  let eligible = true;

  if (transaction.status !== "posted") {
    eligible = false;
    reason = "Only posted transactions can be disputed.";
  } else if (ageInDays > disputeWindowInDays) {
    eligible = false;
    reason = "The dispute window has expired for this transaction.";
  } else if (hasActiveDispute) {
    eligible = false;
    reason = "There is already an active dispute for this transaction.";
  }

  return {
    ...transaction,
    disputeCount: row.dispute_count,
    hasActiveDispute,
    eligibility: {
      eligible,
      reason
    }
  };
}

export class PortalRepository {
  constructor(private readonly db: AppDatabase) {}

  listTransactions(customerId: string): TransactionWithEligibility[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            t.*,
            COUNT(d.id) AS dispute_count,
            COUNT(CASE WHEN d.status IN ('submitted', 'under_review') THEN 1 END) AS active_dispute_count
          FROM transactions t
          LEFT JOIN disputes d ON d.transaction_id = t.id
          WHERE t.customer_id = ?
          GROUP BY t.id
          ORDER BY t.transaction_date DESC
        `
      )
      .all(customerId) as TransactionRow[];

    return rows.map(mapTransaction);
  }

  listDisputes(customerId: string): DisputeRecord[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            d.*,
            t.merchant_name,
            t.branch_name,
            t.amount_cents,
            t.currency,
            t.transaction_date,
            t.account_number_masked,
            t.reference,
            t.description AS transaction_description,
            t.category,
            t.status AS transaction_status
          FROM disputes d
          INNER JOIN transactions t ON t.id = d.transaction_id
          WHERE d.customer_id = ? AND t.customer_id = ?
          ORDER BY d.created_at DESC
        `
      )
      .all(customerId, customerId) as DisputeRow[];

    const eventRows = this.db
      .prepare(
        `
          SELECT e.id, e.dispute_id, e.event_type, e.message, e.created_at
          FROM dispute_events e
          INNER JOIN disputes d ON d.id = e.dispute_id
          WHERE d.customer_id = ?
          ORDER BY e.created_at ASC
        `
      )
      .all(customerId) as Array<{
      id: string;
      dispute_id: string;
      event_type: string;
      message: string;
      created_at: string;
    }>;

    const eventsByDispute = new Map<string, DisputeEvent[]>();

    eventRows.forEach((event) => {
      const mappedEvent: DisputeEvent = {
        id: event.id,
        disputeId: event.dispute_id,
        eventType: event.event_type,
        message: event.message,
        createdAt: event.created_at
      };

      const current = eventsByDispute.get(event.dispute_id) ?? [];
      current.push(mappedEvent);
      eventsByDispute.set(event.dispute_id, current);
    });

    return rows.map((row) => ({
      id: row.id,
      transactionId: row.transaction_id,
      reasonCode: row.reason_code,
      description: row.description,
      status: row.status,
      resolutionNote: row.resolution_note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      transaction: {
        id: row.transaction_id,
        merchantName: row.merchant_name,
        branchName: row.branch_name,
        amountCents: row.amount_cents,
        currency: row.currency,
        transactionDate: row.transaction_date,
        accountNumberMasked: row.account_number_masked,
        reference: row.reference,
        description: row.transaction_description,
        category: row.category,
        status: row.transaction_status
      },
      events: eventsByDispute.get(row.id) ?? []
    }));
  }

  createDispute(customerId: string, input: CreateDisputeInput) {
    const transaction = this.listTransactions(customerId).find((item) => item.id === input.transactionId);

    if (!transaction) {
      throw new Error("Transaction not found.");
    }

    if (!transaction.eligibility.eligible) {
      throw new Error(transaction.eligibility.reason ?? "Transaction is not eligible for dispute.");
    }

    const submittedAt = new Date().toISOString();
    const underReviewAt = new Date(Date.now() + 60 * 1000).toISOString();
    const disputeId = nanoid();

    const writeDispute = this.db.transaction(() => {
      this.db
        .prepare(
          `
            INSERT INTO disputes (
              id, customer_id, transaction_id, reason_code, description, status, resolution_note, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'submitted', NULL, ?, ?)
          `
        )
        .run(disputeId, customerId, input.transactionId, input.reasonCode, input.description, submittedAt, submittedAt);

      this.db
        .prepare(
          `
            INSERT INTO dispute_events (id, dispute_id, event_type, message, created_at)
            VALUES (?, ?, 'submitted', ?, ?)
          `
        )
        .run(
          nanoid(),
          disputeId,
          "Dispute submitted through the customer portal and queued for investigation.",
          submittedAt
        );

      this.db
        .prepare(
          `
            UPDATE disputes
            SET status = 'under_review', updated_at = ?
            WHERE id = ?
          `
        )
        .run(underReviewAt, disputeId);

      this.db
        .prepare(
          `
            INSERT INTO dispute_events (id, dispute_id, event_type, message, created_at)
            VALUES (?, ?, 'under_review', ?, ?)
          `
        )
        .run(
          nanoid(),
          disputeId,
          "Case automatically moved to under review after intake validation.",
          underReviewAt
        );
    });

    writeDispute();

    return this.listDisputes(customerId).find((dispute) => dispute.id === disputeId)!;
  }

  getSummary(customerId: string) {
    const transactions = this.listTransactions(customerId);
    const disputes = this.listDisputes(customerId);

    return {
      transactions,
      disputes,
      metrics: {
        totalTransactions: transactions.length,
        eligibleTransactions: transactions.filter((transaction) => transaction.eligibility.eligible).length,
        activeDisputes: disputes.filter((dispute) => activeDisputeStates.has(dispute.status)).length,
        resolvedDisputes: disputes.filter((dispute) => dispute.status === "resolved").length
      }
    };
  }
}
