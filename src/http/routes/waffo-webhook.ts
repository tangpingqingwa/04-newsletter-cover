/** Canonical Waffo settlement route. The legacy module only remains as an
 * import-compatible name for interrupted work; its `/webhooks/polar` route
 * is explicitly retired with HTTP 410. */
export {
  registerWaffoWebhookRoutes,
  WAFFO_WEBHOOK_PATH,
} from "./polar-webhook.js";
