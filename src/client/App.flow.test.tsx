import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const transaction = {
  id: "txn-groceries-001",
  merchantName: "Checkers Hyper",
  branchName: "Cape Town CBD",
  amountCents: 8245,
  currency: "ZAR",
  transactionDate: new Date().toISOString(),
  accountNumberMasked: "4700 **** **** 1021",
  reference: "POS-839201",
  description: "Point of sale purchase",
  category: "Groceries",
  status: "posted",
  disputeCount: 0,
  hasActiveDispute: false,
  eligibility: { eligible: true, reason: null }
};

const baseDashboard = {
  transactions: [transaction],
  disputes: [],
  metrics: { totalTransactions: 1, eligibleTransactions: 1, activeDisputes: 0, resolvedDisputes: 0 }
};

const sessionCustomer = {
  id: "cust-sifiso",
  displayName: "Sifiso M.",
  email: "sifiso@example.com",
  account: {
    id: "acc-sifiso-primary",
    productName: "Primary Cheque Account",
    accountNumberMasked: "4700 **** **** 1021"
  }
};

const createdDispute = {
  id: "abc123def456",
  transactionId: transaction.id,
  reasonCode: "unauthorised",
  description: "I did not authorise this point of sale purchase and want it investigated.",
  status: "under_review",
  resolutionNote: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  transaction,
  events: [
    { id: "e1", disputeId: "abc123def456", eventType: "submitted", message: "x", createdAt: new Date().toISOString() },
    { id: "e2", disputeId: "abc123def456", eventType: "under_review", message: "y", createdAt: new Date().toISOString() }
  ]
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let postBody: unknown = null;

beforeEach(() => {
  postBody = null;
  window.sessionStorage.setItem("portal-access-token", "test-token");
  vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.endsWith("/api/session") && (!init?.method || init.method === "GET")) {
      return jsonResponse({ customer: sessionCustomer });
    }

    if (url.endsWith("/api/dashboard")) {
      return jsonResponse(baseDashboard);
    }

    if (url.endsWith("/api/disputes") && init?.method === "POST") {
      postBody = JSON.parse(String(init.body));
      return jsonResponse({ dispute: createdDispute }, 201);
    }

    throw new Error(`unexpected request: ${init?.method ?? "GET"} ${url}`);
  });
});

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}

describe("dispute submission flow", () => {
  it("walks from transaction to submitted case", async () => {
    renderApp();

    await screen.findByText("Checkers Hyper");
    fireEvent.click(screen.getAllByRole("button", { name: "Raise dispute" })[0]);

    const dialog = await screen.findByRole("dialog", { name: "Raise a dispute" });

    // Guard: cannot reach the review step without a usable description.
    fireEvent.click(within(dialog).getByRole("button", { name: "Review dispute" }));
    expect(within(dialog).getByText(/at least 20 characters|describe what happened/i)).toBeInTheDocument();

    fireEvent.change(within(dialog).getByPlaceholderText(/Tell us what happened/i), {
      target: { value: "I did not authorise this point of sale purchase and want it investigated." }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Review dispute" }));

    await within(dialog).findByText("Confirm the details before you submit");
    fireEvent.click(within(dialog).getByLabelText(/I confirm that the information above is correct/i));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm and submit" }));

    expect(await screen.findByText("Your dispute has been submitted")).toBeInTheDocument();
    expect(screen.getByText("DSP-DEF456")).toBeInTheDocument();
    expect(postBody).toEqual({
      transactionId: "txn-groceries-001",
      reasonCode: "unauthorised",
      description: "I did not authorise this point of sale purchase and want it investigated."
    });
  });
});
