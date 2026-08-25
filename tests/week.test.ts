import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bidInRollingWeek,
  occupancyExpiresAt,
  ROLLING_WEEK_MS,
  rollingWeekStart,
} from "../src/week.js";

test("rolling last-7-days window is 7 * 24h, not Monday 00:00 UTC", () => {
  const now = new Date("2026-08-24T00:00:00.000Z");
  assert.equal(ROLLING_WEEK_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(rollingWeekStart(now).toISOString(), "2026-08-17T00:00:00.000Z");
  assert.notEqual(ROLLING_WEEK_MS, 24 * 60 * 60 * 1000);
});

test("Monday 00:00 UTC does not drop a bid still inside the rolling week", () => {
  const paidSunday = "2026-08-23T23:00:00.000Z";
  const mondayMidnight = new Date("2026-08-24T00:00:00.000Z");
  assert.equal(bidInRollingWeek(paidSunday, mondayMidnight), true);
  assert.equal(
    occupancyExpiresAt(paidSunday).toISOString(),
    "2026-08-30T23:00:00.000Z",
  );
  assert.equal(
    bidInRollingWeek(paidSunday, new Date("2026-08-30T22:59:59.000Z")),
    true,
  );
  assert.equal(
    bidInRollingWeek(paidSunday, new Date("2026-08-30T23:00:00.001Z")),
    false,
  );
});
