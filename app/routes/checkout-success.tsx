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
      setError("Checkout session is missing.");
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
              : "Could not activate the room pass"
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
      return "Ready to start. The 3-hour timer begins when the director opens the studio.";
    }

    return `Valid until ${new Date(room.expires_at).toLocaleString()}`;
  }, [room?.expires_at]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-4 py-8 sm:px-6">
      <section className="glass-panel w-full rounded-[2rem] p-6 sm:p-8">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="mx-auto animate-spin text-[var(--accent-cyan)]" size={34} />
            <p className="mt-4 text-sm font-semibold text-[var(--text-main)]">
              Activating your streaming room...
            </p>
          </div>
        ) : error ? (
          <div className="py-16 text-center">
            <ShieldAlert className="mx-auto text-[var(--accent-coral)]" size={34} />
            <h1 data-display className="mt-4 text-3xl font-bold text-[var(--text-main)]">
              Payment needs attention.
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--text-muted)]">
              {error}
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex rounded-full border border-[var(--border-soft)] px-5 py-3 text-sm font-semibold text-[var(--text-main)]"
            >
              Back Home
            </Link>
          </div>
        ) : room ? (
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--accent-lime)]/25 bg-[var(--accent-lime)]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-lime)]">
              <CheckCircle2 size={14} />
              Room Active
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
                  Room PIN
                </p>
                <p className="mt-3 text-4xl font-bold tracking-[0.24em] text-[var(--accent-lime)]">
                  {room.pin}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-[var(--border-soft)] bg-black/15 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Next Step
                </p>
                <p className="mt-3 text-lg font-semibold text-[var(--text-main)]">
                  Open studio, join with the PIN, then share camera and viewer links.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/studio"
                className="rounded-full bg-[var(--accent-cyan)] px-5 py-3 text-sm font-semibold text-[#041016]"
              >
                Open Studio
              </Link>
              <Link
                to="/camera"
                className="rounded-full border border-[var(--border-soft)] px-5 py-3 text-sm font-semibold text-[var(--text-main)]"
              >
                Join Camera
              </Link>
              <Link
                to="/watch"
                className="rounded-full border border-[var(--border-soft)] px-5 py-3 text-sm font-semibold text-[var(--text-main)]"
              >
                Viewer Page
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
