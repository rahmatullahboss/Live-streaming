import { describe, expect, it } from "vitest";

import { getCameraPublishConstraints, getQualityConstraints } from "./camera-quality";

describe("getQualityConstraints", () => {
  it("returns a landscape-friendly HD profile", () => {
    expect(getQualityConstraints("hd", true)).toEqual({
      width: { ideal: 1280 },
      height: { ideal: 720 },
      aspectRatio: { ideal: 16 / 9 },
      frameRate: { ideal: 30, max: 30 },
      resizeMode: "crop-and-scale",
    });
  });

  it("swaps width and height for portrait capture", () => {
    expect(getQualityConstraints("hd", false)).toEqual({
      width: { ideal: 720 },
      height: { ideal: 1280 },
      aspectRatio: { ideal: 9 / 16 },
      frameRate: { ideal: 30, max: 30 },
      resizeMode: "crop-and-scale",
    });
  });

  it("lowers frame rate for adaptive mode", () => {
    expect(getQualityConstraints("adaptive", true)).toEqual({
      width: { ideal: 960 },
      height: { ideal: 540 },
      aspectRatio: { ideal: 16 / 9 },
      frameRate: { ideal: 24, max: 24 },
      resizeMode: "crop-and-scale",
    });
  });

  it("uses a landscape capture profile for mobile publishing", () => {
    expect(getCameraPublishConstraints()).toEqual({
      width: { ideal: 1280 },
      height: { ideal: 720 },
      aspectRatio: { ideal: 16 / 9 },
      frameRate: { ideal: 30, max: 30 },
      resizeMode: "crop-and-scale",
    });
  });
});
