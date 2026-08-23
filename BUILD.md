# Newsletter Cover — Detailed Specification and Build Plan

**Contract:** [SPEC.md](./SPEC.md)  
**Git:** [CONTRIBUTING.md](./CONTRIBUTING.md)

Pay-to-rank clone of outbid.lol for one newsletter cover. Rank is money. Polar takes payment. Tests stay on the fixture.

---

## 1. Stack

| Layer | Choice |
|---|---|
| App | Node 22, TypeScript, Fastify |
| DB | SQLite (issues, listings, checkouts) |
| Payments | `PolarPort`. Fixture adapter in tests. Live Polar only when `POLAR_LIVE=1` and secrets exist. `POLAR_FIXTURE_ONLY=1` always wins. |
| Time | UTC. Issue close = `issueDate 00:00:00 UTC`. Weekly default. Catch-up on boot. |
| Tests | `node:test` + fixture Polar. No `polar.sh` network in `scripts/test.sh`. |

---

## 2. Ranking (code)

```
rank(listings) =
  filter paid, status=active, issueDate=open or requested
  sort bidUsd DESC, createdAt ASC
```

- Persist `createdAt` at first **paid** bid. Raises update `bidUsd` only.
- Charge on raise = `targetBidUsd - currentBidUsd`. Reject `targetBidUsd <= currentBidUsd`.
- Do not use clicks, blurb, or URL lexicographic order as a tiebreak.

Editor veto: read `EDITOR_VETO`. If not exactly `1`, skip any pending gate (SPEC §7). Do not add admin routes in PRs 1–10.

---

## 3. URL + policy

Shared helper `canonicalizeSponsorUrl(raw) → { ok, url } | { ok: false, error }`.

Used by create, raise, and `GET /l/:id` (redirect target is the stored canonical URL).

Denylist chat hosts and NSFW terms in the same helper so a listing cannot bypass policy by raising.

---

## 4. Polar wiring

```
POST /listings
  validate url, blurb, min/max, raise-vs-create
  insert checkout pending (amount = full bid or difference)
  PolarPort.createCheckout(...)
  return { url }   # Polar hosted checkout
```

Webhook / fixture `complete(checkoutId)`:

- `paid` → upsert listing, set `bidUsd = targetBidUsd`, first time sets `createdAt`
- already `paid` → idempotent no-op
- unknown id → 404, board unchanged

Live client lives in `src/billing/polar.ts` and is selected only by `createPolar()` when live is enabled. App routes import the port, never `https://api.polar.sh` directly.

---

## 5. Tests

| Test | Assert |
|---|---|
| min bid | $4 rejected; $5 lists |
| rank | higher bid above; $5 then $5 → older is #1 |
| below #1 | $5 then $7 then a third $6 sits at rank 2 |
| raise | same URL $5 → $8 charges $3; `createdAt` stable |
| unpaid | pending checkout does not appear on the board |
| strip | `utm_source` + `fbclid` gone on store and redirect |
| chat | `t.me/...` → `rejected_content` |
| nsfw | adult host or blurb → `rejected_content` |
| clicks | `GET /l/:id` 302 + clicks increment; rank unchanged |
| close | weekly close freezes winner as #1; next issue empty |
| empty close | zero paid rows → no invented cover |
| veto default | `EDITOR_VETO` unset → listing visible after pay |
| fixture wins | `POLAR_FIXTURE_ONLY=1` ignores `POLAR_LIVE` |
| about/rules | 200 and mention min $5 / rank is the bid |

---

## 6. PR plan

### PR 1: Skeleton + schema + healthz
- **Files:** package.json, src/server.ts, src/db.ts, migrations (issues, listings, checkouts), GET /healthz, tests/health.test.ts
- **Dependencies:** None
- **Acceptance:** `GET /healthz` 200; schema matches SPEC §11; `scripts/test.sh` extended, still offline

### PR 2: Public board + ranking
- **Files:** src/rank.ts, src/http/routes/board.ts, tests/rank.test.ts
- **Dependencies:** PR 1
- **Acceptance:** SPEC rank + older-wins-ties; empty board is valid HTML/JSON, not an error

### PR 3: Listing create (URL + blurb + issue date)
- **Files:** src/listings.ts, src/http/routes/listings.ts, tests/listings.test.ts
- **Dependencies:** PR 2
- **Acceptance:** listing shape is sponsor URL + one-line blurb + issue date; open issue stamped; unique (url, issue)

### PR 4: Polar fixture checkout and min $5
- **Files:** src/billing/port.ts, src/billing/fixture.ts, src/billing/create.ts, src/http/routes/polar-webhook.ts, tests/billing.test.ts
- **Dependencies:** PR 3
- **Acceptance:** unpaid checkout hidden; $5 paid appears; $4 never creates a paid row; no Polar HTTP in tests

### PR 5: Raise pays the difference
- **Files:** src/listings.ts, tests/raise.test.ts
- **Dependencies:** PR 4
- **Acceptance:** charge = difference; `createdAt` unchanged; rank recomputed; reject non-increasing bid

### PR 6: Strip tracking, reject chat and NSFW
- **Files:** src/url.ts, tests/url.test.ts
- **Dependencies:** PR 3
- **Acceptance:** SPEC §6; redirect target is canonical; chat/NSFW → `rejected_content`

### PR 7: About and rules
- **Files:** src/http/routes/pages.ts, tests/pages.test.ts
- **Dependencies:** PR 1
- **Acceptance:** `GET /about` and `GET /rules` 200; rules state min $5, rank=bid, older wins, raise=difference, veto off

### PR 8: Public clicks on sponsor URL
- **Files:** src/http/routes/click.ts, tests/click.test.ts
- **Dependencies:** PR 6
- **Acceptance:** `GET /l/:id` 302 cleaned URL; clicks public; clicks do not change rank; unknown id 404

### PR 9: Weekly issue cadence and lock winner as #1
- **Files:** src/issues.ts, src/close.ts, tests/issues.test.ts
- **Dependencies:** PR 2, PR 4
- **Acceptance:** weekly UTC close; winner is issue #1; archive frozen; empty close invents nothing; boot catch-up

### PR 10: live-smoke
- **Files:** scripts/live-smoke.sh, docs/live-smoke.md
- **Dependencies:** PR 9
- **Acceptance:** operator script starts (or assumes) a local process; walks empty board, paid fixture-or-live Polar bid, rank, raise-by-difference, public click 302, about/rules; missing Polar secret → `BLOCKED-SECRET: POLAR_ACCESS_TOKEN` (fixture checkout still allowed as a received pay when `POLAR_FIXTURE_ONLY=1`); **not** called from `scripts/test.sh` or Actions; CI must not set `POLAR_LIVE`

### PR 14: product UI — next issue’s cover auction
- **Description:** Print masthead for the next issue’s one cover. Issue date + OPEN/CLOSED is editorial chrome. A listing is a cover pitch (sponsor URL + one-line blurb). Empty issue is “no cover sold,” never a placeholder sponsor. Outbid DNA stays: Claim #1, dashed $amount, ±, Outbid, $bid + clicks. Not a parchment recolor of a web form. One prize: the cover.
- **Files:** `src/views/skin.ts`, `src/http/routes/board.ts`, `src/http/routes/pages.ts`, `src/http/routes/listings.ts`, `tests/product-ui.test.ts`, `tests/rank.test.ts`, `tests/issues.test.ts`, `scripts/test.sh`, `scripts/live-smoke.sh`
- **Dependencies:** launch-path already shipped (PRs 1–10 / live Polar smoke)
- **Acceptance:** Empty issue says no cover sold and keeps `No paid listings on this board.` Issue chrome is the date + OPEN/CLOSED. Paid rows are cover lines, not cards in a cream form. No article list or subscriber count. `bash scripts/test.sh` stays offline.

### PR 15: first-time sponsor — Claim #1 wins the empty cover
- **Description:** On an empty open issue, one action wins the eye. Honest empty copy (“no cover sold”, `No paid listings on this board.`) lives in the claim note. The second empty-issue slab is gone. Closed empty archives still keep the honest empty rack and drop Claim #1. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 14
- **Acceptance:** Empty open `/` has `class="claim-note" data-empty-issue="true"` and no `class="empty-issue"`. Occupied boards keep cover lines. Closed empty archives stay honest and do not show Claim #1. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 16: first-time reader — closed archive is not the next cover
- **Description:** On a closed `/issue/:date`, the masthead no longer pitches the next issue’s cover. The flag says this issue is closed and is not the next cover, and points to `/` (`data-open-cover`) for the open stand. Empty closed archives stay honest (no Claim #1, empty-issue slab). Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 15
- **Acceptance:** Closed empty `/issue/:date` has `data-open-cover="true"` and does not say the next issue’s cover goes to whoever pays the most. Open `/` keeps that pitch and Claim #1. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 17: first-time reader — read the sold cover on occupied open `/`
- **Description:** On an occupied open `/`, the sold cover is the first move. The cover rack sits above Claim #1 / raise-the-difference so a reader who came to read the cover does not hit the sell first. Empty open `/` still lets Claim #1 win the eye. Closed-archive honesty is unchanged. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 16
- **Acceptance:** Occupied open `/` has `data-read-cover="true"` and the cover line before `id="claim"`. Empty open `/` still has Claim #1 first and no `data-read-cover`. Closed empty archives stay honest. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

---

## 7. Live Polar (after fixture, not a substitute for PR 10)

`src/billing/polar.ts` + `createPolar()` env gate may land in PR 4 or a tiny follow-up on the same billing files. Default remains fixture. Image / CI / `scripts/test.sh` never set `POLAR_LIVE=1`.

Live smoke (PR 10) is what proves the process, not “adapter file exists.”
