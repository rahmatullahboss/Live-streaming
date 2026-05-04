export type PackageRecord = {
  active: number;
  currency: string;
  description: string;
  duration_minutes: number;
  features: string[];
  id: string;
  max_ad_videos: number;
  max_cameras: number;
  max_rooms: number;
  name: string;
  price_cents: number;
  sort_order: number;
};

export const DEFAULT_PACKAGES: PackageRecord[] = [
  {
    active: 1,
    currency: "usd",
    description: "Single match access for small clubs and schools.",
    duration_minutes: 180,
    features: ["1 live room", "3 camera phones", "1 ad video", "R2 logo assets", "External overlay link"],
    id: "starter-live",
    max_ad_videos: 1,
    max_cameras: 3,
    max_rooms: 1,
    name: "Starter Live",
    price_cents: 1500,
    sort_order: 10,
  },
  {
    active: 1,
    currency: "usd",
    description: "Longer match-day coverage with sponsor graphics.",
    duration_minutes: 360,
    features: ["2 live rooms", "5 camera phones", "2 ad videos", "Sponsor graphics", "Ad/promo mode"],
    id: "matchday-pro",
    max_ad_videos: 2,
    max_cameras: 5,
    max_rooms: 2,
    name: "Matchday Pro",
    price_cents: 3500,
    sort_order: 20,
  },
  {
    active: 1,
    currency: "usd",
    description: "Production package for organizations running multiple events.",
    duration_minutes: 720,
    features: ["5 live rooms", "8 camera phones", "3 ad videos", "Priority admin review", "Team branding controls"],
    id: "season-ops",
    max_ad_videos: 3,
    max_cameras: 8,
    max_rooms: 5,
    name: "Season Ops",
    price_cents: 9900,
    sort_order: 30,
  },
];

export function getActivePackages(packages: PackageRecord[]): PackageRecord[] {
  return packages
    .filter((item) => item.active === 1)
    .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name));
}

export function resolvePackageById(
  packageId: string | null | undefined,
  packages: PackageRecord[]
): PackageRecord {
  const activePackages = getActivePackages(packages);
  return activePackages.find((item) => item.id === packageId) ?? activePackages[0] ?? DEFAULT_PACKAGES[0];
}

export function formatPackagePrice({
  amountCents,
  currency,
}: {
  amountCents: number;
  currency: string;
}): string {
  const normalizedCurrency = currency.toLowerCase();
  const amount = amountCents / 100;

  if (normalizedCurrency === "bdt") {
    return `\u09f3${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(amount)}`;
  }

  return new Intl.NumberFormat("en-US", {
    currency: normalizedCurrency.toUpperCase(),
    style: "currency",
  }).format(amount);
}
