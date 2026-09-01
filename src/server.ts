import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import {
  assertWaffoRuntimeConfig,
  createWaffo,
  isEphemeralDatabasePath,
  waffoMode,
} from "./billing/create.js";
import type { WaffoPort } from "./billing/port.js";
import { catchUpIssues, ensureOpenIssue } from "./close.js";
import { openDatabase, type AppDb } from "./db.js";
import { registerAssetRoutes } from "./http/routes/assets.js";
import { registerBoardRoutes } from "./http/routes/board.js";
import { registerClickRoutes } from "./http/routes/click.js";
import { registerListingRoutes } from "./http/routes/listings.js";
import { registerPageRoutes } from "./http/routes/pages.js";
import { registerWaffoWebhookRoutes } from "./http/routes/waffo-webhook.js";

declare module "fastify" {
  interface FastifyInstance {
    db: AppDb;
    /** Compatibility property name; the value is always a Waffo port. */
    polar: WaffoPort;
    now: () => Date;
  }
}

export type BuildAppOptions = {
  logger?: boolean;
  db?: AppDb;
  databasePath?: string;
  /** Deprecated option spelling retained for interrupted tests. */
  polar?: WaffoPort;
  /** Frozen clock for boot catch-up. Production uses wall UTC. */
  now?: Date;
};

export const HEALTHZ_PATH = "/healthz" as const;

export type HealthzOk = {
  ok: true;
};

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const configuredMode = waffoMode(process.env);
  const production = process.env.NODE_ENV === "production";
  const productionLike = production || configuredMode === "waffo-prod";
  const configuredDatabasePath = options.databasePath ?? process.env.DATABASE_PATH;
  if (productionLike) {
    // A production composition must use the real Waffo adapter and a durable
    // path selected by the process environment. Injected fixture/db objects
    // are deliberately test-only escape hatches.
    if (options.polar) {
      throw new Error("BLOCKED-CONFIG: injected provider is not allowed in production");
    }
    if (options.db) {
      throw new Error("BLOCKED-CONFIG: injected database is not allowed in production");
    }
    if (isEphemeralDatabasePath(configuredDatabasePath)) {
      throw new Error("BLOCKED-CONFIG: DATABASE_PATH must be durable");
    }
    const productionEnv = {
      ...process.env,
      ...(configuredDatabasePath ? { DATABASE_PATH: configuredDatabasePath } : {}),
    };
    assertWaffoRuntimeConfig(productionEnv);
  }
  const app = Fastify({ logger: options.logger ?? false });
  const ownsDb = options.db === undefined;
  // createWaffo validates explicit production/test configuration before the
  // database is opened. An injected port is the only non-production test
  // escape hatch.
  const runtimeEnv = productionLike
    ? {
        ...process.env,
        ...(configuredDatabasePath ? { DATABASE_PATH: configuredDatabasePath } : {}),
      }
    : process.env;
  const polar = options.polar ?? createWaffo(runtimeEnv);
  const db = options.db ?? openDatabase(options.databasePath ?? (productionLike
    ? configuredDatabasePath as string
    : ":memory:"));
  const clock = (): Date => options.now ?? new Date();
  catchUpIssues(db, clock());
  app.decorate("db", db);
  app.decorate("polar", polar);
  app.decorate("now", clock);
  if (ownsDb) {
    app.addHook("onClose", async () => {
      db.close();
    });
  }
  app.addHook("onRequest", async () => {
    catchUpIssues(db, clock());
  });
  app.get(HEALTHZ_PATH, async (): Promise<HealthzOk> => ({ ok: true }));
  registerAssetRoutes(app);
  registerBoardRoutes(app);
  registerListingRoutes(app);
  registerClickRoutes(app);
  registerPageRoutes(app);
  registerWaffoWebhookRoutes(app);
  return app;
}

function isExecutedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(entry).href;
}

if (isExecutedDirectly()) {
  const parsedPort = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    throw new Error(`invalid PORT: ${process.env.PORT ?? ""}`);
  }
  const databasePath =
    process.env.DATABASE_PATH ??
    (process.env.NODE_ENV === "production"
      ? (() => {
          throw new Error("BLOCKED-CONFIG: DATABASE_PATH");
        })()
      : "data/newsletter-cover.sqlite");
  const app = await buildApp({ logger: true, databasePath });
  ensureOpenIssue(app.db);
  await app.listen({ host: "127.0.0.1", port: parsedPort });
}
