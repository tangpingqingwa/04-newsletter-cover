import type { AppDb, Issue } from "./db.js";
import {
  catchUpIssues as catchUpDueIssues,
  closeIssue as freezeIssue,
  ensureOpenIssue as seedOpenIssue,
  type CatchUpResult,
  type ClosedIssue,
} from "./issues.js";

export type { CatchUpResult, ClosedIssue };

/**
 * Freeze ranking for an issue. The winner is whatever paid listing sits at rank 1.
 * Zero paid rows → empty archive, no invented cover (SPEC §5).
 */
export function closeIssue(
  db: AppDb,
  issueDate: string,
  now: Date = new Date(),
): ClosedIssue {
  return freezeIssue(db, issueDate, now);
}

/**
 * If `now` is past an open issue’s close and it is not frozen, freeze it
 * before the next issue can take bids. Opens the following weekly issueDate.
 */
export function catchUpIssues(db: AppDb, now: Date = new Date()): CatchUpResult {
  return catchUpDueIssues(db, now);
}

export function ensureOpenIssue(db: AppDb, now: Date = new Date()): Issue {
  return seedOpenIssue(db, now);
}
