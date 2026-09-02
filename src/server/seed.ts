import { subDays } from "date-fns";
import { nanoid } from "nanoid";
import type { AppDatabase } from "./db";
import { hashPassword } from "./auth";

const sifisoCustomerId = "cust-sifiso";
const leboCustomerId = "cust-lebo";
const sifisoAccountId = "acc-sifiso-primary";
const leboAccountId = "acc-lebo-primary";

function isoDate(daysAgo: number) {
  return subDays(new Date(), daysAgo).toISOString();
}

export function seedDatabase(db: AppDatabase) {
  const seedProfiles = db.transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO customers (id, display_name, email, password_hash) VALUES (?, ?, ?, ?)`
    ).run(sifisoCustomerId, "Sifiso M.", "sifiso@example.com", hashPassword("capitec-demo-2026"));
    db.prepare(
      `INSERT OR IGNORE INTO customers (id, display_name, email, password_hash) VALUES (?, ?, ?, ?)`
    ).run(leboCustomerId, "Lebo D.", "lebo@example.com", hashPassword("capitec-demo-2026"));

    db.prepare(
      `INSERT OR IGNORE INTO accounts (id, customer_id, product_name, account_number_masked) VALUES (?, ?, ?, ?)`
    ).run(sifisoAccountId, sifisoCustomerId, "Primary Cheque Account", "4700 **** **** 1021");
    db.prepare(
      `INSERT OR IGNORE INTO accounts (id, customer_id, product_name, account_number_masked) VALUES (?, ?, ?, ?)`
    ).run(leboAccountId, leboCustomerId, "Global One Account", "4700 **** **** 4438");

    // Existing demo data predates scoping, so its owner is explicitly preserved.
    db.prepare("UPDATE transactions SET customer_id = ?, account_id = ? WHERE customer_id IS NULL OR account_id IS NULL").run(
      sifisoCustomerId,
      sifisoAccountId
    );
    db.prepare(
      `
        UPDATE disputes
        SET customer_id = (
          SELECT customer_id FROM transactions WHERE transactions.id = disputes.transaction_id
        )
        WHERE customer_id IS NULL
      `
    ).run();
  });

  seedProfiles();

  const transactionCount =
    (db.prepare("SELECT COUNT(*) AS count FROM transactions").get() as { count: number }).count ?? 0;
  const isExistingDatabase = transactionCount > 0;

  const insertTransaction = db.prepare(`
    INSERT OR IGNORE INTO transactions (
      id, customer_id, account_id, merchant_name, branch_name, amount_cents, currency, transaction_date,
      account_number_masked, reference, description, category, status
    ) VALUES (
      @id, @customer_id, @account_id, @merchant_name, @branch_name, @amount_cents, @currency, @transaction_date,
      @account_number_masked, @reference, @description, @category, @status
    )
  `);

  const insertDispute = db.prepare(`
    INSERT OR IGNORE INTO disputes (
      id, customer_id, transaction_id, reason_code, description, status, resolution_note, created_at, updated_at
    ) VALUES (
      @id, @customer_id, @transaction_id, @reason_code, @description, @status, @resolution_note, @created_at, @updated_at
    )
  `);

  const insertEvent = db.prepare(`
    INSERT INTO dispute_events (id, dispute_id, event_type, message, created_at)
    VALUES (@id, @dispute_id, @event_type, @message, @created_at)
  `);

  const transactions = [
    {
      id: "txn-groceries-001",
      merchant_name: "Checkers Hyper",
      branch_name: "Cape Town CBD",
      amount_cents: 8245,
      currency: "ZAR",
      transaction_date: isoDate(2),
      account_number_masked: "4700 **** **** 1021",
      reference: "POS-839201",
      description: "Point of sale purchase",
      category: "Groceries",
      status: "posted"
    },
    {
      id: "txn-fuel-002",
      merchant_name: "Shell Sandton",
      branch_name: "Sandton City",
      amount_cents: 113900,
      currency: "ZAR",
      transaction_date: isoDate(4),
      account_number_masked: "4700 **** **** 1021",
      reference: "POS-128390",
      description: "Fuel purchase",
      category: "Transport",
      status: "posted"
    },
    {
      id: "txn-transfer-003",
      merchant_name: "Instant EFT",
      branch_name: "Digital",
      amount_cents: 255000,
      currency: "ZAR",
      transaction_date: isoDate(7),
      account_number_masked: "4700 **** **** 1021",
      reference: "EFT-481928",
      description: "Transfer to beneficiary",
      category: "Transfers",
      status: "posted"
    },
    {
      id: "txn-ecommerce-004",
      merchant_name: "Takealot",
      branch_name: "Online",
      amount_cents: 64999,
      currency: "ZAR",
      transaction_date: isoDate(11),
      account_number_masked: "4700 **** **** 1021",
      reference: "ECM-552011",
      description: "Card not present purchase",
      category: "Shopping",
      status: "posted"
    },
    {
      id: "txn-airtime-005",
      merchant_name: "Capitec Airtime",
      branch_name: "Digital",
      amount_cents: 5000,
      currency: "ZAR",
      transaction_date: isoDate(18),
      account_number_masked: "4700 **** **** 1021",
      reference: "AIR-118822",
      description: "Prepaid airtime top-up",
      category: "Utilities",
      status: "posted"
    },
    {
      id: "txn-restaurant-006",
      merchant_name: "Moyo Melrose Arch",
      branch_name: "Johannesburg",
      amount_cents: 23950,
      currency: "ZAR",
      transaction_date: isoDate(28),
      account_number_masked: "4700 **** **** 1021",
      reference: "POS-912731",
      description: "Restaurant payment",
      category: "Dining",
      status: "posted"
    },
    {
      id: "txn-pharmacy-007",
      merchant_name: "Clicks Pharmacy",
      branch_name: "Pretoria East",
      amount_cents: 18990,
      currency: "ZAR",
      transaction_date: isoDate(39),
      account_number_masked: "4700 **** **** 1021",
      reference: "POS-155003",
      description: "Pharmacy checkout",
      category: "Health",
      status: "posted"
    },
    {
      id: "txn-subscription-008",
      merchant_name: "Spotify",
      branch_name: "Online",
      amount_cents: 6999,
      currency: "ZAR",
      transaction_date: isoDate(49),
      account_number_masked: "4700 **** **** 1021",
      reference: "SUB-311420",
      description: "Monthly subscription",
      category: "Entertainment",
      status: "posted"
    },
    {
      id: "txn-old-009",
      merchant_name: "Builders Warehouse",
      branch_name: "Durban North",
      amount_cents: 332100,
      currency: "ZAR",
      transaction_date: isoDate(79),
      account_number_masked: "4700 **** **** 1021",
      reference: "POS-600920",
      description: "Home improvement purchase",
      category: "Home",
      status: "posted"
    },
    {
      id: "txn-pending-010",
      merchant_name: "Uber",
      branch_name: "Digital",
      amount_cents: 18500,
      currency: "ZAR",
      transaction_date: isoDate(1),
      account_number_masked: "4700 **** **** 1021",
      reference: "PEN-100932",
      description: "Pending ride charge",
      category: "Transport",
      status: "pending"
    },
    {
      id: "txn-lebo-groceries-001",
      merchant_name: "Woolworths Food",
      branch_name: "Rosebank",
      amount_cents: 15750,
      currency: "ZAR",
      transaction_date: isoDate(3),
      account_number_masked: "4700 **** **** 4438",
      reference: "POS-770122",
      description: "Point of sale purchase",
      category: "Groceries",
      status: "posted"
    },
    {
      id: "txn-lebo-streaming-002",
      merchant_name: "Netflix",
      branch_name: "Online",
      amount_cents: 19900,
      currency: "ZAR",
      transaction_date: isoDate(16),
      account_number_masked: "4700 **** **** 4438",
      reference: "SUB-120477",
      description: "Streaming subscription",
      category: "Entertainment",
      status: "posted"
    },
    {
      id: "txn-lebo-pending-003",
      merchant_name: "Uber",
      branch_name: "Digital",
      amount_cents: 9200,
      currency: "ZAR",
      transaction_date: isoDate(1),
      account_number_masked: "4700 **** **** 4438",
      reference: "PEN-883214",
      description: "Pending ride charge",
      category: "Transport",
      status: "pending"
    }
  ];

  const disputes = [
    {
      id: "dis-001",
      transaction_id: "txn-fuel-002",
      reason_code: "duplicate",
      description: "The same fuel transaction appears twice on my statement.",
      status: "under_review",
      resolution_note: null,
      created_at: isoDate(3),
      updated_at: isoDate(1)
    },
    {
      id: "dis-002",
      transaction_id: "txn-ecommerce-004",
      reason_code: "goods-not-received",
      description: "The order was cancelled by the merchant but the charge was retained.",
      status: "resolved",
      resolution_note: "Chargeback accepted. Funds reversed to customer account.",
      created_at: isoDate(10),
      updated_at: isoDate(4)
    },
    {
      id: "dis-003",
      transaction_id: "txn-subscription-008",
      reason_code: "merchant-error",
      description: "This subscription should have been cancelled before renewal.",
      status: "rejected",
      resolution_note: "Merchant supplied proof of service and cancellation timestamp was after renewal.",
      created_at: isoDate(44),
      updated_at: isoDate(41)
    }
  ];

  const disputeEvents = [
    {
      id: nanoid(),
      dispute_id: "dis-001",
      event_type: "submitted",
      message: "Dispute submitted through the customer portal.",
      created_at: isoDate(3)
    },
    {
      id: nanoid(),
      dispute_id: "dis-001",
      event_type: "under_review",
      message: "Case assigned to digital payments operations.",
      created_at: isoDate(1)
    },
    {
      id: nanoid(),
      dispute_id: "dis-002",
      event_type: "submitted",
      message: "Dispute submitted through the customer portal.",
      created_at: isoDate(10)
    },
    {
      id: nanoid(),
      dispute_id: "dis-002",
      event_type: "resolved",
      message: "Merchant acknowledged cancellation and reversal has been processed.",
      created_at: isoDate(4)
    },
    {
      id: nanoid(),
      dispute_id: "dis-003",
      event_type: "submitted",
      message: "Dispute submitted through the customer portal.",
      created_at: isoDate(44)
    },
    {
      id: nanoid(),
      dispute_id: "dis-003",
      event_type: "rejected",
      message: "Case closed after evidence review.",
      created_at: isoDate(41)
    }
  ];

  const transactionInsertMany = db.transaction(() => {
    transactions.forEach((transaction) => {
      const isLebo = transaction.id.startsWith("txn-lebo-");
      insertTransaction.run({
        ...transaction,
        customer_id: isLebo ? leboCustomerId : sifisoCustomerId,
        account_id: isLebo ? leboAccountId : sifisoAccountId
      });
    });
    disputes.forEach((dispute) => insertDispute.run({ ...dispute, customer_id: sifisoCustomerId }));
    if (!isExistingDatabase) {
      disputeEvents.forEach((event) => insertEvent.run(event));
    }
  });

  transactionInsertMany();
}
