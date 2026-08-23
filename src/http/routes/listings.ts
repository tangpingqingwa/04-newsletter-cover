import type { FastifyInstance } from "fastify";
import { startListingCheckout } from "../../billing/create.js";
import { ListingError } from "../../listings.js";

export const LISTINGS_PATH = "/listings" as const;

function polarGateError(err: unknown): { status: number; error: string } | null {
  if (!(err instanceof Error)) {
    return null;
  }
  const message = err.message;
  if (message.startsWith("BLOCKED-SECRET:")) {
    return { status: 503, error: message };
  }
  if (
    message === "polar checkout failed closed" ||
    message === "LivePolar createCheckout is env-gated" ||
    message === "LivePolar requires POLAR_LIVE=1" ||
    message === "LivePolar is disabled when POLAR_FIXTURE_ONLY=1"
  ) {
    return { status: 503, error: "polar_unavailable" };
  }
  return null;
}

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
      const gated = polarGateError(err);
      if (gated) {
        return reply.code(gated.status).send({ error: gated.error });
      }
      throw err;
    }
  });
}
