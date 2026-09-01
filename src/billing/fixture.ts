import { randomUUID } from "node:crypto";
import type { CreateCheckoutInput, WaffoCheckout, WaffoPort } from "./port.js";

export type FixtureCheckoutRecord = {
  checkoutId: string;
  listingId: string;
  amountUsd: number;
  successUrl: string;
  cancelUrl: string;
  url: string;
  status: "pending" | "paid";
};

export function fixtureCheckoutUrl(checkoutId: string): string {
  return `/checkout/complete?checkoutId=${encodeURIComponent(checkoutId)}`;
}

/** In-process Waffo fixture. No network. Tests call `complete` to mark a session paid. */
export class FixtureWaffo implements WaffoPort {
  readonly kind = "fixture" as const;
  private readonly sessions = new Map<string, FixtureCheckoutRecord>();

  async createCheckout(input: CreateCheckoutInput): Promise<WaffoCheckout> {
    const checkoutId = `fix_${randomUUID()}`;
    const url = fixtureCheckoutUrl(checkoutId);
    this.sessions.set(checkoutId, {
      checkoutId,
      listingId: input.listingId,
      amountUsd: input.amountUsd,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      url,
      status: "pending",
    });
    return { checkoutId, url };
  }

  getCheckout(checkoutId: string): FixtureCheckoutRecord | undefined {
    const session = this.sessions.get(checkoutId);
    return session ? { ...session } : undefined;
  }

  async complete(checkoutId: string): Promise<FixtureCheckoutRecord> {
    const session = this.sessions.get(checkoutId);
    if (!session) {
      throw new Error(`unknown checkout ${checkoutId}`);
    }
    session.status = "paid";
    return { ...session };
  }
}

/** Deprecated source-compatibility alias; it is the same local Waffo fixture. */
export type FixturePolar = FixtureWaffo;
export const FixturePolar = FixtureWaffo;
