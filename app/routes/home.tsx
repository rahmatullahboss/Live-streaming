import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Clock3,
  Cloud,
  CreditCard,
  Globe,
  Layout,
  Loader2,
  LogOut,
  Play,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  Video,
  Zap,
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
    { title: "Overlays | Multi-Cam Live Studio" },
    {
      name: "description",
      content:
        "Stream school football and cricket matches live — starting at just 150 BDT. Professional multi-cam production with just 3 phones.",
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
      window.location.href = "/dashboard";
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
        window.location.href = "/dashboard";
      }
    } catch (authError: unknown) {
      setError(authError instanceof Error ? authError.message : "Could not sign in with Google");
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem("live-studio-account-token");
    setAccount(null);
    setRooms([]);
    setPasses([]);
    setAccountName("");
    setCustomerEmail("");
    setCustomerPhone("");
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
      window.location.href = "/dashboard";
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
    <div className="relative min-h-screen bg-[#081217] text-[#edf7fb] selection:bg-[var(--accent-cyan)] selection:text-black">
      {/* Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] animate-pulse" />
        <div className="absolute top-[20%] -right-[5%] w-[35%] h-[35%] rounded-full bg-[var(--accent-lime)] opacity-[0.02] blur-[100px] animate-pulse delay-700" />
        <div className="absolute bottom-[10%] left-[20%] w-[30%] h-[30%] rounded-full bg-[var(--accent-coral)] opacity-[0.015] blur-[140px] animate-pulse delay-1000" />
      </div>

      <main className="relative z-10">
        {/* Navbar */}
        <nav className="sticky top-0 z-50 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between glass-panel rounded-full px-6 py-2">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-cyan)]/15 text-sm font-semibold text-[var(--accent-cyan)]">
                OL
              </div>
              <span className="text-sm font-bold uppercase tracking-[0.2em]">Overlays</span>
            </Link>
            
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--accent-cyan)] transition-colors">Features</a>
              <a href="#how-it-works" className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--accent-cyan)] transition-colors">How it works</a>
              <a href="#pricing" className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--accent-cyan)] transition-colors">Pricing</a>
            </div>

            <div className="flex items-center gap-4">
              <Link to="/watch" className="hidden sm:block text-sm font-medium hover:text-[var(--accent-cyan)] transition-colors">Watch Live</Link>
              <Link
                to={account ? "/dashboard" : "/auth"}
                className="px-5 py-2 rounded-full bg-[var(--accent-cyan)] text-black text-sm font-bold hover:scale-105 active:scale-95 transition-all"
              >
                {account ? "Dashboard" : "Get Started"}
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="relative pt-20 pb-32 px-6 overflow-hidden">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent-lime)]/10 border border-[var(--accent-lime)]/20 text-[var(--accent-lime)] text-[10px] font-bold uppercase tracking-widest mb-8 animate-fade-in">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-lime)] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent-lime)]"></span>
                </span>
                The Future of Local Sports
              </div>

              <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.85] mb-8">
                Live Broadcast <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-cyan)] via-[var(--accent-lime)] to-[var(--accent-cyan)] animate-gradient-x">At Pro Level.</span>
              </h1>

              <p className="text-lg md:text-xl text-[var(--text-muted)] max-w-xl mb-12 leading-relaxed">
                Turn your smartphones into a professional multi-camera studio.
                Live scoreboard and professional overlays — for local matches,
                starting at just 150 BDT.
              </p>

              <div className="flex flex-wrap gap-4">
                <a
                  href="#pricing"
                  className="px-8 py-4 bg-[var(--accent-cyan)] text-black font-black rounded-full flex items-center gap-2 hover:translate-y-[-2px] hover:shadow-[0_8px_30px_rgb(80,216,255,0.4)] transition-all group"
                >
                  Start Your Match <ArrowRight className="group-hover:translate-x-1 transition-transform" size={20} />
                </a>
                <Link
                  to="/watch"
                  className="px-8 py-4 bg-white/5 border border-white/10 font-bold rounded-full hover:bg-white/10 transition-all"
                >
                  Watch Demo
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="relative glass-panel rounded-[2.5rem] p-4 aspect-video overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-tr from-[var(--accent-cyan)]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-full h-full bg-black/40 rounded-[2rem] flex items-center justify-center relative">
                   <div className="absolute top-4 left-4 flex gap-2">
                      <div className="w-12 h-6 rounded-md bg-red-600 flex items-center justify-center text-[10px] font-bold">LIVE</div>
                      <div className="w-20 h-6 rounded-md bg-black/60 border border-white/20 backdrop-blur-md flex items-center justify-center text-[10px]">00:14:23</div>
                   </div>
                   <div className="text-center group-hover:scale-110 transition-transform duration-500">
                      <div className="w-16 h-16 rounded-full bg-[var(--accent-cyan)] flex items-center justify-center text-black shadow-[0_0_40px_rgba(80,216,255,0.5)]">
                        <Play fill="currentColor" size={24} />
                      </div>
                   </div>
                   <div className="absolute bottom-4 inset-x-4 flex justify-between items-end">
                      <div className="glass-panel p-2 px-4 rounded-lg">
                        <p className="text-[10px] text-cyan-400 font-bold uppercase">Multi-Cam Studio</p>
                        <p className="text-xs font-bold">Bangladesh vs India</p>
                      </div>
                      <div className="flex -space-x-2">
                        <div className="w-8 h-8 rounded-full border-2 border-black bg-slate-800 flex items-center justify-center text-[10px]">C1</div>
                        <div className="w-8 h-8 rounded-full border-2 border-black bg-slate-800 flex items-center justify-center text-[10px]">C2</div>
                        <div className="w-8 h-8 rounded-full border-2 border-black bg-slate-800 flex items-center justify-center text-[10px]">C3</div>
                      </div>
                   </div>
                </div>
              </div>
              
              {/* Floating UI Elements */}
              <div className="absolute -top-6 -right-6 glass-panel p-4 rounded-2xl animate-float">
                <Layout className="text-[var(--accent-cyan)] mb-2" size={20} />
                <p className="text-[10px] font-bold uppercase tracking-tighter">Pro Overlays</p>
              </div>
              <div className="absolute -bottom-10 -left-6 glass-panel p-4 rounded-2xl animate-float delay-700">
                <Smartphone className="text-[var(--accent-lime)] mb-2" size={20} />
                <p className="text-[10px] font-bold uppercase tracking-tighter">3 Phone Setup</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-32 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl font-black mb-6">আপনার যা প্রয়োজন সবকিছুই এক লিঙ্কে।</h2>
              <p className="text-[var(--text-muted)] max-w-xl mx-auto">
                No expensive cameras or heavy software needed. Just your phone and willingness.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <FeatureCard 
                icon={<Smartphone size={32} />}
                title="Multi-Cam Sync"
                description="Connect up to 5 smartphones simultaneously. Change camera angles like a professional TV crew."
                color="var(--accent-cyan)"
              />
              <FeatureCard 
                icon={<Layout size={32} />}
                title="Pro Scoreboard"
                description="Dynamic overlays for cricket and football. Customize team names and colors."
                color="var(--accent-lime)"
              />
              <FeatureCard 
                icon={<Zap size={32} />}
                title="Ultra-Low Latency"
                description="কোন ল্যাগ ছাড়াই স্ট্রিমিং। মাঠে যা ঘটছে দর্শক ঠিক সেই মুহূর্তেই দেখতে পাবে।"
                color="var(--accent-coral)"
              />
              <FeatureCard 
                icon={<Globe size={32} />}
                title="যেকোনো জায়গায় ব্রডকাস্ট"
                description="Go live directly on Facebook, YouTube, or our high-speed platform."
                color="var(--accent-cyan)"
              />
            </div>
          </div>
        </section>

        {/* How it Works Section */}
        <section id="how-it-works" className="py-32 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row items-end justify-between mb-20 gap-8">
               <div className="max-w-2xl">
                 <h2 className="text-4xl md:text-6xl font-black tracking-tight mb-6">Go <span className="text-[var(--accent-lime)]">live in 3 easy steps.</span></h2>
                 <p className="text-[var(--text-muted)] text-lg">Forget the technical hassle and focus on the game.</p>
               </div>
               <div className="flex gap-4">
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                    <Clock3 className="text-[var(--accent-cyan)] mb-2" size={24} />
                    <p className="text-[10px] font-bold uppercase">2 min <br/> setup</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                    <ShieldCheck className="text-[var(--accent-lime)] mb-2" size={24} />
                    <p className="text-[10px] font-bold uppercase">Zero lag <br/> guarantee</p>
                  </div>
               </div>
            </div>

            <div className="grid md:grid-cols-3 gap-12 relative">
              {/* Connector line for desktop */}
              <div className="hidden md:block absolute top-1/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent -z-10" />
              
              <Step 
                number="01" 
                title="Choose a plan" 
                description="আপনার প্রয়োজন অনুযায়ী প্ল্যান বেছে নিন। বিকাশ বা ক্রেডিট কার্ড দিয়ে পেমেন্ট করা যাবে।"
                icon={<CreditCard className="text-[var(--accent-cyan)]" size={32} />}
              />
              <Step 
                number="02" 
                title="Sync devices" 
                description="ল্যাপটপে আপনার স্টুডিও লিঙ্কটি ওপেন করুন এবং স্মার্টফোন দিয়ে কিউআর কোড স্ক্যান করুন।"
                icon={<Smartphone className="text-[var(--accent-lime)]" size={32} />}
              />
              <Step 
                number="03" 
                title="Start live" 
                description="Control the scoreboard, switch camera angles, and connect with your viewers."
                icon={<Video className="text-[var(--accent-coral)]" size={32} />}
              />
            </div>
          </div>
        </section>

        {/* Pricing Section (The Form) */}
        <section id="pricing" className="py-32 px-6 relative bg-black/20">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-12">
            <div className="lg:col-span-7">
               <div className="mb-12">
                 <h2 className="text-4xl md:text-6xl font-black mb-8 leading-[0.9]">Are you <br/> <span className="text-[var(--accent-cyan)]">ready?</span></h2>
                 <p className="text-[var(--text-muted)] max-w-md">
                   আপনার প্রোডাকশন সাইজ অনুযায়ী প্ল্যান বেছে নিন। প্রতিটি প্ল্যানে আমাদের ৮কে মাল্টি-ক্যাম স্টুডিও এবং প্রো ওভারলে অন্তর্ভুক্ত।
                 </p>
               </div>

               <div className="grid sm:grid-cols-2 gap-4">
                 {packages.map((item) => (
                   <article
                     key={item.id}
                     className="group relative rounded-3xl border border-[var(--border-soft)] bg-black/20 overflow-hidden"
                   >
                     <div className="p-6">
                       <div className="p-3 rounded-2xl bg-white/5 w-fit mb-4">
                          <PackageIcon id={item.id} />
                       </div>
                       
                       <h3 className="text-xl font-bold mb-2">{item.name}</h3>
                       <p className="text-xs text-[var(--text-muted)] mb-6 line-clamp-2">{item.description}</p>
                       
                       <div className="flex items-baseline gap-1 mb-6">
                         <span className="text-3xl font-black">৳{item.price_cents / 100}</span>
                         <span className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-widest">/ match</span>
                       </div>

                       <ul className="space-y-2 mb-6">
                         {item.features.slice(0, 3).map((f) => (
                           <li key={f} className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                             <CheckCircle2 className="text-[var(--accent-lime)]" size={12} /> {f}
                           </li>
                         ))}
                       </ul>
                     </div>
                   </article>
                 ))}
               </div>
            </div>

            <div className="lg:col-span-5">
              <aside className="glass-panel rounded-[2.5rem] p-8 sticky top-24 text-center">
                <div className="mb-8">
                  <div className="w-16 h-16 bg-[var(--accent-cyan)]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Zap className="text-[var(--accent-cyan)]" size={32} />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">লাইভ যাওয়ার জন্য ready?</h3>
                  <p className="text-sm text-[var(--text-muted)] mb-8">
                    আপনার অ্যাকাউন্ট তৈরি করুন এবং কয়েক মিনিটের মধ্যেই প্রথম প্রফেশনাল ব্রডকাস্ট শুরু করুন।
                  </p>
                  
                  <Link 
                    to="/dashboard" 
                    className="w-full py-4 bg-[var(--accent-cyan)] text-black font-black rounded-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    Start Now <ArrowRight size={20} />
                  </Link>
                </div>

                <div className="flex items-center justify-center gap-4 pt-8 border-t border-white/5 grayscale opacity-50">
                   <ShieldCheck size={20} />
                   <span className="text-[10px] font-bold uppercase tracking-widest text-white">Secure Payment</span>
                </div>
              </aside>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="py-32 px-6">
           <div className="max-w-7xl mx-auto">
              <h2 className="text-center text-3xl font-bold mb-16">Those who trust us</h2>
              <div className="grid md:grid-cols-3 gap-8">
                 <TestimonialCard 
                    quote="The scoreboard overlays look just like TV. Our viewers love it!"
                    author="Rahim Ahmed"
                    role="District Football Coach"
                 />
                 <TestimonialCard 
                    quote="Found an affordable way to stream school matches without professional gear."
                    author="Samuel Islam"
                    role="Sports Coordinator"
                 />
                 <TestimonialCard 
                    quote="শুধু ফোন দিয়েই ৩টি ক্যামেরা সেটআপ করা অবাক করার মতো সহজ ছিল। কোন ল্যাগ নেই।"
                    author="Tanvir Hossain"
                    role="Live Streamer"
                 />
              </div>
           </div>
        </section>

        {/* FAQ Section */}
        <section className="py-32 px-6 bg-black/20">
           <div className="max-w-3xl mx-auto">
              <h2 className="text-4xl font-black mb-12 text-center tracking-tight">সাধারণ কিছু <span className="text-[var(--accent-cyan)]">জিজ্ঞাসা।</span></h2>
              <div className="space-y-6">
                 <FAQItem 
                    question="Do I need any special equipment?"
                    answer="না। আপনার শুধু একটি ল্যাপটপ (স্টুডিওর জন্য) এবং অন্তত একটি স্মার্টফোন প্রয়োজন। মাল্টি-ক্যাম সেটআপের জন্য ৫টি পর্যন্ত স্মার্টফোন সিঙ্ক করা যায়।"
                 />
                 <FAQItem 
                    question="আমি কোথায় আমার ম্যাচগুলো স্ট্রিম করতে পারি?"
                    answer="You can stream directly on Facebook, YouTube, or our optimized platform."
                 />
                 <FAQItem 
                    question="৮কে কোয়ালিটি কি সত্যিই কাজ করে?"
                    answer="Yes, if your smartphone supports 4K recording and you have a stable high-speed internet connection."
                 />
                 <FAQItem 
                    question="Can I record my matches?"
                    answer="হ্যাঁ! প্রতিটি স্ট্রিম স্বয়ংক্রিয়ভাবে আর্কাইভ হয়ে যায় এবং পরবর্তীতে দেখার জন্য আপনার ড্যাশবোর্ড থেকে ডাউনলোড করা যায়।"
                 />
                 <FAQItem 
                    question="What sports are supported?"
                    answer="We currently provide professional overlays for cricket and football. We are adding kabaddi and basketball soon!"
                 />
                 <FAQItem 
                    question="Can I add my own team logo?"
                    answer="Absolutely. You can upload custom team logos and sponsor banners directly in studio settings."
                 />
              </div>
           </div>
        </section>

        {/* Footer */}
        <footer className="py-20 px-6 border-t border-white/5">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-cyan)]/15 text-sm font-semibold text-[var(--accent-cyan)]">
                OL
              </div>
              <span className="text-sm font-bold uppercase tracking-[0.2em]">Overlays</span>
            </div>
            
            <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-[0.2em] flex items-center gap-4">
              <span>© 2026 Overlays Studio</span>
              <span className="w-1 h-1 bg-white/20 rounded-full" />
              <span className="flex items-center gap-1">
                 <Cloud size={10} className="text-cyan-400" />
                 Powered by Cloudflare
              </span>
            </p>

            <div className="flex items-center gap-6">
              <Link to="/watch" className="text-xs font-bold hover:text-[var(--accent-cyan)] transition-colors">WATCH</Link>
              <Link to="/dashboard" className="text-xs font-bold hover:text-[var(--accent-cyan)] transition-colors">DASHBOARD</Link>
              <Link to="/admin" className="text-xs font-bold hover:text-[var(--accent-cyan)] transition-colors">ADMIN</Link>
            </div>
          </div>
        </footer>
      </main>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-fade-in { animation: fade-in 1s ease-out forwards; }
        .animate-float { animation: float 5s ease-in-out infinite; }
        .animate-gradient-x { background-size: 200% 200%; animation: gradient-x 15s ease infinite; }
      `}</style>
    </div>
  );
}

function FeatureCard({ icon, title, description, color }: { icon: React.ReactNode, title: string, description: string, color: string }) {
  return (
    <div className="glass-panel p-8 rounded-[2rem] hover:translate-y-[-8px] transition-all group">
      <div className="mb-6 p-4 rounded-2xl w-fit bg-white/5 group-hover:bg-white/10 transition-colors" style={{ color }}>
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-4">{title}</h3>
      <p className="text-sm text-[var(--text-muted)] leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function Step({ number, title, description, icon }: { number: string, title: string, description: string, icon: React.ReactNode }) {
  return (
    <div className="relative group">
      <div className="text-[120px] font-black text-white/[0.03] absolute -top-12 -left-6 pointer-events-none group-hover:text-[var(--accent-cyan)]/5 transition-colors">
        {number}
      </div>
      <div className="relative pt-8">
        <div className="mb-6">{icon}</div>
        <h3 className="text-xl font-bold mb-4 tracking-tight">{title}</h3>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

function PackageIcon({ id }: { id: string }) {
  if (id === 'starter-live') return <Video size={24} />;
  if (id === 'standard-live') return <Zap size={24} />;
  return <Smartphone size={24} />;
}

function TestimonialCard({ quote, author, role }: { quote: string, author: string, role: string }) {
  return (
    <div className="glass-panel p-8 rounded-[2rem] border-white/5 relative">
       <div className="text-4xl text-[var(--accent-cyan)] absolute -top-4 left-6 opacity-20">"</div>
       <p className="text-sm text-[var(--text-muted)] italic mb-6 leading-relaxed">
          {quote}
       </p>
       <div>
          <p className="font-bold">{author}</p>
          <p className="text-[10px] text-[var(--accent-cyan)] uppercase font-bold tracking-widest">{role}</p>
       </div>
    </div>
  );
}

function FAQItem({ question, answer }: { question: string, answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="glass-panel rounded-2xl overflow-hidden border-white/5">
       <button 
          onClick={() => setIsOpen(!isOpen)}
          className="w-full p-6 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
       >
          <span className="font-bold text-sm tracking-tight">{question}</span>
          <ArrowRight className={`transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`} size={16} />
       </button>
       <div className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-40 p-6 pt-0 opacity-100' : 'max-h-0 opacity-0'}`}>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">{answer}</p>
       </div>
    </div>
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
