import type { CreateCheckoutInput, PolarCheckout, PolarPort } from "./port.js";

export type PolarEnv = NodeJS.ProcessEnv;

export type LivePolarOptions = {
  env?: PolarEnv;
  fetch?: typeof fetch;
};

const DEFAULT_POLAR_API_BASE = `https://${["api", "polar", "sh"].join(".")}`;

/** Override with `POLAR_API_BASE` (sandbox: `https://sandbox-api.polar.sh`). */
export function polarApiBase(env: PolarEnv = process.env): string {
  const fromEnv = env.POLAR_API_BASE?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return DEFAULT_POLAR_API_BASE;
}

export function polarAccessToken(env: PolarEnv = process.env): string | undefined {
  const token = env.POLAR_ACCESS_TOKEN?.trim();
  return token ? token : undefined;
}

export function polarProductId(env: PolarEnv = process.env): string | undefined {
  const id = env.POLAR_PRODUCT_ID?.trim();
  return id ? id : undefined;
}

export function polarWebhookSecret(env: PolarEnv = process.env): string | undefined {
  const secret = env.POLAR_WEBHOOK_SECRET?.trim();
  return secret ? secret : undefined;
}

function polarFixtureOnly(env: PolarEnv): boolean {
  return env.POLAR_FIXTURE_ONLY === "1";
}

function polarLiveEnabled(env: PolarEnv): boolean {
  if (polarFixtureOnly(env)) {
    return false;
  }
  return env.POLAR_LIVE === "1";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Live Polar Checkout. Constructor refuses unless `POLAR_LIVE=1` and
 * `POLAR_FIXTURE_ONLY` is not `1`. Routes import the port, never this file.
 */
export class LivePolar implements PolarPort {
  readonly kind = "live" as const;
  private readonly env: PolarEnv;
  private readonly fetchFn: typeof fetch;

  constructor(options: LivePolarOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchFn = options.fetch ?? fetch;
    if (polarFixtureOnly(this.env)) {
      throw new Error("LivePolar is disabled when POLAR_FIXTURE_ONLY=1");
    }
    if (!polarLiveEnabled(this.env)) {
      throw new Error("LivePolar requires POLAR_LIVE=1");
    }
    if (!polarAccessToken(this.env)) {
      throw new Error("BLOCKED-SECRET: POLAR_ACCESS_TOKEN");
    }
    if (!polarProductId(this.env)) {
      throw new Error("BLOCKED-SECRET: POLAR_PRODUCT_ID");
    }
  }

  async createCheckout(input: CreateCheckoutInput): Promise<PolarCheckout> {
    if (polarFixtureOnly(this.env) || !polarLiveEnabled(this.env)) {
      throw new Error("LivePolar createCheckout is env-gated");
    }
    const token = polarAccessToken(this.env);
    if (!token) {
      throw new Error("BLOCKED-SECRET: POLAR_ACCESS_TOKEN");
    }
    const productId = polarProductId(this.env);
    if (!productId) {
      throw new Error("BLOCKED-SECRET: POLAR_PRODUCT_ID");
    }
    if (!Number.isInteger(input.amountUsd) || input.amountUsd < 1) {
      throw new Error("polar checkout failed closed");
    }

    let response: Response;
    try {
      response = await this.fetchFn(`${polarApiBase(this.env)}/v1/checkouts/`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          product_id: productId,
          amount: input.amountUsd * 100,
          currency: "usd",
          success_url: input.successUrl,
          metadata: {
            listingId: input.listingId,
            amountUsd: String(input.amountUsd),
          },
        }),
      });
    } catch {
      throw new Error("polar checkout failed closed");
    }
    if (!response.ok) {
      throw new Error("polar checkout failed closed");
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const checkoutId = readString(payload.id);
    const url = readString(payload.url);
    if (!checkoutId || !url) {
      throw new Error("polar checkout failed closed");
    }
    return { checkoutId, url };
  }
}
