export type CreateCheckoutInput = {
  amountUsd: number;
  listingId: string;
  successUrl: string;
  cancelUrl: string;
};

export type PolarCheckout = {
  checkoutId: string;
  url: string;
};

/** SPEC §8. App routes import this port, never Polar HTTP. */
export type PolarPort = {
  createCheckout(input: CreateCheckoutInput): Promise<PolarCheckout>;
};
