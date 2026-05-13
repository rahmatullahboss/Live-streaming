import { describe, expect, it } from "vitest";
import { getStatusClassName } from "./admin";

describe("Admin Route Utilities", () => {
  describe("getStatusClassName", () => {
    it("returns lime styles for active statuses", () => {
      expect(getStatusClassName("সক্রিয়")).toContain("var(--accent-lime)");
      expect(getStatusClassName("active")).toContain("var(--accent-lime)");
      expect(getStatusClassName("ready")).toContain("var(--accent-lime)");
    });

    it("returns coral styles for inactive or error statuses", () => {
      expect(getStatusClassName("মেয়াদোত্তীর্ণ")).toContain("var(--accent-coral)");
      expect(getStatusClassName("expired")).toContain("var(--accent-coral)");
      expect(getStatusClassName("deleted")).toContain("var(--accent-coral)");
    });

    it("returns cyan styles for pending statuses", () => {
      expect(getStatusClassName("পেন্ডিং")).toContain("var(--accent-cyan)");
      expect(getStatusClassName("pending_manual_review")).toContain("var(--accent-cyan)");
    });

    it("returns default styles for unknown statuses", () => {
      const className = getStatusClassName("unknown-status");
      expect(className).toContain("text-white/60");
    });
  });
});
