/**
 * Occupied live cover uses rolling last 7 days from paid placement (`createdAt`).
 * Not Monday 00:00 UTC. Not a 24h lock on #1.
 * Empty issues still close at `issueDate 00:00:00 UTC`. Closed archives stay frozen.
 */

const DAY_MS = 86_400_000;

/** Inclusive length of the occupied live window. Not a Monday midnight bucket. */
export const ROLLING_WEEK_MS = 7 * DAY_MS;
/** Fixture clocks can stamp paidAt a few ms ahead of `now`. Not a 24h lock. */
export const ROLLING_WEEK_CLOCK_SKEW_MS = 100;

/** Inclusive start of the rolling last-7-days occupancy window. Not civil midnight. */
export function rollingWeekStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - ROLLING_WEEK_MS);
}

/** Occupied #1 holds until seven days after paid placement. Not Monday 00:00 UTC. */
export function occupancyExpiresAt(paidAt: string): Date {
  const paid = Date.parse(paidAt);
  if (!Number.isFinite(paid) || paid <= 0) {
    return new Date(NaN);
  }
  return new Date(paid + ROLLING_WEEK_MS);
}

/**
 * Waffo-paid placement still occupies live `/` if `createdAt` is in `[now − 7d, now]`.
 * Monday 00:00 UTC is not the drop. Not a 24h lock on #1.
 */
export function bidInRollingWeek(
  paidAt: string,
  now: Date = new Date(),
): boolean {
  const paid = Date.parse(paidAt);
  if (!Number.isFinite(paid) || paid <= 0) {
    return false;
  }
  const t = now.getTime();
  return paid >= t - ROLLING_WEEK_MS && paid <= t + ROLLING_WEEK_CLOCK_SKEW_MS;
}
