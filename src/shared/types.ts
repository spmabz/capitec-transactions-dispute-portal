export const disputeReasonCodes = [
  "unauthorised",
  "duplicate",
  "merchant-error",
  "cash-not-received",
  "goods-not-received",
  "other"
] as const;

export const disputeStatuses = [
  "submitted",
  "under_review",
  "resolved",
  "rejected"
] as const;

export type DisputeReasonCode = (typeof disputeReasonCodes)[number];
export type DisputeStatus = (typeof disputeStatuses)[number];
export type TransactionState = "posted" | "pending";

export type Transaction = {
  id: string;
  merchantName: string;
  branchName: string;
  amountCents: number;
  currency: string;
  transactionDate: string;
  accountNumberMasked: string;
  reference: string;
  description: string;
  category: string;
  status: TransactionState;
};

export type TransactionEligibility = {
  eligible: boolean;
  reason: string | null;
};

export type TransactionWithEligibility = Transaction & {
  disputeCount: number;
  hasActiveDispute: boolean;
  eligibility: TransactionEligibility;
};

export type Dispute = {
  id: string;
  transactionId: string;
  reasonCode: DisputeReasonCode;
  description: string;
  status: DisputeStatus;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DisputeEvent = {
  id: string;
  disputeId: string;
  eventType: string;
  message: string;
  createdAt: string;
};

export type DisputeRecord = Dispute & {
  transaction: Transaction;
  events: DisputeEvent[];
};

export type DashboardPayload = {
  transactions: TransactionWithEligibility[];
  disputes: DisputeRecord[];
};

export type CreateDisputeInput = {
  transactionId: string;
  reasonCode: DisputeReasonCode;
  description: string;
};

export type CustomerProfile = {
  id: string;
  displayName: string;
  email: string;
  account: {
    id: string;
    productName: string;
    accountNumberMasked: string;
  };
};

export type SessionResponse = {
  accessToken: string;
  expiresAt: string;
  customer: CustomerProfile;
};

export type LoginInput = {
  email: string;
  password: string;
};
