import type { Listing } from "./db.js";
import { bidInRollingWeek } from "./week.js";

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
  /** Listings rows are paid; unpaid checkouts never become listings. */
  paid?: boolean;
};

export type RankedListing = RankableListing & {
  rank: number;
};

export type RankOptions = {
  issueDate?: string;
  /**
   * Occupied live `/` passes `now` so rank is the rolling last 7 days from
   * paid placement. Closed archives omit it and keep every paid row frozen.
   */
  now?: Date;
};

/** SPEC §7: anything other than exactly `1` leaves the pending gate off. */
export function editorVetoEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.EDITOR_VETO === "1";
}

/**
 * Paid + active listings for the open or requested issue.
 * Sort is bidUsd DESC, createdAt ASC. Clicks, blurb, and URL are not keys.
 * Occupied live `/` ranks only paid placement still inside the rolling last 7 days.
 */
export function rankListings(
  listings: readonly RankableListing[],
  options: RankOptions = {},
): RankedListing[] {
  const skipPendingGate = !editorVetoEnabled();
  const filtered = listings.filter((listing) => {
    if (listing.paid === false) {
      return false;
    }
    // Unpaid creates persist bidUsd 0; only paid bids rank.
    if (listing.bidUsd <= 0) {
      return false;
    }
    if (listing.status !== "active") {
      return false;
    }
    if (options.issueDate !== undefined && listing.issueDate !== options.issueDate) {
      return false;
    }
    if (
      options.now !== undefined &&
      !bidInRollingWeek(listing.createdAt, options.now)
    ) {
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
