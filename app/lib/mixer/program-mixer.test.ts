import { describe, expect, it } from "vitest";
import {
  CAMERA_CROSSFADE_MS,
  getCameraCrossfadeOpacity,
  getProgramVideoLayerState,
} from "./program-mixer";

describe("getCameraCrossfadeOpacity", () => {
  it("returns 0 at the start of the fade", () => {
    expect(getCameraCrossfadeOpacity(0)).toBe(0);
  });

  it("returns 0.5 exactly halfway through the fade", () => {
    const halfDuration = CAMERA_CROSSFADE_MS / 2;
    expect(getCameraCrossfadeOpacity(halfDuration)).toBe(0.5);
  });

  it("returns 1 when the duration has elapsed", () => {
    expect(getCameraCrossfadeOpacity(CAMERA_CROSSFADE_MS)).toBe(1);
  });

  it("caps the opacity at 1 if more than duration has elapsed", () => {
    expect(getCameraCrossfadeOpacity(CAMERA_CROSSFADE_MS + 100)).toBe(1);
  });

  it("caps the opacity at 0 if negative elapsed time is provided", () => {
    expect(getCameraCrossfadeOpacity(-50)).toBe(0);
  });

  it("handles custom durations", () => {
    expect(getCameraCrossfadeOpacity(500, 1000)).toBe(0.5);
    expect(getCameraCrossfadeOpacity(1500, 1000)).toBe(1);
  });

  it("returns 1 immediately if duration is 0 or negative", () => {
    expect(getCameraCrossfadeOpacity(50, 0)).toBe(1);
    expect(getCameraCrossfadeOpacity(50, -100)).toBe(1);
  });
});

describe("getProgramVideoLayerState", () => {
  it("holds the previous ready source while the next source is still loading", () => {
    expect(
      getProgramVideoLayerState({
        activeReady: false,
        fadeOpacity: 0,
        hasFade: true,
        previousReady: true,
      })
    ).toBe("previous");
  });

  it("crossfades only after both previous and active sources are ready", () => {
    expect(
      getProgramVideoLayerState({
        activeReady: true,
        fadeOpacity: 0.5,
        hasFade: true,
        previousReady: true,
      })
    ).toBe("crossfade");
  });

  it("draws the active source when it is ready and no transition is pending", () => {
    expect(
      getProgramVideoLayerState({
        activeReady: true,
        fadeOpacity: 1,
        hasFade: false,
        previousReady: false,
      })
    ).toBe("active");
  });

  it("falls back to no signal only when no drawable source exists", () => {
    expect(
      getProgramVideoLayerState({
        activeReady: false,
        fadeOpacity: 0,
        hasFade: false,
        previousReady: false,
      })
    ).toBe("none");
  });
});
