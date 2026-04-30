import { describe, expect, it } from "vitest";

import { addClockSeconds, formatClockSeconds, parseClockSeconds } from "./score-clock";

describe("score clock helpers", () => {
  it("parses mm:ss values", () => {
    expect(parseClockSeconds("12:34")).toBe(754);
  });

  it("formats seconds as mm:ss", () => {
    expect(formatClockSeconds(754)).toBe("12:34");
  });

  it("increments a clock string", () => {
    expect(addClockSeconds("44:59", 1)).toBe("45:00");
  });
});
