import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { openDatabase, type AppDb } from "./db.js";

declare module "fastify" {
  interface FastifyInstance {
    db: AppDb;
  }
}

export type BuildAppOptions = {
  logger?: boolean;
  db?: AppDb;
  databasePath?: string;
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
  app.decorate("db", db);
  if (ownsDb) {
    app.addHook("onClose", async () => {
      db.close();
    });
  }
  app.get(HEALTHZ_PATH, async (): Promise<HealthzOk> => ({ ok: true }));
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
