import type { OverlayConfig } from "~/lib/realtime";

type ScoreboardOverlayProps = {
  className?: string;
  overlay: OverlayConfig;
};

function getOverlayPosition(overlay: OverlayConfig): string {
  return `${overlay.scoring_data?.overlay_position ?? "top"}`.trim();
}

function getPlacementClasses(overlay: OverlayConfig): string {
  const position = getOverlayPosition(overlay);
  if (position === "lower") {
    return "justify-end pb-5";
  }
  if (position === "side") {
    return "items-end";
  }
  return "items-start";
}

/* ─── Tiny team crest shown inside scorecard panels ─── */
function TeamCrest({ url, alt, size = "sm" }: { alt: string; size?: "sm" | "md"; url?: string | null }) {
  if (!url) return null;
  const px = size === "md" ? "h-8 w-8 sm:h-10 sm:w-10" : "h-6 w-6 sm:h-7 sm:w-7";
  return (
    <img
      src={url}
      alt={alt}
      crossOrigin="anonymous"
      className={`${px} shrink-0 rounded-lg border border-white/10 bg-black/30 object-contain p-[2px] shadow-[0_4px_12px_rgba(0,0,0,0.4)]`}
    />
  );
}

/* ═══════════════════════════════════════════════════════
   Main Overlay Component
   ═══════════════════════════════════════════════════════ */
export function ScoreboardOverlay({ className = "", overlay }: ScoreboardOverlayProps) {
  const showTicker = overlay.ticker_active === 1 && Boolean(overlay.ticker_text?.trim());
  const externalScoreboardUrl = overlay.external_scoreboard_url?.trim() ?? "";
  const showBuiltInScoreboard = overlay.scoreboard_active === 1;
  const showExternalScoreboard = overlay.external_overlay_active === 1 && Boolean(externalScoreboardUrl);
  const showTickerRail = showTicker && !showExternalScoreboard;
  const hasTopLogos = Boolean(overlay.left_logo_url || overlay.right_logo_url);
  const sponsorText = overlay.sponsor_text?.trim() ?? "";
  const statusLabel = overlay.match_status?.trim() || "LIVE";
  const lowerCricketInlineTicker =
    showBuiltInScoreboard && showTickerRail && overlay.sport === "cricket" && getOverlayPosition(overlay) === "lower";

  if (!showBuiltInScoreboard && !showExternalScoreboard && !showTicker && !hasTopLogos && !sponsorText) {
    return null;
  }

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 flex flex-col px-3 pt-2 sm:px-5 sm:pt-3 ${getPlacementClasses(overlay)} ${className}`}
    >
      {showExternalScoreboard ? (
        <iframe
          title="External scoreboard overlay"
          src={externalScoreboardUrl}
          className="absolute inset-0 h-full w-full border-0 bg-transparent"
          allow="autoplay; fullscreen"
        />
      ) : null}

      {/* Top-level broadcast logos */}
      {hasTopLogos && !showExternalScoreboard ? (
        <div className="mb-1 flex w-full items-start justify-between gap-3">
          {overlay.left_logo_url ? (
            <img
              src={overlay.left_logo_url}
              alt="Left logo"
              crossOrigin="anonymous"
              className="h-10 w-10 rounded-xl border border-white/10 bg-black/30 object-contain p-0.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)] sm:h-12 sm:w-12"
            />
          ) : <div className="h-10 w-10 sm:h-12 sm:w-12" />}
          {overlay.right_logo_url ? (
            <img
              src={overlay.right_logo_url}
              alt="Right logo"
              crossOrigin="anonymous"
              className="h-10 w-10 rounded-xl border border-white/10 bg-black/30 object-contain p-0.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)] sm:h-12 sm:w-12"
            />
          ) : <div className="h-10 w-10 sm:h-12 sm:w-12" />}
        </div>
      ) : null}

      {showBuiltInScoreboard ? (
        <div className={`w-full ${overlay.sport === "cricket" ? "max-w-5xl" : "max-w-2xl"}`}>
          {overlay.sport === "cricket" ? (
            <CricketScorecard overlay={overlay} sponsorText={sponsorText} statusLabel={statusLabel} />
          ) : overlay.sport === "football" ? (
            <FootballScorecard overlay={overlay} sponsorText={sponsorText} statusLabel={statusLabel} />
          ) : (
            <GenericScorecard overlay={overlay} sponsorText={sponsorText} statusLabel={statusLabel} />
          )}
        </div>
      ) : null}

      {/* Ticker — fully contained */}
      {showTickerRail && !lowerCricketInlineTicker ? (
        <TickerRail text={overlay.ticker_text ?? ""} />
      ) : null}
    </div>
  );
}

function TickerRail({ compact = false, text }: { compact?: boolean; text: string }) {
  return (
    <div className={`${compact ? "" : "mt-2"} w-full max-w-5xl overflow-hidden rounded-full border border-white/10 bg-[#0a1219]/92 backdrop-blur-md`}>
      <div className="flex items-center gap-0">
        <div className="shrink-0 rounded-full bg-[#e53e3e] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white sm:px-4 sm:text-xs">
          আপডেট
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="scoreboard-ticker whitespace-nowrap py-2 pl-4 text-sm font-medium text-white/90 sm:text-base">
            {text}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ⚽ Football Scorecard — ESPN / Sky Sports inspired
   Compact horizontal bar with team logos flanking the score
   ═══════════════════════════════════════════════════════ */
function FootballScorecard({
  overlay,
  sponsorText,
  statusLabel,
}: {
  overlay: OverlayConfig;
  sponsorText: string;
  statusLabel: string;
}) {
  const period = `${overlay.scoring_data?.period ?? ""}`.trim();
  const clock = overlay.clock_text ?? "00:00";

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a1219]/88 shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      {/* Main score strip */}
      <div className="flex items-center">
        {/* Team 1 */}
        <div className="flex flex-1 items-center justify-end gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
          <span className="min-w-0 truncate text-right text-xs font-bold uppercase tracking-wide text-white sm:text-sm">
            {overlay.team1_name}
          </span>
          <TeamCrest url={overlay.team1_logo_url} alt={overlay.team1_name} size="md" />
        </div>

        {/* Score center */}
        <div className="flex shrink-0 items-center gap-1 bg-[#111c28] px-4 py-2 sm:px-5">
          <span data-display className="text-2xl font-extrabold tabular-nums text-[#ff7a6b] sm:text-3xl">
            {overlay.team1_score}
          </span>
          <span className="mx-1 text-lg text-white/30">–</span>
          <span data-display className="text-2xl font-extrabold tabular-nums text-[#baff66] sm:text-3xl">
            {overlay.team2_score}
          </span>
        </div>

        {/* Team 2 */}
        <div className="flex flex-1 items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
          <TeamCrest url={overlay.team2_logo_url} alt={overlay.team2_name} size="md" />
          <span className="min-w-0 truncate text-xs font-bold uppercase tracking-wide text-white sm:text-sm">
            {overlay.team2_name}
          </span>
        </div>
      </div>

      {/* Bottom info strip */}
      <div className="flex items-center justify-center gap-3 border-t border-white/8 bg-[#081017]/60 px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50 sm:text-xs">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#e53e3e] shadow-[0_0_6px_#e53e3e]" />
          {statusLabel}
        </span>
        {period ? (
          <>
            <span className="text-white/20">·</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50 sm:text-xs">{period}</span>
          </>
        ) : null}
        <span className="text-white/20">·</span>
        <span data-display className="text-xs font-bold tabular-nums text-white/70 sm:text-sm">{clock}</span>
        {sponsorText ? (
          <>
            <span className="text-white/20">·</span>
            <span className="text-[9px] tracking-[0.12em] text-white/35 sm:text-[10px]">{sponsorText}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Cricket scorecard — TV-style match lower-third
   ═══════════════════════════════════════════════════════ */
function CricketScorecard({
  overlay,
  sponsorText,
  statusLabel,
}: {
  overlay: OverlayConfig;
  sponsorText: string;
  statusLabel: string;
}) {
  const runs = `${overlay.scoring_data?.runs ?? overlay.team1_score}`;
  const wickets = `${overlay.scoring_data?.wickets ?? 0}`;
  const overs = `${overlay.scoring_data?.overs ?? "0.0"}`;
  const target = `${overlay.scoring_data?.target ?? ""}`.trim();
  const currentRate = `${overlay.scoring_data?.current_rate ?? ""}`.trim();
  const requiredRate = `${overlay.scoring_data?.required_rate ?? ""}`.trim();
  const ballsInOver = Number(overlay.scoring_data?.balls_in_over ?? 0);
  const partnership = `${overlay.scoring_data?.partnership ?? ""}`.trim();
  const innings = overlay.scoring_data?.innings ? `${overlay.scoring_data.innings}` : "";
  const maxOvers = `${overlay.scoring_data?.max_overs ?? ""}`.trim();
  const extras = `${overlay.scoring_data?.extras ?? 0}`.trim();
  const batsman1Name = getScoringLabel(overlay, "batsman1_name", "স্ট্রাইকার");
  const batsman2Name = getScoringLabel(overlay, "batsman2_name", "নন-স্ট্রাইকার");
  const batsman1Runs = getScoringLabel(overlay, "batsman1_runs", "0");
  const batsman1Balls = getScoringLabel(overlay, "batsman1_balls", "0");
  const batsman2Runs = getScoringLabel(overlay, "batsman2_runs", "0");
  const batsman2Balls = getScoringLabel(overlay, "batsman2_balls", "0");
  const bowlerName = getScoringLabel(overlay, "bowler_name", overlay.team2_name);
  const bowlerBalls = getScoringLabel(overlay, "bowler_balls_this_over", `${ballsInOver}`);
  const lastOutName = getScoringLabel(overlay, "last_out_name", "");
  const lastOutRuns = getScoringLabel(overlay, "last_out_runs", "0");
  const lastOutBalls = getScoringLabel(overlay, "last_out_balls", "0");
  const runsNeeded = Math.max(0, parseScoreNumber(target) - parseScoreNumber(runs));
  const hasTicker = overlay.ticker_active === 1 && Boolean(overlay.ticker_text?.trim());
  const chaseLine = target
    ? `${runsNeeded} রান দরকার`
    : "প্রথম ইনিংস";

  return (
    <div className="overflow-hidden rounded-xl border border-white/12 bg-[#071116]/94 shadow-[0_18px_56px_rgba(0,0,0,0.55)] backdrop-blur-xl">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] border-b border-white/10">
        <div className="min-w-0">
          <div className="flex min-h-[58px] items-center gap-3 bg-[#11252d] px-3 py-2 sm:px-4">
            <TeamCrest url={overlay.team1_logo_url} alt={overlay.team1_name} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="truncate text-sm font-black uppercase text-white sm:text-lg">{overlay.team1_name}</p>
                <span className="rounded bg-[#f5c542] px-1.5 py-0.5 text-[9px] font-black uppercase text-[#091116] sm:text-[10px]">
                  {innings ? `INN ${innings}` : "BAT"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e13f31] px-2 py-0.5 text-[9px] font-black uppercase text-white sm:text-[10px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  {statusLabel}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[10px] font-semibold text-white/55 sm:text-xs">
                বনাম {overlay.team2_name} {maxOvers ? `| ${maxOvers} ওভার ম্যাচ` : ""}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 border-t border-white/8 bg-[#08171d] sm:grid-cols-[1fr_1fr_190px]">
            <CricketPlayerLine balls={batsman1Balls} name={batsman1Name} runs={batsman1Runs} striker />
            <CricketPlayerLine balls={batsman2Balls} name={batsman2Name} runs={batsman2Runs} />
            <div className="col-span-2 flex items-center justify-between gap-2 border-t border-white/8 px-3 py-2 text-[10px] font-bold text-white/70 sm:col-span-1 sm:border-l sm:border-t-0">
              <span className="truncate text-white/45">BOWLER</span>
              <span className="truncate text-right text-white">{bowlerName}</span>
              <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 tabular-nums text-[#f5c542]">
                {bowlerBalls}/6
              </span>
            </div>
          </div>
        </div>

        <div className="flex min-w-[128px] flex-col items-center justify-center bg-[#f5c542] px-3 py-2 text-[#071116] sm:min-w-[156px] sm:px-5">
          <div data-display className="flex items-baseline justify-center leading-none">
            <span className="text-4xl font-black tabular-nums sm:text-5xl">{runs}</span>
            <span className="mx-0.5 text-2xl font-black text-[#071116]/45">/</span>
            <span className="text-2xl font-black tabular-nums sm:text-3xl">{wickets}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] font-black uppercase tabular-nums sm:text-xs">
            <span>{overs} OV</span>
            <BallDots count={ballsInOver} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-[#03080b]/82 px-3 py-2 sm:px-4">
        <CricketInfoPill label="CRR" value={currentRate || "0.00"} tone="lime" />
        {target ? <CricketInfoPill label="TARGET" value={target} /> : null}
        {requiredRate ? <CricketInfoPill label="RRR" value={requiredRate} tone="danger" /> : null}
        <CricketInfoPill label="EXTRAS" value={extras} />
        {partnership ? <CricketInfoPill label="P'SHIP" value={partnership} /> : null}
        {lastOutName ? <CricketInfoPill label="OUT" value={`${lastOutName} ${lastOutRuns}(${lastOutBalls})`} /> : null}
        {!hasTicker ? (
          <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase text-white/48 sm:text-xs">
            {chaseLine}
          </span>
        ) : null}
        {hasTicker ? (
          <span className="min-w-[180px] flex-[1.25] overflow-hidden rounded-full border border-white/8 bg-white/6">
            <span className="scoreboard-ticker inline-block whitespace-nowrap py-1 pl-3 text-[10px] font-semibold text-white/76 sm:text-xs">
              {overlay.ticker_text}
            </span>
          </span>
        ) : null}
        {sponsorText ? <span className="truncate text-[9px] font-semibold uppercase text-white/35 sm:text-[10px]">{sponsorText}</span> : null}
      </div>
    </div>
  );
}

function getScoringLabel(overlay: OverlayConfig, key: string, fallback: string): string {
  const value = overlay.scoring_data?.[key];
  const text = `${value ?? ""}`.trim();
  return text || fallback;
}

function parseScoreNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function CricketPlayerLine({
  balls,
  name,
  runs,
  striker = false,
}: {
  balls: string;
  name: string;
  runs: string;
  striker?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 px-3 py-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${striker ? "bg-[#f5c542]" : "bg-white/20"}`} />
      <span className="min-w-0 flex-1 truncate text-xs font-bold text-white sm:text-sm">{name}</span>
      <span data-display className="shrink-0 text-base font-black tabular-nums text-white sm:text-lg">
        {runs}
      </span>
      <span className="shrink-0 text-[10px] font-bold tabular-nums text-white/45">({balls})</span>
    </div>
  );
}

function CricketInfoPill({
  label,
  tone = "muted",
  value,
}: {
  label: string;
  tone?: "danger" | "lime" | "muted";
  value: string;
}) {
  const toneClass = tone === "danger" ? "text-[#ff7768]" : tone === "lime" ? "text-[#bfff67]" : "text-white";
  return (
    <span className="inline-flex items-center gap-1 rounded bg-white/8 px-2 py-1 text-[10px] font-black uppercase text-white/42 sm:text-xs">
      {label}
      <span className={`tabular-nums ${toneClass}`}>{value}</span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════
   🎮 Generic Scorecard — Clean sports-agnostic design
   ═══════════════════════════════════════════════════════ */
function GenericScorecard({
  overlay,
  sponsorText,
  statusLabel,
}: {
  overlay: OverlayConfig;
  sponsorText: string;
  statusLabel: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a1219]/88 shadow-[0_16px_48px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      {/* Main score strip */}
      <div className="flex items-center">
        {/* Team 1 */}
        <div className="flex flex-1 items-center justify-end gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
          <span className="min-w-0 truncate text-right text-xs font-bold uppercase tracking-wide text-white sm:text-sm">
            {overlay.team1_name}
          </span>
          <TeamCrest url={overlay.team1_logo_url} alt={overlay.team1_name} size="md" />
        </div>

        {/* Score center */}
        <div className="flex shrink-0 flex-col items-center bg-[#111c28] px-4 py-2 sm:px-5">
          <div data-display className="flex items-center gap-2">
            <span className="text-2xl font-extrabold tabular-nums text-[#ff7a6b] sm:text-3xl">
              {overlay.team1_score}
            </span>
            <span className="text-lg text-white/30">–</span>
            <span className="text-2xl font-extrabold tabular-nums text-[#baff66] sm:text-3xl">
              {overlay.team2_score}
            </span>
          </div>
          {overlay.clock_text ? (
            <span data-display className="mt-0.5 text-[10px] font-semibold tabular-nums text-white/50 sm:text-xs">
              {overlay.clock_text}
            </span>
          ) : null}
        </div>

        {/* Team 2 */}
        <div className="flex flex-1 items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
          <TeamCrest url={overlay.team2_logo_url} alt={overlay.team2_name} size="md" />
          <span className="min-w-0 truncate text-xs font-bold uppercase tracking-wide text-white sm:text-sm">
            {overlay.team2_name}
          </span>
        </div>
      </div>

      {/* Bottom info strip */}
      <div className="flex items-center justify-center gap-3 border-t border-white/8 bg-[#081017]/60 px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50 sm:text-xs">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#e53e3e] shadow-[0_0_6px_#e53e3e]" />
          {statusLabel}
        </span>
        {sponsorText ? (
          <>
            <span className="text-white/20">·</span>
            <span className="text-[9px] tracking-[0.12em] text-white/35 sm:text-[10px]">{sponsorText}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Ball-by-ball dots (cricket) ─── */
function BallDots({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-[3px]">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < count ? "bg-[#ff7a6b]" : "bg-white/15"}`}
        />
      ))}
    </div>
  );
}
