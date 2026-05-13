import { describe, expect, it } from "vitest";

import {
  applyCricketBall,
  applyScoreDelta,
  applyTeamScoreDelta,
  ballsToOvers,
  createDefaultScoringData,
  normalizeScoringData,
  undoLastCricketEvent,
  undoLastTeamScoreDelta,
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
      balls_in_over: 0,
      balls: 0,
      extras: 1,
      overs: "0.0",
      runs: 1,
    });
  });

  it("records byes and leg-byes as legal-ball extras", () => {
    const data = applyCricketBall(createDefaultScoringData("cricket"), {
      extra: true,
      legalBall: true,
      runs: 4,
    });

    expect(data).toMatchObject({
      balls: 1,
      extras: 4,
      overs: "0.1",
      runs: 4,
    });
  });

  it("keeps balls in over synced with total legal balls", () => {
    let data = createDefaultScoringData("cricket");
    for (let index = 0; index < 7; index += 1) {
      data = applyCricketBall(data, { runs: 1, legalBall: true });
    }

    expect(data).toMatchObject({
      balls: 7,
      balls_in_over: 1,
      overs: "1.1",
      runs: 7,
    });
  });

  it("calculates required rate from target and max overs", () => {
    const data = applyCricketBall(
      {
        ...createDefaultScoringData("cricket"),
        max_overs: "20",
        target: "121",
      },
      { runs: 6, legalBall: true }
    );

    expect(data).toMatchObject({
      required_rate: "5.80",
      runs: 6,
    });
  });

  it("records cricket events so the last legal ball can be undone with runs and wickets", () => {
    const first = applyCricketBall(createDefaultScoringData("cricket"), {
      legalBall: true,
      runs: 4,
    });
    const second = applyCricketBall(first, {
      legalBall: true,
      runs: 0,
      wicket: true,
    });

    expect(undoLastCricketEvent(second)).toMatchObject({
      balls: 1,
      balls_in_over: 1,
      overs: "0.1",
      runs: 4,
      wickets: 0,
    });
  });

  it("updates striker batting figures, bowler ball count, and strike after cricket balls", () => {
    const first = applyCricketBall(
      {
        ...createDefaultScoringData("cricket"),
        batsman1_name: "Shakib",
        batsman1_runs: 10,
        batsman1_balls: 8,
        batsman2_name: "Hridoy",
        batsman2_runs: 3,
        batsman2_balls: 4,
        bowler_name: "Taskin",
        striker: "batsman1",
      },
      { legalBall: true, runs: 3, striker: "batsman1" }
    );
    const second = applyCricketBall(first, { legalBall: true, runs: 0, striker: "batsman2" });

    expect(first).toMatchObject({
      batsman1_runs: 13,
      batsman1_balls: 9,
      batsman2_runs: 3,
      batsman2_balls: 4,
      bowler_balls_this_over: 1,
      striker: "batsman2",
    });
    expect(second).toMatchObject({
      batsman2_runs: 3,
      batsman2_balls: 5,
      bowler_balls_this_over: 2,
      striker: "batsman2",
    });
  });

  it("records which batter was out and brings in the next batter", () => {
    const data = applyCricketBall(
      {
        ...createDefaultScoringData("cricket"),
        batsman1_name: "Shakib",
        batsman1_runs: 42,
        batsman1_balls: 29,
        batsman2_name: "Hridoy",
        batsman2_runs: 24,
        batsman2_balls: 18,
        striker: "batsman1",
      },
      {
        legalBall: true,
        nextBatsmanName: "Mahmudullah",
        outBatter: "batsman1",
        runs: 0,
        striker: "batsman1",
        wicket: true,
      }
    );

    expect(data).toMatchObject({
      batsman1_name: "Mahmudullah",
      batsman1_runs: 0,
      batsman1_balls: 0,
      last_out_balls: 30,
      last_out_name: "Shakib",
      last_out_runs: 42,
      striker: "batsman1",
      wickets: 1,
    });
  });

  it("undoes cricket player and wicket metadata from the last event snapshot", () => {
    const before = {
      ...createDefaultScoringData("cricket"),
      batsman1_name: "Shakib",
      batsman1_runs: 42,
      batsman1_balls: 29,
      striker: "batsman1",
    };
    const after = applyCricketBall(before, {
      legalBall: true,
      nextBatsmanName: "Mahmudullah",
      outBatter: "batsman1",
      runs: 0,
      striker: "batsman1",
      wicket: true,
    });

    expect(undoLastCricketEvent(after)).toMatchObject({
      batsman1_name: "Shakib",
      batsman1_runs: 42,
      batsman1_balls: 29,
      last_out_name: "",
      striker: "batsman1",
      wickets: 0,
    });
  });

  it("undoes illegal-ball extras without removing a legal delivery", () => {
    const legal = applyCricketBall(createDefaultScoringData("cricket"), {
      legalBall: true,
      runs: 2,
    });
    const wide = applyCricketBall(legal, { legalBall: false, runs: 1 });

    expect(undoLastCricketEvent(wide)).toMatchObject({
      balls: 1,
      balls_in_over: 1,
      extras: 0,
      overs: "0.1",
      runs: 2,
    });
  });

  it("clamps wickets at ten and ignores negative ball runs", () => {
    let data = createDefaultScoringData("cricket");
    for (let index = 0; index < 12; index += 1) {
      data = applyCricketBall(data, { legalBall: true, runs: -4, wicket: true });
    }

    expect(data).toMatchObject({
      runs: 0,
      wickets: 10,
    });
  });

  it("bounds scoreboard deltas at zero", () => {
    expect(applyScoreDelta(0, -1)).toBe(0);
    expect(applyScoreDelta(2, -1)).toBe(1);
    expect(applyScoreDelta(2, 3)).toBe(5);
  });

  it("creates generic overlay builder defaults for sport-agnostic graphics", () => {
    expect(createDefaultScoringData("generic")).toMatchObject({
      overlay_position: "top",
      overlay_preset: "scoreboard",
      overlay_primary_label: "Team 1",
      overlay_secondary_label: "Team 2",
      overlay_subtitle: "",
      overlay_title: "Live Match",
    });
  });

  it("normalizes football scoring metadata and keeps custom overlay builder fields", () => {
    expect(
      normalizeScoringData("football", {
        overlay_position: "side",
        overlay_preset: "lower-third",
        overlay_title: "Captain Interview",
        period: "",
        possession: "",
      })
    ).toMatchObject({
      overlay_position: "side",
      overlay_preset: "lower-third",
      overlay_title: "Captain Interview",
      period: "1ST HALF",
      possession: "50-50",
    });
  });

  it("records and undoes non-cricket team score changes", () => {
    const first = applyTeamScoreDelta(createDefaultScoringData("football"), {
      delta: 1,
      team: "team1",
      team1Score: 0,
      team2Score: 0,
    });
    const second = applyTeamScoreDelta(first.scoringData, {
      delta: 1,
      team: "team2",
      team1Score: first.team1Score,
      team2Score: first.team2Score,
    });
    const undone = undoLastTeamScoreDelta(second.scoringData, {
      team1Score: second.team1Score,
      team2Score: second.team2Score,
    });

    expect(second).toMatchObject({
      team1Score: 1,
      team2Score: 1,
    });
    expect(undone).toMatchObject({
      team1Score: 1,
      team2Score: 0,
    });
  });
});
