import type { FastifyInstance } from "fastify";
import { completeCheckout } from "../../billing/create.js";
import { ListingError } from "../../listings.js";

export const POLAR_WEBHOOK_PATH = "/webhooks/polar" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Fixture `complete(checkoutId)` or a Polar-shaped paid event. */
export function extractCheckoutId(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const direct =
    readString(body.checkoutId) ??
    readString(body.polarCheckoutId) ??
    readString(body.id);
  if (direct) {
    return direct;
  }
  const data = isRecord(body.data) ? body.data : undefined;
  return data
    ? (readString(data.checkoutId) ?? readString(data.id))
    : undefined;
}

export function registerPolarWebhookRoutes(app: FastifyInstance): void {
  app.post(POLAR_WEBHOOK_PATH, async (request, reply) => {
    const checkoutId = extractCheckoutId(request.body);
    if (!checkoutId) {
      return reply.code(400).send({ error: "invalid_webhook" });
    }
    try {
      const checkout = await completeCheckout(app.db, app.polar, checkoutId);
      return { ok: true, status: checkout.status };
    } catch (err) {
      if (err instanceof ListingError) {
        return reply.code(err.statusCode).send({ error: err.code });
      }
      throw err;
    }
  });
}
