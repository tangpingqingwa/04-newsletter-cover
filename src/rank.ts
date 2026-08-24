import type { Listing } from "./db.js";

export type RankableListing = Pick<
  Listing,
  | "id"
  | "issueDate"
  | "sponsorUrl"
  | "blurb"
  | "bidUsd"
  | "createdAt"
  | "clicks"
  | "status"
> & {
  /** Polar (or the fixture) reported paid. Unpaid leftover never occupies Cover · #1. */
  paid?: boolean;
};

export type RankedListing = RankableListing & {
  rank: number;
};

export type RankOptions = {
  issueDate?: string;
};

export type PolarPaidFields = {
  bidUsd: number;
  paid?: boolean;
  createdAt?: string;
  status?: Listing["status"] | string;
};

/**
 * Polar (or the fixture) has reported paid. Unpaid / abandoned checkout
 * never ranks and must not print Cover · #1.
 *
 * `createdAt` omitted is a paid HTML fixture. Empty or epoch `createdAt` is leftover.
 */
export function isPolarPaidListing(listing: PolarPaidFields): boolean {
  if (listing.paid === false) {
    return false;
  }
  if (listing.status === "rejected") {
    return false;
  }
  if (!Number.isInteger(listing.bidUsd) || listing.bidUsd <= 0) {
    return false;
  }
  if (listing.createdAt === undefined) {
    return true;
  }
  const paidAt = listing.createdAt.trim();
  if (!paidAt) {
    return false;
  }
  const ms = Date.parse(paidAt);
  return Number.isFinite(ms) && ms > 0;
}

/** Paid rows only. Unpaid or abandoned checkouts never take a rank. */
export function paidListings<T extends PolarPaidFields>(
  listings: readonly T[],
): T[] {
  return listings.filter(isPolarPaidListing);
}

/** SPEC §7: anything other than exactly `1` leaves the pending gate off. */
export function editorVetoEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.EDITOR_VETO === "1";
}

/**
 * Polar-paid + active listings for the open or requested issue.
 * Sort is bidUsd DESC, createdAt ASC. Clicks, blurb, and URL are not keys.
 * Unpaid leftover never occupies Cover · #1.
 */
export function rankListings(
  listings: readonly RankableListing[],
  options: RankOptions = {},
): RankedListing[] {
  const skipPendingGate = !editorVetoEnabled();
  const filtered = paidListings(listings).filter((listing) => {
    if (listing.status !== "active") {
      return false;
    }
    if (options.issueDate !== undefined && listing.issueDate !== options.issueDate) {
      return false;
    }
    // SPEC §7: unless EDITOR_VETO is exactly 1, do not apply a pending gate.
    // v1 has no pending listing status; the flag is read so the default stays off.
    if (skipPendingGate) {
      return true;
    }
    return listing.status === "active";
  });

  const ordered = [...filtered].sort((a, b) => {
    if (a.bidUsd !== b.bidUsd) {
      return b.bidUsd - a.bidUsd;
    }
    if (a.createdAt < b.createdAt) {
      return -1;
    }
    if (a.createdAt > b.createdAt) {
      return 1;
    }
    return 0;
  });

  return ordered.map((listing, index) => ({ ...listing, rank: index + 1 }));
}
