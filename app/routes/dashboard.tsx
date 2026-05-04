import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Camera, CheckCircle2, Clock3, Copy, X, CreditCard, Loader2, ShieldAlert, Smartphone, Video, Watch } from "lucide-react";

import { formatPackagePrice } from "~/lib/multitenancy";
import {
  createAccount,
  createManualRoomPass,
  createRoomPassCheckout,
  getAccountDashboard,
  getAuthConfig,
  getPackages,
  getPaymentConfig,
  signInWithGoogleCredential,
  type AccountSummary,
  type AuthConfig,
  type ManualRoomPassResult,
  type PaymentConfig,
  type RoomPassSummary,
  type RoomSummary,
  type StreamingPackage,
} from "~/lib/realtime";

type GoogleCredentialResponse = { credential?: string };

type GoogleAccountsId = {
  initialize: (config: { callback: (response: GoogleCredentialResponse) => void; client_id: string }) => void;
  renderButton: (parent: HTMLElement, options: { locale?: string; shape?: string; size?: string; text?: string; theme?: string; width?: number }) => void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

type DashboardData = {
  account: AccountSummary;
  passes: RoomPassSummary[];
  rooms: RoomSummary[];
};

function StatusBadge({ status, expiresAt }: { status: string; expiresAt?: string }) {
  const isExpired = expiresAt && new Date(expiresAt) < new Date();
  if (isExpired) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-coral)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--accent-coral)]">
        Expired
      </span>
    );
  }
  if (status === "paid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-lime)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--accent-lime)]">
        <CheckCircle2 size={11} /> Active
      </span>
    );
  }
  if (status === "pending_manual_review") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-semibold text-yellow-400">
        Pending Review
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-[var(--text-muted)]">
      {status}
    </span>
  );
}

function RoomCard({ room, pass }: { room: RoomSummary; pass?: RoomPassSummary }) {
  const isExpired = room.expires_at && new Date(room.expires_at) < new Date();
  const expiryText = room.expires_at
    ? isExpired
      ? `Expired on ${new Date(room.expires_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`
      : `Valid until ${new Date(room.expires_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`
    : "Timer starts when director opens the studio";

  return (
    <div className="rounded-[1.4rem] border border-[var(--border-soft)] bg-black/15 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[var(--text-main)]">{room.name}</h3>
            {pass && <StatusBadge status={pass.status} expiresAt={room.expires_at} />}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{expiryText}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            PIN
          </p>
          <p className="mt-1 text-3xl font-bold tracking-[0.24em] text-[var(--accent-lime)]">
            {room.pin}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to={`/studio?pin=${room.pin}`}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
            isExpired
              ? "border border-[var(--text-muted)]/30 text-[var(--text-muted)]/50 cursor-not-allowed pointer-events-none"
              : "bg-[var(--accent-cyan)] text-[#041016]"
          }`}
        >
          <Video size={14} /> Studio
        </Link>
        <Link
          to={`/camera?pin=${room.pin}`}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
            isExpired
              ? "border-[var(--border-soft)]/30 text-[var(--text-muted)]/50 cursor-not-allowed pointer-events-none"
              : "border-[var(--border-soft)] text-[var(--text-main)]"
          }`}
        >
          <Camera size={14} /> Camera Join
        </Link>
        <Link
          to={`/watch?pin=${room.pin}`}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
            isExpired
              ? "border-[var(--border-soft)]/30 text-[var(--text-muted)]/50 cursor-not-allowed pointer-events-none"
              : "border-[var(--border-soft)] text-[var(--text-main)]"
          }`}
        >
          <Watch size={14} /> Watch
        </Link>
        <button
          type="button"
          disabled={isExpired}
          onClick={() => {
            const url = `${window.location.origin}/camera?pin=${room.pin}`;
            void navigator.clipboard.writeText(url);
          }}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
            isExpired
              ? "border-[var(--border-soft)]/30 text-[var(--text-muted)]/50 cursor-not-allowed"
              : "border-[var(--border-soft)] text-[var(--text-main)] hover:border-[var(--accent-cyan)] hover:text-[var(--accent-cyan)]"
          }`}
        >
          <Copy size={14} /> Copy Camera Link
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [packages, setPackages] = useState<StreamingPackage[]>([]);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState("starter-live");
  const [roomName, setRoomName] = useState("");
  const [bkashSenderNumber, setBkashSenderNumber] = useState("");
  const [bkashTransactionId, setBkashTransactionId] = useState("");
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [purchaseNotice, setPurchaseNotice] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  const selectedPackage = useMemo(
    () => packages.find((item) => item.id === selectedPackageId) ?? packages[0] ?? null,
    [packages, selectedPackageId]
  );

  async function loadInitialState() {
    try {
      const [packageList, config, payments] = await Promise.all([
        getPackages(),
        getAuthConfig(),
        getPaymentConfig(),
      ]);
      setPackages(packageList);
      setAuthConfig(config);
      setPaymentConfig(payments);
      setSelectedPackageId(packageList[0]?.id ?? "starter-live");
    } catch {
      // ignore load errors on dashboard
    }
  }

  async function handlePurchase(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedPackage) return;

    setCheckoutLoading(true);
    setPurchaseError(null);
    setPurchaseNotice(null);

    try {
      const token = window.localStorage.getItem("live-studio-account-token");
      if (!token) throw new Error("Not authenticated");

      await createManualRoomPass({
        accessToken: token,
        bkashSenderNumber,
        bkashTransactionId,
        packageId: selectedPackage.id,
        roomName,
      });

      setPurchaseNotice("Payment submitted. Admin approval unlocks the room.");
      setBkashSenderNumber("");
      setBkashTransactionId("");
      setRoomName("");

      const dashboard = await getAccountDashboard(token);
      setData(dashboard);
    } catch (err: unknown) {
      setPurchaseError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setCheckoutLoading(false);
    }
  }

  useEffect(() => {
    const token = window.localStorage.getItem("live-studio-account-token");
    if (!token) {
      navigate("/");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void getAccountDashboard(token)
      .then((dashboard) => {
        if (cancelled) return;
        setData(dashboard);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
        window.localStorage.removeItem("live-studio-account-token");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-4 py-8 sm:px-6">
        <div className="glass-panel flex min-h-64 w-full items-center justify-center rounded-[2rem] p-8">
          <Loader2 className="animate-spin text-[var(--accent-cyan)]" size={32} />
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-4 py-8 sm:px-6">
        <div className="glass-panel flex min-h-64 w-full flex-col items-center justify-center rounded-[2rem] p-8 text-center">
          <ShieldAlert className="text-[var(--accent-coral)]" size={32} />
          <p className="mt-4 text-sm font-semibold text-[var(--text-main)]">{error ?? "Something went wrong"}</p>
          <Link to="/" className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-main)]">
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  const { account, rooms, passes } = data;

  const allRooms = rooms.filter((room) => {
    const pass = passes.find((p) => p.room_id === room.id);
    const isExpired = room.expires_at && new Date(room.expires_at) < new Date();
    return pass?.status === "paid" || pass?.status === "pending_manual_review" || isExpired;
  });

  return (
    <main className="relative min-h-screen overflow-hidden">
      <section className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 lg:px-10">
        <header className="glass-panel mb-6 flex flex-wrap items-center justify-between gap-3 rounded-full px-4 py-3">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-cyan)]/15 text-sm font-semibold text-[var(--accent-cyan)]">
              OL
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-main)]">
                Overlays
              </p>
              <p className="text-xs text-[var(--text-muted)]">Dashboard</p>
            </div>
          </Link>
          <nav className="flex flex-wrap items-center gap-2">
            <Link className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-main)]" to="/watch">
              Watch
            </Link>
            <Link className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-main)]" to="/studio">
              Studio
            </Link>
            <Link className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-main)]" to="/admin">
              Admin
            </Link>
          </nav>
        </header>

        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="rounded-[1.4rem] border border-[var(--accent-lime)]/25 bg-[var(--accent-lime)]/10 px-5 py-4">
            <p className="text-sm font-semibold text-[var(--text-main)]">{account.name}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{account.email}</p>
          </div>
          <button
            type="button"
            onClick={() => { void loadInitialState(); setShowPurchaseModal(true); }}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-cyan)] px-4 py-2 text-sm font-semibold text-[#041016]"
          >
            <Clock3 size={14} /> Purchase More
          </button>
        </div>

        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--accent-lime)]/25 bg-[var(--accent-lime)]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-lime)]">
          <Video size={14} />
          Your Rooms
        </div>

        {allRooms.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-[var(--border-soft)] px-4 py-12 text-center">
            <p className="text-sm text-[var(--text-muted)]">No rooms yet.</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Purchase a package to create your first streaming room.
            </p>
            <Link
              to="/"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--accent-cyan)] px-4 py-2 text-sm font-semibold text-[#041016]"
            >
              Choose Package
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {allRooms.map((room) => {
              const pass = passes.find((p) => p.room_id === room.id);
              return <RoomCard key={room.id} room={room} pass={pass} />;
            })}
          </div>
        )}

        {showPurchaseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="glass-panel w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[2rem] p-6">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-[var(--text-main)]">Purchase Package</h2>
                <button
                  type="button"
                  onClick={() => setShowPurchaseModal(false)}
                  className="rounded-full border border-[var(--border-soft)] p-2 text-[var(--text-main)]"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  {packages.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedPackageId(item.id)}
                      className={`rounded-[1.2rem] border p-4 text-left ${
                        selectedPackageId === item.id
                          ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10"
                          : "border-[var(--border-soft)] bg-black/15"
                      }`}
                    >
                      <p className="text-sm font-semibold text-[var(--text-main)]">{item.name}</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{item.duration_minutes} min</p>
                      <p className="mt-2 text-lg font-bold text-[var(--accent-lime)]">
                        {formatPackagePrice({ amountCents: item.price_cents, currency: item.currency })}
                      </p>
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handlePurchase(e);
                  }}
                  className="space-y-3"
                >
                  <input
                    type="text"
                    required
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text-main)] outline-none"
                    placeholder="Room name (e.g. Friday Night Match)"
                  />

                  <div className="rounded-[1.2rem] border border-[var(--border-soft)] bg-black/15 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-lime)]">bKash Payment</p>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                      Merchant: {paymentConfig?.bkashMerchantNumber ?? "configured merchant"}
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input
                        type="tel"
                        required
                        value={bkashSenderNumber}
                        onChange={(e) => setBkashSenderNumber(e.target.value)}
                        className="w-full rounded-xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--text-main)] outline-none"
                        placeholder="Sender number"
                      />
                      <input
                        type="text"
                        required
                        value={bkashTransactionId}
                        onChange={(e) => setBkashTransactionId(e.target.value.toUpperCase())}
                        className="w-full rounded-xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--text-main)] outline-none"
                        placeholder="Transaction ID"
                      />
                    </div>
                  </div>

                  {purchaseError && (
                    <p className="rounded-xl border border-[var(--accent-coral)]/30 bg-[var(--accent-coral)]/10 px-3 py-2 text-sm text-[var(--accent-coral)]">
                      {purchaseError}
                    </p>
                  )}
                  {purchaseNotice && (
                    <p className="rounded-xl border border-[var(--accent-lime)]/30 bg-[var(--accent-lime)]/10 px-3 py-2 text-sm text-[var(--accent-lime)]">
                      {purchaseNotice}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={checkoutLoading || !selectedPackage}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent-cyan)] px-5 py-3 text-sm font-semibold text-[#041016] disabled:opacity-60"
                  >
                    {checkoutLoading ? <Loader2 className="animate-spin" size={18} /> : <Smartphone size={18} />}
                    Submit Payment
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}