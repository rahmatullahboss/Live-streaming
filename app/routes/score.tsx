import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { BadgeCheck, Clipboard, Loader2, Minus, Plus, RotateCcw, Save, ShieldAlert, Trophy } from "lucide-react";

import { ScoreboardOverlay } from "~/components/scoreboard-overlay";
import {
  applyCricketBall,
  applyScoreDelta,
  applyTeamScoreDelta,
  ballsToOvers,
  createDefaultScoringData,
  normalizeCricketScoringData,
  normalizeScoringData,
  toNumber,
  undoLastCricketEvent,
  undoLastTeamScoreDelta,
  type ScoringData,
  type SportType,
} from "~/lib/scoring";
import {
  getScoringSession,
  saveScoringSession,
  type OverlayConfig,
  type RoomSummary,
} from "~/lib/realtime";

const cricketSampleScoringData: ScoringData = {
  ...createDefaultScoringData("cricket"),
  balls: 93,
  batsman1_balls: "29",
  batsman1_name: "Shakib",
  batsman1_runs: "42",
  batsman2_balls: "18",
  batsman2_name: "Hridoy",
  batsman2_runs: "24",
  bowler_balls_this_over: "3",
  bowler_name: "Taskin Ahmed",
  current_rate: "8.00",
  extras: 7,
  innings: "2",
  max_overs: "20",
  overs: "15.3",
  partnership: "61",
  required_rate: "9.12",
  runs: 124,
  target: "166",
  wickets: 4,
};

const footballSampleScoringData: ScoringData = {
  ...createDefaultScoringData("football"),
  period: "2ND HALF",
  possession: "54-46",
};

type CricketBallControlInput = {
  extra?: boolean;
  legalBall: boolean;
  nextBatsmanName?: string;
  outBatter?: "batsman1" | "batsman2";
  runs: number;
  striker?: "batsman1" | "batsman2";
  wicket?: boolean;
};

const defaultOverlay: OverlayConfig = {
  ad_title: "",
  ad_video_url: "",
  clock_text: "00:00",
  external_overlay_active: 0,
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
 
        const sport = payload.overlay.sport ?? "football";
        const hydratedScoringData = {
          ...createDefaultScoringData(sport),
          ...(payload.overlay.scoring_data ?? {}),
        };
        const hydratedOverlay = {
          ...defaultOverlay,
          ...payload.overlay,
          external_scoreboard_url: "",
          scoreboard_active: payload.overlay.scoreboard_active ?? 1,
          scoring_data: normalizeScoringData(sport, hydratedScoringData),
        };
        lastSavedSnapshotRef.current = serializeScoringOverlay(hydratedOverlay);
        setRoom(payload.room);
        setOverlay(hydratedOverlay);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "স্কোর কন্ট্রোল রুম লোড করা সম্ভব হয়নি");
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
    setNotice("স্কোর সেভ হচ্ছে...");
    const timeoutId = window.setTimeout(() => {
      void saveScoringSession(token, prepareScoringOverlay(overlay))
        .then(() => {
          lastSavedSnapshotRef.current = snapshot;
          setNotice("স্কোর লাইভ আপডেট হয়েছে।");
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
      scoring_data:
        normalizeScoringData(current.sport ?? "football", {
          ...(current.scoring_data ?? {}),
          ...patch,
        }),
    }));
    setError(null);
  }

  function updateCricketScore(scoringData: ScoringData) {
    const normalized = normalizeCricketScoringData(scoringData);
    updateOverlay({
      scoring_data: normalized,
      team1_score: toNumber(normalized.runs),
      team2_score: toNumber(normalized.wickets),
    });
  }

  function updateTeamScore(team: "team1" | "team2", delta: number) {
    const result = applyTeamScoreDelta(overlay.scoring_data ?? {}, {
      delta,
      team,
      team1Score: overlay.team1_score,
      team2Score: overlay.team2_score,
    });
    updateOverlay({
      scoring_data: normalizeScoringData(overlay.sport ?? "football", result.scoringData),
      team1_score: result.team1Score,
      team2_score: result.team2Score,
    });
  }

  function undoTeamScore() {
    const result = undoLastTeamScoreDelta(overlay.scoring_data ?? {}, {
      team1Score: overlay.team1_score,
      team2Score: overlay.team2_score,
    });
    updateOverlay({
      scoring_data: normalizeScoringData(overlay.sport ?? "football", result.scoringData),
      team1_score: result.team1Score,
      team2_score: result.team2Score,
    });
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

  function applySampleScorecard(sport: "cricket" | "football") {
    if (sport === "cricket") {
      const scoringData = normalizeCricketScoringData(cricketSampleScoringData);
      updateOverlay({
        clock_text: "",
        match_status: "LIVE",
        scoreboard_active: 1,
        scoring_data: scoringData,
        sport: "cricket",
        team1_name: "Bangladesh",
        team1_score: toNumber(scoringData.runs),
        team2_name: "Sri Lanka",
        team2_score: toNumber(scoringData.wickets),
        ticker_active: 1,
        ticker_text: "Bangladesh need 42 runs from 27 balls · Shakib 42* · Hridoy 24* · Required rate 9.33",
      });
      return;
    }

    updateOverlay({
      clock_text: "68:24",
      match_status: "LIVE",
      scoreboard_active: 1,
      scoring_data: footballSampleScoringData,
      sport: "football",
      team1_name: "Dhaka United",
      team1_score: 2,
      team2_name: "Chittagong FC",
      team2_score: 1,
      ticker_active: 1,
      ticker_text: "Dhaka United lead 2-1 · 68 minutes played · Chittagong pushing for an equalizer",
    });
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice("স্কোর কন্ট্রোল লিঙ্ক কপি হয়েছে।");
    } catch {
      setError("এই ব্রাউজারে ক্লিপবোর্ড অ্যাক্সেস সম্ভব নয়।");
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
      setNotice("স্কোর লাইভ আপডেট হয়েছে।");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "স্কোর আপডেট সেভ করা সম্ভব হয়নি");
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
            স্কোর কন্ট্রোল
          </div>
          <h1 data-display className="text-4xl font-bold tracking-tight text-[var(--text-main)]">
            লাইভ স্কোর কনসোল।
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-muted)]">
            এই লিঙ্ক থেকে ম্যাচের স্কোর আপডেট করুন। প্রতিটি সেভ করা পরিবর্তন সরাসরি ব্রডকাস্টে দেখা যাবে।
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-main)]"
          >
            <Clipboard size={16} />
            লিঙ্ক কপি করুন
          </button>
          <Link
            to="/watch"
            className="rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm font-semibold text-[var(--text-main)]"
          >
            ভিউয়ার পেজ
          </Link>
        </div>
      </section>

      {loading ? (
        <StatePanel icon={<Loader2 className="animate-spin text-[var(--accent-cyan)]" size={28} />} text="স্কোর কন্ট্রোল লোড হচ্ছে..." />
      ) : error && !room ? (
        <StatePanel icon={<ShieldAlert className="text-[var(--accent-coral)]" size={32} />} text={error} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[460px_minmax(0,1fr)]">
          <section className="glass-panel rounded-[2rem] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 data-display className="text-xl font-semibold text-[var(--text-main)]">
                  {room?.name ?? "রুম"}
                </h2>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  লাইভ ম্যাচের সময় স্কোর আপডেট সহজ রাখার জন্য স্পোর্ট-স্পেসিফিক কন্ট্রোল ব্যবহার করুন।
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)]">
                {saving ? <Loader2 className="animate-spin" size={14} /> : <BadgeCheck size={14} />}
                {saving ? "সেভ হচ্ছে" : "লাইভ"}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                { id: "football", label: "ফুটবল" },
                { id: "cricket", label: "ক্রিকেট" },
                { id: "generic", label: "সাধারণ" },
              ].map((sport) => (
                <button
                  key={sport.id}
                  type="button"
                  onClick={() => changeSport(sport.id as SportType)}
                  className={`rounded-2xl px-3 py-3 text-xs font-semibold uppercase tracking-[0.14em] ${
                    overlay.sport === sport.id
                      ? "bg-[var(--accent-cyan)] text-[#041016]"
                      : "border border-[var(--border-soft)] text-[var(--text-main)]"
                  }`}
                >
                  {sport.label}
                </button>
              ))}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => applySampleScorecard("cricket")}
                className="rounded-2xl border border-[var(--border-soft)] px-3 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-main)]"
              >
                ক্রিকেট স্যাম্পল
              </button>
              <button
                type="button"
                onClick={() => applySampleScorecard("football")}
                className="rounded-2xl border border-[var(--border-soft)] px-3 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-main)]"
              >
                ফুটবল স্যাম্পল
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <InputField label="টিম ১" value={overlay.team1_name} onChange={(value) => updateOverlay({ team1_name: value })} />
              <InputField label="টিম ২" value={overlay.team2_name} onChange={(value) => updateOverlay({ team2_name: value })} />
            </div>

            {overlay.sport === "cricket" ? (
              <CricketControls
                data={overlay.scoring_data ?? {}}
                onBall={(input) => {
                  const scoringData = applyCricketBall(overlay.scoring_data ?? {}, input);
                  updateCricketScore(scoringData);
                }}
                onPatch={updateScoringData}
                onReset={() => updateOverlay({ scoring_data: createDefaultScoringData("cricket"), team1_score: 0, team2_score: 0 })}
                onUndo={() => updateCricketScore(undoLastCricketEvent(overlay.scoring_data ?? {}))}
                summary={cricketSummary}
              />
            ) : (
              <TeamScoreControls
                awayLabel={overlay.sport === "football" ? "অ্যাওয়ে গোল" : "টিম ২ স্কোর"}
                homeLabel={overlay.sport === "football" ? "হোম গোল" : "টিম ১ স্কোর"}
                onAwayDelta={(delta) => updateTeamScore("team2", delta)}
                onHomeDelta={(delta) => updateTeamScore("team1", delta)}
                onReset={() => updateOverlay({ scoring_data: createDefaultScoringData(overlay.sport ?? "football"), team1_score: 0, team2_score: 0 })}
                onUndo={undoTeamScore}
                team1Score={overlay.team1_score}
                team2Score={overlay.team2_score}
              />
            )}

            {overlay.sport === "football" ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <InputField label="ঘড়ি" value={overlay.clock_text ?? ""} onChange={(value) => updateOverlay({ clock_text: value })} placeholder="45:00" />
                <SelectField
                  label="পিরিয়ড"
                  value={`${overlay.scoring_data?.period ?? "১ম অর্ধাংশ"}`}
                  options={["১ম অর্ধাংশ", "বিরতি", "২য় অর্ধাংশ", "অতিরিক্ত সময়", "পেনাল্টি", "খেলা শেষ"]}
                  onChange={(value) => updateScoringData({ period: value })}
                />
                <InputField
                  label="পজেশন"
                  value={`${overlay.scoring_data?.possession ?? "50-50"}`}
                  onChange={(value) => updateScoringData({ possession: value })}
                  placeholder="55-45"
                />
              </div>
            ) : null}

{/* TODO: Re-enable overlay builder when custom panels are needed
            {overlay.sport !== "cricket" ? (
              <GenericOverlayBuilderControls data={overlay.scoring_data ?? {}} onPatch={updateScoringData} />
            ) : null}
            */}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <InputField label="স্ট্যাটাস" value={overlay.match_status ?? ""} onChange={(value) => updateOverlay({ match_status: value })} placeholder="LIVE" />
              <SelectField
                label="ওভারলে"
                value={overlay.scoreboard_active === 1 ? "চালু" : "বন্ধ"}
                options={["চালু", "বন্ধ"]}
                onChange={(value) => updateOverlay({ scoreboard_active: value === "চালু" ? 1 : 0 })}
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
              সেভ করুন
            </button>
          </section>

          <section className="glass-panel overflow-hidden rounded-[2rem] p-4">
            <div className="relative aspect-video min-h-[360px] overflow-hidden rounded-[1.75rem] border border-[var(--border-soft)] bg-[#04080d]">
              <div className="absolute inset-0 bg-[linear-gradient(135deg,#101820_0%,#112938_48%,#17201b_100%)]" />
              <div className="absolute inset-0 flex items-center justify-center text-center text-sm font-semibold uppercase tracking-[0.28em] text-white/20">
                ব্রডকাস্ট প্রিভিউ
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
  onUndo,
  summary,
}: {
  data: ScoringData;
  onBall: (input: CricketBallControlInput) => void;
  onPatch: (patch: ScoringData) => void;
  onReset: () => void;
  onUndo: () => void;
  summary: {
    balls: number;
    overs: string;
    runRate: string;
    runs: number;
    wickets: number;
  };
}) {
  const striker = getCricketBatterId(data.striker);
  const outBatter = getCricketBatterId(data.out_batter ?? data.striker);
  const nextBatsmanName = `${data.next_batsman_name ?? ""}`.trim();
  const strikerLabel = getCricketBatterLabel(striker);
  const outBatterLabel = getCricketBatterLabel(outBatter);

  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="রান" value={`${summary.runs}`} />
        <MiniStat label="উইকেট" value={`${summary.wickets}`} />
        <MiniStat label="ওভার" value={summary.overs} />
      </div>

      <FieldGroup label="লিগ্যাল বল">
        {[0, 1, 2, 3, 4, 5, 6].map((runs) => (
          <ScoreButton key={runs} label={`+${runs}`} onClick={() => onBall({ legalBall: true, runs, striker })} />
        ))}
      </FieldGroup>

      <FieldGroup label="অতিরিক্ত / উইকেট">
        <ScoreButton label="ওয়াইড +১" onClick={() => onBall({ legalBall: false, runs: 1, striker })} />
        <ScoreButton label="নো বল +১" onClick={() => onBall({ legalBall: false, runs: 1, striker })} />
        <ScoreButton label="বাই +১" onClick={() => onBall({ extra: true, legalBall: true, runs: 1, striker })} />
        <ScoreButton label="বাই +৪" onClick={() => onBall({ extra: true, legalBall: true, runs: 4, striker })} />
        <ScoreButton
          label="উইকেট"
          onClick={() =>
            onBall({
              legalBall: true,
              nextBatsmanName,
              outBatter,
              runs: 0,
              striker,
              wicket: true,
            })
          }
        />
        <ScoreButton label="আগেরটি বাতিল" icon={<RotateCcw size={14} />} onClick={onUndo} />
      </FieldGroup>

      <div className="grid gap-4 sm:grid-cols-2">
        <InputField label="টার্গেট" value={`${data.target ?? ""}`} onChange={(value) => onPatch({ target: value })} placeholder="156" />
        <InputField label="সর্বোচ্চ ওভার" value={`${data.max_overs ?? "20"}`} onChange={(value) => onPatch({ max_overs: value })} placeholder="20" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <InputField label="রান রেট" value={summary.runRate} readOnly />
        <InputField label="ওভারের বল" value={`${data.balls_in_over ?? 0}`} readOnly />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <InputField label="পার্টনারশিপ" value={`${data.partnership ?? ""}`} onChange={(value) => onPatch({ partnership: value })} placeholder="45" />
        <InputField label="প্রয়োজনীয় রেট" value={`${data.required_rate ?? ""}`} onChange={(value) => onPatch({ required_rate: value })} placeholder="6.50" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="ইনিংস"
          value={`${data.innings ?? 1}`}
          options={["1", "2"]}
          onChange={(value) => onPatch({ innings: value })}
        />
        <SelectField
          label="স্ট্রাইকার"
          value={strikerLabel}
          options={["ব্যাটসম্যান ১", "ব্যাটসম্যান ২"]}
          onChange={(value) => onPatch({ striker: value === "ব্যাটসম্যান ২" ? "batsman2" : "batsman1" })}
        />
        <SelectField
          label="আউট ব্যাটসম্যান"
          value={outBatterLabel}
          options={["ব্যাটসম্যান ১", "ব্যাটসম্যান ২"]}
          onChange={(value) => onPatch({ out_batter: value === "ব্যাটসম্যান ২" ? "batsman2" : "batsman1" })}
        />
      </div>

      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-lime)]">ব্যাটসম্যান</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <InputField label="ব্যাটসম্যান ১ নাম" value={`${data.batsman1_name ?? ""}`} onChange={(value) => onPatch({ batsman1_name: value })} placeholder="Kohli" />
            <div className="grid grid-cols-2 gap-2">
              <InputField label="রান" value={`${data.batsman1_runs ?? ""}`} onChange={(value) => onPatch({ batsman1_runs: value })} placeholder="45" />
              <InputField label="বল" value={`${data.batsman1_balls ?? ""}`} onChange={(value) => onPatch({ batsman1_balls: value })} placeholder="32" />
            </div>
          </div>
          <div className="space-y-2">
            <InputField label="ব্যাটসম্যান ২ নাম" value={`${data.batsman2_name ?? ""}`} onChange={(value) => onPatch({ batsman2_name: value })} placeholder="Gill" />
            <div className="grid grid-cols-2 gap-2">
              <InputField label="রান" value={`${data.batsman2_runs ?? ""}`} onChange={(value) => onPatch({ batsman2_runs: value })} placeholder="23" />
              <InputField label="বল" value={`${data.batsman2_balls ?? ""}`} onChange={(value) => onPatch({ batsman2_balls: value })} placeholder="18" />
            </div>
          </div>
        </div>
        <InputField
          label="নতুন ব্যাটসম্যান"
          value={`${data.next_batsman_name ?? ""}`}
          onChange={(value) => onPatch({ next_batsman_name: value })}
          placeholder="Mahmudullah"
        />
        {data.last_out_name ? (
          <div className="rounded-xl border border-[var(--accent-coral)]/25 bg-[var(--accent-coral)]/10 px-3 py-2 text-xs text-[#ffd8d4]">
            শেষ আউট: {data.last_out_name} {data.last_out_runs ?? 0} ({data.last_out_balls ?? 0})
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-lime)]">বোলার</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <InputField label="বোলার নাম" value={`${data.bowler_name ?? ""}`} onChange={(value) => onPatch({ bowler_name: value })} placeholder="Bumrah" />
          <InputField label="এই ওভারের বল" value={`${data.bowler_balls_this_over ?? ""}`} onChange={(value) => onPatch({ bowler_balls_this_over: value })} placeholder="2" />
        </div>
      </div>
    </div>
  );
}

function getCricketBatterId(value: number | string | undefined): "batsman1" | "batsman2" {
  return value === "batsman2" ? "batsman2" : "batsman1";
}

function getCricketBatterLabel(value: "batsman1" | "batsman2"): string {
  return value === "batsman2" ? "ব্যাটসম্যান ২" : "ব্যাটসম্যান ১";
}

function TeamScoreControls({
  awayLabel,
  homeLabel,
  onAwayDelta,
  onHomeDelta,
  onReset,
  onUndo,
  team1Score,
  team2Score,
}: {
  awayLabel: string;
  homeLabel: string;
  onAwayDelta: (delta: number) => void;
  onHomeDelta: (delta: number) => void;
  onReset: () => void;
  onUndo: () => void;
  team1Score: number;
  team2Score: number;
}) {
  return (
    <div className="mt-5 space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <ScoreStepper label={homeLabel} score={team1Score} onDelta={onHomeDelta} />
        <ScoreStepper label={awayLabel} score={team2Score} onDelta={onAwayDelta} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ScoreButton label="আগের স্কোর বাতিল" icon={<RotateCcw size={14} />} onClick={onUndo} />
        <ScoreButton label="স্কোর রিসেট" onClick={onReset} />
      </div>
    </div>
  );
}

function GenericOverlayBuilderControls({
  data,
  onPatch,
}: {
  data: ScoringData;
  onPatch: (patch: ScoringData) => void;
}) {
  return (
    <div className="mt-5 space-y-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-lime)]">Internal Overlay Builder</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="প্রিসেট"
          value={`${data.overlay_preset ?? "scoreboard"}`}
          options={["scoreboard", "lower-third", "sponsor-bug", "custom-panel"]}
          onChange={(value) => onPatch({ overlay_preset: value })}
        />
        <SelectField
          label="পজিশন"
          value={`${data.overlay_position ?? "top"}`}
          options={["top", "lower", "side"]}
          onChange={(value) => onPatch({ overlay_position: value })}
        />
      </div>
      <InputField label="শিরোনাম" value={`${data.overlay_title ?? ""}`} onChange={(value) => onPatch({ overlay_title: value })} placeholder="লাইভ ম্যাচ" />
      <InputField label="উপ-শিরোনাম" value={`${data.overlay_subtitle ?? ""}`} onChange={(value) => onPatch({ overlay_subtitle: value })} placeholder="ফাইনাল কোয়ার্টার" />
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField label="প্রাথমিক লেবেল" value={`${data.overlay_primary_label ?? ""}`} onChange={(value) => onPatch({ overlay_primary_label: value })} placeholder="খেলোয়াড়" />
        <InputField label="প্রাথমিক ভ্যালু" value={`${data.overlay_primary_value ?? ""}`} onChange={(value) => onPatch({ overlay_primary_value: value })} placeholder="রহিম" />
        <InputField label="দ্বিতীয় লেবেল" value={`${data.overlay_secondary_label ?? ""}`} onChange={(value) => onPatch({ overlay_secondary_label: value })} placeholder="দল" />
        <InputField label="দ্বিতীয় ভ্যালু" value={`${data.overlay_secondary_value ?? ""}`} onChange={(value) => onPatch({ overlay_secondary_value: value })} placeholder="ঢাকা" />
      </div>
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
  readOnly = false,
  value,
}: {
  label: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel-soft)] px-3 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--border-strong)] read-only:opacity-75"
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
