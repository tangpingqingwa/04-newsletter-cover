export type CreateCheckoutInput = {
  amountUsd: number;
  listingId: string;
  successUrl: string;
  cancelUrl: string;
  /** Durable local intent identifier carried to the provider. */
  intentId?: string;
  /** SHA-256 of the immutable intent facts. */
  intentFingerprint?: string;
  /** Provider metadata copied from the immutable local intent. */
  metadata?: Readonly<Record<string, string>>;
  /** Legacy spelling retained for injected fixture ports. */
  checkoutId?: string;
};

export type WaffoCheckout = {
  checkoutId: string;
  url: string;
  expiresAt?: string;
};

/** SPEC §8. App routes import this port, never provider HTTP. */
export type WaffoPort = {
  /** `kind` identifies the explicit fixture/test/prod Waffo mode. */
  readonly kind?: "fixture" | "live" | "waffo-test" | "waffo-prod";
  createCheckout(input: CreateCheckoutInput): Promise<WaffoCheckout>;
};

/** Deprecated source-compatibility alias; no legacy provider is selected. */
export type PolarCheckout = WaffoCheckout;
export type PolarPort = WaffoPort;
