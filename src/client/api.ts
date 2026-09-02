import type { CreateDisputeInput, CustomerProfile, DisputeRecord, LoginInput, SessionResponse, TransactionWithEligibility } from "@shared/types";

type DashboardResponse = {
  transactions: TransactionWithEligibility[];
  disputes: DisputeRecord[];
  metrics: {
    totalTransactions: number;
    eligibleTransactions: number;
    activeDisputes: number;
    resolvedDisputes: number;
  };
};

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string; issues?: Array<{ message: string }> } | null;
    const message = body?.message ?? body?.issues?.[0]?.message ?? "Unexpected error.";
    throw new Error(message);
  }

  return (await response.json()) as T;
}

function authorisedHeaders(accessToken: string, headers: HeadersInit = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${accessToken}`
  };
}

export async function createSession(input: LoginInput) {
  return handleResponse<SessionResponse>(
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function fetchSession(accessToken: string) {
  return handleResponse<{ customer: CustomerProfile }>(
    await fetch("/api/session", { headers: authorisedHeaders(accessToken) })
  );
}

export async function deleteSession(accessToken: string) {
  await handleResponse<void>(await fetch("/api/session", { method: "DELETE", headers: authorisedHeaders(accessToken) }));
}

export async function fetchDashboard(accessToken: string) {
  return handleResponse<DashboardResponse>(await fetch("/api/dashboard", { headers: authorisedHeaders(accessToken) }));
}

export async function createDispute(accessToken: string, input: CreateDisputeInput) {
  return handleResponse<{ dispute: DisputeRecord }>(
    await fetch("/api/disputes", {
      method: "POST",
      headers: authorisedHeaders(accessToken, {
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(input)
    })
  );
}
