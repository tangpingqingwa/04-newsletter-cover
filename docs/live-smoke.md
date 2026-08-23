# Live smoke — Newsletter Cover

Operator-only. `bash scripts/live-smoke.sh` is **not** called from `scripts/test.sh` or GitHub Actions. CI and `scripts/test.sh` stay offline and must not set `POLAR_LIVE`.

`100%` for this unit means a **local process** walked empty board → paid fixture Polar bid → rank → raise-by-difference → public click 302 → about/rules, plus a second live-flagged process that returns a real Polar sandbox Checkout URL (`sandbox.polar.sh`). Fixture checkout is the default path (`POLAR_FIXTURE_ONLY=1`). Live Polar is always attempted on a second process with `POLAR_LIVE=1` and fixture-only unset. Missing Polar secret is `BLOCKED-SECRET: POLAR_ACCESS_TOKEN` — that is not a fixture success. Do not invent subscriber counts or a cover winner on an empty board.

## How to run

```bash
bash scripts/live-smoke.sh
```

The script:

1. Refuses `CI=true` / `GITHUB_ACTIONS=true`.
2. Starts `node --import tsx src/server.ts` on a free loopback port with a temp `DATABASE_PATH`, Polar env unset, and `POLAR_FIXTURE_ONLY=1`.
3. Or attaches to `LIVE_SMOKE_BASE` if that server already answers `GET /healthz`.
4. Walks empty board, unpaid then paid fixture Polar bid (`POST /listings` + `POST /webhooks/polar`), rank, raise-by-difference, public click 302, about/rules.
5. Live Polar: starts a second process with `POLAR_LIVE=1` and `POLAR_FIXTURE_ONLY` unset. A real sandbox token must return a `https://sandbox.polar.sh/…` checkout URL. Missing token prints `BLOCKED-SECRET: POLAR_ACCESS_TOKEN`. Never invents a live paid row.
6. Kills the process it started and deletes the temp database.

Overrides: `LIVE_SMOKE_BASE`, `LIVE_SMOKE_PORT`.

Live Polar (operator machine with a Polar **sandbox** token). Production `https://api.polar.sh` rejects sandbox tokens (401). Override the API host with `POLAR_API_BASE` (default remains `https://api.polar.sh`):

```bash
set -a
source /Users/yann/.polar/sandbox.env
set +a
POLAR_LIVE=1
unset POLAR_FIXTURE_ONLY
POLAR_API_BASE=https://sandbox-api.polar.sh
bash scripts/live-smoke.sh
```

## Verdicts

| Label | Meaning |
|---|---|
| `PASS` | Flow completed as SPEC requires. |
| `PASS-ERROR` | Documented product error; nothing invented. |
| `BLOCKED-SECRET` | Live Polar secret missing. Exact env var named. |
| `FAIL` | Broken product or invented listing/count. |

## This session

Ran `bash scripts/live-smoke.sh` on **2026-08-23** from `feat/live-polar-sandbox-smoke` (parent `8eedf8b`, live-smoke #12 on `origin/main`). Local fixture process started by the script on `http://127.0.0.1:57099`. Temp SQLite. Operator env: `POLAR_LIVE=1`, `POLAR_FIXTURE_ONLY` unset, `POLAR_API_BASE=https://sandbox-api.polar.sh`, Polar sandbox secrets sourced from `~/.polar/sandbox.env` (mode 600; token length 53). No invented cover: empty board first, then unique `*.example` URLs for this run. Live Polar ran on a second loopback process and returned a real `sandbox.polar.sh` Checkout URL; unpaid live session stayed off the board.

Also refused `CI=true` (`FAIL: live-smoke refuses CI=true`) and `GITHUB_ACTIONS=true`. A second run with `POLAR_LIVE=1` and the token unset recorded `BLOCKED-SECRET: POLAR_ACCESS_TOKEN` (no invented paid row).

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
| public-click | **PASS** | `GET /l/4cd9f75b-8599-4303-9bb0-00c236149b88` 302 to cleaned URL. Clicks `0→1`. Rank unchanged. |
| about | **PASS** | `GET /about` 200. Public auction, rank is the bid, weekly, veto off. |
| rules | **PASS** | `GET /rules` 200. Min $5, rank=bid, older wins, raise=difference, veto off. |
| live-checkout | **PASS** | Real Polar sandbox Checkout URL (`sandbox.polar.sh`). Unpaid live session not listed. |

Process exit 0 (`PASS=10` `PASS-ERROR=3` `BLOCKED-SECRET=0` `FAIL=0`). Missing token still records `BLOCKED-SECRET: POLAR_ACCESS_TOKEN` and must never become a fixture listing.

## What this does not do

- Does not call `scripts/live-smoke.sh` from `scripts/test.sh` or Actions.
- Does not set `POLAR_LIVE=1` in CI.
- Does not seed fake listings, subscriber counts, or a cover winner on an empty close.
- Does not treat a missing Polar secret as a paid listing.
- Does not complete a Polar sandbox card payment in this session (unpaid live checkout stays off the board).
