import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { BadgeCheck, Clipboard, Loader2, Minus, Plus, RotateCcw, Save, ShieldAlert, Trophy } from "lucide-react";

import { ScoreboardOverlay } from "~/components/scoreboard-overlay";
import {
  applyCricketBall,
  applyScoreDelta,
  ballsToOvers,
  createDefaultScoringData,
  toNumber,
  type ScoringData,
  type SportType,
} from "~/lib/scoring";
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
  scoreboard_active: 1,
  scoring_data: createDefaultScoringData("football"),
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

type ScoringSnapshot = Pick<
  OverlayConfig,
  | "clock_text"
  | "match_status"
  | "scoreboard_active"
  | "scoring_data"
  | "sport"
  | "team1_name"
  | "team1_score"
  | "team2_name"
  | "team2_score"
>;

export default function ScoreOperatorPage() {
  const { token } = useParams();
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [overlay, setOverlay] = useState<OverlayConfig>(defaultOverlay);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lastSavedSnapshotRef = useRef("");

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

        const hydratedOverlay = {
          ...defaultOverlay,
          ...payload.overlay,
          external_scoreboard_url: "",
          scoreboard_active: payload.overlay.scoreboard_active ?? 1,
          scoring_data: {
            ...createDefaultScoringData(payload.overlay.sport ?? "football"),
            ...(payload.overlay.scoring_data ?? {}),
          },
        };
        lastSavedSnapshotRef.current = serializeScoringOverlay(hydratedOverlay);
        setRoom(payload.room);
        setOverlay(hydratedOverlay);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load score control room");
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

  const cricketSummary = useMemo(() => {
    const data = overlay.scoring_data ?? {};
    const runs = toNumber(data.runs ?? overlay.team1_score);
    const balls = toNumber(data.balls);
    const runRate = balls > 0 ? ((runs / balls) * 6).toFixed(2) : "0.00";
    return {
      balls,
      overs: ballsToOvers(balls),
      runRate,
      runs,
      wickets: toNumber(data.wickets),
    };
  }, [overlay.scoring_data, overlay.team1_score]);

  useEffect(() => {
    if (!token || !room || loading) {
      return;
    }

    const snapshot = serializeScoringOverlay(overlay);
    if (snapshot === lastSavedSnapshotRef.current) {
      return;
    }

    setSaving(true);
    setNotice("Saving score...");
    const timeoutId = window.setTimeout(() => {
      void saveScoringSession(token, prepareScoringOverlay(overlay))
        .then(() => {
          lastSavedSnapshotRef.current = snapshot;
          setNotice("Score updated live.");
        })
        .catch((saveError: unknown) => {
          setError(saveError instanceof Error ? saveError.message : "Could not save score update");
        })
        .finally(() => {
          setSaving(false);
        });
    }, 450);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loading, overlay, room, token]);

  function updateOverlay(patch: Partial<OverlayConfig>) {
    setOverlay((current) => ({
      ...current,
      ...patch,
      external_scoreboard_url: "",
      scoreboard_active: patch.scoreboard_active ?? current.scoreboard_active ?? 1,
    }));
    setError(null);
  }

  function updateScoringData(patch: ScoringData) {
    setOverlay((current) => ({
      ...current,
      external_scoreboard_url: "",
      scoreboard_active: 1,
      scoring_data: {
        ...(current.scoring_data ?? {}),
        ...patch,
      },
    }));
    setError(null);
  }

  function changeSport(sport: SportType) {
    updateOverlay({
      clock_text: sport === "cricket" ? "" : "00:00",
      match_status: "LIVE",
      scoreboard_active: 1,
      scoring_data: createDefaultScoringData(sport),
      sport,
      team1_score: 0,
      team2_score: 0,
    });
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice("Score control link copied.");
    } catch {
      setError("Clipboard access failed on this browser.");
    }
  }

  async function handleManualSave() {
    if (!token) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveScoringSession(token, prepareScoringOverlay(overlay));
      lastSavedSnapshotRef.current = serializeScoringOverlay(overlay);
      setNotice("Score updated live.");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Could not save score update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6">
      <section className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-lime)]">
            <Trophy size={14} />
            Score Control
          </div>
          <h1 data-display className="text-4xl font-bold tracking-tight text-[var(--text-main)]">
            Live score console.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
            Update the match score from this shared link. Every saved change is drawn into the broadcast canvas.
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
        <StatePanel icon={<Loader2 className="animate-spin text-[var(--accent-cyan)]" size={28} />} text="Loading score control..." />
      ) : error && !room ? (
        <StatePanel icon={<ShieldAlert className="text-[var(--accent-coral)]" size={32} />} text={error} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[460px_minmax(0,1fr)]">
          <section className="glass-panel rounded-[2rem] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 data-display className="text-xl font-semibold text-[var(--text-main)]">
                  {room?.name ?? "Room"}
                </h2>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Sport-specific controls keep the overlay simple under live pressure.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)]">
                {saving ? <Loader2 className="animate-spin" size={14} /> : <BadgeCheck size={14} />}
                {saving ? "Saving" : "Live"}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {(["football", "cricket", "generic"] as const).map((sport) => (
                <button
                  key={sport}
                  type="button"
                  onClick={() => changeSport(sport)}
                  className={`rounded-2xl px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] ${
                    overlay.sport === sport
                      ? "bg-[var(--accent-cyan)] text-[#041016]"
                      : "border border-[var(--border-soft)] text-[var(--text-main)]"
                  }`}
                >
                  {sport}
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <InputField label="Team 1" value={overlay.team1_name} onChange={(value) => updateOverlay({ team1_name: value })} />
              <InputField label="Team 2" value={overlay.team2_name} onChange={(value) => updateOverlay({ team2_name: value })} />
            </div>

            {overlay.sport === "cricket" ? (
              <CricketControls
                data={overlay.scoring_data ?? {}}
                onBall={(runs, legalBall, wicket = false) => {
                  const scoringData = applyCricketBall(overlay.scoring_data ?? {}, { legalBall, runs, wicket });
                  updateOverlay({
                    scoring_data: scoringData,
                    team1_score: toNumber(scoringData.runs),
                    team2_score: toNumber(scoringData.wickets),
                  });
                }}
                onPatch={updateScoringData}
                onReset={() => updateOverlay({ scoring_data: createDefaultScoringData("cricket"), team1_score: 0, team2_score: 0 })}
                summary={cricketSummary}
              />
            ) : (
              <TeamScoreControls
                awayLabel={overlay.sport === "football" ? "Away Goals" : "Team 2 Score"}
                homeLabel={overlay.sport === "football" ? "Home Goals" : "Team 1 Score"}
                onAwayDelta={(delta) => updateOverlay({ team2_score: applyScoreDelta(overlay.team2_score, delta) })}
                onHomeDelta={(delta) => updateOverlay({ team1_score: applyScoreDelta(overlay.team1_score, delta) })}
                team1Score={overlay.team1_score}
                team2Score={overlay.team2_score}
              />
            )}

            {overlay.sport === "football" ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <InputField label="Clock" value={overlay.clock_text ?? ""} onChange={(value) => updateOverlay({ clock_text: value })} placeholder="45:00" />
                <SelectField
                  label="Period"
                  value={`${overlay.scoring_data?.period ?? "1ST HALF"}`}
                  options={["1ST HALF", "HALF TIME", "2ND HALF", "EXTRA TIME", "PENALTIES", "FULL TIME"]}
                  onChange={(value) => updateScoringData({ period: value })}
                />
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <InputField label="Status" value={overlay.match_status ?? ""} onChange={(value) => updateOverlay({ match_status: value })} placeholder="LIVE" />
              <SelectField
                label="Overlay"
                value={overlay.scoreboard_active === 1 ? "ON" : "OFF"}
                options={["ON", "OFF"]}
                onChange={(value) => updateOverlay({ scoreboard_active: value === "ON" ? 1 : 0 })}
              />
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
              onClick={() => void handleManualSave()}
              disabled={saving}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent-coral)] px-5 py-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              Save Now
            </button>
          </section>

          <section className="glass-panel overflow-hidden rounded-[2rem] p-4">
            <div className="relative aspect-video min-h-[360px] overflow-hidden rounded-[1.75rem] border border-[var(--border-soft)] bg-[#04080d]">
              <div className="absolute inset-0 bg-[linear-gradient(135deg,#101820_0%,#112938_48%,#17201b_100%)]" />
              <div className="absolute inset-0 flex items-center justify-center text-center text-sm font-semibold uppercase tracking-[0.28em] text-white/20">
                Broadcast Preview
              </div>
              <ScoreboardOverlay overlay={overlay} />
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function CricketControls({
  data,
  onBall,
  onPatch,
  onReset,
  summary,
}: {
  data: ScoringData;
  onBall: (runs: number, legalBall: boolean, wicket?: boolean) => void;
  onPatch: (patch: ScoringData) => void;
  onReset: () => void;
  summary: {
    balls: number;
    overs: string;
    runRate: string;
    runs: number;
    wickets: number;
  };
}) {
  function undoLastLegalBall() {
    const balls = Math.max(0, summary.balls - 1);
    const runRate = balls > 0 ? ((summary.runs / balls) * 6).toFixed(2) : "0.00";
    onPatch({
      balls,
      current_rate: runRate,
      overs: ballsToOvers(balls),
    });
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Runs" value={`${summary.runs}`} />
        <MiniStat label="Wickets" value={`${summary.wickets}`} />
        <MiniStat label="Overs" value={summary.overs} />
      </div>

      <FieldGroup label="Legal Ball">
        {[0, 1, 2, 3, 4, 5, 6].map((runs) => (
          <ScoreButton key={runs} label={`+${runs}`} onClick={() => onBall(runs, true)} />
        ))}
      </FieldGroup>

      <FieldGroup label="Extras / Wicket">
        <ScoreButton label="Wide +1" onClick={() => onBall(1, false)} />
        <ScoreButton label="No Ball +1" onClick={() => onBall(1, false)} />
        <ScoreButton label="Wicket" onClick={() => onBall(0, true, true)} />
        <ScoreButton label="Undo Ball" icon={<RotateCcw size={14} />} onClick={undoLastLegalBall} />
      </FieldGroup>

      <div className="grid gap-4 sm:grid-cols-2">
        <InputField label="Target" value={`${data.target ?? ""}`} onChange={(value) => onPatch({ target: value })} placeholder="156" />
        <InputField label="Run Rate" value={summary.runRate} onChange={() => undefined} />
      </div>
    </div>
  );
}

function TeamScoreControls({
  awayLabel,
  homeLabel,
  onAwayDelta,
  onHomeDelta,
  team1Score,
  team2Score,
}: {
  awayLabel: string;
  homeLabel: string;
  onAwayDelta: (delta: number) => void;
  onHomeDelta: (delta: number) => void;
  team1Score: number;
  team2Score: number;
}) {
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <ScoreStepper label={homeLabel} score={team1Score} onDelta={onHomeDelta} />
      <ScoreStepper label={awayLabel} score={team2Score} onDelta={onAwayDelta} />
    </div>
  );
}

function ScoreStepper({
  label,
  onDelta,
  score,
}: {
  label: string;
  onDelta: (delta: number) => void;
  score: number;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onDelta(-1)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-soft)] text-[var(--text-main)]"
        >
          <Minus size={18} />
        </button>
        <div data-display className="text-4xl font-bold text-[var(--text-main)]">
          {score}
        </div>
        <button
          type="button"
          onClick={() => onDelta(1)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-lime)] text-[#041016]"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}

function InputField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
      />
    </label>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--border-strong)]"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function FieldGroup({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{children}</div>
    </div>
  );
}

function ScoreButton({
  icon,
  label,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border-soft)] px-3 py-2 text-sm font-semibold text-[var(--text-main)]"
    >
      {icon}
      {label}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{label}</p>
      <p data-display className="mt-1 text-2xl font-bold text-[var(--text-main)]">
        {value}
      </p>
    </div>
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

function prepareScoringOverlay(overlay: OverlayConfig): OverlayConfig {
  return {
    ...overlay,
    external_scoreboard_url: "",
    scoreboard_active: overlay.scoreboard_active ?? 1,
  };
}

function serializeScoringOverlay(overlay: OverlayConfig): string {
  const snapshot: ScoringSnapshot = {
    clock_text: overlay.clock_text,
    match_status: overlay.match_status,
    scoreboard_active: overlay.scoreboard_active,
    scoring_data: overlay.scoring_data,
    sport: overlay.sport,
    team1_name: overlay.team1_name,
    team1_score: overlay.team1_score,
    team2_name: overlay.team2_name,
    team2_score: overlay.team2_score,
  };
  return JSON.stringify(snapshot);
}
