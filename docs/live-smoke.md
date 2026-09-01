# Live smoke — Newsletter Cover

Operator-only. `bash scripts/live-smoke.sh` is **not** called from
`scripts/test.sh` or GitHub Actions. CI stays in the offline fixture mode and
must not select a live Waffo environment or carry provider secrets.

The smoke script proves the local process boundary: empty board → below-floor
error → explicit unpaid fixture checkout → browser return renders durable
pending state and stays read-only →
unsigned Waffo webhook rejection → about/rules. It never calls Waffo and never
invents a paid row. Live configuration is a separate operator preflight; the
fixture script never silently falls back to a live provider.

## How to run

```bash
bash scripts/live-smoke.sh
```

The script:

1. Refuses `CI=true` / `GITHUB_ACTIONS=true`.
2. Starts `node --import tsx src/server.ts` on a free loopback port with a
   temporary durable SQLite path, `WAFFO_MODE=fixture`, and no provider keys.
3. Walks the empty board, below-minimum error, explicit unpaid fixture
   checkout, durable read-only browser return, unsigned Waffo webhook rejection,
   about, and rules.
4. Checks the process log for provider hosts and reports
   `PASS no-live-provider-host` when none were contacted or logged.
5. Kills only the process it started and removes only its temporary database.

Override: `LIVE_SMOKE_PORT`.

## Explicit live configuration

Live operation is a separate, operator-controlled path. Select exactly one
mode with `WAFFO_MODE=waffo-test` or `WAFFO_MODE=waffo-prod`, provide the
documented merchant/private/store/product/webhook values, use the official
HTTPS API origin, and set a durable `DATABASE_PATH` plus public HTTPS URL for
production. A missing private key or unsafe endpoint/configuration must be
reported as `BLOCKED-SECRET` or `BLOCKED-CONFIG` by the production startup
preflight. Do not use live credentials in CI or fixture smoke.

## Verdicts

| Label | Meaning |
|---|---|
| `PASS` | The local fixture flow completed as specified. |
| `PASS-ERROR` | A documented invalid-input response was observed; nothing was invented. |
| `BLOCKED-SECRET` | An explicit live configuration is missing a named secret. |
| `BLOCKED-CONFIG` | An explicit live configuration is unsafe or incomplete. |
| `FAIL` | The local product boundary or no-network guarantee is broken. |

## What this does not do

- It does not run from `scripts/test.sh` or Actions.
- It does not settle from a browser return or call a retired webhook path.
- It does not seed fake subscribers, counts, or a cover winner on an empty board.
- It does not make a live provider request as part of fixture smoke.
