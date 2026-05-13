import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Mail, Phone, User, Zap } from "lucide-react";

import {
  createAccount,
  getAuthConfig,
  signInWithGoogleCredential,
  type AuthConfig,
} from "~/lib/realtime";

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

export default function Auth() {
  const navigate = useNavigate();
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const accessToken = window.localStorage.getItem("live-studio-account-token");
    if (accessToken) {
      navigate("/dashboard");
    }
    void loadAuthConfig();
  }, [navigate]);

  useEffect(() => {
    if (!authConfig?.googleClientId || !googleButtonRef.current) return;

    const renderGoogleButton = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) return;

      window.google.accounts.id.initialize({
        callback: handleGoogleCredential,
        client_id: authConfig.googleClientId as string,
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        locale: "en",
        shape: "pill",
        size: "large",
        text: isLogin ? "signin_with" : "signup_with",
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

    return () => {
      script.removeEventListener("load", renderGoogleButton);
    };
  }, [authConfig?.googleClientId, isLogin]);

  async function loadAuthConfig() {
    try {
      const config = await getAuthConfig();
      setAuthConfig(config);
    } catch (err) {
      setError("Auth configuration load failed.");
    }
  }

  async function handleGoogleCredential(response: GoogleCredentialResponse) {
    if (!response.credential) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithGoogleCredential(response.credential);
      if (result.account.accessToken) {
        window.localStorage.setItem("live-studio-account-token", result.account.accessToken);
        window.localStorage.setItem("is-new-user", "true"); // Flag for walkthrough
        navigate("/dashboard");
      }
    } catch (err: any) {
      setError(err.message || "Google sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await createAccount({ email, name, phone });
      if (result.account.accessToken) {
        window.localStorage.setItem("live-studio-account-token", result.account.accessToken);
        window.localStorage.setItem("is-new-user", "true"); // Flag for walkthrough
        navigate("/dashboard");
      }
    } catch (err: any) {
      setError(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-[#081217] text-[#edf7fb] flex flex-col items-center justify-center p-6 selection:bg-[var(--accent-cyan)] selection:text-black">
      {/* Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-[var(--accent-cyan)] opacity-[0.03] blur-[120px] animate-pulse" />
        <div className="absolute top-[20%] -right-[5%] w-[35%] h-[35%] rounded-full bg-[var(--accent-lime)] opacity-[0.02] blur-[100px] animate-pulse delay-700" />
      </div>

      <main className="relative z-10 w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--accent-cyan)] transition-colors mb-8 group">
          <ArrowLeft className="group-hover:-translate-x-1 transition-transform" size={18} />
          <span>Go back</span>
        </Link>

        <div className="glass-panel rounded-[2.5rem] p-8 md:p-10">
          <div className="text-center mb-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-cyan)]/15 text-sm font-semibold text-[var(--accent-cyan)] mx-auto mb-4">
              OL
            </div>
            <h1 className="text-3xl font-black tracking-tight mb-2">
              {isLogin ? "Welcome" : "Create account"}
            </h1>
            <p className="text-[var(--text-muted)] text-sm">
              {isLogin ? "Sign in to your account" : "Start your journey with Overlays Studio"}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-[var(--accent-coral)]/10 border border-[var(--accent-coral)]/20 text-[var(--accent-coral)] text-xs font-bold text-center">
              {error}
            </div>
          )}

          <div className="space-y-6">
            <div ref={googleButtonRef} className="flex justify-center" />

            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/5"></div>
              </div>
              <span className="relative px-4 bg-transparent text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Or</span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
                  <input
                    type="text"
                    required
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/5 border border-white/10 focus:border-[var(--accent-cyan)] focus:bg-white/10 outline-none transition-all text-sm"
                  />
                </div>
              )}

              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
                <input
                  type="email"
                  required
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/5 border border-white/10 focus:border-[var(--accent-cyan)] focus:bg-white/10 outline-none transition-all text-sm"
                />
              </div>

              {!isLogin && (
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
                  <input
                    type="tel"
                    required
                    placeholder="Phone number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/5 border border-white/10 focus:border-[var(--accent-cyan)] focus:bg-white/10 outline-none transition-all text-sm"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-[var(--accent-cyan)] text-black font-black rounded-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : (isLogin ? "Sign in" : "Create account")}
                {!loading && <ArrowRight size={20} />}
              </button>
            </form>

            <p className="text-center text-sm text-[var(--text-muted)]">
              {isLogin ? "New user?" : "Already have an account?"} {" "}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-[var(--accent-cyan)] font-bold hover:underline"
              >
                {isLogin ? "Register" : "Sign in"}
              </button>
            </p>
          </div>
        </div>

        <div className="mt-12 text-center">
          <p className="text-[10px] text-[var(--text-muted)] uppercase font-bold tracking-[0.2em] flex items-center justify-center gap-2">
            <Zap size={12} className="text-[var(--accent-lime)]" />
            The future of local sports is now in your hands
          </p>
        </div>
      </main>
    </div>
  );
}
