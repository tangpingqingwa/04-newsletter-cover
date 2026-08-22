import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { createPolar } from "./billing/create.js";
import type { PolarPort } from "./billing/port.js";
import { openDatabase, type AppDb } from "./db.js";
import { registerBoardRoutes } from "./http/routes/board.js";
import { registerClickRoutes } from "./http/routes/click.js";
import { registerListingRoutes } from "./http/routes/listings.js";
import { registerPageRoutes } from "./http/routes/pages.js";
import { registerPolarWebhookRoutes } from "./http/routes/polar-webhook.js";

declare module "fastify" {
  interface FastifyInstance {
    db: AppDb;
    polar: PolarPort;
  }
}

export type BuildAppOptions = {
  logger?: boolean;
  db?: AppDb;
  databasePath?: string;
  polar?: PolarPort;
};

export const HEALTHZ_PATH = "/healthz" as const;

export type HealthzOk = {
  ok: true;
};

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const ownsDb = options.db === undefined;
  const db = options.db ?? openDatabase(options.databasePath ?? ":memory:");
  const polar = options.polar ?? createPolar();
  app.decorate("db", db);
  app.decorate("polar", polar);
  if (ownsDb) {
    app.addHook("onClose", async () => {
      db.close();
    });
  }
  app.get(HEALTHZ_PATH, async (): Promise<HealthzOk> => ({ ok: true }));
  registerBoardRoutes(app);
  registerListingRoutes(app);
  registerClickRoutes(app);
  registerPageRoutes(app);
  registerPolarWebhookRoutes(app);
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
  const databasePath = process.env.DATABASE_PATH ?? "data/newsletter-cover.sqlite";
  const app = await buildApp({ logger: true, databasePath });
  await app.listen({ host: "0.0.0.0", port: parsedPort });
}
