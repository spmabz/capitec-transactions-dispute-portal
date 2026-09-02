import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { addBusinessDays, format } from "date-fns";
import type { CreateDisputeInput, CustomerProfile, DisputeReasonCode, DisputeRecord, LoginInput, TransactionState, TransactionWithEligibility } from "@shared/types";
import { disputeReasonCodes } from "@shared/types";
import { createDispute, createSession, deleteSession, fetchDashboard, fetchSession } from "./api";

type WorkspaceView = "overview" | "transactions" | "disputes" | "support";
type ActionFilter = "all" | "eligible" | "open_case";
type TransactionStatusFilter = "all" | TransactionState;
type DisputeFilter = "all" | "submitted" | "under_review" | "resolved" | "rejected";
type TransactionSort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
type DateRangeFilter = "all" | "7" | "30" | "60";
type AmountRangeFilter = "all" | "under_100" | "100_to_500" | "500_plus";
type NotificationTone = "info" | "success";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  tone: NotificationTone;
};

const reasonLabels: Record<DisputeReasonCode, string> = {
  unauthorised: "I do not recognise this transaction",
  duplicate: "I was charged more than once",
  "merchant-error": "The merchant charged the wrong amount",
  "cash-not-received": "Cash was not received",
  "goods-not-received": "Goods or services were not received",
  other: "Something else went wrong"
};

const viewCopy: Record<WorkspaceView, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: "Customer workspace",
    title: "Transactions Dispute Portal",
    description: "Review your account activity, open a dispute, and track the progress of your cases in one place."
  },
  transactions: {
    eyebrow: "Account activity",
    title: "Transactions",
    description: "Search your recent card activity, filter what you need, and open a dispute when a transaction looks wrong."
  },
  disputes: {
    eyebrow: "Case tracking",
    title: "Disputes",
    description: "See what you have submitted, what is under review, and what has already been resolved."
  },
  support: {
    eyebrow: "Help and support",
    title: "Support",
    description: "Reach a person quickly, understand the dispute process, and know what happens next."
  }
};

const statusMeta: Record<string, { label: string; icon: string; toneClass: string }> = {
  posted: { label: "Posted", icon: "OK", toneClass: "status-posted" },
  pending: { label: "Pending", icon: "P", toneClass: "status-pending" },
  submitted: { label: "Submitted", icon: "IN", toneClass: "status-submitted" },
  under_review: { label: "Under review", icon: "RV", toneClass: "status-under_review" },
  resolved: { label: "Resolved", icon: "OK", toneClass: "status-resolved" },
  rejected: { label: "Rejected", icon: "NO", toneClass: "status-rejected" }
};

function formatCurrency(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2
  }).format(amountCents / 100);
}

function formatDateTime(value: string) {
  return format(new Date(value), "dd MMM yyyy, HH:mm");
}

function formatShortDate(value: string) {
  return format(new Date(value), "dd MMM yyyy");
}

function formatCaseReference(id: string) {
  return `DSP-${id.slice(-6).toUpperCase()}`;
}

function formatTimelineMessage(eventType: string) {
  switch (eventType) {
    case "submitted":
      return "We received your dispute and sent it to our team for review.";
    case "under_review":
      return "Your case is currently being reviewed.";
    case "resolved":
      return "Your case has been resolved.";
    case "rejected":
      return "Your case was declined after review.";
    default:
      return "Your case was updated.";
  }
}

function getNotificationItems(disputes: DisputeRecord[], manualItems: NotificationItem[]) {
  const disputeItems: NotificationItem[] = disputes.map((dispute) => ({
    id: `dispute-${dispute.id}`,
    title: `${formatCaseReference(dispute.id)} ${statusMeta[dispute.status]?.label ?? "Update"}`,
    message: `${dispute.transaction.merchantName} is ${statusMeta[dispute.status]?.label.toLowerCase() ?? "updated"}.`,
    createdAt: dispute.updatedAt,
    tone: dispute.status === "resolved" ? "success" : "info"
  }));

  return [...manualItems, ...disputeItems]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 6);
}

function StatusBadge({ value }: { value: string }) {
  const meta = statusMeta[value] ?? { label: value.replaceAll("_", " "), icon: "i", toneClass: "status-generic" };

  return (
    <span className={clsx("status-badge", meta.toneClass)} aria-label={meta.label}>
      <span className="status-badge-icon" aria-hidden="true">
        {meta.icon}
      </span>
      {meta.label}
    </span>
  );
}

function MetricCard({
  label,
  value,
  tone,
  note
}: {
  label: string;
  value: number;
  tone: "neutral" | "accent" | "dark" | "success";
  note: string;
}) {
  return (
    <article className={clsx("metric-card", `metric-${tone}`)}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}

function NotificationPanel({
  items,
  onClose
}: {
  items: NotificationItem[];
  onClose: () => void;
}) {
  return (
    <div className="notification-panel" role="dialog" aria-label="Notifications">
      <div className="notification-header">
        <strong>Notifications</strong>
        <button className="text-button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="notification-list">
        {items.length > 0 ? (
          items.map((item) => (
            <article key={item.id} className={clsx("notification-item", item.tone === "success" && "notification-item-success")}>
              <p className="notification-title">{item.title}</p>
              <p className="notification-message">{item.message}</p>
              <time>{formatDateTime(item.createdAt)}</time>
            </article>
          ))
        ) : (
          <EmptyState title="No new updates" message="You will see dispute status changes here." />
        )}
      </div>
    </div>
  );
}

function SidebarNav({
  activeView,
  account,
  onChange
}: {
  activeView: WorkspaceView;
  account: CustomerProfile;
  onChange: (view: WorkspaceView) => void;
}) {
  const items: Array<{ view: WorkspaceView; label: string; meta: string }> = [
    { view: "overview", label: "Overview", meta: "Dashboard" },
    { view: "transactions", label: "Transactions", meta: "Search and filter" },
    { view: "disputes", label: "Disputes", meta: "Track cases" },
    { view: "support", label: "Support", meta: "Chat, call, message" }
  ];

  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark" aria-hidden="true">
          C
        </div>
        <div>
          <p className="brand-name">Capitec</p>
          <p className="brand-subtitle">Dispute support</p>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Workspace navigation">
        {items.map((item) => (
          <button
            key={item.view}
            className={clsx("nav-link", activeView === item.view && "nav-link-active")}
            onClick={() => startTransition(() => onChange(item.view))}
          >
            <span>{item.label}</span>
            <small>{item.meta}</small>
          </button>
        ))}
      </nav>

      <div className="sidebar-card">
        <p className="eyebrow">Selected account</p>
        <strong>{account.account.productName}</strong>
        <p>{account.account.accountNumberMasked}</p>
        <div className="sidebar-card-grid">
          <div>
            <span>Case window</span>
            <strong>60 days</strong>
          </div>
          <div>
            <span>Support hours</span>
            <strong>24/7</strong>
          </div>
        </div>
      </div>
    </aside>
  );
}

function TopBar({
  view,
  account,
  notificationCount,
  notificationsOpen,
  notifications,
  onChange,
  onToggleNotifications,
  onSwitchAccount,
  onLogout
}: {
  view: WorkspaceView;
  account: CustomerProfile;
  notificationCount: number;
  notificationsOpen: boolean;
  notifications: NotificationItem[];
  onChange: (view: WorkspaceView) => void;
  onToggleNotifications: () => void;
  onSwitchAccount: () => void;
  onLogout: () => void;
}) {
  const copy = viewCopy[view];

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="topbar-copy">{copy.description}</p>
      </div>

      <div className="topbar-actions">
        <div className="topbar-utility">
          <button className="icon-button" aria-expanded={notificationsOpen} onClick={onToggleNotifications}>
            Alerts
            <span className="icon-count">{notificationCount}</span>
          </button>
          <button className="ghost-button" onClick={() => startTransition(() => onChange("support"))}>
            Get help
          </button>
          <button className="ghost-button" onClick={onSwitchAccount}>
            Switch profile
          </button>
          <button className="text-button" onClick={onLogout}>
            Log out
          </button>
        </div>

        <div className="account-chip">
          <span className="account-chip-label">Customer</span>
          <strong>{account.displayName}</strong>
          <small>{account.account.accountNumberMasked}</small>
        </div>

        {notificationsOpen ? <NotificationPanel items={notifications} onClose={onToggleNotifications} /> : null}
      </div>
    </header>
  );
}

function TransactionRow({
  transaction,
  index,
  onDispute,
  onViewDisputes
}: {
  transaction: TransactionWithEligibility;
  index: number;
  onDispute: (transaction: TransactionWithEligibility) => void;
  onViewDisputes: () => void;
}) {
  return (
    <article className={clsx("transaction-row", transaction.eligibility.eligible ? "transaction-live" : "transaction-locked")} style={{ animationDelay: `${index * 70}ms` }}>
      <div>
        <p className="transaction-title">{transaction.merchantName}</p>
        <p className="transaction-meta">
          {transaction.branchName} • {transaction.reference} • {formatDateTime(transaction.transactionDate)}
        </p>
      </div>

      <div className="transaction-side">
        <strong>{formatCurrency(transaction.amountCents, transaction.currency)}</strong>
        <div className="transaction-tags">
          <span className="category-chip">{transaction.category}</span>
          <StatusBadge value={transaction.status} />
        </div>
      </div>

      <div className="transaction-actions">
        {transaction.eligibility.eligible ? (
          <button className="primary-button" onClick={() => onDispute(transaction)}>
            Raise dispute
          </button>
        ) : (
          <span className="helper-text">{transaction.eligibility.reason}</span>
        )}

        {transaction.disputeCount > 0 ? (
          <button className="ghost-button action-button" onClick={onViewDisputes}>
            View case history
          </button>
        ) : null}
      </div>
    </article>
  );
}

function DisputeTimeline({
  dispute,
  onAddInfo,
  onMessageSupport
}: {
  dispute: DisputeRecord;
  onAddInfo: (dispute: DisputeRecord) => void;
  onMessageSupport: (dispute: DisputeRecord) => void;
}) {
  const isOpenCase = dispute.status === "submitted" || dispute.status === "under_review";

  return (
    <article className="history-card">
      <div className="history-header">
        <div>
          <p className="transaction-title">{dispute.transaction.merchantName}</p>
          <p className="transaction-meta">
            {formatCaseReference(dispute.id)} • {dispute.transaction.reference}
          </p>
        </div>
        <StatusBadge value={dispute.status} />
      </div>

      <div className="history-summary">
        <strong>{formatCurrency(dispute.transaction.amountCents, dispute.transaction.currency)}</strong>
        <span>{reasonLabels[dispute.reasonCode]}</span>
      </div>

      <div className="history-detail-grid">
        <div>
          <span>Submitted</span>
          <strong>{formatShortDate(dispute.createdAt)}</strong>
        </div>
        <div>
          <span>Expected update</span>
          <strong>{format(addBusinessDays(new Date(dispute.createdAt), 5), "dd MMM yyyy")}</strong>
        </div>
      </div>

      <p className="history-description">{dispute.description}</p>
      {dispute.resolutionNote ? <p className="resolution-note">{dispute.resolutionNote}</p> : null}

      {isOpenCase ? (
        <div className="history-actions">
          <button className="ghost-button" onClick={() => onAddInfo(dispute)}>
            Add more information
          </button>
          <button className="ghost-button" onClick={() => onMessageSupport(dispute)}>
            Message support
          </button>
        </div>
      ) : null}

      <div className="timeline">
        {dispute.events.map((event) => (
          <div key={event.id} className="timeline-item">
            <span className="timeline-dot" aria-hidden="true" />
            <div>
              <p className="timeline-type">{statusMeta[event.eventType]?.label ?? event.eventType.replaceAll("_", " ")}</p>
              <p className="transaction-meta">{formatTimelineMessage(event.eventType)}</p>
            </div>
            <time>{formatDateTime(event.createdAt)}</time>
          </div>
        ))}
      </div>
    </article>
  );
}

function DisputeDrawer({
  transaction,
  accessToken,
  onClose,
  onSubmitted,
  onTrackCase
}: {
  transaction: TransactionWithEligibility;
  accessToken: string;
  onClose: () => void;
  onSubmitted: (dispute: DisputeRecord) => void;
  onTrackCase: () => void;
}) {
  const queryClient = useQueryClient();
  const [reasonCode, setReasonCode] = useState<DisputeReasonCode>("unauthorised");
  const [description, setDescription] = useState("");
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [successDispute, setSuccessDispute] = useState<DisputeRecord | null>(null);

  const noteLength = description.trim().length;
  const descriptionError =
    noteLength === 0
      ? "Please describe what happened before submitting."
      : noteLength < 20
        ? "Please add at least 20 characters so we can understand the issue."
        : null;

  const mutation = useMutation({
    mutationFn: (input: CreateDisputeInput) => createDispute(accessToken, input),
    onSuccess: async ({ dispute }) => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setSuccessDispute(dispute);
      onSubmitted(dispute);
    }
  });

  const moveToReview = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDescriptionTouched(true);

    if (descriptionError) {
      return;
    }

    setShowReview(true);
  };

  const submitDispute = () => {
    mutation.mutate({
      transactionId: transaction.id,
      reasonCode,
      description: description.trim()
    });
  };

  const closeAndTrack = () => {
    onTrackCase();
    onClose();
  };

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-label="Raise a dispute" onClick={(event) => event.stopPropagation()}>
        {successDispute ? (
          <div className="success-state" aria-live="polite">
            <span className="hero-pill">Case received</span>
            <h2>Your dispute has been submitted</h2>
            <p>We have started reviewing your case. You can track progress under Disputes.</p>

            <div className="success-card">
              <div>
                <span>Case reference</span>
                <strong>{formatCaseReference(successDispute.id)}</strong>
              </div>
              <div>
                <span>Status</span>
                <StatusBadge value={successDispute.status} />
              </div>
              <div>
                <span>Next update</span>
                <strong>{format(addBusinessDays(new Date(successDispute.createdAt), 5), "dd MMM yyyy")}</strong>
              </div>
            </div>

            <div className="drawer-actions">
              <button className="ghost-button" onClick={onClose}>
                Close
              </button>
              <button className="primary-button" onClick={closeAndTrack}>
                Track this case
              </button>
            </div>
          </div>
        ) : showReview ? (
          <div className="review-state">
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Review your dispute</p>
                <h2>Confirm the details before you submit</h2>
              </div>
              <button className="ghost-button" onClick={() => setShowReview(false)}>
                Back
              </button>
            </div>

            <div className="review-card">
              <div className="review-row">
                <span>Transaction</span>
                <strong>{transaction.merchantName}</strong>
              </div>
              <div className="review-row">
                <span>Amount</span>
                <strong>{formatCurrency(transaction.amountCents, transaction.currency)}</strong>
              </div>
              <div className="review-row">
                <span>Date</span>
                <strong>{formatDateTime(transaction.transactionDate)}</strong>
              </div>
              <div className="review-row">
                <span>Reason</span>
                <strong>{reasonLabels[reasonCode]}</strong>
              </div>
              <div className="review-row review-row-stack">
                <span>What happened</span>
                <p>{description.trim()}</p>
              </div>
            </div>

            <label className="confirm-check">
              <input type="checkbox" checked={confirmChecked} onChange={(event) => setConfirmChecked(event.target.checked)} />
              <span>I confirm that the information above is correct.</span>
            </label>

            {mutation.error ? <p className="error-text">{mutation.error.message}</p> : null}

            <div className="drawer-actions">
              <button className="ghost-button" onClick={onClose}>
                Cancel
              </button>
              <button className="primary-button" disabled={!confirmChecked || mutation.isPending} onClick={submitDispute}>
                {mutation.isPending ? "Submitting..." : "Confirm and submit"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Raise a dispute</p>
                <h2>{transaction.merchantName}</h2>
              </div>
              <button className="ghost-button" onClick={onClose}>
                Close
              </button>
            </div>

            <div className="drawer-transaction">
              <strong>{formatCurrency(transaction.amountCents, transaction.currency)}</strong>
              <span>
                {transaction.reference} • {formatDateTime(transaction.transactionDate)}
              </span>
            </div>

            <form className="dispute-form" onSubmit={moveToReview} noValidate>
              <label>
                <span className="field-label">
                  Reason for dispute <strong className="field-required">*</strong>
                </span>
                <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value as DisputeReasonCode)}>
                  {disputeReasonCodes.map((reason) => (
                    <option key={reason} value={reason}>
                      {reasonLabels[reason]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="field-label">
                  Tell us what happened <strong className="field-required">*</strong>
                </span>
                <textarea
                  rows={6}
                  value={description}
                  aria-invalid={descriptionTouched && descriptionError ? "true" : "false"}
                  onBlur={() => setDescriptionTouched(true)}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Tell us what happened, what you expected, and whether you already contacted the merchant."
                />
                <div className="field-meta">
                  <span className="field-hint">Minimum 20 characters.</span>
                  <span className={clsx("field-counter", noteLength < 20 && "field-counter-warning")}>{noteLength}/20 minimum</span>
                </div>
                {descriptionTouched && descriptionError ? <span className="field-error">{descriptionError}</span> : null}
              </label>

              {mutation.error ? <p className="error-text">{mutation.error.message}</p> : null}

              <div className="drawer-actions">
                <button className="ghost-button" type="button" onClick={onClose}>
                  Cancel
                </button>
                <button className="primary-button" type="submit">
                  Review dispute
                </button>
              </div>
            </form>

            <div className="drawer-note">
              <span className="eyebrow">What happens next</span>
              <p>Once you submit, we will start reviewing your case and update you within 5 business days.</p>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function OverviewPage({
  metrics,
  transactions,
  disputes,
  onNavigate,
  onDispute
}: {
  metrics: { totalTransactions: number; eligibleTransactions: number; activeDisputes: number; resolvedDisputes: number };
  transactions: TransactionWithEligibility[];
  disputes: DisputeRecord[];
  onNavigate: (view: WorkspaceView) => void;
  onDispute: (transaction: TransactionWithEligibility) => void;
}) {
  const overviewTransactions = transactions
    .filter((transaction) => transaction.eligibility.eligible || transaction.disputeCount > 0)
    .slice(0, 3);
  const recentDisputes = disputes.slice(0, 2);

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-panel-copy">
          <span className="hero-pill">Overview snapshot</span>
          <h2>Start here</h2>
          <p>Use this dashboard to see what you can do right now, what cases are already in progress, and where to go next.</p>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="Transactions loaded" value={metrics.totalTransactions} tone="neutral" note="Available to review" />
        <MetricCard label="Eligible for dispute" value={metrics.eligibleTransactions} tone="accent" note="Ready for customer action" />
        <MetricCard label="Active investigations" value={metrics.activeDisputes} tone="dark" note="Cases currently in progress" />
        <MetricCard label="Resolved cases" value={metrics.resolvedDisputes} tone="success" note="Past outcomes you can still review" />
      </section>

      <section className="panel panel-history">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Recent updates</p>
            <h2>Latest case movement</h2>
          </div>
          <button className="ghost-button" onClick={() => onNavigate("disputes")}>
            View disputes
          </button>
        </div>

        <div className="overview-history-list">
          {recentDisputes.length > 0 ? (
            recentDisputes.map((dispute) => (
              <button key={dispute.id} className="mini-case-card" onClick={() => onNavigate("disputes")}>
                <div>
                  <p className="transaction-title">{dispute.transaction.merchantName}</p>
                  <p className="transaction-meta">{formatShortDate(dispute.updatedAt)}</p>
                </div>
                <StatusBadge value={dispute.status} />
              </button>
            ))
          ) : (
            <EmptyState title="No cases yet" message="Once you raise a dispute, you will be able to track updates here." />
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Next best actions</p>
            <h2>Transactions you can act on now</h2>
          </div>
          <button className="ghost-button" onClick={() => onNavigate("transactions")}>
            Open transactions
          </button>
        </div>

        <div className="transactions-list">
          {overviewTransactions.length > 0 ? (
            overviewTransactions.map((transaction, index) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                index={index}
                onDispute={onDispute}
                onViewDisputes={() => onNavigate("disputes")}
              />
            ))
          ) : (
            <EmptyState title="No immediate actions" message="Open Transactions to review the full statement and filter your activity." />
          )}
        </div>
      </section>
    </div>
  );
}

function TransactionsPage({
  transactions,
  search,
  actionFilter,
  statusFilter,
  categoryFilter,
  dateRangeFilter,
  amountRangeFilter,
  sort,
  categories,
  currentPage,
  totalPages,
  onSearchChange,
  onActionFilterChange,
  onStatusFilterChange,
  onCategoryFilterChange,
  onDateRangeFilterChange,
  onAmountRangeFilterChange,
  onSortChange,
  onPrevPage,
  onNextPage,
  onDispute,
  onViewDisputes
}: {
  transactions: TransactionWithEligibility[];
  search: string;
  actionFilter: ActionFilter;
  statusFilter: TransactionStatusFilter;
  categoryFilter: string;
  dateRangeFilter: DateRangeFilter;
  amountRangeFilter: AmountRangeFilter;
  sort: TransactionSort;
  categories: string[];
  currentPage: number;
  totalPages: number;
  onSearchChange: (value: string) => void;
  onActionFilterChange: (value: ActionFilter) => void;
  onStatusFilterChange: (value: TransactionStatusFilter) => void;
  onCategoryFilterChange: (value: string) => void;
  onDateRangeFilterChange: (value: DateRangeFilter) => void;
  onAmountRangeFilterChange: (value: AmountRangeFilter) => void;
  onSortChange: (value: TransactionSort) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onDispute: (transaction: TransactionWithEligibility) => void;
  onViewDisputes: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Statement review</p>
          <h2>Transaction activity</h2>
        </div>

        <button className="text-button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          Back to top
        </button>
      </div>

      <div className="filters filters-extended">
        <label className="filter-field">
          <span>Search</span>
          <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search by merchant, reference, branch, or category" />
        </label>
        <label className="filter-field">
          <span>Action</span>
          <select value={actionFilter} onChange={(event) => onActionFilterChange(event.target.value as ActionFilter)}>
            <option value="all">All activity</option>
            <option value="eligible">Can be disputed</option>
            <option value="open_case">Has an open case</option>
          </select>
        </label>
        <label className="filter-field">
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as TransactionStatusFilter)}>
            <option value="all">All statuses</option>
            <option value="posted">Posted</option>
            <option value="pending">Pending</option>
          </select>
        </label>
        <label className="filter-field">
          <span>Category</span>
          <select value={categoryFilter} onChange={(event) => onCategoryFilterChange(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Date range</span>
          <select value={dateRangeFilter} onChange={(event) => onDateRangeFilterChange(event.target.value as DateRangeFilter)}>
            <option value="all">All dates</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
          </select>
        </label>
        <label className="filter-field">
          <span>Amount</span>
          <select value={amountRangeFilter} onChange={(event) => onAmountRangeFilterChange(event.target.value as AmountRangeFilter)}>
            <option value="all">All amounts</option>
            <option value="under_100">Under R100</option>
            <option value="100_to_500">R100 to R500</option>
            <option value="500_plus">R500 and above</option>
          </select>
        </label>
        <label className="filter-field">
          <span>Sort by</span>
          <select value={sort} onChange={(event) => onSortChange(event.target.value as TransactionSort)}>
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="amount_desc">Highest amount</option>
            <option value="amount_asc">Lowest amount</option>
          </select>
        </label>
      </div>

      <div className="transactions-list">
        {transactions.length > 0 ? (
          transactions.map((transaction, index) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              index={index}
              onDispute={onDispute}
              onViewDisputes={onViewDisputes}
            />
          ))
        ) : (
          <EmptyState title="No matching transactions" message="Try a different search or filter to widen your results." />
        )}
      </div>

      {totalPages > 1 ? (
        <div className="pagination">
          <button className="ghost-button" disabled={currentPage === 1} onClick={onPrevPage}>
            Previous
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button className="ghost-button" disabled={currentPage === totalPages} onClick={onNextPage}>
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}

function DisputesPage({
  disputes,
  filter,
  onFilterChange,
  onAddInfo,
  onMessageSupport
}: {
  disputes: DisputeRecord[];
  filter: DisputeFilter;
  onFilterChange: (value: DisputeFilter) => void;
  onAddInfo: (dispute: DisputeRecord) => void;
  onMessageSupport: (dispute: DisputeRecord) => void;
}) {
  return (
    <section className="panel panel-history">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Case history</p>
          <h2>Disputed transactions</h2>
        </div>

        <div className="filters filters-compact">
          <select value={filter} onChange={(event) => onFilterChange(event.target.value as DisputeFilter)}>
            <option value="all">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under review</option>
            <option value="resolved">Resolved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="history-list">
        {disputes.length > 0 ? (
          disputes.map((dispute, index) => (
            <div key={dispute.id} className="history-card-shell" style={{ animationDelay: `${index * 90}ms` }}>
              <DisputeTimeline dispute={dispute} onAddInfo={onAddInfo} onMessageSupport={onMessageSupport} />
            </div>
          ))
        ) : (
          <EmptyState title="No disputes in this view" message="Change the filter to see a different set of cases." />
        )}
      </div>
    </section>
  );
}

function SupportPage({
  onStartChat,
  onRequestCallback,
  onSendMessage
}: {
  onStartChat: () => void;
  onRequestCallback: () => void;
  onSendMessage: () => void;
}) {
  return (
    <section className="page-stack">
      <div className="support-grid">
        <article className="panel">
          <p className="eyebrow">Speak to someone</p>
          <h2>Get help with your dispute</h2>
          <div className="support-contact-grid">
            <div className="contact-card">
              <strong>Live chat</strong>
              <p>Start a secure chat if you need help while completing the form.</p>
              <button className="primary-button" onClick={onStartChat}>
                Start chat
              </button>
            </div>
            <div className="contact-card">
              <strong>Request a callback</strong>
              <p>Ask our team to call you back about a transaction or open case.</p>
              <button className="ghost-button" onClick={onRequestCallback}>
                Request callback
              </button>
            </div>
            <div className="contact-card">
              <strong>Secure message</strong>
              <p>Send supporting information or follow-up questions through a secure message.</p>
              <button className="ghost-button" onClick={onSendMessage}>
                Send message
              </button>
            </div>
          </div>
        </article>

        <article className="panel panel-history">
          <p className="eyebrow">What you may need</p>
          <h2>Before you submit a case</h2>
          <div className="support-list">
            <div className="support-item">
              <strong>Only posted transactions can be disputed</strong>
              <p>If a card payment is still pending, wait until it posts to your account before raising a case.</p>
            </div>
            <div className="support-item">
              <strong>Tell us clearly what happened</strong>
              <p>Explain what you expected, what went wrong, and whether you already contacted the merchant.</p>
            </div>
            <div className="support-item">
              <strong>Keep your case reference handy</strong>
              <p>Quote your case reference when you contact support so we can find your dispute quickly.</p>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

function LoginPage({ onSignedIn }: { onSignedIn: (accessToken: string) => void }) {
  const [email, setEmail] = useState("sifiso@example.com");
  const [password, setPassword] = useState("capitec-demo-2026");
  const mutation = useMutation({
    mutationFn: (input: LoginInput) => createSession(input),
    onSuccess: ({ accessToken }) => onSignedIn(accessToken)
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.mutate({ email, password });
  };

  return (
    <main className="signed-out-shell">
      <section className="signed-out-card login-card">
        <p className="eyebrow">Demo sign in</p>
        <h1>Welcome to your dispute workspace</h1>
        <p>Sign in to view only the transactions and disputes for your selected demo customer.</p>

        <form className="login-form" onSubmit={submit}>
          <label>
            <span>Email address</span>
            <select value={email} onChange={(event) => setEmail(event.target.value)}>
              <option value="sifiso@example.com">Sifiso M. - sifiso@example.com</option>
              <option value="lebo@example.com">Lebo D. - lebo@example.com</option>
            </select>
          </label>
          <label>
            <span>Demo password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </label>
          {mutation.error ? <p className="error-text">{mutation.error.message}</p> : null}
          <button className="primary-button" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="login-hint">Both seeded profiles use the password `capitec-demo-2026`.</p>
      </section>
    </main>
  );
}

export function App() {
  const [view, setView] = useState<WorkspaceView>("overview");
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithEligibility | null>(null);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [statusFilter, setStatusFilter] = useState<TransactionStatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>("all");
  const [amountRangeFilter, setAmountRangeFilter] = useState<AmountRangeFilter>("all");
  const [sort, setSort] = useState<TransactionSort>("date_desc");
  const [disputeFilter, setDisputeFilter] = useState<DisputeFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [accessToken, setAccessToken] = useState(() => window.sessionStorage.getItem("portal-access-token"));
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [manualNotifications, setManualNotifications] = useState<NotificationItem[]>([]);
  const [toast, setToast] = useState<null | { title: string; message: string }>(null);
  const deferredSearch = useDeferredValue(search);
  const queryClient = useQueryClient();

  const session = useQuery({
    queryKey: ["session", accessToken],
    queryFn: () => fetchSession(accessToken!),
    enabled: Boolean(accessToken),
    retry: false
  });

  const dashboard = useQuery({
    queryKey: ["dashboard", accessToken],
    queryFn: () => fetchDashboard(accessToken!),
    enabled: Boolean(accessToken && session.data)
  });

  const clearSession = () => {
    window.sessionStorage.removeItem("portal-access-token");
    setAccessToken(null);
    queryClient.removeQueries({ queryKey: ["dashboard"] });
    queryClient.removeQueries({ queryKey: ["session"] });
  };

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (session.isError) {
      clearSession();
    }
  }, [session.isError]);

  const transactions = dashboard.data?.transactions ?? [];
  const disputes = dashboard.data?.disputes ?? [];
  const account = session.data?.customer;
  const categories = [...new Set(transactions.map((transaction) => transaction.category))].sort((left, right) => left.localeCompare(right));
  const notifications = getNotificationItems(disputes, manualNotifications);

  const filteredTransactions = transactions
    .filter((transaction) => {
      const query = deferredSearch.toLowerCase();
      const matchesSearch =
        transaction.merchantName.toLowerCase().includes(query) ||
        transaction.reference.toLowerCase().includes(query) ||
        transaction.category.toLowerCase().includes(query) ||
        transaction.branchName.toLowerCase().includes(query);

      const matchesActionFilter =
        actionFilter === "all"
          ? true
          : actionFilter === "eligible"
            ? transaction.eligibility.eligible
            : transaction.hasActiveDispute;

      const matchesStatus = statusFilter === "all" ? true : transaction.status === statusFilter;
      const matchesCategory = categoryFilter === "all" ? true : transaction.category === categoryFilter;
      const transactionAgeDays = Math.floor((Date.now() - new Date(transaction.transactionDate).getTime()) / (1000 * 60 * 60 * 24));
      const matchesDateRange = dateRangeFilter === "all" ? true : transactionAgeDays <= Number(dateRangeFilter);
      const amount = transaction.amountCents / 100;
      const matchesAmountRange =
        amountRangeFilter === "all"
          ? true
          : amountRangeFilter === "under_100"
            ? amount < 100
            : amountRangeFilter === "100_to_500"
              ? amount >= 100 && amount <= 500
              : amount > 500;

      return matchesSearch && matchesActionFilter && matchesStatus && matchesCategory && matchesDateRange && matchesAmountRange;
    })
    .sort((left, right) => {
      if (sort === "date_asc") {
        return new Date(left.transactionDate).getTime() - new Date(right.transactionDate).getTime();
      }

      if (sort === "amount_desc") {
        return right.amountCents - left.amountCents;
      }

      if (sort === "amount_asc") {
        return left.amountCents - right.amountCents;
      }

      return new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime();
    });

  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const pagedTransactions = filteredTransactions.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const filteredDisputes = disputes.filter((dispute) => (disputeFilter === "all" ? true : dispute.status === disputeFilter));

  const openDispute = (transaction: TransactionWithEligibility) => {
    setSelectedTransaction(transaction);
  };

  const goToDisputes = () => {
    setNotificationsOpen(false);
    startTransition(() => setView("disputes"));
  };

  const pushToast = (title: string, message: string) => {
    setToast({ title, message });
  };

  const handleDisputeSubmitted = (dispute: DisputeRecord) => {
    const item = {
      id: `manual-${dispute.id}`,
      title: `${formatCaseReference(dispute.id)} under review`,
      message: `We have started reviewing your ${formatCurrency(dispute.transaction.amountCents, dispute.transaction.currency)} transaction at ${dispute.transaction.merchantName}.`,
      createdAt: new Date().toISOString(),
      tone: "success" as const
    };

    setManualNotifications((current) => [item, ...current].slice(0, 6));
    pushToast("Dispute submitted", `Case ${formatCaseReference(dispute.id)} is now under review.`);
  };

  const handleSupportAction = (title: string, message: string) => {
    setNotificationsOpen(false);
    startTransition(() => setView("support"));
    pushToast(title, message);
  };

  if (!accessToken) {
    return (
      <LoginPage
        onSignedIn={(token) => {
          window.sessionStorage.setItem("portal-access-token", token);
          setAccessToken(token);
        }}
      />
    );
  }

  if (session.isLoading || !account || dashboard.isLoading) {
    return <main className="loading-shell">Loading your dispute workspace...</main>;
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <main className="loading-shell">
        <div>
          <h1>We could not load your dispute workspace</h1>
          <p>{dashboard.error instanceof Error ? dashboard.error.message : "Unknown error"}</p>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="bank-shell">
        <SidebarNav activeView={view} account={account} onChange={setView} />

        <section className="workspace">
          <TopBar
            view={view}
            account={account}
            notificationCount={notifications.length}
            notificationsOpen={notificationsOpen}
            notifications={notifications}
            onChange={setView}
            onToggleNotifications={() => setNotificationsOpen((current) => !current)}
            onSwitchAccount={() => clearSession()}
            onLogout={() => {
              void deleteSession(accessToken).finally(clearSession);
            }}
          />

          {view === "overview" ? (
            <OverviewPage
              metrics={dashboard.data.metrics}
              transactions={transactions}
              disputes={disputes}
              onNavigate={setView}
              onDispute={openDispute}
            />
          ) : null}

          {view === "transactions" ? (
            <TransactionsPage
              transactions={pagedTransactions}
              search={search}
              actionFilter={actionFilter}
              statusFilter={statusFilter}
              categoryFilter={categoryFilter}
              dateRangeFilter={dateRangeFilter}
              amountRangeFilter={amountRangeFilter}
              sort={sort}
              categories={categories}
              currentPage={currentPage}
              totalPages={totalPages}
              onSearchChange={(value) => {
                setSearch(value);
                setCurrentPage(1);
              }}
              onActionFilterChange={(value) => {
                setActionFilter(value);
                setCurrentPage(1);
              }}
              onStatusFilterChange={(value) => {
                setStatusFilter(value);
                setCurrentPage(1);
              }}
              onCategoryFilterChange={(value) => {
                setCategoryFilter(value);
                setCurrentPage(1);
              }}
              onDateRangeFilterChange={(value) => {
                setDateRangeFilter(value);
                setCurrentPage(1);
              }}
              onAmountRangeFilterChange={(value) => {
                setAmountRangeFilter(value);
                setCurrentPage(1);
              }}
              onSortChange={(value) => {
                setSort(value);
                setCurrentPage(1);
              }}
              onPrevPage={() => setCurrentPage((current) => Math.max(1, current - 1))}
              onNextPage={() => setCurrentPage((current) => Math.min(totalPages, current + 1))}
              onDispute={openDispute}
              onViewDisputes={goToDisputes}
            />
          ) : null}

          {view === "disputes" ? (
            <DisputesPage
              disputes={filteredDisputes}
              filter={disputeFilter}
              onFilterChange={setDisputeFilter}
              onAddInfo={(dispute) =>
                handleSupportAction("Add more information", `Open Support and reference ${formatCaseReference(dispute.id)} when you share more details.`)
              }
              onMessageSupport={(dispute) =>
                handleSupportAction("Support message ready", `Open Support to send a secure message about ${formatCaseReference(dispute.id)}.`)
              }
            />
          ) : null}

          {view === "support" ? (
            <SupportPage
              onStartChat={() => pushToast("Chat started", "A support consultant will join the chat shortly.")}
              onRequestCallback={() => pushToast("Callback requested", "We will call you back within 15 minutes.")}
              onSendMessage={() => pushToast("Secure message ready", "A support consultant can help you add more information to your case.")}
            />
          ) : null}
        </section>

        {selectedTransaction ? (
          <DisputeDrawer
            transaction={selectedTransaction}
            accessToken={accessToken}
            onClose={() => setSelectedTransaction(null)}
            onSubmitted={handleDisputeSubmitted}
            onTrackCase={() => {
              setSelectedTransaction(null);
              goToDisputes();
            }}
          />
        ) : null}
      </main>

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          <strong>{toast.title}</strong>
          <p>{toast.message}</p>
        </div>
      ) : null}
    </>
  );
}
