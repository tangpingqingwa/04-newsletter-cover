import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase, type AppDb } from "../src/db.js";
import { buildApp } from "../src/server.js";

test("GET /healthz returns 200 { ok: true }", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/healthz" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });
});

test("schema matches SPEC §11 issues, listings, checkouts", (t) => {
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
  assert.deepEqual(Object.keys(checkoutColumns), [
    "id",
    "listing_id",
    "amount_usd",
    "target_bid_usd",
    "polar_checkout_id",
    "status",
  ]);
  assert.equal(checkoutColumns.amount_usd.type, "INTEGER");
  assert.equal(checkoutColumns.target_bid_usd.type, "INTEGER");
  assert.match(tableSql(db, "checkouts"), /status IN \('pending', 'paid', 'failed'\)/);
  assert.match(tableSql(db, "checkouts"), /polar_checkout_id TEXT NOT NULL UNIQUE/);

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
