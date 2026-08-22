import type { FastifyInstance } from "fastify";
import { startListingCheckout } from "../../billing/create.js";
import { ListingError } from "../../listings.js";

export const LISTINGS_PATH = "/listings" as const;

export function registerListingRoutes(app: FastifyInstance): void {
  app.post(LISTINGS_PATH, async (request, reply) => {
    try {
      const started = await startListingCheckout(
        app.db,
        app.polar,
        request.body,
      );
      return { url: started.url };
    } catch (err) {
      if (err instanceof ListingError) {
        return reply.code(err.statusCode).send({ error: err.code });
      }
      throw err;
    }
  });
}
