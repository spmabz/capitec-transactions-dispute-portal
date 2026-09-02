import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";

const dashboardPayload = {
  transactions: [
    {
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
      eligibility: {
        eligible: true,
        reason: null
      }
    }
  ],
  disputes: [],
  metrics: {
    totalTransactions: 1,
    eligibleTransactions: 1,
    activeDisputes: 0,
    resolvedDisputes: 0
  }
};

describe("App", () => {
  it("renders dashboard data from the API", async () => {
    const queryClient = new QueryClient();

    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          customer: {
            id: "cust-sifiso",
            displayName: "Sifiso M.",
            email: "sifiso@example.com",
            account: {
              id: "acc-sifiso-primary",
              productName: "Primary Cheque Account",
              accountNumberMasked: "4700 **** **** 1021"
            }
          }
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );
    window.sessionStorage.setItem("portal-access-token", "test-token");

    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(dashboardPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText("Transactions Dispute Portal").length).toBeGreaterThan(0);
    });

    expect(screen.getByText("Checkers Hyper")).toBeInTheDocument();
    expect(screen.getByText("Raise dispute")).toBeInTheDocument();
  });
});
