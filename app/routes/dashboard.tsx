import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Camera, CheckCircle2, Clock3, Copy, LogOut, X, CreditCard, Loader2, ShieldAlert, Smartphone, Video, Watch, Power, Pause, Play, BarChart3, Package, Info } from "lucide-react";

import { formatPackagePrice } from "~/lib/multitenancy";
import {
  createAccount,
  createManualRoomPass,
  createRoomPassCheckout,
  createRoom as createRoomApi,
  expireRoomSession,
  getAccountDashboard,
  getAuthConfig,
  getEntitlements,
  getPackages,
  getPaymentConfig,
  getTimePool,
  pauseRoomSession,
  resumeRoomSession,
  signInWithGoogleCredential,
  type AccountSummary,
  type AuthConfig,
  type Entitlements,
  type ManualRoomPassResult,
  type PaymentConfig,
  type RoomPassSummary,
  type RoomSummary,
  type StreamingPackage,
  type TimePool,
  type TimePoolRoom,
} from "~/lib/realtime";

type GoogleCredentialResponse = { credential?: string };

type GoogleAccountsId = {
  initialize: (config: { callback: (response: GoogleCredentialResponse) => void; client_id: string }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      locale?: string;
      shape?: "pill" | "rectangular";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with";
      theme?: "filled_blue" | "filled_black" | "outline";
      type?: "standard" | "icon";
      width?: number;
    }
  ) => void;
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
        মেয়াদ উত্তীর্ণ
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
        পর্যবেক্ষণের অপেক্ষায়
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-[var(--text-muted)]">
      {status}
    </span>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}hours ${rm}min`;
  }
  return `${m}min ${s}sec`;
}

function RoomCard({
  room,
  pass,
  onClose,
  onPause,
  onResume,
  secondsUsed,
}: {
  room: RoomSummary;
  pass?: RoomPassSummary;
  onClose?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  secondsUsed?: number;
}) {
  const isExpired = room.expires_at ? new Date(room.expires_at) < new Date() : false;
  const isPaused = room.is_paused === 1;
  const expiryText = room.expires_at
    ? isExpired
      ? `মেয়াদ শেষ হয়েছে ${new Date(room.expires_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`
      : `মেয়াদ আছে ${new Date(room.expires_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`
    : "Timer starts when studio opens";

  return (
    <div className="rounded-[1.4rem] border border-[var(--border-soft)] bg-black/15 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[var(--text-main)]">{room.name}</h3>
            {pass && <StatusBadge status={pass.status} expiresAt={room.expires_at ?? undefined} />}
            {isPaused && (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-semibold text-yellow-400">
                <Pause size={11} /> Paused
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{expiryText}</p>
          {typeof secondsUsed === "number" && (
            <p className="mt-1 text-xs font-semibold text-[var(--accent-cyan)]">
              Used: {formatDuration(secondsUsed)}
            </p>
          )}
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
          id="walkthrough-studio-btn"
          to={`/studio?room=${room.id}`}
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
          <Camera size={14} /> ক্যামেরা জয়েন
        </Link>
        <Link
          to={`/watch?pin=${room.pin}`}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
            isExpired
              ? "border-[var(--border-soft)]/30 text-[var(--text-muted)]/50 cursor-not-allowed pointer-events-none"
              : "border-[var(--border-soft)] text-[var(--text-main)]"
          }`}
        >
          <Watch size={14} /> Watch Live
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
          <Copy size={14} /> Copy camera link
        </button>
        {!isExpired && !isPaused && onPause && (
          <button
            type="button"
            onClick={onPause}
            className="inline-flex items-center gap-2 rounded-full border border-yellow-500/40 px-4 py-2 text-sm font-semibold text-yellow-400 hover:bg-yellow-500/10"
          >
            <Pause size={14} /> Pause
          </button>
        )}
        {!isExpired && isPaused && onResume && (
          <button
            type="button"
            onClick={onResume}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-lime)]/40 px-4 py-2 text-sm font-semibold text-[var(--accent-lime)] hover:bg-[var(--accent-lime)]/10"
          >
            <Play size={14} /> পুনরায় শুরু করুন
          </button>
        )}
        {!isExpired && onClose && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("আপনি কি এই রুমটি বন্ধ করতে চান? লাইভ স্ট্রিমিং সাথে সাথে বন্ধ হয়ে যাবে।")) {
                onClose();
              }
            }}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--accent-coral)]/40 px-4 py-2 text-sm font-semibold text-[var(--accent-coral)] hover:bg-[var(--accent-coral)]/10"
          >
            <Power size={14} /> Close room
          </button>
        )}
      </div>
    </div>
  );
}

import { Walkthrough } from "~/components/walkthrough";

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
  const [entitlements, setEntitlements] = useState<Entitlements["entitlements"] | null>(null);
  const [purchases, setPurchases] = useState<Entitlements["purchases"]>([]);
  const [createRoomLoading, setCreateRoomLoading] = useState(false);
  const [createRoomError, setCreateRoomError] = useState<string | null>(null);
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [purchaseNotice, setPurchaseNotice] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [timePool, setTimePool] = useState<TimePool | null>(null);
  const [timePoolRooms, setTimePoolRooms] = useState<TimePoolRoom[]>([]);
  const [timePoolLoading, setTimePoolLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"rooms" | "archive" | "billing">("rooms");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

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

  async function handleCreateRoom() {
    setCreateRoomLoading(true);
    setCreateRoomError(null);
    try {
      const token = window.localStorage.getItem("live-studio-account-token");
      if (!token) throw new Error("Not authenticated");
      const result = await createRoomApi(token, newRoomName.trim() || "Live Match Room");
      setNewRoomName("");
      setShowCreateRoomModal(false);
      const dashboard = await getAccountDashboard(token);
      setData(dashboard);
      const ents = await getEntitlements(token);
      setEntitlements(ents.entitlements);
      setPurchases(ents.purchases);
    } catch (err: unknown) {
      setCreateRoomError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setCreateRoomLoading(false);
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
        roomName: roomName.trim() || "Live Match Room",
      });

      setPurchaseNotice("পেমেন্ট সফলভাবে সাবমিট হয়েছে। অ্যাডমিন অ্যাপ্রুভ করলে আপনার অ্যাকাউন্টে সময় যোগ হবে।");
      setBkashSenderNumber("");
      setBkashTransactionId("");
      setRoomName("");

      const dashboard = await getAccountDashboard(token);
      setData(dashboard);
      const ents = await getEntitlements(token);
      setEntitlements(ents.entitlements);
      setPurchases(ents.purchases);
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
      .then(() => {
        if (cancelled) return;
        const t = window.localStorage.getItem("live-studio-account-token");
        if (t) return getEntitlements(t);
      })
      .then((ents) => {
        if (cancelled || !ents) return;
        setEntitlements(ents.entitlements);
        setPurchases(ents.purchases);
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

  function handleLogout() {
    window.localStorage.removeItem("live-studio-account-token");
    navigate("/");
  }

  async function handleCloseRoom(roomId: string) {
    const token = window.localStorage.getItem("live-studio-account-token");
    if (!token) return;
    try {
      await expireRoomSession(roomId, token);
      const dashboard = await getAccountDashboard(token);
      setData(dashboard);
      await loadTimePool();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to close room");
    }
  }

  async function loadTimePool() {
    const token = window.localStorage.getItem("live-studio-account-token");
    if (!token) return;
    setTimePoolLoading(true);
    try {
      const result = await getTimePool(token);
      setTimePool(result.pool);
      setTimePoolRooms(result.rooms);
    } catch {
      // silently ignore time pool errors
    } finally {
      setTimePoolLoading(false);
    }
  }

  async function handlePauseRoom(roomId: string) {
    const token = window.localStorage.getItem("live-studio-account-token");
    if (!token) return;
    try {
      await pauseRoomSession(roomId, token);
      await loadTimePool();
      const dashboard = await getAccountDashboard(token);
      setData(dashboard);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to pause room");
    }
  }

  async function handleResumeRoom(roomId: string) {
    const token = window.localStorage.getItem("live-studio-account-token");
    if (!token) return;
    try {
      await resumeRoomSession(roomId, token);
      await loadTimePool();
      const dashboard = await getAccountDashboard(token);
      setData(dashboard);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resume room");
    }
  }

  useEffect(() => {
    if (data) {
      void loadTimePool();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.rooms.length]);

  const { activeRooms, archiveRooms } = useMemo(() => {
    if (!data) return { activeRooms: [], archiveRooms: [] };
    
    const active: RoomSummary[] = [];
    const archive: RoomSummary[] = [];
    
    data.rooms.forEach(room => {
      const isExpired = room.expires_at ? new Date(room.expires_at) < new Date() : false;
      const isActuallyExpired = room.status === 'expired' || isExpired;
      
      if (isActuallyExpired) {
        archive.push(room);
      } else {
        active.push(room);
      }
    });
    
    return { activeRooms: active, archiveRooms: archive };
  }, [data]);

  const paginatedItems = useMemo(() => {
    let list: any[] = [];
    if (activeTab === "rooms") list = activeRooms;
    else if (activeTab === "archive") list = archiveRooms;
    else if (activeTab === "billing") list = purchases;
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    return list.slice(startIndex, startIndex + itemsPerPage);
  }, [activeTab, activeRooms, archiveRooms, purchases, currentPage]);

  const totalPages = useMemo(() => {
    let list: any[] = [];
    if (activeTab === "rooms") list = activeRooms;
    else if (activeTab === "archive") list = archiveRooms;
    else if (activeTab === "billing") list = purchases;
    
    return Math.ceil(list.length / itemsPerPage);
  }, [activeTab, activeRooms, archiveRooms, purchases]);

  const handleTabChange = (tab: "rooms" | "archive" | "billing") => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

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

  const { account, passes } = data;

  return (
    <div className="relative min-h-screen bg-[#081217] text-[#edf7fb] selection:bg-[var(--accent-cyan)] selection:text-black">
      <Walkthrough />
      {/* Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-[var(--accent-cyan)] opacity-[0.02] blur-[120px] animate-pulse" />
        <div className="absolute top-[20%] -right-[5%] w-[35%] h-[35%] rounded-full bg-[var(--accent-lime)] opacity-[0.015] blur-[100px] animate-pulse delay-700" />
        <div className="absolute bottom-[10%] left-[20%] w-[30%] h-[30%] rounded-full bg-[var(--accent-coral)] opacity-[0.01] blur-[140px] animate-pulse delay-1000" />
      </div>

      <section className="relative z-10 mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 lg:px-10">
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
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-medium text-[var(--text-muted)]"
            >
              <LogOut size={16} />
              Logout
            </button>
          </nav>
        </header>

        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="rounded-[1.4rem] border border-[var(--accent-lime)]/25 bg-[var(--accent-lime)]/10 px-5 py-4">
            <p className="text-sm font-semibold text-[var(--text-main)]">{account.name}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{account.email}</p>
          </div>
          <button
            id="walkthrough-purchase-btn"
            type="button"
            onClick={() => { void loadInitialState(); setShowPurchaseModal(true); }}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-cyan)] px-4 py-2 text-sm font-semibold text-[#041016]"
          >
            <Clock3 size={14} /> Buy more
          </button>
        </div>

        {entitlements && (
          <div className="mb-6 rounded-[1.4rem] border border-[var(--border-soft)] bg-black/15 p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={16} className="text-[var(--accent-cyan)]" />
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-main)]">My Account</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[1rem] border border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-cyan)]">Available rooms</p>
                <p className="mt-1 text-2xl font-bold text-[var(--accent-cyan)]">{entitlements.availableRooms}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{entitlements.maxRooms}max</p>
              </div>
              <div className="rounded-[1rem] border border-[var(--accent-lime)]/30 bg-[var(--accent-lime)]/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-lime)]">অবশিষ্ট সময়</p>
                <p className="mt-1 text-2xl font-bold text-[var(--accent-lime)]">{Math.floor(entitlements.remainingSeconds / 60)}min</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{Math.floor(entitlements.usedSeconds / 60)}min ব্যবহৃত ({entitlements.totalMinutes}minের মধ্যে)</p>
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                id="walkthrough-create-room-btn"
                type="button"
                onClick={() => setShowCreateRoomModal(true)}
                disabled={entitlements.availableRooms <= 0 || entitlements.remainingSeconds <= 0}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-lime)] px-4 py-2 text-sm font-semibold text-[#041016] disabled:opacity-40"
              >
                <Video size={14} /> Create room
              </button>
              <button
                type="button"
                onClick={() => { void loadInitialState(); setShowPurchaseModal(true); }}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-cyan)] px-4 py-2 text-sm font-semibold text-[#041016]"
              >
                <Clock3 size={14} /> Buy more
              </button>
            </div>
          </div>
        )}

        <div className="mb-8 flex flex-wrap gap-4 border-b border-[var(--border-soft)]">
          <button
            onClick={() => handleTabChange("rooms")}
            className={`pb-3 text-sm font-semibold transition-all ${
              activeTab === "rooms"
                ? "border-b-2 border-[var(--accent-cyan)] text-[var(--accent-cyan)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            Live Rooms ({activeRooms.length})
          </button>
          <button
            onClick={() => handleTabChange("archive")}
            className={`pb-3 text-sm font-semibold transition-all ${
              activeTab === "archive"
                ? "border-b-2 border-[var(--accent-coral)] text-[var(--accent-coral)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            Archive ({archiveRooms.length})
          </button>
          <button
            onClick={() => handleTabChange("billing")}
            className={`pb-3 text-sm font-semibold transition-all ${
              activeTab === "billing"
                ? "border-b-2 border-[var(--accent-lime)] text-[var(--accent-lime)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            Billing ({purchases.length})
          </button>
        </div>

        <div className="mb-20">
          {activeTab === "rooms" && (
            <div className="space-y-4">
              {activeRooms.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-[var(--border-soft)] px-4 py-12 text-center">
                  <p className="text-sm text-[var(--text-muted)]">কোন Active রুম নেই।</p>
                  <button
                    onClick={() => setShowCreateRoomModal(true)}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--accent-lime)] px-4 py-2 text-sm font-semibold text-[#041016]"
                  >
                    <Video size={14} /> Create room
                  </button>
                </div>
              ) : (
                <>
                  {paginatedItems.map((room: RoomSummary) => {
                    const pass = passes.find((p) => p.room_id === room.id);
                    const poolRoom = timePoolRooms.find((r) => r.id === room.id);
                    return (
                      <RoomCard
                        key={room.id}
                        room={room}
                        pass={pass}
                        secondsUsed={poolRoom?.secondsUsed}
                        onClose={() => void handleCloseRoom(room.id)}
                        onPause={() => void handlePauseRoom(room.id)}
                        onResume={() => void handleResumeRoom(room.id)}
                      />
                    );
                  })}
                </>
              )}
            </div>
          )}

          {activeTab === "archive" && (
            <div className="space-y-4">
              {archiveRooms.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-[var(--border-soft)] px-4 py-12 text-center">
                  <p className="text-sm text-[var(--text-muted)]">কোন Archive রুম নেই।</p>
                </div>
              ) : (
                <>
                  {paginatedItems.map((room: RoomSummary) => {
                    const pass = passes.find((p) => p.room_id === room.id);
                    const poolRoom = timePoolRooms.find((r) => r.id === room.id);
                    return (
                      <RoomCard
                        key={room.id}
                        room={room}
                        pass={pass}
                        secondsUsed={poolRoom?.secondsUsed}
                      />
                    );
                  })}
                </>
              )}
            </div>
          )}

          {activeTab === "billing" && (
            <div className="space-y-4">
              {purchases.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-[var(--border-soft)] px-4 py-12 text-center">
                  <p className="text-sm text-[var(--text-muted)]">No purchase history.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {paginatedItems.map((purchase: any) => (
                    <div key={purchase.id} className="flex items-start justify-between rounded-[1rem] border border-[var(--border-soft)] bg-black/10 p-4">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-main)]">
                          {purchase.packageName} — {formatPackagePrice({ amountCents: purchase.amountCents, currency: purchase.currency })}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-cyan)]/10 px-2 py-0.5 text-xs text-[var(--accent-cyan)]">
                            <Clock3 size={10} /> {purchase.durationMinutes} min
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-lime)]/10 px-2 py-0.5 text-xs text-[var(--accent-lime)]">
                            <Video size={10} /> {purchase.maxRooms}টি রুম
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-[var(--text-muted)]">
                          Status: <span className={purchase.status === "paid" ? "text-[var(--accent-lime)]" : "text-yellow-400"}>{purchase.status === "paid" ? "Active" : purchase.status === "pending_manual_review" ? "পর্যবেক্ষণের অপেক্ষায়" : purchase.status}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--border-soft)] bg-black/10 px-3 py-2">
                    <Info size={14} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
                    <p className="text-xs text-[var(--text-muted)]">
                      প্রতিটি প্যাকেজ কিনলে আপনার অ্যাকাউন্টে সময় এবং রুম লিমিট যোগ হবে। সকল রুম একই টাইম বাজেট শেয়ার করে।
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="rounded-full border border-[var(--border-soft)] p-2 text-[var(--text-main)] disabled:opacity-30"
              >
                আগে
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`h-10 w-10 rounded-full text-sm font-semibold transition-all ${
                    currentPage === page
                      ? "bg-[var(--accent-cyan)] text-[#041016]"
                      : "border border-[var(--border-soft)] text-[var(--text-main)] hover:bg-white/10"
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="rounded-full border border-[var(--border-soft)] p-2 text-[var(--text-main)] disabled:opacity-30"
              >
                পরে
              </button>
            </div>
          )}
        </div>

        {showCreateRoomModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="glass-panel w-full max-w-md rounded-[2rem] p-6">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-[var(--text-main)]">Create room</h2>
                <button
                  type="button"
                  onClick={() => setShowCreateRoomModal(false)}
                  className="rounded-full border border-[var(--border-soft)] p-2 text-[var(--text-main)]"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Room name</label>
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="Live Match Room"
                    className="w-full rounded-xl border border-[var(--border-soft)] bg-black/20 px-4 py-3 text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)]"
                  />
                </div>
                {createRoomError && (
                  <p className="text-sm text-[var(--accent-coral)]">{createRoomError}</p>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateRoomModal(false)}
                    className="flex-1 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-main)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateRoom()}
                    disabled={createRoomLoading}
                    className="flex flex items-center gap-2 rounded-full bg-[var(--accent-lime)] px-4 py-2 text-sm font-semibold text-[#041016] disabled:opacity-50"
                  >
                    {createRoomLoading && <Loader2 size={14} className="animate-spin" />}
                    <Video size={14} /> Create
                  </button>
                </div>
              </div>
            </div>
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

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.02; transform: scale(1); }
          50% { opacity: 0.03; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
