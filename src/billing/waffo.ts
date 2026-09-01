import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { createPrivateKey, createPublicKey } from "node:crypto";
import {
  WaffoPancake,
  WaffoPancakeError,
  TaxCategory,
  type WaffoPancakeConfig,
} from "@waffo/pancake-ts";
import type { CreateCheckoutInput, WaffoCheckout, WaffoPort } from "./port.js";

export type WaffoEnv = NodeJS.ProcessEnv;
export type WaffoMode = "fixture" | "waffo-test" | "waffo-prod";
export type WaffoEnvironment = "test" | "prod";

export const DEFAULT_WAFFO_API_BASE = "https://api.waffo.ai";
export const OFFICIAL_WAFFO_API_ORIGIN = "https://api.waffo.ai";

const WAFFO_CHECKOUT_HOST = "pancake.waffo.ai";
const WAFFO_SHORT_ID = /^[A-Z]{2,5}_[0-9A-Za-z]{22}$/;

/** Keep a stalled provider socket from holding an immutable intent forever. */
export const DEFAULT_WAFFO_FETCH_TIMEOUT_MS = 10_000;
const MAX_WAFFO_FETCH_TIMEOUT_MS = 120_000;

const RESERVED_LOCAL_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".test",
  ".invalid",
  ".example",
  ".internal",
  ".lan",
  ".home.arpa",
] as const;

// RFC 2606/6761 documentation domains are never valid production return
// origins, even though they otherwise look like public DNS names.
const RESERVED_DOCUMENTATION_HOSTS = new Set([
  "example.com",
  "example.net",
  "example.org",
  "example.edu",
]);

export class WaffoProviderRejectedError extends Error {
  readonly providerRejected = true;
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "WaffoProviderRejectedError";
    this.status = status;
  }
}

export class WaffoCheckoutAmbiguousError extends Error {
  readonly ambiguous = true;

  constructor(message = "Waffo checkout outcome is ambiguous", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WaffoCheckoutAmbiguousError";
  }
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

type WaffoErrorNotice = {
  message: string;
  layer: string;
};

function validProviderErrors(error: WaffoPancakeError): WaffoErrorNotice[] | undefined {
  const entries: unknown = error.errors;
  if (!Array.isArray(entries) || entries.length === 0) return undefined;
  if (!entries.every((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
    const notice = entry as Record<string, unknown>;
    return nonEmpty(notice.message) !== undefined && nonEmpty(notice.layer) !== undefined;
  })) {
    return undefined;
  }
  return entries as WaffoErrorNotice[];
}

export function waffoMode(env: WaffoEnv = process.env): WaffoMode | undefined {
  const value = nonEmpty(env.WAFFO_MODE);
  if (value === "fixture" || value === "waffo-test" || value === "waffo-prod") {
    return value;
  }
  return undefined;
}

export function waffoEnvironment(
  mode: WaffoMode | undefined,
): WaffoEnvironment | undefined {
  if (mode === "waffo-test") return "test";
  if (mode === "waffo-prod") return "prod";
  return undefined;
}

export function waffoApiBase(env: WaffoEnv = process.env): string {
  return (nonEmpty(env.WAFFO_API_BASE) ?? DEFAULT_WAFFO_API_BASE).replace(/\/$/, "");
}

function parseOrigin(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!url.hostname || url.username || url.password || url.pathname !== "/" && url.pathname !== "" || url.search || url.hash) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function safeTestApiHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".test");
}

function reservedIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a, b, c] = octets as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 31 && c === 196) ||
    (a === 192 && b === 52 && c === 193) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 175 && c === 48) ||
    (a === 198 && b >= 18 && b <= 19) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/**
 * A production return origin must be reachable by a buyer and must not point
 * at a local, private, documentation, or test address. URL parsing is done
 * before this check so decimal/hex/octal IPv4 spellings are normalized by the
 * WHATWG parser and checked as the same address.
 */
function isPublicProductionHostname(hostname: string): boolean {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
  if (!normalized) return false;
  if (
    [...RESERVED_DOCUMENTATION_HOSTS].some(
      (host) => normalized === host || normalized.endsWith(`.${host}`),
    )
  ) {
    return false;
  }
  const version = isIP(normalized);
  if (version === 6) return false;
  if (version === 4) return !reservedIpv4(normalized);
  // WHATWG leaves out-of-range dotted/decimal IPv4 spellings as hostnames;
  // do not accidentally treat an invalid numeric address as public DNS.
  if (/^\d+(?:\.\d+){0,3}$/.test(normalized)) return false;
  if (
    normalized === "localhost" ||
    RESERVED_LOCAL_SUFFIXES.some(
      (suffix) => normalized === suffix.slice(1) || normalized.endsWith(suffix),
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Production credentials may only be sent to Waffo's official HTTPS origin.
 * Tests can inject a HTTPS `.test`/loopback origin for a fetch double, but an
 * arbitrary production-looking URL is never accepted as an API endpoint.
 */
export function validateWaffoApiOrigin(
  value: string | undefined,
  mode: WaffoMode | undefined,
): string {
  const parsed = parseOrigin(value);
  if (!parsed || parsed.protocol !== "https:") {
    throw new Error("BLOCKED-CONFIG: WAFFO_API_BASE must be an HTTPS origin");
  }
  const origin = parsed.origin;
  if (mode === "waffo-prod" && origin !== OFFICIAL_WAFFO_API_ORIGIN) {
    throw new Error("BLOCKED-CONFIG: WAFFO_API_BASE must be https://api.waffo.ai in waffo-prod");
  }
  if (mode === "waffo-test" && origin !== OFFICIAL_WAFFO_API_ORIGIN && !safeTestApiHost(parsed.hostname)) {
    throw new Error("BLOCKED-CONFIG: WAFFO_API_BASE test override must use a .test or loopback HTTPS origin");
  }
  return origin;
}

/** Public base URL must be an origin; route/query fragments could leak facts. */
export function validateWaffoPublicOrigin(
  value: string | undefined,
  mode: WaffoMode | undefined,
): string {
  const parsed = parseOrigin(value);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    throw new Error("BLOCKED-CONFIG: PUBLIC_BASE_URL must be an origin");
  }
  if (mode === "waffo-prod" && parsed.protocol !== "https:") {
    throw new Error("BLOCKED-CONFIG: PUBLIC_BASE_URL must use HTTPS in waffo-prod");
  }
  if (mode === "waffo-prod" && !isPublicProductionHostname(parsed.hostname)) {
    throw new Error(
      "BLOCKED-CONFIG: PUBLIC_BASE_URL must use a public production hostname",
    );
  }
  if (mode === "waffo-prod") {
    // DNS's optional root label is not part of the stable application origin.
    parsed.hostname = parsed.hostname.replace(/\.+$/, "");
  }
  return parsed.origin;
}

/** Hosted checkout links must remain on Waffo's HTTPS cashier origin. */
export function validateWaffoCheckoutUrl(
  value: string | undefined,
  expectedSessionId?: string,
): string {
  if (!value) throw new WaffoCheckoutAmbiguousError("Waffo checkout response was incomplete");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new WaffoCheckoutAmbiguousError("Waffo checkout URL is invalid");
  }
  const authority = /^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i.exec(value)?.[1];
  let pathSegments: string[];
  try {
    // Decode each segment independently: encoded slashes must not smuggle an
    // extra path component into the cashier URL, and malformed escapes are
    // never allowed to pass through as an opaque provider string.
    pathSegments = parsed.pathname
      .split("/")
      .slice(1)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    throw new WaffoCheckoutAmbiguousError("Waffo checkout URL contains malformed encoding");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname.toLowerCase() !== WAFFO_CHECKOUT_HOST ||
    authority?.toLowerCase() !== WAFFO_CHECKOUT_HOST ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    pathSegments.length !== 4 ||
    pathSegments[0] !== "store" ||
    pathSegments[1] === "" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pathSegments[1] ?? "") ||
    pathSegments[2] !== "checkout" ||
    pathSegments[3] === "" ||
    pathSegments[3]?.includes("/") ||
    (expectedSessionId !== undefined && pathSegments[3] !== expectedSessionId)
  ) {
    throw new WaffoCheckoutAmbiguousError("Waffo checkout URL is not an HTTPS Waffo cashier URL");
  }
  return parsed.toString();
}

/** Expiry is a provider fact, not an opaque string that can be persisted. */
export function validateWaffoExpiry(value: string | undefined, now: Date = new Date()): string {
  const match = value && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  if (!match) {
    throw new WaffoCheckoutAmbiguousError("Waffo checkout expiry is invalid");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millis = Number((match[7] ?? "").padEnd(3, "0") || "0");
  const expiresAt = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millis));
  if (
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt.getUTCFullYear() !== year ||
    expiresAt.getUTCMonth() !== month - 1 ||
    expiresAt.getUTCDate() !== day ||
    expiresAt.getUTCHours() !== hour ||
    expiresAt.getUTCMinutes() !== minute ||
    expiresAt.getUTCSeconds() !== second ||
    expiresAt.getUTCMilliseconds() !== millis ||
    expiresAt.getTime() <= now.getTime()
  ) {
    throw new WaffoCheckoutAmbiguousError("Waffo checkout expiry is not in the future");
  }
  return expiresAt.toISOString();
}

export function waffoMerchantId(env: WaffoEnv = process.env): string | undefined {
  return nonEmpty(env.WAFFO_MERCHANT_ID);
}

export function waffoStoreId(env: WaffoEnv = process.env): string | undefined {
  return nonEmpty(env.WAFFO_STORE_ID);
}

export function waffoProductId(env: WaffoEnv = process.env): string | undefined {
  return nonEmpty(env.WAFFO_PRODUCT_ID);
}

export function waffoPublicBaseUrl(env: WaffoEnv = process.env): string | undefined {
  const raw = nonEmpty(env.PUBLIC_BASE_URL);
  if (!raw) return undefined;
  return raw.replace(/\/$/, "");
}

export function waffoDatabasePath(env: WaffoEnv = process.env): string | undefined {
  return nonEmpty(env.DATABASE_PATH);
}

/** SQLite URI forms with an in-memory mode are not durable payment ledgers. */
export function isEphemeralDatabasePath(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === ":memory:" || normalized.startsWith("file::memory:") || normalized.startsWith("file:memory:")) {
    return true;
  }
  if (!normalized.startsWith("file:")) return false;
  const query = normalized.split("?", 2)[1];
  if (!query) return false;
  return new URLSearchParams(query.replace(/#.*$/, "")).get("mode") === "memory";
}

export function waffoPrivateKey(env: WaffoEnv = process.env): string | undefined {
  const inline = nonEmpty(env.WAFFO_PRIVATE_KEY);
  if (inline) return inline.replace(/\\n/g, "\n");
  const path = nonEmpty(env.WAFFO_PRIVATE_KEY_FILE);
  if (!path) return undefined;
  try {
    const value = readFileSync(path, "utf8").trim();
    return value ? value : undefined;
  } catch {
    return undefined;
  }
}

export function waffoWebhookPublicKey(
  env: WaffoEnv = process.env,
  mode: WaffoMode | undefined = waffoMode(env),
): string | undefined {
  const modeSpecific =
    mode === "waffo-prod"
      ? env.WAFFO_WEBHOOK_PROD_PUBLIC_KEY
      : mode === "waffo-test"
        ? env.WAFFO_WEBHOOK_TEST_PUBLIC_KEY
        : undefined;
  // Live environments must never silently share a key across test/prod. The
  // generic name is retained only for compatibility with an explicitly
  // mode-less fixture harness.
  return mode === "waffo-prod" || mode === "waffo-test"
    ? nonEmpty(modeSpecific)
    : nonEmpty(env.WAFFO_WEBHOOK_PUBLIC_KEY);
}

function configuredFetchTimeoutMs(env: WaffoEnv): number {
  const parsed = Number(nonEmpty(env.WAFFO_FETCH_TIMEOUT_MS));
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_WAFFO_FETCH_TIMEOUT_MS;
  return Math.min(Math.max(Math.floor(parsed), 1), MAX_WAFFO_FETCH_TIMEOUT_MS);
}

class WaffoFetchAbortError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WaffoFetchAbortError";
  }
}

function normalizedPem(value: string): string {
  return value.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
}

function assertRsaPrivateKey(name: string, value: string): void {
  try {
    const key = createPrivateKey(normalizedPem(value));
    if (key.asymmetricKeyType !== "rsa") throw new Error("not rsa");
  } catch {
    throw new Error(`BLOCKED-CONFIG: ${name} must be an RSA private key (Private key PEM)`);
  }
}

function assertRsaPublicKey(name: string, value: string): void {
  try {
    const key = createPublicKey(normalizedPem(value));
    if (key.asymmetricKeyType !== "rsa") throw new Error("not rsa");
  } catch {
    throw new Error(`BLOCKED-CONFIG: ${name} must be an RSA public key`);
  }
}

function assertWaffoShortId(name: string, value: string, prefix: string): void {
  if (!WAFFO_SHORT_ID.test(value) || !value.startsWith(`${prefix}_`)) {
    throw new Error(`BLOCKED-CONFIG: ${name} must be a ${prefix}_ Short ID`);
  }
}

/**
 * Wrap the SDK's fetch without weakening its request contract. Every request
 * gets an abort signal, any caller signal is composed into it, and the race
 * rejects even when a test/double ignores AbortController entirely.
 */
export function withWaffoFetchTimeout(
  baseFetch: typeof fetch,
  timeoutMs: number,
): typeof fetch {
  const deadline = Math.min(
    Math.max(Math.floor(timeoutMs), 1),
    MAX_WAFFO_FETCH_TIMEOUT_MS,
  );
  return async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    const controller = new AbortController();
    const sourceSignals: AbortSignal[] = [];
    if (init?.signal) sourceSignals.push(init.signal);
    if (typeof Request !== "undefined" && input instanceof Request && input.signal) {
      sourceSignals.push(input.signal);
    }
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = (source: AbortSignal): void => {
      if (!controller.signal.aborted) {
        controller.abort(source.reason);
      }
    };
    const listeners = sourceSignals.map((source) => {
      const listener = (): void => onAbort(source);
      if (source.aborted) listener();
      else source.addEventListener("abort", listener, { once: true });
      return { source, listener };
    });
    const abortRaceListeners: Array<{ source: AbortSignal; listener: () => void }> = [];
    const request = Promise.resolve().then(() =>
      baseFetch(input, { ...init, signal: controller.signal }),
    );
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        const error = new WaffoFetchAbortError("Waffo checkout request timed out");
        if (!controller.signal.aborted) controller.abort(error);
        reject(error);
      }, deadline);
    });
    const sourceAbort = sourceSignals.length
      ? new Promise<never>((_resolve, reject) => {
          const check = (): void => {
            const source = sourceSignals.find((candidate) => candidate.aborted);
            if (!source) return;
            const error = new WaffoFetchAbortError("Waffo checkout request was aborted", {
              cause: source.reason,
            });
            if (!controller.signal.aborted) controller.abort(source.reason);
            reject(error);
          };
          for (const source of sourceSignals) {
            const listener = (): void => check();
            abortRaceListeners.push({ source, listener });
            if (source.aborted) listener();
            else source.addEventListener("abort", listener, { once: true });
          }
        })
      : null;
    try {
      const response = await Promise.race(
        sourceAbort ? [request, timeout, sourceAbort] : [request, timeout],
      );
      // The official SDK calls response.json() after fetch resolves. Consume
      // that body before returning so the same deadline covers headers and
      // the response body, including a fetch double that ignores aborts.
      const parsedBody = await Promise.race(
        sourceAbort
          ? [
              Promise.resolve().then(() => response.json()),
              timeout,
              sourceAbort,
            ]
          : [Promise.resolve().then(() => response.json()), timeout],
      );
      return new Response(JSON.stringify(parsedBody), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      if (timedOut) throw error;
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      for (const { source, listener } of listeners) {
        source.removeEventListener("abort", listener);
      }
      for (const { source, listener } of abortRaceListeners) {
        source.removeEventListener("abort", listener);
      }
    }
  };
}

function requireValue(name: string, value: string | undefined): string {
  if (!value) throw new Error(`BLOCKED-CONFIG: ${name}`);
  return value;
}

/**
 * Validate the explicit runtime mode before a server can accept a checkout.
 * Legacy provider flags intentionally do not participate.
 */
export function assertWaffoRuntimeConfig(env: WaffoEnv = process.env): WaffoMode {
  const modeValue = nonEmpty(env.WAFFO_MODE);
  if (
    modeValue !== "fixture" &&
    modeValue !== "waffo-test" &&
    modeValue !== "waffo-prod"
  ) {
    throw new Error("BLOCKED-CONFIG: WAFFO_MODE");
  }
  if (modeValue === "fixture") {
    if (env.NODE_ENV === "production") {
      throw new Error("BLOCKED-CONFIG: WAFFO_MODE=waffo-prod required in production");
    }
    if (waffoPublicBaseUrl(env)) {
      validateWaffoPublicOrigin(waffoPublicBaseUrl(env), modeValue);
    }
    return modeValue;
  }

  const merchantId = requireValue("WAFFO_MERCHANT_ID", waffoMerchantId(env));
  const privateKey = requireValue("WAFFO_PRIVATE_KEY", waffoPrivateKey(env));
  const storeId = requireValue("WAFFO_STORE_ID", waffoStoreId(env));
  const productId = requireValue("WAFFO_PRODUCT_ID", waffoProductId(env));
  assertWaffoShortId("WAFFO_MERCHANT_ID", merchantId, "MER");
  assertWaffoShortId("WAFFO_STORE_ID", storeId, "STO");
  assertWaffoShortId("WAFFO_PRODUCT_ID", productId, "PROD");
  assertRsaPrivateKey("WAFFO_PRIVATE_KEY", privateKey);
  const publicBase = requireValue("PUBLIC_BASE_URL", waffoPublicBaseUrl(env));
  const databasePath = requireValue("DATABASE_PATH", waffoDatabasePath(env));
  if (isEphemeralDatabasePath(databasePath)) {
    throw new Error("BLOCKED-CONFIG: DATABASE_PATH must be durable");
  }
  validateWaffoApiOrigin(waffoApiBase(env), modeValue);
  validateWaffoPublicOrigin(publicBase, modeValue);
  if (env.NODE_ENV === "production" && modeValue !== "waffo-prod") {
    throw new Error("BLOCKED-CONFIG: WAFFO_MODE=waffo-prod required in production");
  }
  const webhookKeyName = modeValue === "waffo-prod"
    ? "WAFFO_WEBHOOK_PROD_PUBLIC_KEY"
    : "WAFFO_WEBHOOK_TEST_PUBLIC_KEY";
  const webhookKey = requireValue(webhookKeyName, nonEmpty(env[webhookKeyName]));
  assertRsaPublicKey(webhookKeyName, webhookKey);
  return modeValue;
}

export function chargeCentsToDisplayString(chargeCents: number): string {
  if (!Number.isSafeInteger(chargeCents) || chargeCents < 1) {
    throw new WaffoProviderRejectedError("invalid checkout charge");
  }
  const dollars = Math.floor(chargeCents / 100);
  const cents = String(chargeCents % 100).padStart(2, "0");
  return `${dollars}.${cents}`;
}

function providerErrorMessage(error: WaffoPancakeError): string {
  const first = validProviderErrors(error)?.[0]?.message;
  return first ? `Waffo checkout rejected: ${first}` : "Waffo checkout rejected";
}

function isExplicitProviderError(error: unknown): error is WaffoPancakeError {
  if (!(error instanceof WaffoPancakeError)) return false;
  const errors = validProviderErrors(error);
  if (!errors || !Number.isInteger(error.status)) return false;
  // A non-JSON body is an incomplete provider response, even when its HTTP
  // status happens to be 4xx. It cannot prove that Waffo rejected the call.
  if (errors.some((entry) => entry.layer === "sdk" && entry.message.startsWith("Non-JSON response"))) {
    return false;
  }
  // A 5xx, timeout, conflict, too-early, or rate-limit response does not
  // prove that Waffo did not accept the request.
  return error.status >= 400 && error.status < 500 &&
    error.status !== 408 && error.status !== 409 &&
    error.status !== 425 && error.status !== 429;
}

export type LiveWaffoOptions = {
  env?: WaffoEnv;
  fetch?: typeof fetch;
  webhookPublicKey?: string;
  /** Testable override; production defaults to a bounded ten-second deadline. */
  timeoutMs?: number;
};

/** Official Waffo Pancake API-key checkout adapter. */
export class LiveWaffo implements WaffoPort {
  readonly kind: "waffo-test" | "waffo-prod";
  private readonly env: WaffoEnv;
  private readonly client: WaffoPancake;
  private readonly configuredWebhookPublicKey: string | undefined;

  constructor(options: LiveWaffoOptions = {}) {
    this.env = options.env ?? process.env;
    const mode = waffoMode(this.env);
    if (mode !== "waffo-test" && mode !== "waffo-prod") {
      throw new Error("BLOCKED-CONFIG: WAFFO_MODE");
    }
    const merchantId = requireValue("WAFFO_MERCHANT_ID", waffoMerchantId(this.env));
    const privateKey = requireValue("WAFFO_PRIVATE_KEY", waffoPrivateKey(this.env));
    assertWaffoShortId("WAFFO_MERCHANT_ID", merchantId, "MER");
    assertRsaPrivateKey("WAFFO_PRIVATE_KEY", privateKey);
    assertWaffoShortId(
      "WAFFO_STORE_ID",
      requireValue("WAFFO_STORE_ID", waffoStoreId(this.env)),
      "STO",
    );
    assertWaffoShortId(
      "WAFFO_PRODUCT_ID",
      requireValue("WAFFO_PRODUCT_ID", waffoProductId(this.env)),
      "PROD",
    );
    const apiBase = validateWaffoApiOrigin(waffoApiBase(this.env), mode);
    this.kind = mode;
    this.configuredWebhookPublicKey =
      options.webhookPublicKey ?? waffoWebhookPublicKey(this.env, mode);
    if (this.configuredWebhookPublicKey) {
      const webhookKeyName = mode === "waffo-prod"
        ? "WAFFO_WEBHOOK_PROD_PUBLIC_KEY"
        : "WAFFO_WEBHOOK_TEST_PUBLIC_KEY";
      assertRsaPublicKey(webhookKeyName, this.configuredWebhookPublicKey);
    }
    const config: WaffoPancakeConfig = {
      merchantId,
      privateKey,
      baseUrl: apiBase,
      fetch: withWaffoFetchTimeout(
        options.fetch ?? globalThis.fetch.bind(globalThis),
        options.timeoutMs ?? configuredFetchTimeoutMs(this.env),
      ),
      webhookPublicKey: this.configuredWebhookPublicKey,
    };
    this.client = new WaffoPancake(config);
  }

  getMode(): "waffo-test" | "waffo-prod" {
    return this.kind;
  }

  getEnvironment(): WaffoEnvironment {
    return this.kind === "waffo-prod" ? "prod" : "test";
  }

  getStoreId(): string | undefined {
    return waffoStoreId(this.env);
  }

  getProductId(): string | undefined {
    return waffoProductId(this.env);
  }

  getWebhookPublicKey(): string | undefined {
    return this.configuredWebhookPublicKey;
  }

  async createCheckout(input: CreateCheckoutInput): Promise<WaffoCheckout> {
    const intentId = nonEmpty(input.intentId) ?? nonEmpty(input.checkoutId);
    const metadata = { ...(input.metadata ?? {}) };
    if (!intentId || !nonEmpty(input.intentFingerprint ?? metadata.intentFingerprint)) {
      throw new WaffoProviderRejectedError("immutable Waffo intent metadata is missing");
    }
    metadata.intentId = intentId;
    metadata.intentFingerprint =
      nonEmpty(input.intentFingerprint ?? metadata.intentFingerprint) as string;

    let session: Awaited<ReturnType<WaffoPancake["checkout"]["anonymous"]["create"]>>;
    try {
      session = await this.client.checkout.anonymous.create({
        productId: requireValue("WAFFO_PRODUCT_ID", waffoProductId(this.env)),
        currency: "USD",
        priceSnapshot: {
          amount: chargeCentsToDisplayString(input.amountUsd * 100),
          taxCategory: TaxCategory.DigitalGoods,
        },
        successUrl: input.successUrl,
        orderMerchantExternalId: intentId,
        metadata,
      });
    } catch (error) {
      if (isExplicitProviderError(error)) {
        throw new WaffoProviderRejectedError(providerErrorMessage(error), error.status);
      }
      throw new WaffoCheckoutAmbiguousError(undefined, { cause: error });
    }

    if (typeof session !== "object" || session === null || Array.isArray(session)) {
      throw new WaffoCheckoutAmbiguousError("Waffo checkout response is malformed");
    }
    const checkoutId = nonEmpty(session.sessionId);
    if (!checkoutId) {
      throw new WaffoCheckoutAmbiguousError("Waffo checkout response session id is malformed");
    }
    const checkoutUrl = nonEmpty(session.checkoutUrl);
    if (!checkoutUrl) {
      throw new WaffoCheckoutAmbiguousError("Waffo checkout response URL is malformed");
    }
    const expiry = nonEmpty(session.expiresAt);
    if (!expiry) {
      throw new WaffoCheckoutAmbiguousError("Waffo checkout response expiry is malformed");
    }
    const url = validateWaffoCheckoutUrl(checkoutUrl, checkoutId);
    const expiresAt = validateWaffoExpiry(expiry);
    return {
      checkoutId,
      url,
      expiresAt,
    };
  }
}
