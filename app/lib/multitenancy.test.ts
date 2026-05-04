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
});
