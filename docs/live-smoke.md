# Live smoke — Newsletter Cover

Operator-only. `bash scripts/live-smoke.sh` is **not** called from `scripts/test.sh` or GitHub Actions. CI and `scripts/test.sh` stay offline and must not set `POLAR_LIVE`.

`100%` for this unit means a **local process** walked empty board → paid fixture Polar bid → rank → raise-by-difference → public click 302 → about/rules. Fixture checkout is the default path (`POLAR_FIXTURE_ONLY=1`). Live Polar is always attempted on a second process with `POLAR_LIVE=1` and fixture-only unset. Missing Polar secret is `BLOCKED-SECRET: POLAR_ACCESS_TOKEN` — that is not a fixture success. Do not invent subscriber counts or a cover winner on an empty board.

## How to run

```bash
bash scripts/live-smoke.sh
```

The script:

1. Refuses `CI=true` / `GITHUB_ACTIONS=true`.
2. Starts `node --import tsx src/server.ts` on a free loopback port with a temp `DATABASE_PATH`, Polar env unset, and `POLAR_FIXTURE_ONLY=1`.
3. Or attaches to `LIVE_SMOKE_BASE` if that server already answers `GET /healthz`.
4. Walks empty board, unpaid then paid fixture Polar bid (`POST /listings` + `POST /webhooks/polar`), rank, raise-by-difference, public click 302, about/rules.
5. Live Polar: starts a second process with `POLAR_LIVE=1` and `POLAR_FIXTURE_ONLY` unset. Missing token (or live Polar still env-gated) prints `BLOCKED-SECRET: POLAR_ACCESS_TOKEN`. Never invents a live paid row.
6. Kills the process it started and deletes the temp database.

Overrides: `LIVE_SMOKE_BASE`, `LIVE_SMOKE_PORT`.

Live Polar (operator machine with a real token; still env-gated in this tree):

```bash
POLAR_LIVE=1 POLAR_ACCESS_TOKEN=… bash scripts/live-smoke.sh
```

## Verdicts

| Label | Meaning |
|---|---|
| `PASS` | Flow completed as SPEC requires. |
| `PASS-ERROR` | Documented product error; nothing invented. |
| `BLOCKED-SECRET` | Live Polar secret missing. Exact env var named. |
| `FAIL` | Broken product or invented listing/count. |

## This session

Ran `bash scripts/live-smoke.sh` on **2026-08-22** from `feat/live-smoke` (parent `763ccc9`, weekly issue lock on `origin/main`). Local process started by the script on `http://127.0.0.1:57723`. Temp SQLite. `POLAR_LIVE` unset. `POLAR_ACCESS_TOKEN` unset. Fixture path (`POLAR_FIXTURE_ONLY=1`). No invented cover: empty board first, then unique `*.example` URLs for this run. Live Polar was still attempted on a second loopback process; it printed `BLOCKED-SECRET: POLAR_ACCESS_TOKEN`.

Also refused `CI=true` (`FAIL: live-smoke refuses CI=true`) and `GITHUB_ACTIONS=true`.

| Flow | Result | Note |
|---|---|---|
| empty-board | **PASS** | `GET /` 200. Zero paid listings. Copy is “No paid listings on this board.” No invented cover. |
| below-minimum | **PASS-ERROR** | `POST /listings` $4 → 400 `below_minimum`. Board unchanged. |
| unpaid-checkout | **PASS** | `POST /listings` $5 returns `/checkout/complete?checkoutId=fix_…`. Unpaid row not listed. |
| paid-bid | **PASS** | `POST /webhooks/polar` `{checkoutId}`. Cover #1 · $5. Tracking stripped. `EDITOR_VETO` unset. |
| rank | **PASS** | Later $5 is #3 after $6 pays. $6 is #1; older $5 stays above later $5. |
| raise-difference | **PASS** | Same URL $5 → $8. Unpaid raise hidden. `createdAt` stable. Rank recomputed. |
| rank-tie | **PASS** | Both $10. Older paid listing stays #1. |
| rejected-chat | **PASS-ERROR** | `https://t.me/foo` → 400 `rejected_content`. |
| rejected-nsfw | **PASS-ERROR** | NSFW blurb → 400 `rejected_content`. |
| public-click | **PASS** | `GET /l/b3ac3775-89a4-4236-9838-73055beb9bb2` 302 to cleaned URL. Clicks `0→1`. Rank unchanged. |
| about | **PASS** | `GET /about` 200. Public auction, rank is the bid, weekly, veto off. |
| rules | **PASS** | `GET /rules` 200. Min $5, rank=bid, older wins, raise=difference, veto off. |
| live-checkout | **BLOCKED-SECRET** | `BLOCKED-SECRET: POLAR_ACCESS_TOKEN` |

Process exit 0 (`PASS=9` `PASS-ERROR=3` `BLOCKED-SECRET=1` `FAIL=0`). Re-run with `POLAR_LIVE=1` and a real token to complete Polar Checkout; missing token (or the current env-gated live adapter) must stay `BLOCKED-SECRET`, never a fixture listing.

## What this does not do

- Does not call `scripts/live-smoke.sh` from `scripts/test.sh` or Actions.
- Does not set `POLAR_LIVE=1` in CI.
- Does not seed fake listings, subscriber counts, or a cover winner on an empty close.
- Does not treat a missing Polar secret as a paid listing.
- Does not implement a live Polar HTTP client.
