import type { FastifyInstance } from "fastify";
import { createListing, ListingError } from "../../listings.js";

export const LISTINGS_PATH = "/listings" as const;

export function registerListingRoutes(app: FastifyInstance): void {
  app.post(LISTINGS_PATH, async (request, reply) => {
    try {
      return createListing(app.db, request.body);
    } catch (err) {
      if (err instanceof ListingError) {
        return reply.code(err.statusCode).send({ error: err.code });
      }
      throw err;
    }
  });
}
