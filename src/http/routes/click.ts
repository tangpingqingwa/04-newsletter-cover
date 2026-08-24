import type { FastifyInstance } from "fastify";
import type { AppDb, Listing } from "../../db.js";
import { findListingById, ListingError } from "../../listings.js";
import { isPolarPaidListing } from "../../rank.js";
import { redirectTarget } from "../../url.js";

export const CLICK_PATH = "/l/:id" as const;

/**
 * Public outbound hop. Polar-paid + active listings only.
 * Missing, unpaid, rejected, or unpublished rows 404 and do not increment.
 */
export function incrementPublicClick(db: AppDb, listingId: string): Listing {
  const listing = findListingById(db, listingId);
  if (!listing || listing.status !== "active" || !isPolarPaidListing(listing)) {
    throw new ListingError("unknown_listing", "listing not found", 404);
  }
  const result = db
    .prepare(
      `UPDATE listings SET clicks = clicks + 1
       WHERE id = ? AND status = 'active' AND bid_usd > 0`,
    )
    .run(listingId);
  if (result.changes !== 1) {
    throw new ListingError("unknown_listing", "listing not found", 404);
  }
  const updated = findListingById(db, listingId);
  if (!updated || !isPolarPaidListing(updated)) {
    throw new ListingError("unknown_listing", "listing not found", 404);
  }
  return updated;
}

export function registerClickRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>(CLICK_PATH, async (request, reply) => {
    try {
      const listing = incrementPublicClick(app.db, request.params.id);
      return reply.redirect(redirectTarget(listing.sponsorUrl), 302);
    } catch (err) {
      if (err instanceof ListingError) {
        return reply.code(err.statusCode).send({ error: err.code });
      }
      throw err;
    }
  });
}
