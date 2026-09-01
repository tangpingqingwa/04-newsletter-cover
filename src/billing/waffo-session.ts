/**
 * Compatibility exports for the interrupted Waffo adapter. The application
 * uses `waffo.ts`, which delegates checkout creation and webhook verification
 * to the official `@waffo/pancake-ts` SDK. This module deliberately contains
 * no alternate signing or provider-selection path.
 */
export {
  DEFAULT_WAFFO_API_BASE,
  LiveWaffo,
  WaffoCheckoutAmbiguousError,
  WaffoProviderRejectedError,
  assertWaffoRuntimeConfig,
  chargeCentsToDisplayString,
  waffoApiBase,
  waffoEnvironment,
  waffoMode,
  waffoMerchantId,
  waffoPrivateKey,
  waffoProductId,
  waffoPublicBaseUrl,
  waffoStoreId,
  waffoWebhookPublicKey,
} from "./waffo.js";
export type {
  LiveWaffoOptions,
  WaffoEnv,
  WaffoEnvironment,
  WaffoMode,
} from "./waffo.js";

/** Legacy switch is inert; mode must be explicitly selected with WAFFO_MODE. */
export function isWaffoLive(_env: Record<string, string | undefined> = process.env): boolean {
  return false;
}
