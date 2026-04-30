import { describe, expect, it } from "vitest";

import { getProgramBadgeLabel, getStreamGuardState } from "./stream-guard";

describe("getProgramBadgeLabel", () => {
  it("keeps live output labels clean instead of exposing camera ids", () => {
    expect(getProgramBadgeLabel("live", "camera-secret-123")).toBe("Live");
  });

  it("uses the ad title only while ad mode is on air", () => {
    expect(getProgramBadgeLabel("ad", "Halftime Sponsor")).toBe("Halftime Sponsor");
    expect(getProgramBadgeLabel("ad", "")).toBe("Commercial Break");
  });
});

describe("getStreamGuardState", () => {
  it("does not warn before the relay is live", () => {
    expect(getStreamGuardState(false, "hidden", false).level).toBe("idle");
  });

  it("tells directors to keep the dashboard foreground while streaming", () => {
    expect(getStreamGuardState(true, "visible", false)).toEqual({
      level: "ok",
      message: "Keep this director dashboard visible and in the foreground while streaming.",
      title: "Foreground required",
    });
  });

  it("warns when the live dashboard was moved to the background", () => {
    expect(getStreamGuardState(true, "visible", true)).toEqual({
      level: "warning",
      message: "This tab was backgrounded during the stream. Keep it foreground to avoid dropped frames.",
      title: "Stream quality at risk",
    });
  });
});
