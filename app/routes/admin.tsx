import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import {
  CheckCircle2,
  Loader2,
  Play,
  RefreshCcw,
  Save,
  Shield,
  ShieldAlert,
  StopCircle,
  Users,
  XCircle,
} from "lucide-react";

import { formatPackagePrice } from "~/lib/multitenancy";
import {
  approveAdminRoomPass,
  expireAdminRoom,
  getAdminDashboard,
  loginAdmin,
  logoutAdmin,
  rejectAdminRoomPass,
  startAdminRoom,
  updateAdminPackage,
  type AdminPackageUpdate,
  type AdminDashboard,
  type RoomPassSummary,
  type RoomSummary,
  type StreamingPackage,
} from "~/lib/realtime";
import type { Route } from "./+types/admin";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Admin | Kinetic Command" },
    {
      name: "description",
      content: "Admin operations panel for packages, tenants, rooms, and payments.",
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
  const [mutatingPackageId, setMutatingPackageId] = useState<string | null>(null);
  const [mutatingRoomId, setMutatingRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pendingPasses = useMemo(
    () => dashboard?.roomPasses.filter((item) => item.status === "pending_manual_review") ?? [],
    [dashboard?.roomPasses]
  );

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

  async function handlePackageSave(packageId: string, input: AdminPackageUpdate) {
    setMutatingPackageId(packageId);
    setError(null);
    setNotice(null);

    try {
      await updateAdminPackage(packageId, input);
      setNotice("Package controls saved.");
      await loadDashboard({ clearNotice: false });
    } catch (packageError: unknown) {
      setError(packageError instanceof Error ? packageError.message : "Could not update package");
    } finally {
      setMutatingPackageId(null);
    }
  }

  async function handleStartRoom(roomId: string) {
    await mutateRoom(roomId, "start");
  }

  async function handleExpireRoom(roomId: string) {
    await mutateRoom(roomId, "expire");
  }

  async function mutateRoom(roomId: string, action: "expire" | "start") {
    setMutatingRoomId(roomId);
    setError(null);
    setNotice(null);

    try {
      if (action === "start") {
        await startAdminRoom(roomId);
        setNotice("Room access window started.");
      } else {
        await expireAdminRoom(roomId);
        setNotice("Room access expired.");
      }
      await loadDashboard({ clearNotice: false });
    } catch (roomError: unknown) {
      setError(roomError instanceof Error ? roomError.message : "Could not update room");
    } finally {
      setMutatingRoomId(null);
    }
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
            Admin operations
          </div>
          <h1 data-display className="text-3xl font-bold text-[var(--text-main)] sm:text-4xl">
            Packages, tenants, payments, rooms.
          </h1>
        </div>
        <Link
          to="/"
          className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-main)]"
        >
          Home
        </Link>
      </header>

      <section className="glass-panel mb-5 rounded-[1.5rem] p-4">
        {authenticatedEmail ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Signed in as
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
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={loading}
                className="rounded-full border border-[var(--border-soft)] px-5 py-3 text-sm font-semibold text-[var(--text-main)] disabled:opacity-60"
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Admin email
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
                Password
              </span>
              <input
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
                placeholder="Admin password"
                autoComplete="current-password"
              />
            </label>
            <button
              type="submit"
              disabled={loading || !adminEmail.trim() || !adminPassword.trim()}
              className="flex items-center justify-center gap-2 rounded-full bg-[var(--accent-cyan)] px-5 py-3 text-sm font-semibold text-[#041016] disabled:opacity-60 md:self-end"
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : <Shield size={16} />}
              Sign in
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
        <StatePanel icon={<Loader2 className="animate-spin text-[var(--accent-cyan)]" size={28} />} text="Loading admin data..." />
      ) : !dashboard ? (
        <StatePanel icon={<ShieldAlert className="text-[var(--accent-coral)]" size={28} />} text="Sign in with the admin email and password to load operations data." />
      ) : (
        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="Tenants" value={String(dashboard.summary.tenants)} />
            <Metric label="Rooms" value={String(dashboard.summary.rooms)} />
            <Metric label="Active rooms" value={String(dashboard.summary.activeRooms)} />
            <Metric label="Pending review" value={String(dashboard.summary.pendingManualReviews)} />
            <Metric label="Paid purchases" value={String(dashboard.summary.paidPurchases)} />
          </section>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-5">
              <Panel title="Manual payment queue">
                {pendingPasses.length === 0 ? (
                  <EmptyState text="No manual payments are waiting for review." />
                ) : (
                  <div className="space-y-3">
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

              <Panel title="Rooms">
                {dashboard.rooms.length === 0 ? (
                  <EmptyState text="No rooms have been created yet." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-left text-sm">
                      <thead className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                        <tr>
                          <th className="px-3 py-2">Room</th>
                          <th className="px-3 py-2">PIN</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Tenant</th>
                          <th className="px-3 py-2">Expires</th>
                          <th className="px-3 py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.rooms.map((room) => (
                          <RoomRow
                            key={room.id}
                            mutating={mutatingRoomId === room.id}
                            onExpire={() => void handleExpireRoom(room.id)}
                            onStart={() => void handleStartRoom(room.id)}
                            room={room}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>

            <aside className="space-y-5">
              <Panel title="Packages">
                {dashboard.packages.length === 0 ? (
                  <EmptyState text="No packages are configured yet." />
                ) : (
                  <div className="space-y-3">
                    {dashboard.packages.map((item) => (
                      <PackageEditor
                        key={item.id}
                        item={item}
                        saving={mutatingPackageId === item.id}
                        onSave={(input) => void handlePackageSave(item.id, input)}
                      />
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Tenants">
                {dashboard.tenants.length === 0 ? (
                  <EmptyState text="No tenant accounts yet." />
                ) : (
                  <div className="space-y-3">
                    {dashboard.tenants.map((tenant) => (
                      <div key={tenant.id} className="flex items-start gap-3 rounded-[1.15rem] border border-[var(--border-soft)] bg-black/15 p-4">
                        <div className="rounded-full bg-[var(--accent-cyan)]/12 p-2 text-[var(--accent-cyan)]">
                          <Users size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[var(--text-main)]">{tenant.name}</p>
                          <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{tenant.email}</p>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">{tenant.authProvider ?? "email"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </aside>
          </section>
        </div>
      )}
    </main>
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
            Approve
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={mutating}
            className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-xs font-semibold text-[var(--text-main)] disabled:opacity-60"
          >
            <XCircle size={14} />
            Reject
          </button>
        </div>
      </div>
    </article>
  );
}

type PackageDraft = {
  active: boolean;
  description: string;
  durationMinutes: string;
  featuresText: string;
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
  onSave: (input: AdminPackageUpdate) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<PackageDraft>(() => createPackageDraft(item));

  function updateDraft<Key extends keyof PackageDraft>(key: Key, value: PackageDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      active: draft.active ? 1 : 0,
      description: draft.description.trim(),
      duration_minutes: parsePositiveInteger(draft.durationMinutes, item.duration_minutes),
      features: draft.featuresText
        .split("\n")
        .map((feature) => feature.trim())
        .filter((feature) => feature.length > 0),
      max_cameras: parsePositiveInteger(draft.maxCameras, item.max_cameras),
      max_rooms: parsePositiveInteger(draft.maxRooms, item.max_rooms),
      name: draft.name.trim() || item.name,
      price_cents: parseNonNegativeInteger(draft.priceCents, item.price_cents),
      sort_order: parseNonNegativeInteger(draft.sortOrder, item.sort_order),
    });
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
          {draft.active ? "Public" : "Hidden"}
        </label>
      </div>

      <div className="grid gap-3">
        <TextField
          label="Package name"
          value={draft.name}
          onChange={(value) => updateDraft("name", value)}
        />
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Description
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
            label="Price cents"
            value={draft.priceCents}
            onChange={(value) => updateDraft("priceCents", value)}
          />
          <TextField
            inputMode="numeric"
            label="Duration minutes"
            value={draft.durationMinutes}
            onChange={(value) => updateDraft("durationMinutes", value)}
          />
          <TextField
            inputMode="numeric"
            label="Max rooms"
            value={draft.maxRooms}
            onChange={(value) => updateDraft("maxRooms", value)}
          />
          <TextField
            inputMode="numeric"
            label="Max cameras"
            value={draft.maxCameras}
            onChange={(value) => updateDraft("maxCameras", value)}
          />
          <TextField
            inputMode="numeric"
            label="Sort order"
            value={draft.sortOrder}
            onChange={(value) => updateDraft("sortOrder", value)}
          />
        </div>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Features
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
        {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
        Save package
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

function RoomRow({
  mutating,
  onExpire,
  onStart,
  room,
}: {
  mutating: boolean;
  onExpire: () => void;
  onStart: () => void;
  room: RoomSummary;
}) {
  const accessStatus = getRoomAccessStatus(room);
  const canStart = room.status === "ready";
  const canExpire = room.status === "active" && accessStatus !== "expired";

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
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onStart}
            disabled={mutating || !canStart}
            className="flex items-center gap-2 rounded-full bg-[var(--accent-lime)] px-3 py-2 text-xs font-semibold text-[#041016] disabled:opacity-40"
          >
            {mutating && canStart ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
            Start
          </button>
          <button
            type="button"
            onClick={onExpire}
            disabled={mutating || !canExpire}
            className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-main)] disabled:opacity-40"
          >
            {mutating && canExpire ? <Loader2 className="animate-spin" size={14} /> : <StopCircle size={14} />}
            Expire
          </button>
        </div>
      </td>
    </tr>
  );
}

function getRoomAccessStatus(room: RoomSummary): string {
  if (room.status === "active" && room.expires_at && new Date(room.expires_at).getTime() <= Date.now()) {
    return "expired";
  }

  return room.status ?? "active";
}

function getStatusClassName(status: string): string {
  const base = "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]";
  if (status === "active") {
    return `${base} bg-[var(--accent-lime)]/15 text-[var(--accent-lime)]`;
  }
  if (status === "ready") {
    return `${base} bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)]`;
  }
  if (status === "expired" || status === "cancelled") {
    return `${base} bg-[var(--accent-coral)]/15 text-[#ffd8d4]`;
  }
  return `${base} bg-white/8 text-white/60`;
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
