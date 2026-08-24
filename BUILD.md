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

### PR 18: first-time sponsor — claim the next cover on occupied open `/`
- **Description:** On an occupied open `/`, readers still hit the sold cover first. A first-time sponsor who came to Outbid gets one named hop (`data-claim-cover`) from the flag to `#claim` so Claim #1 / raise-the-difference is not lost under the rack. Empty open `/` still lets Claim #1 win the eye with no extra hop. Closed-archive honesty is unchanged. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 17
- **Acceptance:** Occupied open `/` has one `data-claim-cover="true"` `href="#claim"` before `data-read-cover` and `#claim`. Empty open `/` and closed archives have no claim hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 19: first-time reader — Cover · #1 is one prize line
- **Description:** On a sold cover, `Cover · #1` is one certain prize line (`data-cover-prize-line`), not a wrap in the rank gutter. Sold-cover-first and Claim the next cover stay. Empty boards and closed empty archives do not get the prize-line mark. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 18
- **Acceptance:** Occupied boards have one `data-cover-prize-line="true"` on `Cover · #1` with `white-space: nowrap`. Empty open `/` and closed empty archives have no prize-line mark. `data-read-cover` and `data-claim-cover` stay. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 20: first-time sponsor — $5 takes this issue’s cover
- **Description:** On an empty open `/`, the claim note names the prize. `$5 takes #1` is this issue’s cover, not a subscriber pitch or a nameless rank. Occupied boards keep sold-cover-first, **Claim the next cover**, and the Cover · #1 prize line. Closed empty archives stay honest and do not get the cover-prize mark. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 19
- **Acceptance:** Empty open `/` has `data-cover-prize="true"` and `$5 takes #1 — this issue’s cover`. Occupied open `/` keeps `data-claim-cover` and `data-cover-prize-line` and has no `data-cover-prize="true"`. Closed empty archives stay honest and do not show Claim #1. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 21: first-time reader — empty open stand before Claim #1
- **Description:** On an empty open `/`, a first-time reader who came to read hits the blank stand first. The honest empty folio (`data-read-stand`) sits above Claim #1 so the page is not a checkout. Sponsors still get Claim #1, dashed $amount, ±, Outbid, and `$5 takes #1 — this issue’s cover`. Occupied boards keep sold-cover-first and Claim the next cover. Closed empty archives stay the frozen empty-issue slab. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 20
- **Acceptance:** Empty open `/` has `data-read-stand="true"` before `id="claim"` and says this issue’s cover is still open. Occupied open `/` keeps `data-read-cover` and `data-claim-cover` and has no `data-read-stand`. Closed empty archives keep `class="empty-issue"` and do not stamp `data-read-stand`. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 22: first-time sponsor — claim after the empty stand
- **Description:** On an empty open `/`, readers still hit the blank stand first. A first-time sponsor who came to buy gets one named hop (`data-claim-after-stand`) from the stand to `#claim` so Claim #1 / Outbid is not lost under the folio. Occupied boards keep sold-cover-first and **Claim the next cover**. Closed empty archives stay the frozen empty-issue slab. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 21
- **Acceptance:** Empty open `/` has one `data-claim-after-stand="true"` `href="#claim"` after `data-read-stand` and before `id="claim"`. Occupied open `/` keeps `data-claim-cover` and has no `data-claim-after-stand`. Closed empty archives have no claim hop. `$5 takes #1 — this issue’s cover`, Claim the next cover, and Cover · #1 stay. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 23: first-time reader — sold cover is certain on occupied open `/`
- **Description:** On an occupied open `/`, a first-time reader who came to read hits a named sold-cover line first. The flag says this issue’s cover is sold (`data-sold-cover`) before **Claim the next cover**, so the sold cover does not lose to the claim hop / $bid. Empty open `/` still pitches the next issue and keeps the empty stand. Closed archives stay honest. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 22
- **Acceptance:** Occupied open `/` has one `data-sold-cover="true"` and **This issue’s cover is sold.** before `data-claim-cover` and `data-read-cover`. Empty open `/` and closed archives have no `data-sold-cover`. Claim the next cover, Cover · #1, empty-stand-first, and claim-after-stand stay. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 24: first-time sponsor — claim after the sold cover
- **Description:** On an occupied open `/`, readers still hit **This issue’s cover is sold.** first. The existing **Claim the next cover** hop (`data-claim-cover`) is now the certain sponsor move after that line (`data-claim-after-sold` on the same `#claim` hop) so the sold-cover line does not steal the first click. Do not add another claim hop. Empty open `/` keeps claim-after-stand. Closed archives stay honest. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 23
- **Acceptance:** Occupied open `/` has one `data-claim-cover="true"` and one `data-claim-after-sold="true"` on the same `href="#claim"` after `data-sold-cover` and before `data-read-cover`. Empty open `/` and closed archives have no `data-claim-after-sold`. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 25: first-time reader — read after Claim the next cover is concentrated
- **Description:** On an occupied open `/`, sponsors already have **Claim the next cover** on its own line after the sold-cover sentence. A first-time reader who came to read now gets the existing sold-cover line concentrated (`data-read-after-claim-sold` on the same `data-sold-cover` span) so **This issue’s cover is sold.** does not lose to that louder claim hop. Do not add another claim hop. Empty open `/` keeps empty-stand-first. Closed archives stay honest. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 24
- **Acceptance:** Occupied open `/` has one `data-sold-cover="true"` and one `data-read-after-claim-sold="true"` on the same sold-cover span before `data-claim-cover` / `data-claim-after-sold` and `data-read-cover`. Empty open `/` and closed archives have no `data-read-after-claim-sold`. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 26: first-time sponsor — claim after the sold-cover read is concentrated
- **Description:** On an occupied open `/`, readers already have **This issue’s cover is sold.** as the certain first read (`data-read-after-claim-sold`). A first-time sponsor who came to Outbid now gets the existing **Claim the next cover** hop concentrated (`data-claim-after-read-sold` on the same `#claim` hop) so the claim does not disappear under that louder sold-cover line. Do not add another claim hop. Empty open `/` keeps claim-after-stand. Closed archives stay honest. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 25
- **Acceptance:** Occupied open `/` has one `data-claim-cover="true"`, one `data-claim-after-sold="true"`, and one `data-claim-after-read-sold="true"` on the same `href="#claim"` after `data-sold-cover` / `data-read-after-claim-sold` and before `data-read-cover`. Empty open `/` and closed archives have no `data-claim-after-read-sold`. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 27: first-time reader — read after Claim is re-concentrated
- **Description:** On an occupied open `/`, sponsors already have **Claim the next cover** heavier after the sold-cover read (`data-claim-after-read-sold`). A first-time reader who came to read now gets the existing sold-cover line re-concentrated (`data-read-after-claim-two` on the same `data-sold-cover` / `data-read-after-claim-sold` span) so **This issue’s cover is sold.** does not lose to that louder claim hop. Do not add another claim hop. Empty open `/` keeps empty-stand-first. Closed archives stay honest. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 26
- **Acceptance:** Occupied open `/` has one `data-sold-cover="true"`, one `data-read-after-claim-sold="true"`, and one `data-read-after-claim-two="true"` on the same sold-cover span before `data-claim-cover` / `data-claim-after-sold` / `data-claim-after-read-sold` and `data-read-cover`. Empty open `/` and closed archives have no `data-read-after-claim-two`. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 28: first-time sponsor — claim after the sold-cover read is re-concentrated
- **Description:** On an occupied open `/`, readers already have **This issue’s cover is sold.** as the certain first read after Claim is re-concentrated (`data-read-after-claim-two`). A first-time sponsor who came to Outbid now gets the existing **Claim the next cover** hop re-concentrated (`data-claim-after-read-two` on the same `#claim` hop) so the claim does not disappear under that louder sold-cover line. Do not add another claim hop. Empty open `/` keeps claim-after-stand. Closed archives stay honest. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 27
- **Acceptance:** Occupied open `/` has one `data-claim-cover="true"`, one `data-claim-after-sold="true"`, one `data-claim-after-read-sold="true"`, and one `data-claim-after-read-two="true"` on the same `href="#claim"` after `data-sold-cover` / `data-read-after-claim-sold` / `data-read-after-claim-two` and before `data-read-cover`. Empty open `/` and closed archives have no `data-claim-after-read-two`. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 29: first-time reader — read after Claim is re-concentrated again
- **Description:** On an occupied open `/`, sponsors already have **Claim the next cover** louder after the sold-cover read (`data-claim-after-read-two`). A first-time reader who came to read now gets the existing sold-cover line concentrated again (`data-read-after-claim-three` on the same `data-sold-cover` / `data-read-after-claim-sold` / `data-read-after-claim-two` span) so **This issue’s cover is sold.** does not lose to that louder claim hop. Do not add another claim hop. Empty open `/` keeps empty-stand-first. Closed archives stay honest. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 28
- **Acceptance:** Occupied open `/` has one `data-sold-cover="true"`, one `data-read-after-claim-sold="true"`, one `data-read-after-claim-two="true"`, and one `data-read-after-claim-three="true"` on the same sold-cover span before `data-claim-cover` / `data-claim-after-sold` / `data-claim-after-read-sold` / `data-claim-after-read-two` and `data-read-cover`. Empty open `/` and closed archives have no `data-read-after-claim-three`. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 30: first-time sponsor — claim after the sold-cover read is re-concentrated again
- **Description:** On an occupied open `/`, readers already have **This issue’s cover is sold.** as the certain first read after Claim is re-concentrated again (`data-read-after-claim-three`). A first-time sponsor who came to Outbid now gets the existing **Claim the next cover** hop concentrated again (`data-claim-after-read-three` on the same `#claim` hop) so the claim does not disappear under that louder sold-cover line. Do not add another claim hop. Empty open `/` keeps claim-after-stand. Closed archives stay honest. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 29
- **Acceptance:** Occupied open `/` has one `data-claim-cover="true"`, one `data-claim-after-sold="true"`, one `data-claim-after-read-sold="true"`, one `data-claim-after-read-two="true"`, and one `data-claim-after-read-three="true"` on the same `href="#claim"` after `data-sold-cover` / `data-read-after-claim-sold` / `data-read-after-claim-two` / `data-read-after-claim-three` and before `data-read-cover`. Empty open `/` and closed archives have no `data-claim-after-read-three`. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 31: first-time reader — read after Claim is re-concentrated a fourth time
- **Description:** On an occupied open `/`, sponsors already have **Claim the next cover** louder after the sold-cover read (`data-claim-after-read-three`). A first-time reader who came to read now gets the existing sold-cover line concentrated a fourth time (`data-read-after-claim-four` on the same `data-sold-cover` / `data-read-after-claim-sold` / `data-read-after-claim-two` / `data-read-after-claim-three` span) so **This issue’s cover is sold.** does not lose to that louder claim hop. Do not add another claim hop. Empty open `/` keeps empty-stand-first. Closed archives stay honest. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 30
- **Acceptance:** Occupied open `/` has one `data-sold-cover="true"`, one `data-read-after-claim-sold="true"`, one `data-read-after-claim-two="true"`, one `data-read-after-claim-three="true"`, and one `data-read-after-claim-four="true"` on the same sold-cover span before `data-claim-cover` / `data-claim-after-sold` / `data-claim-after-read-sold` / `data-claim-after-read-two` / `data-claim-after-read-three` and `data-read-cover`. Empty open `/` and closed archives have no `data-read-after-claim-four`. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 32: first-time sponsor — claim after the sold-cover read is re-concentrated a fourth time
- **Description:** On an occupied open `/`, readers already have **This issue’s cover is sold.** as the certain first read after Claim is re-concentrated a fourth time (`data-read-after-claim-four`). A first-time sponsor who came to Outbid now gets the existing **Claim the next cover** hop concentrated a fourth time (`data-claim-after-read-four` on the same `#claim` hop) so the claim does not disappear under that louder sold-cover line. Do not add another claim hop. Empty open `/` keeps claim-after-stand. Closed archives stay honest. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 31
- **Acceptance:** Occupied open `/` has one `data-claim-cover="true"`, one `data-claim-after-sold="true"`, one `data-claim-after-read-sold="true"`, one `data-claim-after-read-two="true"`, one `data-claim-after-read-three="true"`, and one `data-claim-after-read-four="true"` on the same `href="#claim"` after `data-sold-cover` / `data-read-after-claim-sold` / `data-read-after-claim-two` / `data-read-after-claim-three` / `data-read-after-claim-four` and before `data-read-cover`. Empty open `/` and closed archives have no `data-claim-after-read-four`. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

---

## 7. Live Polar (after fixture, not a substitute for PR 10)

`src/billing/polar.ts` + `createPolar()` env gate may land in PR 4 or a tiny follow-up on the same billing files. Default remains fixture. Image / CI / `scripts/test.sh` never set `POLAR_LIVE=1`.

Live smoke (PR 10) is what proves the process, not “adapter file exists.”
