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

  it("accepts R2 asset URLs (our own storage)", () => {
    expect(getAdVideoUrlIssue("https://example.com/api/v1/assets/abc-123")).toBeNull();
  });

  it("rejects non-direct video URLs", () => {
    expect(getAdVideoUrlIssue("https://example.com/page.html")).toContain("direct video file");
  });

  it("rejects invalid URLs", () => {
    expect(getAdVideoUrlIssue("not-a-url")).toContain("valid absolute URL");
  });

  it("returns null for empty input", () => {
    expect(getAdVideoUrlIssue("   ")).toBeNull();
  });
});
