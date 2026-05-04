import { describe, expect, it } from "vitest";

import {
  applyCricketBall,
  applyScoreDelta,
  ballsToOvers,
  createDefaultScoringData,
} from "./scoring";

describe("scoring helpers", () => {
  it("formats legal cricket balls as overs", () => {
    expect(ballsToOvers(0)).toBe("0.0");
    expect(ballsToOvers(5)).toBe("0.5");
    expect(ballsToOvers(6)).toBe("1.0");
    expect(ballsToOvers(17)).toBe("2.5");
  });

  it("updates cricket score, overs, and run rate from legal deliveries", () => {
    const first = applyCricketBall(createDefaultScoringData("cricket"), { runs: 4, legalBall: true });
    const second = applyCricketBall(first, { runs: 2, legalBall: true });

    expect(second).toMatchObject({
      balls: 2,
      current_rate: "18.00",
      overs: "0.2",
      runs: 6,
      wickets: 0,
    });
  });

  it("keeps wide and no-ball extras from adding a legal cricket ball", () => {
    const data = applyCricketBall(createDefaultScoringData("cricket"), { runs: 1, legalBall: false });

    expect(data).toMatchObject({
      balls: 0,
      extras: 1,
      overs: "0.0",
      runs: 1,
    });
  });

  it("bounds scoreboard deltas at zero", () => {
    expect(applyScoreDelta(0, -1)).toBe(0);
    expect(applyScoreDelta(2, -1)).toBe(1);
    expect(applyScoreDelta(2, 3)).toBe(5);
  });
});
