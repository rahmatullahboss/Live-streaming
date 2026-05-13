import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";

import { confirmRoomPass, type RoomSummary } from "~/lib/realtime";

export default function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id") ?? "";
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError("   ।");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void confirmRoomPass(sessionId)
      .then((payload) => {
        if (!cancelled) {
          setRoom(payload.room);
        }
      })
      .catch((confirmError: unknown) => {
        if (!cancelled) {
          setError(
            confirmError instanceof Error
              ? confirmError.message
              : "     "
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const expiryText = useMemo(() => {
    if (!room?.expires_at) {
      return "   ।            ।";
    }

    return ` ${new Date(room.expires_at).toLocaleString()} `;
  }, [room?.expires_at]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-4 py-8 sm:px-6">
      <section className="glass-panel w-full rounded-[2rem] p-6 sm:p-8">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="mx-auto animate-spin text-[var(--accent-cyan)]" size={34} />
            <p className="mt-4 text-sm font-semibold text-[var(--text-main)]">
                  ...
            </p>
          </div>
        ) : error ? (
          <div className="py-16 text-center">
            <ShieldAlert className="mx-auto text-[var(--accent-coral)]" size={34} />
            <h1 data-display className="mt-4 text-3xl font-bold text-[var(--text-main)]">
              Checking payment.
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--text-muted)]">
              {error}
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex rounded-full border border-[var(--border-soft)] px-5 py-3 text-sm font-semibold text-[var(--text-main)]"
            >
               
            </Link>
          </div>
        ) : room ? (
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--accent-lime)]/25 bg-[var(--accent-lime)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-lime)]">
              <CheckCircle2 size={14} />
                
            </div>
            <h1 data-display className="text-4xl font-bold tracking-tight text-[var(--text-main)]">
              {room.name}
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              {expiryText}
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[1.5rem] border border-[var(--border-soft)] bg-black/15 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                   PIN
                </p>
                <p className="mt-3 text-4xl font-bold tracking-[0.24em] text-[var(--accent-lime)]">
                  {room.pin}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-[var(--border-soft)] bg-black/15 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Next step
                </p>
                <p className="mt-3 text-lg font-semibold text-[var(--text-main)]">
                   ,    ,       ।
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/studio"
                className="rounded-full bg-[var(--accent-cyan)] px-5 py-3 text-sm font-semibold text-[#041016]"
              >
                 Open
              </Link>
              <Link
                to="/camera"
                className="rounded-full border border-[var(--border-soft)] px-5 py-3 text-sm font-semibold text-[var(--text-main)]"
              >
                  
              </Link>
              <Link
                to="/watch"
                className="rounded-full border border-[var(--border-soft)] px-5 py-3 text-sm font-semibold text-[var(--text-main)]"
              >
                Viewer page
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
