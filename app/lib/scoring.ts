import type { OverlayConfig } from "./realtime";

export type SportType = NonNullable<OverlayConfig["sport"]>;
export type ScoringData = NonNullable<OverlayConfig["scoring_data"]>;

type CricketBallInput = {
  extra?: boolean;
  legalBall: boolean;
  nextBatsmanName?: string;
  outBatter?: CricketBatterKey;
  runs: number;
  striker?: CricketBatterKey;
  wicket?: boolean;
};

type CricketBatterKey = "batsman1" | "batsman2";

type CricketEventDelta = {
  balls: number;
  extras: number;
  previous?: ScoringData;
  runs: number;
  wickets: number;
};

type TeamScoreInput = {
  delta: number;
  team: "team1" | "team2";
  team1Score: number;
  team2Score: number;
};

type TeamScoreResult = {
  scoringData: ScoringData;
  team1Score: number;
  team2Score: number;
};

type TeamScoreEventDelta = {
  previousScore: number;
  team: "team1" | "team2";
};

const CRICKET_EVENT_LOG_LIMIT = 36;
const TEAM_SCORE_EVENT_LOG_LIMIT = 30;

const overlayBuilderDefaults = {
  overlay_position: "top",
  overlay_preset: "scoreboard",
  overlay_primary_label: "Team 1",
  overlay_primary_value: "",
  overlay_secondary_label: "Team 2",
  overlay_secondary_value: "",
  overlay_subtitle: "",
  overlay_title: "Live Match",
} satisfies ScoringData;

export function createDefaultScoringData(sport: SportType): ScoringData {
  if (sport === "cricket") {
    return {
      balls: 0,
      balls_in_over: 0,
      current_rate: "0.00",
      event_log: "[]",
      extras: 0,
      innings: "1",
      batsman1_balls: 0,
      batsman1_name: "",
      batsman1_runs: 0,
      batsman2_balls: 0,
      batsman2_name: "",
      batsman2_runs: 0,
      bowler_balls_this_over: 0,
      bowler_name: "",
      last_out_balls: 0,
      last_out_name: "",
      last_out_runs: 0,
      max_overs: "20",
      next_batsman_name: "",
      overlay_position: "lower",
      out_batter: "batsman1",
      overs: "0.0",
      required_rate: "",
      runs: 0,
      striker: "batsman1",
      target: "",
      wickets: 0,
    };
  }

  if (sport === "football") {
    return {
      ...overlayBuilderDefaults,
      period: "1ST HALF",
      possession: "50-50",
      score_event_log: "[]",
    };
  }

  return {
    ...overlayBuilderDefaults,
    score_event_log: "[]",
  };
}

export function applyScoreDelta(score: number, delta: number): number {
  return Math.max(0, score + delta);
}

export function ballsToOvers(balls: number): string {
  const safeBalls = Math.max(0, Math.trunc(balls));
  const completedOvers = Math.floor(safeBalls / 6);
  const ballInOver = safeBalls % 6;
  return `${completedOvers}.${ballInOver}`;
}

export function applyCricketBall(current: ScoringData, input: CricketBallInput): ScoringData {
  const normalized = normalizeCricketScoringData(current);
  const previousSnapshot: ScoringData = { ...normalized };
  const currentRuns = toWholeNumber(normalized.runs);
  const currentBalls = toWholeNumber(normalized.balls);
  const currentWickets = toWholeNumber(normalized.wickets);
  const currentExtras = toWholeNumber(normalized.extras);
  const striker = normalizeBatterKey(input.striker ?? normalized.striker);
  const outBatter = input.outBatter ? normalizeBatterKey(input.outBatter) : input.wicket ? striker : null;
  const runs = Math.max(0, Math.trunc(input.runs));
  const ballDelta = input.legalBall ? 1 : 0;
  const wicketDelta = input.wicket ? Math.min(1, Math.max(0, 10 - currentWickets)) : 0;
  const extraDelta = !input.legalBall || input.extra ? runs : 0;
  const balls = currentBalls + ballDelta;
  const wickets = currentWickets + wicketDelta;
  const totalRuns = currentRuns + runs;
  const eventLog = appendCricketEvent(parseCricketEventLog(normalized.event_log), {
    balls: ballDelta,
    extras: extraDelta,
    previous: previousSnapshot,
    runs,
    wickets: wicketDelta,
  });

  const nextScoringData: ScoringData = {
    ...normalized,
    balls,
    event_log: serializeCricketEventLog(eventLog),
    extras: currentExtras + extraDelta,
    runs: totalRuns,
    wickets,
  };

  updateBatterForDelivery(nextScoringData, striker, {
    ballDelta,
    extra: Boolean(input.extra),
    runs,
  });

  if (wicketDelta > 0 && outBatter) {
    recordOutBatter(nextScoringData, outBatter, input.nextBatsmanName);
    nextScoringData.next_batsman_name = "";
    nextScoringData.out_batter = outBatter;
  }

  nextScoringData.striker = getNextCricketStriker({
    ballDelta,
    balls,
    outBatter,
    runs,
    striker,
    wicket: wicketDelta > 0,
  });
  nextScoringData.bowler_balls_this_over = balls % 6;

  return normalizeCricketScoringData({
    ...nextScoringData,
  });
}

export function undoLastCricketEvent(current: ScoringData): ScoringData {
  const normalized = normalizeCricketScoringData(current);
  const eventLog = parseCricketEventLog(normalized.event_log);
  const lastEvent = eventLog.at(-1);

  if (!lastEvent) {
    return normalized;
  }

  const remainingEvents = eventLog.slice(0, -1);
  if (lastEvent.previous) {
    return normalizeCricketScoringData({
      ...lastEvent.previous,
      event_log: serializeCricketEventLog(remainingEvents),
    });
  }

  return normalizeCricketScoringData({
    ...normalized,
    balls: toWholeNumber(normalized.balls) - lastEvent.balls,
    event_log: serializeCricketEventLog(remainingEvents),
    extras: toWholeNumber(normalized.extras) - lastEvent.extras,
    runs: toWholeNumber(normalized.runs) - lastEvent.runs,
    wickets: toWholeNumber(normalized.wickets) - lastEvent.wickets,
  });
}

export function applyTeamScoreDelta(current: ScoringData, input: TeamScoreInput): TeamScoreResult {
  const normalized = normalizeNonCricketScoringData("generic", current);
  const previousScore = input.team === "team1" ? input.team1Score : input.team2Score;
  const nextScore = applyScoreDelta(previousScore, input.delta);
  const eventLog = appendTeamScoreEvent(parseTeamScoreEventLog(normalized.score_event_log), {
    previousScore,
    team: input.team,
  });

  return {
    scoringData: {
      ...normalized,
      score_event_log: serializeTeamScoreEventLog(eventLog),
    },
    team1Score: input.team === "team1" ? nextScore : input.team1Score,
    team2Score: input.team === "team2" ? nextScore : input.team2Score,
  };
}

export function undoLastTeamScoreDelta(
  current: ScoringData,
  scores: { team1Score: number; team2Score: number }
): TeamScoreResult {
  const normalized = normalizeNonCricketScoringData("generic", current);
  const eventLog = parseTeamScoreEventLog(normalized.score_event_log);
  const lastEvent = eventLog.at(-1);

  if (!lastEvent) {
    return {
      scoringData: normalized,
      team1Score: scores.team1Score,
      team2Score: scores.team2Score,
    };
  }

  return {
    scoringData: {
      ...normalized,
      score_event_log: serializeTeamScoreEventLog(eventLog.slice(0, -1)),
    },
    team1Score: lastEvent.team === "team1" ? lastEvent.previousScore : scores.team1Score,
    team2Score: lastEvent.team === "team2" ? lastEvent.previousScore : scores.team2Score,
  };
}

export function normalizeScoringData(sport: SportType, current: ScoringData): ScoringData {
  return sport === "cricket" ? normalizeCricketScoringData(current) : normalizeNonCricketScoringData(sport, current);
}

export function normalizeCricketScoringData(current: ScoringData): ScoringData {
  const balls = toWholeNumber(current.balls);
  const runs = toWholeNumber(current.runs);
  const wickets = Math.min(10, toWholeNumber(current.wickets));
  const extras = toWholeNumber(current.extras);
  const maxOvers = `${current.max_overs ?? ""}`.trim();
  const target = `${current.target ?? ""}`.trim();

  return {
    ...createDefaultScoringData("cricket"),
    ...current,
    balls,
    balls_in_over: balls % 6,
    current_rate: balls > 0 ? ((runs / balls) * 6).toFixed(2) : "0.00",
    event_log: serializeCricketEventLog(parseCricketEventLog(current.event_log)),
    extras,
    max_overs: maxOvers,
    overs: ballsToOvers(balls),
    required_rate: calculateRequiredRate({
      balls,
      maxOvers,
      runs,
      target,
    }),
    runs,
    striker: normalizeBatterKey(current.striker),
    target,
    wickets,
  };
}

function updateBatterForDelivery(
  scoringData: ScoringData,
  striker: CricketBatterKey,
  input: {
    ballDelta: number;
    extra: boolean;
    runs: number;
  }
) {
  const runsKey = `${striker}_runs`;
  const ballsKey = `${striker}_balls`;
  const batterRuns = toWholeNumber(scoringData[runsKey]);
  const batterBalls = toWholeNumber(scoringData[ballsKey]);

  scoringData[runsKey] = batterRuns + (input.extra ? 0 : input.runs);
  scoringData[ballsKey] = batterBalls + input.ballDelta;
}

function recordOutBatter(
  scoringData: ScoringData,
  outBatter: CricketBatterKey,
  nextBatsmanName: string | undefined
) {
  scoringData.last_out_name = `${scoringData[`${outBatter}_name`] ?? ""}`.trim();
  scoringData.last_out_runs = toWholeNumber(scoringData[`${outBatter}_runs`]);
  scoringData.last_out_balls = toWholeNumber(scoringData[`${outBatter}_balls`]);
  scoringData[`${outBatter}_name`] = nextBatsmanName?.trim() ?? "";
  scoringData[`${outBatter}_runs`] = 0;
  scoringData[`${outBatter}_balls`] = 0;
}

function getNextCricketStriker({
  ballDelta,
  balls,
  outBatter,
  runs,
  striker,
  wicket,
}: {
  ballDelta: number;
  balls: number;
  outBatter: CricketBatterKey | null;
  runs: number;
  striker: CricketBatterKey;
  wicket: boolean;
}): CricketBatterKey {
  if (wicket && outBatter) {
    return outBatter === striker ? outBatter : striker;
  }

  let nextStriker = runs % 2 === 1 ? getOtherBatter(striker) : striker;
  if (ballDelta > 0 && balls % 6 === 0) {
    nextStriker = getOtherBatter(nextStriker);
  }
  return nextStriker;
}

function getOtherBatter(batter: CricketBatterKey): CricketBatterKey {
  return batter === "batsman1" ? "batsman2" : "batsman1";
}

function normalizeBatterKey(value: number | string | undefined): CricketBatterKey {
  return value === "batsman2" ? "batsman2" : "batsman1";
}

function normalizeNonCricketScoringData(sport: SportType, current: ScoringData): ScoringData {
  const period = `${current.period ?? ""}`.trim();
  const possession = `${current.possession ?? ""}`.trim();

  return {
    ...createDefaultScoringData(sport),
    ...current,
    overlay_position: normalizeOverlayPosition(current.overlay_position),
    overlay_preset: normalizeOverlayPreset(current.overlay_preset),
    overlay_primary_label: normalizeTextValue(current.overlay_primary_label, "Team 1"),
    overlay_primary_value: normalizeTextValue(current.overlay_primary_value, ""),
    overlay_secondary_label: normalizeTextValue(current.overlay_secondary_label, "Team 2"),
    overlay_secondary_value: normalizeTextValue(current.overlay_secondary_value, ""),
    overlay_subtitle: normalizeTextValue(current.overlay_subtitle, ""),
    overlay_title: normalizeTextValue(current.overlay_title, "Live Match"),
    period: sport === "football" ? period || "1ST HALF" : current.period,
    possession: sport === "football" ? possession || "50-50" : current.possession,
    score_event_log: serializeTeamScoreEventLog(parseTeamScoreEventLog(current.score_event_log)),
  };
}

export function toNumber(value: number | string | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function calculateRequiredRate({
  balls,
  maxOvers,
  runs,
  target,
}: {
  balls: number;
  maxOvers: string;
  runs: number;
  target: string;
}): string {
  const targetRuns = toNumber(target);
  const totalBalls = Math.trunc(toNumber(maxOvers) * 6);
  if (targetRuns <= 0 || totalBalls <= 0) {
    return "";
  }

  const runsNeeded = Math.max(0, Math.trunc(targetRuns) - runs);
  if (runsNeeded === 0) {
    return "0.00";
  }

  const ballsRemaining = totalBalls - balls;
  if (ballsRemaining <= 0) {
    return "";
  }

  return ((runsNeeded / ballsRemaining) * 6).toFixed(2);
}

function toWholeNumber(value: number | string | undefined): number {
  return Math.max(0, Math.trunc(toNumber(value)));
}

function appendCricketEvent(
  events: CricketEventDelta[],
  event: CricketEventDelta
): CricketEventDelta[] {
  return [...events, event].slice(-CRICKET_EVENT_LOG_LIMIT);
}

function appendTeamScoreEvent(
  events: TeamScoreEventDelta[],
  event: TeamScoreEventDelta
): TeamScoreEventDelta[] {
  return [...events, event].slice(-TEAM_SCORE_EVENT_LOG_LIMIT);
}

function parseTeamScoreEventLog(value: number | string | undefined): TeamScoreEventDelta[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isTeamScoreEventDelta);
  } catch {
    return [];
  }
}

function serializeTeamScoreEventLog(events: TeamScoreEventDelta[]): string {
  return JSON.stringify(events.filter(isTeamScoreEventDelta).slice(-TEAM_SCORE_EVENT_LOG_LIMIT));
}

function parseCricketEventLog(value: number | string | undefined): CricketEventDelta[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isCricketEventDelta);
  } catch {
    return [];
  }
}

function serializeCricketEventLog(events: CricketEventDelta[]): string {
  return JSON.stringify(events.filter(isCricketEventDelta).slice(-CRICKET_EVENT_LOG_LIMIT));
}

function isCricketEventDelta(value: unknown): value is CricketEventDelta {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Record<keyof CricketEventDelta, unknown>>;
  return (
    typeof candidate.balls === "number" &&
    typeof candidate.extras === "number" &&
    (candidate.previous === undefined || isScoringDataSnapshot(candidate.previous)) &&
    typeof candidate.runs === "number" &&
    typeof candidate.wickets === "number"
  );
}

function isScoringDataSnapshot(value: unknown): value is ScoringData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (entry) => typeof entry === "number" || typeof entry === "string"
  );
}

function isTeamScoreEventDelta(value: unknown): value is TeamScoreEventDelta {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Record<keyof TeamScoreEventDelta, unknown>>;
  return (
    typeof candidate.previousScore === "number" &&
    (candidate.team === "team1" || candidate.team === "team2")
  );
}

function normalizeTextValue(value: number | string | undefined, fallback: string): string {
  const text = `${value ?? ""}`.trim();
  return text || fallback;
}

function normalizeOverlayPreset(value: number | string | undefined): string {
  const preset = `${value ?? ""}`.trim();
  return ["scoreboard", "lower-third", "sponsor-bug", "custom-panel"].includes(preset) ? preset : "scoreboard";
}

function normalizeOverlayPosition(value: number | string | undefined): string {
  const position = `${value ?? ""}`.trim();
  return ["top", "lower", "side"].includes(position) ? position : "top";
}
