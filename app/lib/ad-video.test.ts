import { describe, expect, it } from "vitest";

import { getAdVideoUrlIssue } from "./ad-video";

describe("getAdVideoUrlIssue", () => {
  it("rejects YouTube watch URLs because they cannot be drawn into the mixer canvas", () => {
    expect(getAdVideoUrlIssue("https://www.youtube.com/watch?v=abc123")).toContain(
      "YouTube"
    );
  });

  it("accepts direct MP4 URLs", () => {
    expect(getAdVideoUrlIssue("https://cdn.example.com/ad.mp4")).toBeNull();
  });
});
