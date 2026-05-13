import { describe, expect, it } from "vitest";

import {
  DEFAULT_PACKAGES,
  formatPackagePrice,
  getActivePackages,
  resolvePackageById,
} from "./multitenancy";

describe("multitenancy package catalog", () => {
  it("exposes active packages in admin-defined display order", () => {
    const packages = getActivePackages([
      { ...DEFAULT_PACKAGES[1], active: 0, sort_order: 1 },
      { ...DEFAULT_PACKAGES[2], active: 1, sort_order: 3 },
      { ...DEFAULT_PACKAGES[0], active: 1, sort_order: 2 },
    ]);

    expect(packages.map((item) => item.id)).toEqual([
      DEFAULT_PACKAGES[0].id,
      DEFAULT_PACKAGES[2].id,
    ]);
  });

  it("falls back to the default starter package when an unknown package id is requested", () => {
    const selectedPackage = resolvePackageById("missing-package", DEFAULT_PACKAGES);

    expect(selectedPackage.id).toBe(DEFAULT_PACKAGES[0].id);
    expect(selectedPackage.duration_minutes).toBeGreaterThan(0);
  });

  it("formats package prices without losing minor units", () => {
    expect(formatPackagePrice({ amountCents: 2499, currency: "usd" })).toBe("$24.99");
    expect(formatPackagePrice({ amountCents: 150000, currency: "bdt" })).toBe("৳1,500");
  });

  it("limits uploaded ad videos by package tier", () => {
    expect(DEFAULT_PACKAGES.map((item) => [item.id, item.max_ad_videos])).toEqual([
      ["starter-live", 1],
      ["matchday-pro", 2],
      ["season-ops", 3],
    ]);
  });

  it("formats BDT prices without decimal when cents are a multiple of 100", () => {
    expect(formatPackagePrice({ amountCents: 15000, currency: "bdt" })).toBe("৳150");
  });

  it("formats USD prices with two decimal places", () => {
    expect(formatPackagePrice({ amountCents: 2499, currency: "usd" })).toBe("$24.99");
  });

  it("formats zero cents as free", () => {
    expect(formatPackagePrice({ amountCents: 0, currency: "usd" })).toBe("$0.00");
  });

  it("handles large BDT amounts without scientific notation", () => {
    expect(formatPackagePrice({ amountCents: 9999999, currency: "bdt" })).toBe("৳100,000");
    expect(formatPackagePrice({ amountCents: 1234567, currency: "bdt" })).toBe("৳12,346");
  });
  it("handles empty package lists in resolvePackageById", () => {
    // Should fallback to DEFAULT_PACKAGES[0] if provided list is empty
    expect(resolvePackageById("some-id", [])).toBe(DEFAULT_PACKAGES[0]);
  });

  it("returns the first package if no match is found and list is not empty", () => {
    const customPackages = [DEFAULT_PACKAGES[2], DEFAULT_PACKAGES[1]];
    // Sort order: matchday-pro (20) < season-ops (30)
    expect(resolvePackageById("non-existent", customPackages).id).toBe(DEFAULT_PACKAGES[1].id);
  });

  it("handles BDT currency formatting properly", () => {
    expect(formatPackagePrice({ amountCents: 10000, currency: "bdt" })).toBe("৳100");
    expect(formatPackagePrice({ amountCents: 10050, currency: "bdt" })).toBe("৳101"); // Rounds up
  });
});
