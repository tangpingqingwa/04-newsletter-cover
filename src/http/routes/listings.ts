import type { FastifyInstance } from "fastify";
import { startListingCheckout } from "../../billing/create.js";
import { ListingError } from "../../listings.js";
import { escapeHtml } from "../../views/skin.js";

export const LISTINGS_PATH = "/listings" as const;

function providerGateError(err: unknown): { status: number; error: string } | null {
  if (!(err instanceof Error)) {
    return null;
  }
  const message = err.message;
  if (message.startsWith("BLOCKED-SECRET:")) {
    return { status: 503, error: message };
  }
  if (
    message.startsWith("BLOCKED-CONFIG:") ||
    message.startsWith("Waffo checkout") ||
    message.startsWith("Waffo checkout rejected:")
  ) {
    return { status: 503, error: "waffo_unavailable" };
  }
  return null;
}

function wantsHtml(request: { headers: Record<string, unknown> }): boolean {
  const accept = String(request.headers.accept ?? "");
  const type = String(request.headers["content-type"] ?? "");
  return (
    type.includes("application/x-www-form-urlencoded") ||
    (/\btext\/html\b/.test(accept) && !/\bapplication\/json\b/.test(accept))
  );
}

export function registerListingRoutes(app: FastifyInstance): void {
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      const raw = typeof body === "string" ? body : body.toString("utf8");
      done(null, Object.fromEntries(new URLSearchParams(raw)));
    },
  );

  app.post(LISTINGS_PATH, async (request, reply) => {
    try {
      const started = await startListingCheckout(
        app.db,
        app.polar,
        request.body,
        app.now(),
      );
      if (wantsHtml(request)) {
        return reply.redirect(started.url, 303);
      }
      return { url: started.url };
    } catch (err) {
      if (err instanceof ListingError) {
        if (wantsHtml(request)) {
          return reply.code(err.statusCode).type("text/html; charset=utf-8").send(
            `<!DOCTYPE html><html lang="en"><body><p>${escapeHtml(err.message)}</p><p><a href="/">Back</a></p></body></html>`,
          );
        }
        return reply.code(err.statusCode).send({ error: err.code });
      }
      const gated = providerGateError(err);
      if (gated) {
        if (wantsHtml(request)) {
          return reply.code(gated.status).type("text/html; charset=utf-8").send(
            `<!DOCTYPE html><html lang="en"><body><p>${escapeHtml(gated.error)}</p><p><a href="/">Back</a></p></body></html>`,
          );
        }
        return reply.code(gated.status).send({ error: gated.error });
      }
      throw err;
    }
  });
}
