import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import {
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  FileText,
  LayoutDashboard,
  Loader2,
  MonitorPlay,
  Package,
  Play,
  RefreshCcw,
  Save,
  Shield,
  ShieldAlert,
  StopCircle,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";

import { formatPackagePrice } from "~/lib/multitenancy";
import {
  approveAdminRoomPass,
  getAdminDashboard,
  loginAdmin,
  logoutAdmin,
  rejectAdminRoomPass,
  updateAdminPackage,
  type AdminDashboard,
  type AdminAuditLog,
  type AdminReadiness,
  type RoomPassSummary,
  type RoomSummary,
  type StreamingPackage,
} from "~/lib/realtime";
import type { Route } from "./+types/admin";

// Placeholder types for new analytics data (backend to be added)
type RevenueStats = {
  mrrCents: number;
  arrCents: number;
  totalRevenueCents: number;
  paymentMethodBreakdown: Record<string, number>;
};

type StreamingStats = {
  totalStreams: number;
  avgDurationMinutes: number;
  peakConcurrentCameras: number;
};

type AuditLogFilter = {
  actionType: string;
  dateRange: string;
};

export function meta(_: Route.MetaArgs) {
  return [
    { title: "অ্যাডমিন | কাইনেটিক কমান্ড" },
    {
      name: "description",
      content: "প্যাকেজ, টেন্যান্ট, রুম এবং পেমেন্ট ম্যানেজমেন্ট অ্যাডমিন প্যানেল।",
    },
  ];
}

export default function AdminRoute() {
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [authenticatedEmail, setAuthenticatedEmail] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [savingPackageId, setSavingPackageId] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<string>("overview");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [auditLogFilter, setAuditLogFilter] = useState<AuditLogFilter>({
    actionType: "all",
    dateRange: "all",
  });

  const pendingPasses = useMemo(
    () => dashboard?.roomPasses.filter((item) => item.status === "pending_manual_review") ?? [],
    [dashboard?.roomPasses]
  );

  // Revenue calculations
  const revenueStats = useMemo<RevenueStats>(() => {
    if (!dashboard?.roomPasses) {
      return {
        mrrCents: 0,
        arrCents: 0,
        totalRevenueCents: 0,
        paymentMethodBreakdown: {},
      };
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);

    const EXCHANGE_RATE = 110; // 1 USD = 110 BDT (approximate)

    // Normalize cents to BDT for display
    function toBDTCents(amountCents: number, currency: string): number {
      if (currency.toLowerCase() === "usd") {
        return amountCents * EXCHANGE_RATE; // amount_cents is in dollars, convert to BDT cents
      }
      return amountCents; // already BDT
    }

    const paidPasses = dashboard.roomPasses.filter((p) => p.status === "paid");
    const currentMonthPasses = paidPasses.filter(
      (p) => p.paid_at && new Date(p.paid_at) >= startOfMonth
    );

    const mrrCents = currentMonthPasses.reduce(
      (sum, p) => sum + toBDTCents(p.amount_cents, p.currency ?? "bdt"),
      0
    );
    const totalRevenueCents = paidPasses.reduce(
      (sum, p) => sum + toBDTCents(p.amount_cents, p.currency ?? "bdt"),
      0
    );

    const breakdown: Record<string, number> = {};
    for (const pass of paidPasses) {
      const method = pass.payment_provider ?? "manual";
      breakdown[method] = (breakdown[method] ?? 0) + toBDTCents(pass.amount_cents, pass.currency ?? "bdt");
    }

    return {
      mrrCents,
      arrCents: mrrCents * 12,
      totalRevenueCents,
      paymentMethodBreakdown: breakdown,
    };
  }, [dashboard?.roomPasses]);

  // Streaming stats placeholder (backend data not yet available)
  const streamingStats = useMemo<StreamingStats>(() => {
    // TODO: Replace with actual data from room_assets or streaming_stats table
    return {
      totalStreams: 0,
      avgDurationMinutes: 0,
      peakConcurrentCameras: 0,
    };
  }, []);

  // Trending metrics (placeholder - backend to add week-over-week comparison)
  const trendingMetrics = useMemo(() => {
    if (!dashboard?.summary) return null;
    // TODO: Fetch previous week data from backend to calculate trends
    return {
      activeRoomsChange: 0,
      paidPurchasesChange: 0,
    };
  }, [dashboard?.summary]);

  // Filtered audit logs
  const filteredAuditLogs = useMemo(() => {
    if (!dashboard?.auditLogs) return [];

    let logs = [...dashboard.auditLogs];

    if (auditLogFilter.actionType !== "all") {
      logs = logs.filter((log) => log.action === auditLogFilter.actionType);
    }

    if (auditLogFilter.dateRange !== "all") {
      const now = new Date();
      let cutoff: Date | null = null;

      if (auditLogFilter.dateRange === "today") {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (auditLogFilter.dateRange === "7days") {
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (auditLogFilter.dateRange === "30days") {
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      if (cutoff) {
        logs = logs.filter((log) => {
          if (!log.created_at) return false;
          return new Date(log.created_at) >= cutoff!;
        });
      }
    }

    return logs;
  }, [dashboard?.auditLogs, auditLogFilter]);

  useEffect(() => {
    const savedEmail = window.localStorage.getItem("live-studio-admin-email") ?? "";
    setAdminEmail(savedEmail);
    void loadDashboard({ showError: false });
  }, []);

  async function loadDashboard(options: { clearNotice?: boolean; showError?: boolean } = {}) {
    const { clearNotice = true } = options;
    const { showError = true } = options;

    setLoading(true);
    setError(null);
    if (clearNotice) {
      setNotice(null);
    }

    try {
      const nextDashboard = await getAdminDashboard();
      setDashboard(nextDashboard);
      setAuthenticatedEmail((current) => current ?? (adminEmail.trim().toLowerCase() || "admin"));
    } catch (loadError: unknown) {
      setDashboard(null);
      setAuthenticatedEmail(null);
      if (showError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load admin dashboard");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePackage(packageId: string, draft: PackageDraft) {
    setSavingPackageId(packageId);
    setError(null);
    setNotice(null);

    try {
      await updateAdminPackage(packageId, {
        active: draft.active ? 1 : 0,
        description: draft.description,
        duration_minutes: parsePositiveInteger(draft.durationMinutes, 180),
        features: draft.featuresText.split("\n").filter((line) => line.trim()),
        max_ad_videos: parseNonNegativeInteger(draft.maxAdVideos, 3),
        max_cameras: parsePositiveInteger(draft.maxCameras, 3),
        max_rooms: parsePositiveInteger(draft.maxRooms, 1),
        name: draft.name,
        price_cents: parseNonNegativeInteger(draft.priceCents, 0),
        sort_order: parseNonNegativeInteger(draft.sortOrder, 100),
      });
      setNotice(`Package "${draft.name || packageId}" updated.`);
      await loadDashboard({ clearNotice: false });
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save package");
    } finally {
      setSavingPackageId(null);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = adminEmail.trim().toLowerCase();
    const password = adminPassword.trim();
    if (!email || !password) {
      setError("Admin email and password are required.");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const result = await loginAdmin({ email, password });
      window.localStorage.setItem("live-studio-admin-email", result.account.email);
      setAuthenticatedEmail(result.account.email);
      setAdminPassword("");
      await loadDashboard({ clearNotice: false });
      setNotice("Admin signed in.");
    } catch (loginError: unknown) {
      setDashboard(null);
      setAuthenticatedEmail(null);
      setError(loginError instanceof Error ? loginError.message : "Could not sign in");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      await logoutAdmin();
    } catch {
      // A local logout should still clear client state even if the session is already gone.
    } finally {
      setDashboard(null);
      setAuthenticatedEmail(null);
      setAdminPassword("");
      setLoading(false);
    }
  }

  async function handleApprove(roomPassId: string) {
    await mutatePass(roomPassId, "approve");
  }

  async function handleReject(roomPassId: string) {
    await mutatePass(roomPassId, "reject");
  }

  async function mutatePass(roomPassId: string, action: "approve" | "reject") {
    setMutatingId(roomPassId);
    setError(null);
    setNotice(null);

    try {
      if (action === "approve") {
        await approveAdminRoomPass(roomPassId);
        setNotice("Room pass approved and room is ready.");
      } else {
        await rejectAdminRoomPass(roomPassId);
        setNotice("Room pass rejected and room was cancelled.");
      }
      await loadDashboard({ clearNotice: false });
    } catch (mutationError: unknown) {
      setError(mutationError instanceof Error ? mutationError.message : "Could not update payment");
    } finally {
      setMutatingId(null);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--accent-cyan)]/25 bg-[var(--accent-cyan)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-cyan)]">
            <Shield size={14} />
            অ্যাডমিন অপারেশন
          </div>
          <h1 data-display className="text-3xl font-bold text-[var(--text-main)] sm:text-4xl">
            অপারেশন
          </h1>
        </div>
        <Link
          to="/"
          className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-main)]"
        >
          হোম
        </Link>
      </header>

      <section className="glass-panel mb-5 rounded-[1.5rem] p-4">
        {authenticatedEmail ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                লগইন করা আছে
              </p>
              <p className="mt-1 font-semibold text-[var(--text-main)]">{authenticatedEmail}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadDashboard()}
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-full bg-[var(--accent-cyan)] px-5 py-3 text-sm font-semibold text-[#041016] disabled:opacity-60"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
                রিফ্রেশ
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={loading}
                className="rounded-full border border-[var(--border-soft)] px-5 py-3 text-sm font-semibold text-[var(--text-main)] disabled:opacity-60"
              >
                লগআউট
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                অ্যাডমিন ইমেইল
              </span>
              <input
                type="email"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
                placeholder="admin@example.com"
                autoComplete="username"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                পাসওয়ার্ড
              </span>
              <input
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
                placeholder="অ্যাডমিন পাসওয়ার্ড"
                autoComplete="current-password"
              />
            </label>
            <button
              type="submit"
              disabled={loading || !adminEmail.trim() || !adminPassword.trim()}
              className="flex items-center justify-center gap-2 rounded-full bg-[var(--accent-cyan)] px-5 py-3 text-sm font-semibold text-[#041016] disabled:opacity-60 md:self-end"
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : <Shield size={16} />}
              লগইন
            </button>
          </form>
        )}
        {error ? (
          <Message
            tone="error"
            text={error}
            actionLabel={authenticatedEmail ? "Retry" : undefined}
            onAction={authenticatedEmail ? () => void loadDashboard() : undefined}
          />
        ) : null}
        {notice ? <Message tone="notice" text={notice} /> : null}
      </section>

      {loading && !dashboard ? (
        <StatePanel icon={<Loader2 className="animate-spin text-[var(--accent-cyan)]" size={28} />} text="অ্যাডমিন ডাটা লোড হচ্ছে..." />
      ) : !dashboard ? (
        <StatePanel icon={<ShieldAlert className="text-[var(--accent-coral)]" size={28} />} text="অপারেশন ডাটা দেখার জন্য অ্যাডমিন ইমেইল এবং পাসওয়ার্ড দিয়ে লগইন করুন।" />
      ) : (
        <div className="space-y-5">
          <AdminTabBar active={adminTab} onChange={setAdminTab} />

          {/* ── Overview ── */}
          {adminTab === "overview" && (
            <>
              <Panel title="রাজস্ব">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <RevenueMetric label="MRR" valueCents={revenueStats.mrrCents} subtitle="মাসিক সম্ভাব্য আয়" />
                  <RevenueMetric label="ARR" valueCents={revenueStats.arrCents} subtitle="বার্ষিক সম্ভাব্য আয়" />
                  <RevenueMetric label="মোট রাজস্ব" valueCents={revenueStats.totalRevenueCents} subtitle="সর্বকালীন" />
                  <div className="rounded-[1.25rem] border border-[var(--border-soft)] bg-black/15 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      পেমেন্ট মাধ্যম
                    </p>
                    <div className="mt-3 space-y-2">
                      {Object.keys(revenueStats.paymentMethodBreakdown).length === 0 ? (
                        <p className="text-sm text-[var(--text-muted)]">কোনো পেমেন্ট নেই</p>
                      ) : (
                        Object.entries(revenueStats.paymentMethodBreakdown).map(([method, cents]) => (
                          <div key={method} className="flex justify-between text-sm">
                            <span className="capitalize text-[var(--text-main)]">{method}</span>
                            <span className="font-semibold text-[var(--text-main)]">{formatBDT(cents)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </Panel>

              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Metric label="টেন্যান্ট" value={String(dashboard.summary.tenants)} />
                <Metric label="রুম" value={String(dashboard.summary.rooms)} />
                <TrendingMetric
                  label="সক্রিয় রুম"
                  value={dashboard.summary.activeRooms}
                  change={trendingMetrics?.activeRoomsChange ?? 0}
                />
                <Metric label="রিভিউ অপেক্ষমান" value={String(dashboard.summary.pendingManualReviews)} />
                <TrendingMetric
                  label="পেইড পারচেজ"
                  value={dashboard.summary.paidPurchases}
                  change={trendingMetrics?.paidPurchasesChange ?? 0}
                />
              </section>

              <Panel title="স্ট্রিমিং পরিসংখ্যান">
                {streamingStats.totalStreams === 0 ? (
                  <div className="flex items-center justify-between rounded-[1.25rem] border border-dashed border-[var(--border-soft)] px-4 py-6 text-sm text-[var(--text-muted)]">
                    <span>স্ট্রিমিং অ্যানালিটিক্স শীঘ্রই আসছে</span>
                    <TrendingUp size={16} className="text-[var(--accent-cyan)]" />
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <StreamingStatItem label="মোট স্ট্রিম" value={streamingStats.totalStreams} />
                    <StreamingStatItem label="গড় স্থায়িত্ব" value={`${streamingStats.avgDurationMinutes}m`} />
                    <StreamingStatItem label="সর্বোচ্চ ক্যামেরা" value={streamingStats.peakConcurrentCameras} />
                  </div>
                )}
              </Panel>
            </>
          )}

          {/* ── Packages ── */}
          {adminTab === "packages" && (
            <Panel title="প্যাকেজ">
              {dashboard.packages.length === 0 ? (
                <EmptyState text="এখনও কোনো প্যাকেজ কনফিগার করা হয়নি।" />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {dashboard.packages.map((item) => (
                    <PackageEditor
                      key={item.id}
                      item={item}
                      saving={savingPackageId === item.id}
                      onSave={(draft) => handleSavePackage(item.id, draft)}
                    />
                  ))}
                </div>
              )}
            </Panel>
          )}

          {/* ── Payments ── */}
          {adminTab === "payments" && (
            <Panel title="ম্যানুয়াল পেমেন্ট কিউ">
              {pendingPasses.length === 0 ? (
                <EmptyState text="কোনো ম্যানুয়াল পেমেন্ট রিভিউ অপেক্ষমান নেই।" />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {pendingPasses.map((pass) => (
                    <PaymentCard
                      key={pass.id}
                      pass={pass}
                      mutating={mutatingId === pass.id}
                      onApprove={() => void handleApprove(pass.id)}
                      onReject={() => void handleReject(pass.id)}
                    />
                  ))}
                </div>
              )}
            </Panel>
          )}

          {/* ── Rooms ── */}
          {adminTab === "rooms" && (
            <Panel title="রুম">
              {dashboard.rooms.length === 0 ? (
                <EmptyState text="এখনও কোনো রুম তৈরি করা হয়নি।" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      <tr>
                        <th className="px-3 py-2">রুম</th>
                        <th className="px-3 py-2">পিন (PIN)</th>
                        <th className="px-3 py-2">স্ট্যাটাস</th>
                        <th className="px-3 py-2">টেন্যান্ট</th>
                        <th className="px-3 py-2">মেয়াদ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.rooms.map((room) => (
                        <RoomRow key={room.id} room={room} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}

          {/* ── Audit Log ── */}
          {adminTab === "audit" && (
            <Panel title="সাম্প্রতিক অ্যাডমিন অ্যাকশন">
              <div className="mb-4 flex flex-wrap gap-2">
                <select
                  value={auditLogFilter.actionType}
                  onChange={(e) => setAuditLogFilter((f) => ({ ...f, actionType: e.target.value }))}
                  className="rounded-full border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
                >
                  <option value="all">সকল অ্যাকশন</option>
                  <option value="approve">অনুমোদন</option>
                  <option value="reject">প্রত্যাখ্যান</option>
                  <option value="create">তৈরি</option>
                  <option value="update">আপডেট</option>
                  <option value="delete">ডিলিট</option>
                </select>
                <select
                  value={auditLogFilter.dateRange}
                  onChange={(e) => setAuditLogFilter((f) => ({ ...f, dateRange: e.target.value }))}
                  className="rounded-full border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
                >
                  <option value="all">সর্বকালীন</option>
                  <option value="today">আজ</option>
                  <option value="7days">গত ৭ দিন</option>
                  <option value="30days">গত ৩০ দিন</option>
                </select>
              </div>
              {filteredAuditLogs.length === 0 ? (
                <EmptyState text="ফিল্টারের সাথে কোনো অ্যাকশন মেলেনি।" />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {filteredAuditLogs.map((item) => (
                    <AuditLogItem key={item.id} item={item} />
                  ))}
                </div>
              )}
            </Panel>
          )}

          {/* ── Tenants ── */}
          {adminTab === "tenants" && (
            <Panel title="টেন্যান্ট">
              {dashboard.tenants.length === 0 ? (
                <EmptyState text="এখনও কোনো টেন্যান্ট অ্যাকাউন্ট নেই।" />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {dashboard.tenants.map((tenant) => (
                    <div key={tenant.id} className="flex items-start gap-3 rounded-[1.15rem] border border-[var(--border-soft)] bg-black/15 p-4">
                      <div className="rounded-full bg-[var(--accent-cyan)]/12 p-2 text-[var(--accent-cyan)]">
                        <Users size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--text-main)]">{tenant.name}</p>
                        <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{tenant.email}</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">{tenant.authProvider ?? "ইমেইল"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          )}
        </div>
      )}
    </main>
  );
}

type AdminTab = {
  id: string;
  label: string;
  icon: ReactNode;
};

const ADMIN_TABS: AdminTab[] = [
  { id: "overview", label: "সারসংক্ষেপ", icon: <LayoutDashboard size={16} /> },
  { id: "packages", label: "প্যাকেজ", icon: <Package size={16} /> },
  { id: "payments", label: "পেমেন্ট", icon: <CreditCard size={16} /> },
  { id: "rooms", label: "রুম", icon: <MonitorPlay size={16} /> },
  { id: "audit", label: "অডিট লগ", icon: <FileText size={16} /> },
  { id: "tenants", label: "টেন্যান্ট", icon: <Users size={16} /> },
];

function AdminTabBar({
  active,
  onChange,
}: {
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <nav className="overflow-x-auto rounded-[1.25rem] border border-[var(--border-soft)] bg-black/15 p-1.5">
      <div className="flex min-w-max gap-1">
        {ADMIN_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold transition-colors ${
              active === tab.id
                ? "bg-[var(--accent-cyan)] text-[#041016]"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function formatBDT(cents: number): string {
  const taka = cents / 100;
  return `৳${taka.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function RevenueMetric({
  label,
  valueCents,
  subtitle,
}: {
  label: string;
  valueCents: number;
  subtitle: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-[var(--border-soft)] bg-black/15 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </p>
      <p data-display className="mt-2 text-2xl font-bold text-[var(--accent-lime)]">
        {formatBDT(valueCents)}
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{subtitle}</p>
    </div>
  );
}

function TrendingMetric({
  label,
  value,
  change,
}: {
  label: string;
  value: number;
  change: number;
}) {
  const isPositive = change > 0;
  const isNegative = change < 0;
  const hasChange = change !== 0;

  return (
    <div className="glass-panel rounded-[1.25rem] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <p data-display className="text-2xl font-bold text-[var(--text-main)]">{value}</p>
        {hasChange && (
          <span
            className={`flex items-center gap-0.5 text-sm font-semibold ${
              isPositive
                ? "text-[var(--accent-lime)]"
                : isNegative
                ? "text-[var(--accent-coral)]"
                : "text-[var(--text-muted)]"
            }`}
          >
            {isPositive ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            {Math.abs(change)}
          </span>
        )}
      </div>
    </div>
  );
}

function StreamingStatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[1.15rem] border border-[var(--border-soft)] bg-black/15 p-3 text-center">
      <p className="text-2xl font-bold text-[var(--text-main)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

function PaymentCard({
  mutating,
  onApprove,
  onReject,
  pass,
}: {
  mutating: boolean;
  onApprove: () => void;
  onReject: () => void;
  pass: RoomPassSummary;
}) {
  return (
    <article className="rounded-[1.15rem] border border-[var(--border-soft)] bg-black/15 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[var(--text-main)]">{pass.id}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {pass.payment_provider ?? "manual"} · {pass.currency.toUpperCase()} {(pass.amount_cents / 100).toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Sender {pass.bkash_sender_number ?? "-"} · TrxID {pass.bkash_transaction_id ?? "-"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={mutating}
            className="flex items-center gap-2 rounded-full bg-[var(--accent-lime)] px-4 py-2 text-xs font-semibold text-[#041016] disabled:opacity-60"
          >
            {mutating ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
            অনুমোদন
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={mutating}
            className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-xs font-semibold text-[var(--text-main)] disabled:opacity-60"
          >
            <XCircle size={14} />
            প্রত্যাখ্যান
          </button>
        </div>
      </div>
    </article>
  );
}

function ReadinessPanel({ readiness }: { readiness: AdminReadiness }) {
  const failingChecks = readiness.checks.filter((check) => !check.ok);

  return (
    <Panel title="প্রোডাকশন রেডিনেস">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`rounded-full p-2 ${
              readiness.ready
                ? "bg-[var(--accent-lime)]/15 text-[var(--accent-lime)]"
                : "bg-[var(--accent-coral)]/15 text-[#ffd8d4]"
            }`}
          >
            {readiness.ready ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          </div>
          <div>
            <p className="font-semibold text-[var(--text-main)]">
              {readiness.ready ? "প্রোডাকশন ট্রাফিকের জন্য প্রস্তুত" : `${failingChecks.length}টি প্রোডাকশন চেক মনোযোগ প্রয়োজন`}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              সিক্রেট, মাইগ্রেশন, পেমেন্ট, স্টোরেজ, রিলে এবং টেন্যান্ট লগইন চেক।
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {readiness.checks.map((check) => (
          <div key={check.key} className="rounded-[1.15rem] border border-[var(--border-soft)] bg-black/15 p-4">
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 rounded-full p-1.5 ${
                  check.ok
                    ? "bg-[var(--accent-lime)]/15 text-[var(--accent-lime)]"
                    : "bg-[var(--accent-coral)]/15 text-[#ffd8d4]"
                }`}
              >
                {check.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-main)]">{check.label}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  {check.ok ? "কনফিগার করা আছে" : check.action}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function AuditLogItem({ item }: { item: AdminAuditLog }) {
  return (
    <div className="rounded-[1.15rem] border border-[var(--border-soft)] bg-black/15 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-main)]">
            {formatAuditAction(item.action)}
          </p>
          <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
            {item.target_type} · {item.target_id}
          </p>
        </div>
        <span className="shrink-0 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {item.created_at ? new Date(item.created_at).toLocaleString() : "এইমাত্র"}
        </span>
      </div>
      <p className="mt-2 truncate text-xs text-[var(--text-muted)]">
        {item.actor_email ?? "admin"}
      </p>
    </div>
  );
}

function formatAuditAction(action: string): string {
  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type PackageDraft = {
  active: boolean;
  description: string;
  durationMinutes: string;
  featuresText: string;
  maxAdVideos: string;
  maxCameras: string;
  maxRooms: string;
  name: string;
  priceCents: string;
  sortOrder: string;
};

function createPackageDraft(item: StreamingPackage): PackageDraft {
  return {
    active: item.active === 1,
    description: item.description,
    durationMinutes: String(item.duration_minutes),
    featuresText: item.features.join("\n"),
    maxAdVideos: String(item.max_ad_videos),
    maxCameras: String(item.max_cameras),
    maxRooms: String(item.max_rooms),
    name: item.name,
    priceCents: String(item.price_cents),
    sortOrder: String(item.sort_order),
  };
}

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function PackageEditor({
  item,
  onSave,
  saving,
}: {
  item: StreamingPackage;
  onSave: (draft: PackageDraft) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<PackageDraft>(() => createPackageDraft(item));

  function updateDraft<Key extends keyof PackageDraft>(key: Key, value: PackageDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(draft);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[1.15rem] border border-[var(--border-soft)] bg-black/15 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[var(--text-main)]">{item.id}</p>
          <p data-display className="mt-2 text-2xl font-bold text-[var(--text-main)]">
            {formatPackagePrice({ amountCents: item.price_cents, currency: item.currency })}
          </p>
        </div>
        <label className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-main)]">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) => updateDraft("active", event.target.checked)}
            className="h-4 w-4 accent-[var(--accent-lime)]"
          />
          {draft.active ? "প্রকাশিত" : "লুকানো"}
        </label>
      </div>

      <div className="grid gap-3">
        <TextField
          label="প্যাকেজের নাম"
          value={draft.name}
          onChange={(value) => updateDraft("name", value)}
        />
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            বিবরণ
          </span>
          <textarea
            value={draft.description}
            onChange={(event) => updateDraft("description", event.target.value)}
            rows={2}
            className="min-h-20 w-full resize-y rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            inputMode="numeric"
            label="মূল্য (পয়সা)"
            value={draft.priceCents}
            onChange={(value) => updateDraft("priceCents", value)}
          />
          <TextField
            inputMode="numeric"
            label="স্থায়িত্ব (মিনিট)"
            value={draft.durationMinutes}
            onChange={(value) => updateDraft("durationMinutes", value)}
          />
          <TextField
            inputMode="numeric"
            label="সর্বোচ্চ রুম"
            value={draft.maxRooms}
            onChange={(value) => updateDraft("maxRooms", value)}
          />
          <TextField
            inputMode="numeric"
            label="সর্বোচ্চ ক্যামেরা"
            value={draft.maxCameras}
            onChange={(value) => updateDraft("maxCameras", value)}
          />
          <TextField
            inputMode="numeric"
            label="সর্বোচ্চ অ্যাড ভিডিও"
            value={draft.maxAdVideos}
            onChange={(value) => updateDraft("maxAdVideos", value)}
          />
          <TextField
            inputMode="numeric"
            label="ক্রমিক নম্বর"
            value={draft.sortOrder}
            onChange={(value) => updateDraft("sortOrder", value)}
          />
        </div>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            বৈশিষ্ট্যসমূহ
          </span>
          <textarea
            value={draft.featuresText}
            onChange={(event) => updateDraft("featuresText", event.target.value)}
            rows={4}
            className="min-h-28 w-full resize-y rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent-cyan)] px-4 py-3 text-sm font-semibold text-[#041016] disabled:opacity-60"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {saving ? "সেভ হচ্ছে..." : "প্যাকেজ সেভ করুন"}
      </button>
    </form>
  );
}

function TextField({
  inputMode,
  label,
  onChange,
  value,
}: {
  inputMode?: "decimal" | "email" | "numeric" | "search" | "tel" | "text" | "url";
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {label}
      </span>
      <input
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
      />
    </label>
  );
}

function RoomRow({ room }: { room: RoomSummary }) {
  const accessStatus = getRoomAccessStatus(room);

  return (
    <tr className="border-t border-[var(--border-soft)]">
      <td className="px-3 py-3 font-semibold text-[var(--text-main)]">{room.name}</td>
      <td className="px-3 py-3 text-[var(--text-muted)]">{room.pin}</td>
      <td className="px-3 py-3">
        <span className={getStatusClassName(accessStatus)}>{accessStatus}</span>
      </td>
      <td className="px-3 py-3 text-[var(--text-muted)]">{room.tenant_id ?? "-"}</td>
      <td className="px-3 py-3 text-[var(--text-muted)]">
        {room.expires_at ? new Date(room.expires_at).toLocaleString() : "-"}
      </td>
    </tr>
  );
}

function getRoomAccessStatus(room: RoomSummary): string {
  if (room.status === "active" && room.expires_at && new Date(room.expires_at).getTime() <= Date.now()) {
    return "মেয়াদোত্তীর্ণ";
  }

  const statusMap: Record<string, string> = {
    active: "সক্রিয়",
    pending: "অপেক্ষমান",
    expired: "মেয়াদোত্তীর্ণ",
    suspended: "স্থগিত",
  };

  return statusMap[room.status ?? ""] ?? (room.status ?? "সক্রিয়");
}

export function getStatusClassName(status: string): string {
  const base = "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]";
  const lower = status.toLowerCase();
  
  if (lower === "সক্রিয়" || lower === "active" || lower === "ready" || lower === "paid") {
    return `${base} bg-[var(--accent-lime)]/15 text-[var(--accent-lime)]`;
  }
  if (lower === "মেয়াদোত্তীর্ণ" || lower === "expired" || lower === "cancelled" || lower === "deleted" || lower === "failed") {
    return `${base} bg-[var(--accent-coral)]/15 text-[#ffd8d4]`;
  }
  if (lower === "পেন্ডিং" || lower === "pending" || lower === "pending_manual_review") {
    return `${base} bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]`;
  }
  
  return `${base} bg-white/10 text-white/60 border-white/20`;
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="glass-panel rounded-[1.5rem] p-5">
      <h2 data-display className="mb-4 text-xl font-semibold text-[var(--text-main)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel rounded-[1.25rem] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </p>
      <p data-display className="mt-2 text-2xl font-bold text-[var(--text-main)]">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[1.25rem] border border-dashed border-[var(--border-soft)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
      {text}
    </div>
  );
}

function StatePanel({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="glass-panel flex min-h-72 items-center justify-center rounded-[1.5rem] p-6 text-center">
      <div>
        <div className="flex justify-center">{icon}</div>
        <p className="mt-4 text-sm font-semibold text-[var(--text-main)]">{text}</p>
      </div>
    </div>
  );
}

function Message({
  actionLabel,
  onAction,
  text,
  tone,
}: {
  actionLabel?: string;
  onAction?: () => void;
  text: string;
  tone: "error" | "notice";
}) {
  const isError = tone === "error";
  return (
    <div
      className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${
        isError
          ? "border-[var(--accent-coral)]/30 bg-[var(--accent-coral)]/10 text-[#ffd8d4]"
          : "border-[var(--accent-lime)]/25 bg-[var(--accent-lime)]/10 text-[#d9ffe4]"
      }`}
    >
      <span>{text}</span>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="rounded-full border border-current px-3 py-1 text-xs font-semibold"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
