import type { OverlayConfig } from "./realtime";

export type SportType = NonNullable<OverlayConfig["sport"]>;
export type ScoringData = NonNullable<OverlayConfig["scoring_data"]>;

type CricketBallInput = {
  legalBall: boolean;
  runs: number;
  wicket?: boolean;
};

export function createDefaultScoringData(sport: SportType): ScoringData {
  if (sport === "cricket") {
    return {
      balls: 0,
      current_rate: "0.00",
      extras: 0,
      overs: "0.0",
      runs: 0,
      target: "",
      wickets: 0,
    };
  }

  if (sport === "football") {
    return {
      period: "1ST HALF",
      possession: "50-50",
    };
  }

  return {};
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
  const currentRuns = toNumber(current.runs);
  const currentBalls = toNumber(current.balls);
  const currentWickets = toNumber(current.wickets);
  const currentExtras = toNumber(current.extras);
  const runs = Math.max(0, Math.trunc(input.runs));
  const balls = input.legalBall ? currentBalls + 1 : currentBalls;
  const wickets = input.wicket ? Math.min(10, currentWickets + 1) : currentWickets;
  const totalRuns = currentRuns + runs;
  const runRate = balls > 0 ? (totalRuns / balls) * 6 : 0;

  return {
    ...current,
    balls,
    current_rate: runRate.toFixed(2),
    extras: input.legalBall ? currentExtras : currentExtras + runs,
    overs: ballsToOvers(balls),
    runs: totalRuns,
    wickets,
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
