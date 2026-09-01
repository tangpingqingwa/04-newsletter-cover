/**
 * Polar compatibility shim.
 *
 * Waffo Pancake is the sole money provider. This module remains only so an
 * interrupted import cannot silently select a second network adapter; it has
 * no SDK dependency, credentials, URL, or network implementation.
 */
import type { CreateCheckoutInput, PolarCheckout, PolarPort } from "./port.js";

export type PolarEnv = NodeJS.ProcessEnv;
export type LivePolarOptions = {
  env?: PolarEnv;
  fetch?: typeof fetch;
};
export type CorrelatedCreateCheckoutInput = CreateCheckoutInput & {
  checkoutId?: string;
};

export function polarApiBase(_env: PolarEnv = process.env): undefined {
  return undefined;
}

export function polarAccessToken(_env: PolarEnv = process.env): undefined {
  return undefined;
}

export function polarProductId(_env: PolarEnv = process.env): undefined {
  return undefined;
}

export function polarWebhookSecret(_env: PolarEnv = process.env): undefined {
  return undefined;
}

/** Constructor is intentionally unusable: Polar is quarantined compatibility debris. */
export class LivePolar implements PolarPort {
  readonly kind = "live" as const;

  constructor(_options: LivePolarOptions = {}) {
    throw new Error("BLOCKED-CONFIG: Polar provider is quarantined; use Waffo");
  }

  async createCheckout(_input: CorrelatedCreateCheckoutInput): Promise<PolarCheckout> {
    throw new Error("BLOCKED-CONFIG: Polar provider is quarantined; use Waffo");
  }
}
