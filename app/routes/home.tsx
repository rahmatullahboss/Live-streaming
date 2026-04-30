import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  Video,
} from "lucide-react";

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
import type { Route } from "./+types/home";

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleAccountsId = {
  initialize: (config: {
    callback: (response: GoogleCredentialResponse) => void;
    client_id: string;
  }) => void;
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
    google?: {
      accounts?: {
        id?: GoogleAccountsId;
      };
    };
  }
}

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Kinetic Command | Live Streaming Packages" },
    {
      name: "description",
      content:
        "Create a live streaming account, choose a package, and unlock a multi-camera director room after payment.",
    },
  ];
}

export default function Home() {
  const [packages, setPackages] = useState<StreamingPackage[]>([]);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState("starter-live");
  const [roomName, setRoomName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [bkashSenderNumber, setBkashSenderNumber] = useState("");
  const [bkashTransactionId, setBkashTransactionId] = useState("");
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [passes, setPasses] = useState<RoomPassSummary[]>([]);
  const [manualResult, setManualResult] = useState<ManualRoomPassResult | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  const selectedPackage = useMemo(
    () => packages.find((item) => item.id === selectedPackageId) ?? packages[0] ?? null,
    [packages, selectedPackageId]
  );

  useEffect(() => {
    void loadInitialState();

    const accessToken = window.localStorage.getItem("live-studio-account-token");
    if (accessToken) {
      void hydrateAccount(accessToken);
    }
  }, []);

  useEffect(() => {
    if (!authConfig?.googleClientId || account || !googleButtonRef.current) {
      return;
    }

    let cancelled = false;
    const renderGoogleButton = () => {
      if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) {
        return;
      }

      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        callback: (response) => void handleGoogleCredential(response),
        client_id: authConfig.googleClientId as string,
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        locale: "bn",
        shape: "pill",
        size: "large",
        text: "signup_with",
        theme: "outline",
        type: "standard",
        width: 320,
      });
    };
    const script = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    ) ?? document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", renderGoogleButton);

    if (!script.parentElement) {
      document.head.appendChild(script);
    } else {
      renderGoogleButton();
    }

    if (window.google?.accounts?.id) {
      renderGoogleButton();
    }

    return () => {
      cancelled = true;
      script.removeEventListener("load", renderGoogleButton);
    };
  }, [account, authConfig?.googleClientId]);

  async function loadInitialState() {
    setLoadingCatalog(true);
    setError(null);

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
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Could not load pricing");
    } finally {
      setLoadingCatalog(false);
    }
  }

  async function hydrateAccount(accessToken: string) {
    try {
      const dashboard = await getAccountDashboard(accessToken);
      setAccount({ ...dashboard.account, accessToken });
      setRooms(dashboard.rooms);
      setPasses(dashboard.passes);
      setCustomerEmail(dashboard.account.email);
      setCustomerPhone(dashboard.account.phone);
      setAccountName(dashboard.account.name);
    } catch {
      window.localStorage.removeItem("live-studio-account-token");
    }
  }

  async function handleGoogleCredential(response: GoogleCredentialResponse) {
    if (!response.credential) {
      setError("Google did not return a sign-in credential.");
      return;
    }

    setAuthLoading(true);
    setError(null);
    setNotice(null);

    try {
      const result = await signInWithGoogleCredential(response.credential);
      if (result.account.accessToken) {
        window.localStorage.setItem("live-studio-account-token", result.account.accessToken);
        await hydrateAccount(result.account.accessToken);
      }
      setNotice("Google account connected. Choose a package to continue.");
    } catch (authError: unknown) {
      setError(authError instanceof Error ? authError.message : "Could not sign in with Google");
    } finally {
      setAuthLoading(false);
    }
  }

  async function ensureAccount(): Promise<AccountSummary> {
    if (account?.accessToken) {
      return account;
    }

    const created = await createAccount({
      email: customerEmail,
      name: accountName,
      phone: customerPhone,
    });
    const accessToken = created.account.accessToken ?? "";
    window.localStorage.setItem("live-studio-account-token", accessToken);
    setAccount(created.account);
    return created.account;
  }

  async function handleManualPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPackage) {
      return;
    }

    setCheckoutLoading(true);
    setError(null);
    setNotice(null);
    setManualResult(null);

    try {
      const activeAccount = await ensureAccount();
      if (!activeAccount.accessToken) {
        throw new Error("Account token was not created");
      }

      const result = await createManualRoomPass({
        accessToken: activeAccount.accessToken,
        bkashSenderNumber,
        bkashTransactionId,
        packageId: selectedPackage.id,
        roomName,
      });
      setManualResult(result);
      setRooms((current) => [result.room, ...current]);
      setPasses((current) => [
        {
          amount_cents: result.payment.amountCents,
          currency: "bdt",
          duration_minutes: selectedPackage.duration_minutes,
          id: result.payment.id,
          package_id: selectedPackage.id,
          payment_provider: "bkash_manual",
          room_id: result.room.id,
          status: result.payment.status,
          tenant_id: result.room.tenant_id ?? activeAccount.id,
        },
        ...current,
      ]);
      setNotice("Payment submitted. Admin approval unlocks the room.");
    } catch (paymentError: unknown) {
      setError(paymentError instanceof Error ? paymentError.message : "Could not submit bKash payment");
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleStripeCheckout() {
    if (!selectedPackage) {
      return;
    }

    setCheckoutLoading(true);
    setError(null);
    setNotice(null);

    try {
      const activeAccount = await ensureAccount();
      const checkout = await createRoomPassCheckout({
        accessToken: activeAccount.accessToken,
        customerEmail: activeAccount.email || customerEmail,
        packageId: selectedPackage.id,
        roomName,
      });
      window.location.href = checkout.checkoutUrl;
    } catch (checkoutError: unknown) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Could not start Stripe checkout");
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <section className="mx-auto w-full max-w-7xl px-5 py-6 sm:px-8 lg:px-10">
        <header className="glass-panel mb-6 flex flex-wrap items-center justify-between gap-3 rounded-full px-4 py-3">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-cyan)]/15 text-sm font-semibold text-[var(--accent-cyan)]">
              KC
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--text-main)]">
                Kinetic Command
              </p>
              <p className="text-xs text-[var(--text-muted)]">Multi-tenant live studio</p>
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

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <section>
            <div className="mb-6">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--accent-lime)]/25 bg-[var(--accent-lime)]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-lime)]">
                <Video size={14} />
                Packages & pricing
              </div>
              <h1 data-display className="max-w-4xl text-4xl font-bold tracking-tight text-[var(--text-main)] sm:text-5xl">
                Buy a package, unlock a live production room.
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--text-muted)]">
                Every tenant gets isolated rooms, payment tracking, director access, and room-level graphics.
              </p>
            </div>

            {loadingCatalog ? (
              <StatePanel icon={<Loader2 className="animate-spin text-[var(--accent-cyan)]" size={24} />} text="Loading packages..." />
            ) : error && packages.length === 0 ? (
              <StatePanel
                action={<button type="button" onClick={() => void loadInitialState()} className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-main)]"><RefreshCcw size={16} />Retry</button>}
                icon={<ShieldCheck className="text-[var(--accent-coral)]" size={28} />}
                text={error}
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {packages.map((item) => (
                  <article
                    key={item.id}
                    className={`rounded-[1.4rem] border p-5 ${
                      selectedPackageId === item.id
                        ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10"
                        : "border-[var(--border-soft)] bg-black/15"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 data-display className="text-xl font-semibold text-[var(--text-main)]">
                          {item.name}
                        </h2>
                        <p className="mt-2 min-h-12 text-sm leading-6 text-[var(--text-muted)]">
                          {item.description}
                        </p>
                      </div>
                      {selectedPackageId === item.id ? <CheckCircle2 className="text-[var(--accent-cyan)]" size={20} /> : null}
                    </div>
                    <p data-display className="mt-5 text-3xl font-bold text-[var(--text-main)]">
                      {formatPackagePrice({ amountCents: item.price_cents, currency: item.currency })}
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      {item.duration_minutes} minutes · {item.max_cameras} cameras
                    </p>
                    <ul className="mt-4 space-y-2">
                      {item.features.map((feature) => (
                        <li key={feature} className="flex gap-2 text-sm text-[var(--text-muted)]">
                          <CheckCircle2 className="mt-0.5 shrink-0 text-[var(--accent-lime)]" size={15} />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => setSelectedPackageId(item.id)}
                      className="mt-5 w-full rounded-full border border-[var(--border-soft)] px-4 py-3 text-sm font-semibold text-[var(--text-main)]"
                    >
                      {selectedPackageId === item.id ? "Selected" : "Choose package"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <section className="glass-panel rounded-[1.5rem] p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 data-display className="text-xl font-semibold text-[var(--text-main)]">
                    Account & checkout
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                    Sign in, name the room, then pay by Stripe or submit bKash for review.
                  </p>
                </div>
                <Smartphone className="text-[var(--accent-cyan)]" size={20} />
              </div>

              {account ? (
                <div className="mb-4 rounded-[1.2rem] border border-[var(--accent-lime)]/25 bg-[var(--accent-lime)]/10 px-4 py-3">
                  <p className="text-sm font-semibold text-[var(--text-main)]">{account.name}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{account.email}</p>
                </div>
              ) : (
                <div className="mb-4 rounded-[1.2rem] border border-[var(--border-soft)] bg-black/15 p-4">
                  {authConfig?.googleClientId ? (
                    <div className="min-h-11">
                      <div ref={googleButtonRef} />
                      {authLoading ? (
                        <p className="mt-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                          <Loader2 className="animate-spin" size={14} /> Connecting Google account...
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">
                      Google sign-in needs GOOGLE_CLIENT_ID in production. Use email signup for now.
                    </p>
                  )}
                </div>
              )}

              <form onSubmit={handleManualPayment} className="space-y-3">
                <InputField label="Account name" onChange={setAccountName} required value={accountName} placeholder="City Club" />
                <InputField label="Email" onChange={setCustomerEmail} required type="email" value={customerEmail} placeholder="club@example.com" />
                <InputField label="Phone" onChange={setCustomerPhone} required type="tel" value={customerPhone} placeholder="01711111111" />
                <InputField label="Match / room name" onChange={setRoomName} required value={roomName} placeholder="Friday Night Match" />

                <div className="rounded-[1.2rem] border border-[var(--border-soft)] bg-black/15 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-lime)]">
                    Manual bKash
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    Merchant: {paymentConfig?.bkashMerchantNumber ?? "configured merchant number"}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <InputField label="bKash sender" onChange={setBkashSenderNumber} required type="tel" value={bkashSenderNumber} placeholder="01722222222" />
                    <InputField label="bKash TrxID" onChange={(value) => setBkashTransactionId(value.toUpperCase())} required value={bkashTransactionId} placeholder="BKASH12345" />
                  </div>
                </div>

                {error ? <Message tone="error" text={error} /> : null}
                {notice ? <Message tone="notice" text={notice} /> : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="submit"
                    disabled={checkoutLoading || !selectedPackage}
                    className="flex items-center justify-center gap-2 rounded-full bg-[var(--accent-cyan)] px-4 py-3 text-sm font-semibold text-[#041016] disabled:opacity-60"
                  >
                    {checkoutLoading ? <Loader2 className="animate-spin" size={16} /> : <Smartphone size={16} />}
                    Submit bKash
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStripeCheckout()}
                    disabled={checkoutLoading || !selectedPackage}
                    className="flex items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] px-4 py-3 text-sm font-semibold text-[var(--text-main)] disabled:opacity-60"
                  >
                    <CreditCard size={16} />
                    Stripe checkout
                  </button>
                </div>
              </form>
            </section>

            <section className="glass-panel rounded-[1.5rem] p-5">
              <h2 data-display className="text-lg font-semibold text-[var(--text-main)]">
                Your rooms
              </h2>
              {manualResult ? (
                <Message tone="notice" text={`Room PIN ${manualResult.room.pin} is reserved and waits for admin approval.`} />
              ) : null}
              {rooms.length === 0 ? (
                <div className="mt-4 rounded-[1.25rem] border border-dashed border-[var(--border-soft)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                  No rooms yet. Choose a package and submit payment to create one.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {rooms.slice(0, 5).map((room) => (
                    <div key={room.id} className="rounded-[1.15rem] border border-[var(--border-soft)] bg-black/15 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-main)]">{room.name}</p>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            PIN {room.pin} · {room.status ?? "active"}
                          </p>
                        </div>
                        <Clock3 className="text-[var(--accent-lime)]" size={16} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {passes.length > 0 ? (
                <p className="mt-4 text-xs text-[var(--text-muted)]">
                  {passes.length} purchase record{passes.length === 1 ? "" : "s"} linked to this account.
                </p>
              ) : null}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function InputField({
  label,
  onChange,
  placeholder,
  required = false,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: "email" | "tel" | "text";
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
        placeholder={placeholder}
      />
    </label>
  );
}

function Message({ text, tone }: { text: string; tone: "error" | "notice" }) {
  const isError = tone === "error";
  return (
    <div
      className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
        isError
          ? "border-[var(--accent-coral)]/30 bg-[var(--accent-coral)]/10 text-[#ffd8d4]"
          : "border-[var(--accent-lime)]/25 bg-[var(--accent-lime)]/10 text-[#d9ffe4]"
      }`}
    >
      {text}
    </div>
  );
}

function StatePanel({
  action,
  icon,
  text,
}: {
  action?: React.ReactNode;
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="glass-panel flex min-h-64 items-center justify-center rounded-[1.5rem] p-6 text-center">
      <div>
        <div className="flex justify-center">{icon}</div>
        <p className="mt-3 text-sm font-semibold text-[var(--text-main)]">{text}</p>
        {action}
      </div>
    </div>
  );
}
