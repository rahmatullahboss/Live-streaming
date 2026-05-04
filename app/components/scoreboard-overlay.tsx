import type { OverlayConfig } from "~/lib/realtime";

type ScoreboardOverlayProps = {
  className?: string;
  overlay: OverlayConfig;
};

const themeClasses: Record<
  NonNullable<OverlayConfig["theme_variant"]>,
  {
    frame: string;
    pill: string;
    scoreLeft: string;
    scoreRight: string;
    ticker: string;
  }
> = {
  arena: {
    frame: "border-white/10 bg-[#0a1017]/78",
    pill: "bg-[#121e29]",
    scoreLeft: "text-[#67e8f9]",
    scoreRight: "text-[#d9f99d]",
    ticker: "bg-[#0c151f]/95",
  },
  broadcast: {
    frame: "border-white/12 bg-[#071119]/82",
    pill: "bg-[#101c27]",
    scoreLeft: "text-[#ff7a6b]",
    scoreRight: "text-[#baff66]",
    ticker: "bg-[#09121a]/95",
  },
  classic: {
    frame: "border-white/12 bg-[#101010]/84",
    pill: "bg-[#181818]",
    scoreLeft: "text-[#fca5a5]",
    scoreRight: "text-[#bfdbfe]",
    ticker: "bg-[#141414]/95",
  },
};

function renderSportMeta(overlay: OverlayConfig) {
  if (overlay.sport === "cricket") {
    const runs = `${overlay.scoring_data?.runs ?? overlay.team1_score}`;
    const wickets = `${overlay.scoring_data?.wickets ?? "0"}`;
    const overs = `${overlay.scoring_data?.overs ?? "0.0"}`;
    const target = overlay.scoring_data?.target;

    return (
      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/78 sm:text-xs">
        <span className="rounded-full border border-white/12 px-3 py-1">Cricket</span>
        <span className="rounded-full border border-white/12 px-3 py-1">
          {runs}/{wickets}
        </span>
        <span className="rounded-full border border-white/12 px-3 py-1">{overs} overs</span>
        {target ? (
          <span className="rounded-full border border-white/12 px-3 py-1">Target {target}</span>
        ) : null}
      </div>
    );
  }

  if (overlay.sport === "football") {
    const period = `${overlay.scoring_data?.period ?? "2ND HALF"}`;
    return (
      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/78 sm:text-xs">
        <span className="rounded-full border border-white/12 px-3 py-1">Football</span>
        <span className="rounded-full border border-white/12 px-3 py-1">{period}</span>
        <span className="rounded-full border border-white/12 px-3 py-1">
          {overlay.clock_text ?? "00:00"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/78 sm:text-xs">
      <span className="rounded-full border border-white/12 px-3 py-1">Live Broadcast</span>
      <span className="rounded-full border border-white/12 px-3 py-1">
        {overlay.match_status ?? "LIVE"}
      </span>
    </div>
  );
}

export function ScoreboardOverlay({ className = "", overlay }: ScoreboardOverlayProps) {
  const theme = themeClasses[overlay.theme_variant ?? "broadcast"];
  const showTicker = overlay.ticker_active === 1 && Boolean(overlay.ticker_text?.trim());
  const externalScoreboardUrl = overlay.external_scoreboard_url?.trim() ?? "";
  const showScoreboard = overlay.scoreboard_active === 1;
  const showExternalScoreboard = showScoreboard && Boolean(externalScoreboardUrl);
  const showBuiltInScoreboard = showScoreboard;
  const hasTopLogos = Boolean(overlay.left_logo_url || overlay.right_logo_url);
  const sponsorText = overlay.sponsor_text?.trim() ?? "";
  const statusLabel = overlay.match_status?.trim() || "LIVE";

  if (!showScoreboard && !showTicker && !hasTopLogos && !sponsorText) {
    return null;
  }

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 flex flex-col items-start px-3 pt-3 sm:px-5 sm:pt-5 ${className}`}
    >
      {showExternalScoreboard ? (
        <iframe
          title="External scoreboard overlay"
          src={externalScoreboardUrl}
          className="absolute inset-0 h-full w-full border-0 bg-transparent"
          allow="autoplay; fullscreen"
        />
      ) : null}

      {showBuiltInScoreboard ? (
        <div
          className={`w-full max-w-xl overflow-hidden rounded-[1.3rem] border px-2.5 py-2 shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:max-w-2xl sm:px-3 sm:py-3 ${theme.frame}`}
        >
          {overlay.sport === "cricket" ? (
            <CricketOverlayCard overlay={overlay} sponsorText={sponsorText} statusLabel={statusLabel} />
          ) : overlay.sport === "football" ? (
            <FootballOverlayCard overlay={overlay} sponsorText={sponsorText} statusLabel={statusLabel} />
          ) : (
            <GenericOverlayCard overlay={overlay} sponsorText={sponsorText} statusLabel={statusLabel} theme={theme} />
          )}
        </div>
      ) : null}

      {showTicker ? (
        <div
          className={`mt-2 w-full max-w-5xl overflow-hidden rounded-full border border-white/10 ${theme.ticker}`}
        >
          <div className="flex items-center gap-4">
            <div className="shrink-0 rounded-full bg-[var(--accent-coral)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white sm:text-xs">
              Update
            </div>
            <div className="min-w-0 flex-1 overflow-hidden py-2">
              <div className="scoreboard-ticker whitespace-nowrap text-sm font-medium text-white/90 sm:text-base">
                {overlay.ticker_text}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HeaderStrip({
  overlay,
  sponsorText,
  statusLabel,
}: {
  overlay: OverlayConfig;
  sponsorText: string;
  statusLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {overlay.left_logo_url ? (
          <img
            src={overlay.left_logo_url}
            alt="Left team logo"
            className="h-9 w-9 rounded-xl border border-white/10 object-cover shadow-[0_10px_30px_rgba(0,0,0,0.35)] sm:h-10 sm:w-10"
          />
        ) : null}

        <div className="min-w-0">
          {renderSportMeta(overlay)}
          {sponsorText ? (
          <p className="mt-2 text-[11px] font-medium tracking-[0.12em] text-white/58 uppercase sm:text-xs">
            Sponsored by {sponsorText}
          </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="rounded-full bg-[#ff5d5d]/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ff9898] sm:text-xs">
          {statusLabel}
        </div>
        {overlay.right_logo_url ? (
          <img
            src={overlay.right_logo_url}
            alt="Right team logo"
            className="h-9 w-9 rounded-xl border border-white/10 object-cover shadow-[0_10px_30px_rgba(0,0,0,0.35)] sm:h-10 sm:w-10"
          />
        ) : null}
      </div>
    </div>
  );
}

function FootballOverlayCard({
  overlay,
  sponsorText,
  statusLabel,
}: {
  overlay: OverlayConfig;
  sponsorText: string;
  statusLabel: string;
}) {
  const period = `${overlay.scoring_data?.period ?? "2ND HALF"}`;
  const possession = `${overlay.scoring_data?.possession ?? "50-50"}`;

  return (
    <>
      <HeaderStrip overlay={overlay} sponsorText={sponsorText} statusLabel={statusLabel} />
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
        <TeamSide align="right" label="Home" name={overlay.team1_name} />
        <div className="rounded-[1.2rem] border border-white/10 bg-black/40 px-3 py-2 text-center sm:px-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/45 sm:text-xs">
            {period}
          </p>
          <p data-display className="mt-1 flex items-center justify-center gap-2 text-2xl font-bold leading-none tracking-tight sm:text-3xl">
            <span className="text-[#ff7a6b]">{overlay.team1_score}</span>
            <span className="text-white/38">-</span>
            <span className="text-[#baff66]">{overlay.team2_score}</span>
          </p>
          <div className="mt-2 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60 sm:text-xs">
            <span>{overlay.clock_text ?? "00:00"}</span>
            <span className="text-white/25">•</span>
            <span>Poss {possession}</span>
          </div>
        </div>
        <TeamSide align="left" label="Away" name={overlay.team2_name} />
      </div>
    </>
  );
}

function CricketOverlayCard({
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

  return (
    <>
      <HeaderStrip overlay={overlay} sponsorText={sponsorText} statusLabel={statusLabel} />
      <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rounded-[1.2rem] border border-white/10 bg-black/35 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
                Batting Side
              </p>
              <p data-display className="mt-2 text-xl font-bold text-[var(--text-main)] sm:text-2xl">
                {overlay.team1_name}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
                Score
              </p>
              <p data-display className="mt-2 text-2xl font-bold leading-none text-[#ff7a6b] sm:text-3xl">
                {runs}
                <span className="mx-1 text-white/35">/</span>
                <span className="text-white">{wickets}</span>
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <StatChip label="Overs" value={overs} />
            <StatChip label="Target" value={target || "-"} />
            <StatChip label="Run Rate" value={currentRate || "-"} />
          </div>
        </div>

        <div className="rounded-[1.2rem] border border-white/10 bg-[#101c27] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
            Bowling / Opposition
          </p>
          <p data-display className="mt-2 text-xl font-bold text-[var(--text-main)] sm:text-2xl">
            {overlay.team2_name}
          </p>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">
                Match Clock
              </p>
              <p data-display className="mt-2 text-lg font-bold text-[#baff66] sm:text-xl">
                {overlay.clock_text ?? "00:00"}
              </p>
            </div>
            <div className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
              {statusLabel}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function GenericOverlayCard({
  overlay,
  sponsorText,
  statusLabel,
  theme,
}: {
  overlay: OverlayConfig;
  sponsorText: string;
  statusLabel: string;
  theme: {
    frame: string;
    pill: string;
    scoreLeft: string;
    scoreRight: string;
    ticker: string;
  };
}) {
  return (
    <>
      <HeaderStrip overlay={overlay} sponsorText={sponsorText} statusLabel={statusLabel} />
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
        <div className={`min-w-0 rounded-[1.25rem] px-3 py-3 text-right sm:px-4 ${theme.pill}`}>
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-white/55 sm:text-xs">
            Home
          </p>
          <p
            data-display
            className="mt-1 truncate text-base font-bold text-[var(--text-main)] sm:text-2xl"
          >
            {overlay.team1_name}
          </p>
        </div>

        <div className="rounded-[1.15rem] border border-white/10 bg-black/35 px-3 py-2 text-center sm:px-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/50 sm:text-xs">
            Score
          </p>
          <p
            data-display
            className="mt-1 flex items-center justify-center gap-2 text-2xl font-bold leading-none tracking-tight sm:text-3xl"
          >
            <span className={theme.scoreLeft}>{overlay.team1_score}</span>
            <span className="text-white/38">-</span>
            <span className={theme.scoreRight}>{overlay.team2_score}</span>
          </p>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/58 sm:text-xs">
            Clock {overlay.clock_text ?? "00:00"}
          </p>
        </div>

        <div className={`min-w-0 rounded-[1.25rem] px-3 py-3 text-left sm:px-4 ${theme.pill}`}>
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-white/55 sm:text-xs">
            Away
          </p>
          <p
            data-display
            className="mt-1 truncate text-base font-bold text-[var(--text-main)] sm:text-2xl"
          >
            {overlay.team2_name}
          </p>
        </div>
      </div>
    </>
  );
}

function TeamSide({
  align,
  label,
  name,
}: {
  align: "left" | "right";
  label: string;
  name: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-[1rem] bg-[#101c27] px-2.5 py-2.5 sm:px-3 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.24em] text-white/55 sm:text-xs">
        {label}
      </p>
      <p data-display className="mt-1 truncate text-sm font-bold text-[var(--text-main)] sm:text-lg">
        {name}
      </p>
    </div>
  );
}

function StatChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[0.9rem] border border-white/10 bg-white/4 px-2.5 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/48">
        {label}
      </p>
      <p data-display className="mt-1.5 text-sm font-bold text-[var(--text-main)] sm:text-base">
        {value}
      </p>
    </div>
  );
}
