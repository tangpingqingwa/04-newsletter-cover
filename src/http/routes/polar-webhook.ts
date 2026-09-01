import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  verifyWebhook,
  type VerifyWebhookOptions,
  type WebhookEvent,
  type WebhookEventData,
} from "@waffo/pancake-ts";
import type { FastifyInstance } from "fastify";
import {
  applyVerifiedWaffoOrder,
  waffoEnvironment,
  waffoMode,
  type VerifiedWaffoOrder,
} from "../../billing/create.js";
import {
  waffoWebhookPublicKey,
} from "../../billing/waffo.js";
import { ListingError } from "../../listings.js";

/** Retired compatibility path; it must never be a settlement surface. */
export const POLAR_WEBHOOK_PATH = "/webhooks/polar" as const;
export const WAFFO_WEBHOOK_PATH = "/webhooks/waffo" as const;
/** Keep unauthenticated capture bounded before Fastify parses or verifies it. */
export const MAX_WAFFO_WEBHOOK_BODY_BYTES = 64 * 1024;

const rawBodies = new WeakMap<object, Buffer>();

class WaffoWebhookBodyTooLargeError extends Error {
  readonly statusCode = 413;
  readonly code = "waffo_webhook_body_too_large";

  constructor() {
    super("Waffo webhook body exceeds the configured limit");
    this.name = "WaffoWebhookBodyTooLargeError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  ...names: string[]
): string | undefined {
  for (const name of names) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value) || typeof value !== "string") continue;
    if (value.trim()) return value.trim();
  }
  return undefined;
}

function captureRawBody(
  request: {
    raw: object;
    headers: Record<string, string | string[] | undefined>;
  },
  payload: NodeJS.ReadableStream,
): Promise<Readable> {
  return (async () => {
    const contentLength = headerValue(request.headers, "content-length", "Content-Length");
    if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_WAFFO_WEBHOOK_BODY_BYTES) {
      throw new WaffoWebhookBodyTooLargeError();
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of payload) {
      const bytes = Buffer.isBuffer(chunk)
        ? chunk
        : typeof chunk === "string"
          ? Buffer.from(chunk)
          : Buffer.from(chunk as Uint8Array);
      total += bytes.length;
      if (total > MAX_WAFFO_WEBHOOK_BODY_BYTES) {
        throw new WaffoWebhookBodyTooLargeError();
      }
      chunks.push(bytes);
    }
    const raw = Buffer.concat(chunks);
    rawBodies.set(request.raw, raw);
    const replay = Readable.from([raw]) as Readable & {
      receivedEncodedLength?: number;
    };
    replay.receivedEncodedLength = raw.length;
    return replay;
  })();
}

function invalidWebhook(reply: {
  code: (status: number) => { send: (body: unknown) => unknown };
}): unknown {
  return reply.code(400).send({ error: "invalid_webhook" });
}

function providerAccessor<T>(
  app: FastifyInstance,
  name: string,
): T | undefined {
  const provider = app.polar as typeof app.polar & {
    [key: string]: (() => T) | undefined;
  };
  const value = provider[name];
  return typeof value === "function" ? value.call(provider) : undefined;
}

function configuredMode(app: FastifyInstance): "test" | "prod" {
  const fromProvider = providerAccessor<"test" | "prod">(app, "getEnvironment");
  if (fromProvider) return fromProvider;
  return waffoEnvironment(waffoMode()) ?? "test";
}

function configuredPublicKey(app: FastifyInstance): string | undefined {
  return (
    providerAccessor<string>(app, "getWebhookPublicKey") ??
    waffoWebhookPublicKey()
  );
}

function snapshotWithoutDeliveryId(
  event: WebhookEvent<WebhookEventData>,
): Record<string, unknown> {
  const snapshot = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
  delete snapshot.id;
  return snapshot;
}

function registerPath(app: FastifyInstance, path: string): void {
  app.post(
    path,
    {
      // Waffo signs the exact bytes. Replay the captured stream so Fastify's
      // JSON parser cannot alter the input used for RSA verification.
      preParsing: async (request, _reply, payload) =>
        captureRawBody(request, payload),
    },
    async (request, reply) => {
      const rawBody = rawBodies.get(request.raw);
      const signature = headerValue(
        request.headers as Record<string, string | string[] | undefined>,
        "x-waffo-signature",
        "X-Waffo-Signature",
      );
      if (!rawBody || !signature) return invalidWebhook(reply);

      const mode = configuredMode(app);
      const verifyOptions: VerifyWebhookOptions = { environment: mode };
      const publicKey = configuredPublicKey(app);
      if (publicKey) verifyOptions.publicKey = publicKey;

      let event: WebhookEvent<WebhookEventData>;
      try {
        event = verifyWebhook<WebhookEventData>(
          rawBody.toString("utf8"),
          signature,
          verifyOptions,
        );
      } catch {
        return reply.code(401).send({ error: "invalid_webhook_signature" });
      }

      if (!isRecord(event)) {
        return reply.code(422).send({ error: "invalid_webhook_event" });
      }
      if (!isRecord(event.data)) {
        return reply.code(422).send({ error: "invalid_webhook_event" });
      }
      const data = event.data as WebhookEventData;
      const productMetadata = isRecord(data.productMetadata)
        ? data.productMetadata
        : null;
      const orderMetadata = isRecord(data.orderMetadata)
        ? data.orderMetadata
        : {};
      const order: VerifiedWaffoOrder = {
        deliveryId: stringField(event.id),
        businessEventId: stringField(event.eventId),
        eventType: stringField(event.eventType),
        eventTimestamp: stringField(event.timestamp),
        mode: stringField(event.mode),
        storeId: stringField(event.storeId),
        orderId: stringField(data.orderId),
        paymentId: stringField(data.paymentId),
        orderStatus: stringField(data.orderStatus),
        paymentStatus: stringField(data.paymentStatus),
        currency: stringField(data.currency),
        productId:
          productMetadata && typeof productMetadata.productId === "string"
            ? productMetadata.productId
            : "",
        amount: stringField(data.amount),
        taxAmount: stringField(data.taxAmount),
        ...(data.subtotal !== undefined ? { subtotal: data.subtotal } : {}),
        ...(data.total !== undefined ? { total: data.total } : {}),
        orderMerchantExternalId: stringField(data.orderMerchantExternalId),
        orderMetadata,
        payloadSha256: createHash("sha256").update(rawBody).digest("hex"),
        eventSnapshot: snapshotWithoutDeliveryId(event),
        receivedAt: app.now().toISOString(),
      };

      try {
        // The settlement layer accepts only the signed order.completed event;
        // every other Waffo event is durably rejected without ranking.
        const result = applyVerifiedWaffoOrder(app.db, order, app.now());
        return {
          ok: true,
          status: result.reconciled
            ? "needs_reconciliation"
            : result.checkout.status,
          replay: result.replay,
        };
      } catch (error) {
        if (error instanceof ListingError) {
          return reply.code(error.statusCode).send({ error: error.code });
        }
        throw error;
      }
    },
  );
}

export function registerWaffoWebhookRoutes(app: FastifyInstance): void {
  registerPath(app, WAFFO_WEBHOOK_PATH);
  app.post(POLAR_WEBHOOK_PATH, async (_request, reply) => {
    return reply.code(410).send({ error: "polar_webhook_retired" });
  });
}

/** Compatibility export for interrupted server wiring; Waffo remains canonical. */
export const registerPolarWebhookRoutes = registerWaffoWebhookRoutes;
