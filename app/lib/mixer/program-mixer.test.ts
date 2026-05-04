import { describe, expect, it } from "vitest";

import { getCameraCrossfadeOpacity, getProgramMediaPolicy } from "./program-mixer";

describe("getProgramMediaPolicy", () => {
  it("uses ad video and ad audio while muting live camera audio during ad mode", () => {
    expect(
      getProgramMediaPolicy({
        adVideoUrl: "https://cdn.example.com/ad.mp4",
        programSource: "ad",
      })
    ).toEqual({
      adAudioEnabled: true,
      liveAudioEnabled: false,
      videoSource: "ad",
    });
  });

  it("falls back to live video and live audio when ad mode has no playable URL", () => {
    expect(
      getProgramMediaPolicy({
        adVideoUrl: "",
        programSource: "ad",
      })
    ).toEqual({
      adAudioEnabled: false,
      liveAudioEnabled: true,
      videoSource: "live",
    });
  });
});

describe("getCameraCrossfadeOpacity", () => {
  it("clamps fade opacity between 0 and 1 across the transition duration", () => {
    expect(getCameraCrossfadeOpacity(-20, 500)).toBe(0);
    expect(getCameraCrossfadeOpacity(250, 500)).toBe(0.5);
    expect(getCameraCrossfadeOpacity(900, 500)).toBe(1);
  });
});
