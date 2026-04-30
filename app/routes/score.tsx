import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { Clipboard, ExternalLink, Loader2, Save, ShieldAlert, Trophy } from "lucide-react";

import { ScoreboardOverlay } from "~/components/scoreboard-overlay";
import {
  getScoringSession,
  saveScoringSession,
  type OverlayConfig,
  type RoomSummary,
} from "~/lib/realtime";

const defaultOverlay: OverlayConfig = {
  ad_title: "",
  ad_video_url: "",
  clock_text: "00:00",
  external_scoreboard_url: "",
  left_logo_url: "",
  logo_url: "",
  match_status: "LIVE",
  program_source: "live",
  right_logo_url: "",
  scoreboard_active: 0,
  scoring_data: {},
  sponsor_text: "",
  sport: "football",
  team1_name: "TEAM A",
  team1_score: 0,
  team2_name: "TEAM B",
  team2_score: 0,
  theme_variant: "broadcast",
  ticker_active: 0,
  ticker_text: "",
};

export default function ScoreOperatorPage() {
  const { token } = useParams();
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [overlay, setOverlay] = useState<OverlayConfig>(defaultOverlay);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Score overlay token is missing.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void getScoringSession(token)
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setRoom(payload.room);
        setOverlay({
          ...defaultOverlay,
          ...payload.overlay,
          scoring_data: payload.overlay.scoring_data ?? {},
        });
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load score overlay room");
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
  }, [token]);

  function updateOverlay(field: keyof OverlayConfig, value: OverlayConfig[keyof OverlayConfig]) {
    setOverlay((current) => ({
      ...current,
      [field]: value,
    }));
    setNotice(null);
  }

  async function handleSave() {
    if (!token) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      await saveScoringSession(token, {
        ...overlay,
        scoreboard_active: overlay.external_scoreboard_url?.trim() ? overlay.scoreboard_active : 0,
      });
      setNotice("External score overlay saved for this room.");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Could not save score overlay");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice("Score overlay settings link copied.");
    } catch {
      setError("Clipboard access failed on this browser.");
    }
  }

  const externalUrl = overlay.external_scoreboard_url?.trim() ?? "";

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 sm:px-6">
      <section className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-lime)]">
            <Trophy size={14} />
            External Score Overlay
          </div>
          <h1 data-display className="text-4xl font-bold tracking-tight text-[var(--text-main)]">
            Score link handoff.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
            Paste the scoring website overlay URL here. The detailed scoring work stays on the
            external service, while this room only stores and displays the overlay link.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-main)]"
          >
            <Clipboard size={16} />
            Copy Link
          </button>
          <Link
            to="/watch"
            className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-main)]"
          >
            Viewer Page
          </Link>
        </div>
      </section>

      {loading ? (
        <StatePanel icon={<Loader2 className="animate-spin text-[var(--accent-cyan)]" size={28} />} text="Loading score overlay settings..." />
      ) : error && !room ? (
        <StatePanel icon={<ShieldAlert className="text-[var(--accent-coral)]" size={32} />} text={error} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
          <section className="glass-panel rounded-[2rem] p-5">
            <div>
              <h2 data-display className="text-xl font-semibold text-[var(--text-main)]">
                {room?.name ?? "Room"}
              </h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Keep this on only when the external page is ready and embeddable.
              </p>
            </div>

            <label className="mt-5 block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Overlay Website URL
              </span>
              <input
                type="url"
                value={overlay.external_scoreboard_url ?? ""}
                onChange={(event) => updateOverlay("external_scoreboard_url", event.target.value)}
                className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
                placeholder="https://scores.example.com/overlay/match-1"
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => updateOverlay("scoreboard_active", overlay.scoreboard_active === 1 ? 0 : 1)}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                  overlay.scoreboard_active === 1
                    ? "bg-[var(--accent-lime)] text-[#041016]"
                    : "border border-[var(--border-soft)] text-[var(--text-main)]"
                }`}
              >
                {overlay.scoreboard_active === 1 ? "Overlay On" : "Overlay Off"}
              </button>

              {externalUrl ? (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-main)]"
                >
                  <ExternalLink size={14} />
                  Open Source
                </a>
              ) : null}
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-[var(--accent-coral)]/30 bg-[var(--accent-coral)]/10 px-4 py-3 text-sm text-[#ffd8d4]">
                {error}
              </div>
            ) : null}

            {notice ? (
              <div className="mt-4 rounded-2xl border border-[var(--accent-lime)]/25 bg-[var(--accent-lime)]/10 px-4 py-3 text-sm text-[#d9ffe4]">
                {notice}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent-coral)] px-5 py-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              Save Overlay Link
            </button>
          </section>

          <section className="glass-panel overflow-hidden rounded-[2rem] p-4">
            <div className="relative min-h-[60vh] overflow-hidden rounded-[1.75rem] border border-[var(--border-soft)] bg-[#04080d]">
              <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-5 py-5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-cyan)]">
                    Website Overlay Preview
                  </p>
                  <p className="text-sm font-semibold text-white/90">
                    {overlay.scoreboard_active === 1 && externalUrl ? "External score is visible" : "External score is off"}
                  </p>
                </div>
              </div>

              <div className="flex min-h-[60vh] items-center justify-center px-6 py-10 text-center text-white/50">
                The iframe preview appears here when the external overlay URL is saved and enabled.
              </div>

              <ScoreboardOverlay overlay={overlay} />
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function StatePanel({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="glass-panel flex min-h-[50vh] items-center justify-center rounded-[2rem]">
      <div className="max-w-md text-center">
        <div className="mx-auto flex justify-center">{icon}</div>
        <p className="mt-4 text-lg font-semibold text-[var(--text-main)]">{text}</p>
      </div>
    </div>
  );
}
