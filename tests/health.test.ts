import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { migrate, openDatabase, type AppDb } from "../src/db.js";
import { buildApp } from "../src/server.js";

const Database = createRequire(import.meta.url)(
  "better-sqlite3",
) as typeof import("better-sqlite3");
const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/migrations",
);

test("GET /healthz returns 200 { ok: true }", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/healthz" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });
});

test("schema matches SPEC §11 plus durable Waffo intent/event facts", (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());

  const tables = db
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('issues', 'listings', 'checkouts') ORDER BY name",
    )
    .all();
  assert.deepEqual(
    tables.map((row) => row.name),
    ["checkouts", "issues", "listings"],
  );

  const issueColumns = columnMap(db, "issues");
  assert.deepEqual(Object.keys(issueColumns), ["issue_date", "status", "closed_at"]);
  assert.equal(issueColumns.issue_date.pk, 1);
  assert.equal(issueColumns.issue_date.notnull, 1);
  assert.equal(issueColumns.status.notnull, 1);
  assert.match(tableSql(db, "issues"), /status IN \('open', 'closed'\)/);

  const listingColumns = columnMap(db, "listings");
  assert.deepEqual(Object.keys(listingColumns), [
    "id",
    "issue_date",
    "sponsor_url",
    "blurb",
    "bid_usd",
    "created_at",
    "clicks",
    "status",
  ]);
  assert.equal(listingColumns.id.pk, 1);
  assert.equal(listingColumns.bid_usd.type, "INTEGER");
  assert.equal(listingColumns.clicks.type, "INTEGER");
  assert.equal(listingColumns.clicks.notnull, 1);
  assert.match(tableSql(db, "listings"), /status IN \('active', 'rejected'\)/);
  assert.match(tableSql(db, "listings"), /UNIQUE \(sponsor_url, issue_date\)/);

  const checkoutColumns = columnMap(db, "checkouts");
  assert.deepEqual(Object.keys(checkoutColumns).slice(0, 6), [
    "id",
    "listing_id",
    "amount_usd",
    "target_bid_usd",
    "polar_checkout_id",
    "status",
  ]);
  assert.equal(checkoutColumns.amount_usd.type, "INTEGER");
  assert.equal(checkoutColumns.target_bid_usd.type, "INTEGER");
  for (const name of [
    "expected_store_id",
    "expected_product_id",
    "expected_mode",
    "expected_currency",
    "expected_tax_category",
    "quote_base_bid_cents",
    "target_bid_cents",
    "charge_cents",
    "metadata_json",
    "intent_fingerprint",
  ]) {
    assert.equal(checkoutColumns[name]?.notnull, 1, `${name} must be durable`);
  }
  assert.match(tableSql(db, "checkouts"), /pending_unknown/);
  assert.match(tableSql(db, "checkouts"), /polar_checkout_id TEXT NOT NULL UNIQUE/);

  const waffoEventColumns = columnMap(db, "waffo_webhook_events");
  assert.equal(waffoEventColumns.delivery_id.pk, 1);
  assert.equal(waffoEventColumns.payload_sha256.notnull, 1);
  assert.equal(waffoEventColumns.event_fingerprint.notnull, 1);
  assert.match(tableSql(db, "waffo_webhook_events"), /event_type TEXT NOT NULL/);
  assert.ok(columnMap(db, "waffo_identity_reservations").identity_type);
  assert.ok(columnMap(db, "waffo_identity_conflicts").conflict_id);

  db.prepare(
    "INSERT INTO issues (issue_date, status, closed_at) VALUES (?, ?, ?)",
  ).run("2026-08-24", "open", null);
  db.prepare(
    `INSERT INTO listings (id, issue_date, sponsor_url, blurb, bid_usd, created_at, clicks, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "lst_1",
    "2026-08-24",
    "https://example.com",
    "Cover slot",
    5,
    "2026-08-17T00:00:00.000Z",
    0,
    "active",
  );
  db.prepare(
    `INSERT INTO checkouts (id, listing_id, amount_usd, target_bid_usd, polar_checkout_id, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run("chk_1", "lst_unpaid", 5, 5, "polar_chk_1", "pending");

  assert.throws(() => {
    db.prepare(
      `INSERT INTO listings (id, issue_date, sponsor_url, blurb, bid_usd, created_at, clicks, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "lst_2",
      "2026-08-24",
      "https://example.com",
      "Duplicate URL same issue",
      8,
      "2026-08-17T01:00:00.000Z",
      0,
      "active",
    );
  });

  assert.throws(() => {
    db.prepare(
      `INSERT INTO listings (id, issue_date, sponsor_url, blurb, bid_usd, created_at, clicks, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "lst_orphan",
      "2099-01-01",
      "https://orphan.example",
      "No issue row",
      5,
      "2026-08-17T00:00:00.000Z",
      0,
      "active",
    );
  });

  assert.throws(() => {
    db.prepare(
      "INSERT INTO issues (issue_date, status, closed_at) VALUES (?, ?, ?)",
    ).run("2026-08-31", "pending", null);
  });
});

test("pending rebuild migrations roll back with their marker and retry cleanly", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "newsletter-migration-"));
  const path = join(directory, "cover.sqlite");
  const db = new Database(path) as AppDb;
  t.after(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  for (const file of [
    "001_issues.sql",
    "002_listings.sql",
    "004_polar_webhook_events.sql",
  ]) {
    db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  // Reproduce the legacy 003 shape without its unique index so migration 005's
  // rebuild fails while copying duplicate provider IDs.
  db.exec(`
    CREATE TABLE checkouts (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      amount_usd INTEGER NOT NULL,
      target_bid_usd INTEGER NOT NULL,
      polar_checkout_id TEXT NOT NULL,
      status TEXT NOT NULL
    );
  `);
  const mark = db.prepare(
    "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
  );
  for (const file of [
    "001_issues.sql",
    "002_listings.sql",
    "003_checkouts.sql",
    "004_polar_webhook_events.sql",
  ]) {
    mark.run(file, "2026-08-28T00:00:00.000Z");
  }
  db.prepare(
    `INSERT INTO checkouts (
       id, listing_id, amount_usd, target_bid_usd, polar_checkout_id, status
     ) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)` ,
  ).run(
    "legacy-1", "listing-1", 5, 5, "duplicate-provider-id", "pending",
    "legacy-2", "listing-2", 7, 7, "duplicate-provider-id", "pending",
  );

  assert.throws(() => migrate(db), /UNIQUE constraint failed/);
  assert.equal(
    db.prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM schema_migrations WHERE id = '005_waffo_payment_events.sql'",
    ).get()?.n,
    0,
  );
  assert.equal(
    db.prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM checkouts",
    ).get()?.n,
    2,
  );
  assert.equal(
    db.prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'checkouts_legacy_005'",
    ).get()?.n,
    0,
  );
  assert.equal(
    db.prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'waffo_webhook_events'",
    ).get()?.n,
    0,
  );

  db.prepare("DELETE FROM checkouts WHERE id = ?").run("legacy-2");
  migrate(db);
  assert.equal(
    db.prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM schema_migrations",
    ).get()?.n,
    8,
  );
  assert.equal(
    db.prepare<[], { n: number }>(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('waffo_webhook_events', 'waffo_identity_reservations', 'waffo_identity_conflicts')",
    ).get()?.n,
    3,
  );
  assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
});

type ColumnInfo = {
  name: string;
  type: string;
  notnull: number;
  pk: number;
};

function columnMap(db: AppDb, table: string): Record<string, ColumnInfo> {
  const rows = db.prepare<[], ColumnInfo>(`PRAGMA table_info(${table})`).all();
  return Object.fromEntries(rows.map((row) => [row.name, row]));
}

function tableSql(db: AppDb, table: string): string {
  const row = db
    .prepare<[string], { sql: string | null }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(table);
  assert.ok(row?.sql, `missing CREATE TABLE for ${table}`);
  return row.sql;
}
