import {
  renderBoardPage,
  type BoardViewModel,
} from "./outbid-reference-board.js";
import type { RankedListing } from "./outbid-reference-core.js";

export const OUTBID_REFERENCE_NOW = new Date("2026-08-29T12:00:00.000Z");
export const OUTBID_REFERENCE_ISSUE = "2026-08-31";

export type NewsletterReferenceListing = {
  rank: number;
  id: string;
  sponsorUrl: string;
  blurb: string;
  bidUsd: number;
  clicks: number;
  createdAt?: string;
  updatedAt?: string;
};

export type NewsletterReferenceBoard = {
  issueDate: string | null;
  status: "open" | "closed" | null;
  listings: NewsletterReferenceListing[];
};

export const OUTBID_REFERENCE_FIXTURE_ROWS = [
  ["lst_visual_one", "The Morning Ledger — A calm briefing on money, work, and the week ahead", 17_000, "https://morning-ledger.example/"],
  ["lst_visual_two", "Field Notes Weekly — Practical field notes for people building in public", 16_000, "https://field-notes-weekly.example/"],
  ["lst_visual_three", "The Signal Sheet — Policy, platforms, and power in plain English", 14_028, "https://signal-sheet.example/"],
  ["lst_visual_four", "Northstar Dispatch — Product lessons from people shipping the work", 13_005, "https://northstar-dispatch.example/"],
  ["lst_visual_five", "Common Thread — Climate progress reported without the theater", 12_080, "https://common-thread.example/"],
  ["lst_visual_six", "The Local Index — One useful local story before your first meeting", 11_004, "https://local-index.example/"],
] as const;

export function isOutbidReferenceFixture(
  board: NewsletterReferenceBoard,
): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.WAFFO_MODE !== "fixture") return false;
  if (board.issueDate !== OUTBID_REFERENCE_ISSUE || board.status !== "open") {
    return false;
  }
  if (board.listings.length !== OUTBID_REFERENCE_FIXTURE_ROWS.length) {
    return false;
  }
  return OUTBID_REFERENCE_FIXTURE_ROWS.every(
    ([id, blurb, bidUsd, sponsorUrl], index) => {
      const listing = board.listings[index];
      return (
        listing?.id === id &&
        listing.blurb === blurb &&
        listing.bidUsd === bidUsd &&
        listing.sponsorUrl === sponsorUrl
      );
    },
  );
}

function referenceListings(
  board: NewsletterReferenceBoard,
): RankedListing[] {
  const day = OUTBID_REFERENCE_NOW.toISOString().slice(0, 10);
  return board.listings.slice(0, 3).map((listing) => ({
    id: listing.id,
    day,
    productUrl: listing.sponsorUrl,
    whyTestThisToday: listing.blurb,
    bidUsd: listing.bidUsd,
    paidUsd: listing.bidUsd,
    clicks: listing.clicks,
    createdAt: listing.createdAt ?? OUTBID_REFERENCE_NOW.toISOString(),
    updatedAt:
      listing.updatedAt ?? listing.createdAt ?? OUTBID_REFERENCE_NOW.toISOString(),
    rank: listing.rank,
  }));
}

/**
 * Preserve Newsletter Cover's real POST /listings contract while the exact
 * six-row disposable fixture uses the shared Outbid visual surface.
 */
export function adaptReferenceDocument(documentHtml: string): string {
  return documentHtml
    .replace("<body>", '<body><div class="outbid-reference-root" data-reference-fixture-root="">')
    .replace("</body>", "</div></body>")
    .replace('action="/checkout"', 'action="/listings"')
    .replaceAll("productUrl", "sponsorUrl")
    .replaceAll("whyTestThisToday", "blurb")
    .replace('name="category"', 'data-ui-field="category"')
    .replace('name="kind"', 'data-ui-field="kind"')
    .replace('name="venueName"', 'data-ui-field="newsletterName"')
    .replace("Product URL", "Sponsor URL")
    .replace("Why test this today", "One-line cover pitch")
    .replace("What a seller should try this morning", "One line for this week’s cover")
    .replace(
      "A short, specific reason helps sellers decide what to test.",
      "This line appears on the paid cover placement.",
    )
    .replace("Choose a category and enter venue details", "Choose a category and enter newsletter details")
    .replace("Weekend venue details", "Newsletter details")
    .replace("Venue details", "Newsletter details")
    .replace("Venue name", "Newsletter name")
    .replace('placeholder="Venue name"', 'placeholder="Newsletter name"')
    .replaceAll(/href="\/r\/([^"#?]+)"/g, 'href="/l/$1"')
    .replaceAll(/data-target="\/r\/([^"#?]+)"/g, 'data-target="/l/$1"')
    .replace("<title>DTC Picks Daily</title>", "<title>Newsletter Cover</title>");
}

export function renderNewsletterReferencePage(
  board: NewsletterReferenceBoard,
): string | null {
  if (!isOutbidReferenceFixture(board)) return null;
  const day = OUTBID_REFERENCE_NOW.toISOString().slice(0, 10);
  const listings = referenceListings(board);
  const model: BoardViewModel = {
    day,
    tz: "UTC",
    listings,
    last24h: listings,
    defaultBidUsd: 17_001,
    now: OUTBID_REFERENCE_NOW,
    fixtureMode: true,
  };
  return adaptReferenceDocument(renderBoardPage(model));
}
