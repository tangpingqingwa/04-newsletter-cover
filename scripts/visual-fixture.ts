import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, type Listing } from "../src/db.js";
import {
  OUTBID_REFERENCE_FIXTURE_ROWS,
  OUTBID_REFERENCE_ISSUE,
} from "../src/views/outbid-reference-page.js";

const CREATED_AT = [
  "2026-08-28T12:00:00.000Z",
  "2026-08-28T11:00:00.000Z",
  "2026-08-28T10:00:00.000Z",
  "2026-08-28T09:00:00.000Z",
  "2026-08-28T08:00:00.000Z",
  "2026-08-28T07:00:00.000Z",
] as const;
const CLICKS = [148, 92, 64, 48, 27, 12] as const;

export function seedVisualFixture(databasePath: string): Listing[] {
  const path = resolve(databasePath);
  if (!path.startsWith("/private/tmp/")) {
    throw new Error("visual fixture requires a disposable /private/tmp database");
  }
  mkdirSync(dirname(path), { recursive: true });
  const db = openDatabase(path);
  try {
    const seed = db.transaction(() => {
      db.prepare("DELETE FROM listings").run();
      db.prepare("DELETE FROM issues").run();
      db.prepare(
        "INSERT INTO issues (issue_date, status, closed_at) VALUES (?, 'open', NULL)",
      ).run(OUTBID_REFERENCE_ISSUE);
      const insert = db.prepare(
        `INSERT INTO listings (
          id, issue_date, sponsor_url, blurb, bid_usd, created_at, clicks, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      );
      for (const [index, row] of OUTBID_REFERENCE_FIXTURE_ROWS.entries()) {
        const [id, blurb, bidUsd, sponsorUrl] = row;
        insert.run(
          id,
          OUTBID_REFERENCE_ISSUE,
          sponsorUrl,
          blurb,
          bidUsd,
          CREATED_AT[index],
          CLICKS[index],
        );
      }
    });
    seed();
    return db
      .prepare<[string], {
        id: string;
        issue_date: string;
        sponsor_url: string;
        blurb: string;
        bid_usd: number;
        created_at: string;
        clicks: number;
        status: Listing["status"];
      }>(
        `SELECT id, issue_date, sponsor_url, blurb, bid_usd, created_at, clicks, status
         FROM listings
         WHERE issue_date = ?
         ORDER BY bid_usd DESC, created_at ASC`,
      )
      .all(OUTBID_REFERENCE_ISSUE)
      .map((row) => ({
        id: row.id,
        issueDate: row.issue_date,
        sponsorUrl: row.sponsor_url,
        blurb: row.blurb,
        bidUsd: row.bid_usd,
        createdAt: row.created_at,
        clicks: row.clicks,
        status: row.status,
      }));
  } finally {
    db.close();
  }
}

function runFromCli(): void {
  const requested = process.argv[2] ?? process.env.DATABASE_PATH;
  if (!requested || requested === ":memory:") {
    throw new Error("visual fixture requires a disposable file-backed DATABASE_PATH");
  }
  const rows = seedVisualFixture(requested);
  for (const row of rows) {
    process.stdout.write(
      `${row.id}\t${row.blurb}\t${row.bidUsd}\t${row.clicks}\n`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runFromCli();
}
