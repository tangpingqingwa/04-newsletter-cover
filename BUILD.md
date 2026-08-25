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
| Time | UTC. Empty close = `issueDate 00:00:00 UTC`. Occupied live rank = rolling last 7 days from paid placement. Catch-up on boot. |
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
| close | occupied live is rolling last 7 days from paid placement; Monday 00:00 UTC does not drop #1; empty close still invents nothing; boot catch-up |
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

### PR 33: first-time reader — read after Claim is re-concentrated a fifth time
- **Description:** On an occupied open `/`, sponsors already have **Claim the next cover** louder after the sold-cover read (`data-claim-after-read-four`). A first-time reader who came to read now gets the existing sold-cover line concentrated a fifth time (`data-read-after-claim-five` on the same `data-sold-cover` / `data-read-after-claim-sold` / `data-read-after-claim-two` / `data-read-after-claim-three` / `data-read-after-claim-four` span) so **This issue’s cover is sold.** does not lose to that louder claim hop. Do not add another claim hop. Empty open `/` keeps empty-stand-first. Closed archives stay honest. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 32
- **Acceptance:** Occupied open `/` has one `data-sold-cover="true"`, one `data-read-after-claim-sold="true"`, one `data-read-after-claim-two="true"`, one `data-read-after-claim-three="true"`, one `data-read-after-claim-four="true"`, and one `data-read-after-claim-five="true"` on the same sold-cover span before `data-claim-cover` / `data-claim-after-sold` / `data-claim-after-read-sold` / `data-claim-after-read-two` / `data-claim-after-read-three` / `data-claim-after-read-four` and `data-read-cover`. Empty open `/` and closed archives have no `data-read-after-claim-five`. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 34: first-time sponsor — claim after the sold-cover read is re-concentrated a fifth time
- **Description:** On an occupied open `/`, readers already have **This issue’s cover is sold.** as the certain first read after Claim is re-concentrated a fifth time (`data-read-after-claim-five`). A first-time sponsor who came to Outbid now gets the existing **Claim the next cover** hop concentrated a fifth time (`data-claim-after-read-five` on the same `#claim` hop) so the claim does not disappear under that louder sold-cover line. Do not add another claim hop. Empty open `/` keeps claim-after-stand. Closed archives stay honest. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 33
- **Acceptance:** Occupied open `/` has one `data-claim-cover="true"`, one `data-claim-after-sold="true"`, one `data-claim-after-read-sold="true"`, one `data-claim-after-read-two="true"`, one `data-claim-after-read-three="true"`, one `data-claim-after-read-four="true"`, and one `data-claim-after-read-five="true"` on the same `href="#claim"` after `data-sold-cover` / `data-read-after-claim-sold` / `data-read-after-claim-two` / `data-read-after-claim-three` / `data-read-after-claim-four` / `data-read-after-claim-five` and before `data-read-cover`. Empty open `/` and closed archives have no `data-claim-after-read-five`. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 35: first-time reader — read after Claim is re-concentrated a sixth time
- **Description:** On an occupied open `/`, sponsors already have **Claim the next cover** louder after the sold-cover read (`data-claim-after-read-five`). A first-time reader who came to read now gets the existing sold-cover line concentrated a sixth time (`data-read-after-claim-six` on the same `data-sold-cover` / `data-read-after-claim-sold` / `data-read-after-claim-two` / `data-read-after-claim-three` / `data-read-after-claim-four` / `data-read-after-claim-five` span) so **This issue’s cover is sold.** does not lose to that louder claim hop. Do not add another claim hop. Empty open `/` keeps empty-stand-first. Closed archives stay honest. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 34
- **Acceptance:** Occupied open `/` has one `data-sold-cover="true"`, one `data-read-after-claim-sold="true"`, one `data-read-after-claim-two="true"`, one `data-read-after-claim-three="true"`, one `data-read-after-claim-four="true"`, one `data-read-after-claim-five="true"`, and one `data-read-after-claim-six="true"` on the same sold-cover span before `data-claim-cover` / `data-claim-after-sold` / `data-claim-after-read-sold` / `data-claim-after-read-two` / `data-claim-after-read-three` / `data-claim-after-read-four` / `data-claim-after-read-five` and `data-read-cover`. Empty open `/` and closed archives have no `data-read-after-claim-six`. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 36: first-time sponsor — claim after the sold-cover read is re-concentrated a sixth time
- **Description:** On an occupied open `/`, readers already have **This issue’s cover is sold.** as the certain first read after Claim is re-concentrated a sixth time (`data-read-after-claim-six`). A first-time sponsor who came to Outbid now gets the existing **Claim the next cover** hop concentrated a sixth time (`data-claim-after-read-six` on the same `#claim` hop) so the claim does not disappear under that louder sold-cover line. Do not add another claim hop. Empty open `/` keeps claim-after-stand. Closed archives stay honest. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 35
- **Acceptance:** Occupied open `/` has one `data-claim-cover="true"`, one `data-claim-after-sold="true"`, one `data-claim-after-read-sold="true"`, one `data-claim-after-read-two="true"`, one `data-claim-after-read-three="true"`, one `data-claim-after-read-four="true"`, one `data-claim-after-read-five="true"`, and one `data-claim-after-read-six="true"` on the same `href="#claim"` after `data-sold-cover` / `data-read-after-claim-sold` / `data-read-after-claim-two` / `data-read-after-claim-three` / `data-read-after-claim-four` / `data-read-after-claim-five` / `data-read-after-claim-six` and before `data-read-cover`. Empty open `/` and closed archives have no `data-claim-after-read-six`. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 37: first-time reader — prize before price on the occupied cover
- **Description:** On an occupied open `/`, a first-time reader who came to read hits **Cover · #1** before `$bid`. The existing cover line keeps `Cover · #1` first and larger than `$bid` + clicks (`data-prize-before-price`). Money stays a later fact. Do not add another named hop. Do not stamp claim-after-read-N / read-after-claim-N. Empty open `/` stays honest. Closed empty archives stay the empty-issue slab. One prize. No article list or subscriber count. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 36
- **Acceptance:** Occupied open `/` has one `data-prize-before-price="true"` on the rank-1 cover line. `Cover · #1` is before `class="bid"` and larger in CSS. Empty open `/` and closed empty archives have no `data-prize-before-price`. `data-read-cover`, `data-claim-cover`, and `data-cover-prize-line` stay. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 38: first-time reader — later ranks stay quieter than Cover · #1
- **Description:** On an occupied open `/` with later covers, ranks 2+ stay quieter than `Cover · #1` (`data-later-rank`). One prize. Empty open `/` stays honest. Closed empty archives stay the empty-issue slab. Do not add another named hop. Do not stamp claim-after-read-N / read-after-claim-N. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 37
- **Acceptance:** Occupied open `/` stamps `data-later-rank="true"` only on ranks 2+. `Cover · #1` keeps `data-prize-before-price` and stays larger in CSS. Empty open `/` and closed empty archives have no `data-later-rank`. `data-read-cover`, `data-claim-cover`, and `data-cover-prize-line` stay. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 39: first-time reader — closed issue stays empty-issue
- **Description:** On a closed `/issue/:date`, a first-time reader must not think this archive is claimable. Closed empty archives stay the `empty-issue` slab (`data-closed-empty-issue`). The only hop is the existing open stand (`data-open-cover`). Occupied closed archives keep the frozen board but drop sold-cover, Claim the next cover, and prize stamps. One prize lives on the open issue only. Do not add another named hop. Do not stamp `*-after-*-N`. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 38
- **Acceptance:** Closed empty `/issue/:date` has `class="empty-issue"` and `data-closed-empty-issue="true"`. The only hop is one `data-open-cover="true"` `href="/"`. Closed occupied archives have no `data-sold-cover`, no Claim the next cover, and no `data-cover-prize` / `data-cover-prize-line` / `data-prize-before-price` / `data-later-rank`. Occupied open `/` keeps those prize marks and one `#claim` hop. Empty open `/` stays the empty stand. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 40: first-time reader — occupied Cover · #1 names the sponsor
- **Description:** On an occupied open `/`, Cover · #1 names the sponsor from the listing’s existing blurb (`data-named-prize`). Host/path (`displaySponsor`) stays a later fact on the dek. Do not scrape a second title from the live web. Empty open `/` stays the empty stand + Claim #1. Closed empty archives stay the empty-issue slab. Closed occupied archives keep the frozen board and drop prize stamps. Do not add another named hop. Do not stamp `*-after-*-N`. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 39
- **Acceptance:** Occupied open `/` has one `data-named-prize="true"` on rank 1. The Cover · #1 hed is the listing blurb; host/path stays quieter on the dek. Empty open `/` and closed archives have no `data-named-prize`. `data-read-cover`, `data-claim-cover`, `data-cover-prize-line`, `data-prize-before-price`, and `data-later-rank` stay. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 41: first-time sponsor — empty open stand stays honest
- **Description:** On an empty open `/`, a first-time sponsor must not hit leftover occupied chrome. The blank stand stays the empty stand + Claim #1 (`data-empty-open-stand`). Sold-cover, Claim the next cover, and named-prize stamps stay on occupied weeks only. Closed empty archives stay the empty-issue slab. One prize only when a cover is sold. Do not add another named hop. Do not stamp `*-after-*-N`. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 40
- **Acceptance:** Empty open `/` has `class="empty-stand"` and `data-empty-open-stand="true"` before `id="claim"`. It has no `data-sold-cover`, no Claim the next cover, and no `data-named-prize`. Occupied open `/` keeps those prize marks and one `#claim` hop. Closed empty archives keep `class="empty-issue"` / `data-closed-empty-issue` and have no `data-empty-open-stand`. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 42: first-time reader — empty open stand stays certain
- **Description:** On an empty open `/`, occupied sold-cover / Claim the next cover / named-prize chrome cannot leak. The week is its own shell (`week-open-empty`) so occupied CSS is scoped to `week-open-sold`. Empty open stays empty stand + Claim #1. Closed archives stay empty-issue. Do not add another named hop. Do not stamp `*-after-*-N`. Do not recolor. Do not rebuild the folio. A stamp without this CSS/markup isolation is REJECT.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 41
- **Acceptance:** Empty open `/` has `class="week week-open-empty"` wrapping the empty stand before `id="claim"`. Occupied sold-cover CSS is scoped to `.week-open-sold`. Empty open has no `data-sold-cover`, no Claim the next cover, and no `data-named-prize`. Occupied open `/` keeps those prize marks and one `#claim` hop. Closed empty archives keep `class="empty-issue"` / `data-closed-empty-issue` and have no `week-open-empty`. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 43: first-time reader — occupied Cover · #1 prize stays before $bid
- **Description:** On an occupied open `/`, Cover · #1 names the listing blurb first. `$bid` + clicks and host/path drop out of the money column and sit as later facts under the hed (`data-later-fact`). Empty open `/` stays empty stand + Claim #1. Closed empty archives stay the empty-issue slab. Closed occupied archives keep the frozen three-column board and drop prize stamps. Do not add another named hop. Do not stamp `*-after-*-N`. Do not re-ship empty-open isolation. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 42
- **Acceptance:** Occupied open `/` has one `data-later-fact="true"` on rank 1. The Cover · #1 hed is before host/path and `$bid`. Occupied `#1` has no `class="money"`. Empty open `/` and closed archives have no `data-later-fact`. `data-read-cover`, `data-claim-cover`, `data-cover-prize-line`, `data-prize-before-price`, `data-named-prize`, and `data-later-rank` stay. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 44: first-time sponsor — empty open stand stays Claim #1; later-fact / named-prize cannot leak
- **Description:** On an empty open `/`, occupied later-fact / named-prize CSS cannot leak after Cover · #1 money moved under the hed. Empty and closed pages ship `FOLIO_CSS` only. Occupied open `/` still concatenates `OCCUPIED_CSS` so the cover name reads before `$bid`. Closed archives stay empty-issue. Do not add another named hop. Do not stamp `*-after-*-N`. Do not re-ship Cover · #1 later-fact grouping. Do not recolor. Do not rebuild the folio. A stamp without this CSS isolation is REJECT.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 43
- **Acceptance:** Empty open `/` has `class="week week-open-empty"` wrapping the empty stand before `id="claim"` and ships `FOLIO_CSS` without `.later-fact[data-later-fact]` or `[data-named-prize]`. Occupied open `/` keeps `data-later-fact`, `data-named-prize`, and one `#claim` hop. Closed empty archives keep `class="empty-issue"` / `data-closed-empty-issue` and have no later-fact / named-prize CSS. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 45: first-time reader — occupied Claim the next cover stays quieter than Cover · #1; prize stays first
- **Description:** On an occupied open `/`, Cover · #1 is the prize and the first occupied click. The listing blurb on Cover · #1 is the `/l/:id` read (`data-cover-first`). **Claim the next cover** stays the existing `#claim` hop and stays quieter than Cover · #1 after money moved under the hed. Empty open `/` stays empty stand + Claim #1. Closed empty archives stay the empty-issue slab. Do not add another named hop. Do not stamp `*-after-*-N`. Do not re-ship FOLIO vs ISSUE CSS split. Do not recolor. Do not rebuild the folio. Stamp-only mute = REJECT.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 44
- **Acceptance:** Occupied open `/` has one `data-cover-first="true"` `/l/:id` on the Cover · #1 hed before host/path and `$bid`. **Claim the next cover** stays one `data-claim-cover` `href="#claim"` and is quieter in CSS than Cover · #1. Empty open `/` and closed archives have no `data-cover-first`. `data-read-cover`, `data-claim-cover`, `data-cover-prize-line`, `data-prize-before-price`, `data-named-prize`, `data-later-fact`, and `data-later-rank` stay. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 46: first-time sponsor — empty open has one first click; cover URL is a later write
- **Description:** On an empty open `/`, Claim #1 / Outbid is the only first click. Cover identity (sponsor URL + one-line pitch) is a later write after that hop (`data-later-write`, “Then the cover URL”), not same-weight fields fighting Outbid on the claim rail. Occupied Cover · #1 stays the first occupied click; Claim the next cover stays quieter. Closed empty archives stay empty-issue. Do not add another named hop. Do not stamp `*-after-*-N`. Do not re-ship FOLIO vs ISSUE or Cover-first size. Do not recolor. Do not rebuild the folio. Stamp-only = REJECT.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 45
- **Acceptance:** Empty open `/` has one `data-first-click="claim"` on Claim #1, then Outbid, then one `data-later-write="true"` cover identity after “Then the cover URL”. Empty open has no `class="bid-row"`. Occupied open `/` keeps sponsor URL on the bid-row with Outbid, `data-cover-first`, and quieter Claim the next cover. Closed empty archives keep `class="empty-issue"` and have no later-write chrome. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 47: first-time reader — occupied Cover · #1 identity is the paid name
- **Description:** On an occupied open `/`, Cover · #1 is the paid name (`data-paid-name`). Later ranks cannot wear that identity: they drop `class="hed"` and sit as quieter host/path + slot. The occupied claim rail cannot wear the cover pitch. Host/path stays a later fact. Empty open `/` stays empty stand + Claim #1. Closed empty archives stay empty-issue. Occupied Cover · #1 stays the first occupied click. Do not add another named hop. Do not stamp `*-after-*-N`. Do not re-ship FOLIO vs ISSUE, Cover-first size, or empty later-write. Do not recolor. Do not rebuild the folio. Stamp-only mute of later names = REJECT. Not a 24h lock on #1.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 46
- **Acceptance:** Occupied open `/` has one `data-paid-name="true"` on rank 1. Cover · #1 hed is the listing blurb; ranks 2+ have no `class="hed"` and no `data-paid-name`. Occupied claim uses `data-later-listing` / “One-line listing”, not the cover-pitch placeholder. Empty open `/` and closed archives have no `data-paid-name`. `data-read-cover`, `data-claim-cover`, `data-cover-prize-line`, `data-prize-before-price`, `data-named-prize`, `data-later-fact`, `data-later-rank`, and `data-cover-first` stay. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 48: first-time reader — closed occupied keeps frozen Cover · #1; live claim cannot steal the archive
- **Description:** On a closed occupied `/issue/:date`, Cover · #1 is the paid name of that frozen issue (`data-frozen-cover` / `data-archive-name`). The board stays a three-column freeze. Live Claim the next cover / open checkout stays off the archive. The existing open-stand hop (`data-open-cover`) sits after the frozen rack, not above Cover · #1. Empty closed stays empty-issue. Occupied open Cover · #1 stays the first occupied click. Do not add another named hop. Do not stamp `*-after-*-N`. Do not re-ship FOLIO vs ISSUE, Cover-first size, empty later-write, or paid-name. Do not recolor. Do not rebuild the folio. Stamp-only = REJECT.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 47
- **Acceptance:** Closed occupied `/issue/:date` has one `data-frozen-cover="true"` Cover · #1 hed (listing blurb) before later ranks and before `data-open-cover`. No `id="claim"`, no Claim the next cover, no `action="/listings"`. Later ranks drop `class="hed"`. Empty closed keeps `class="empty-issue"`. Occupied open `/` keeps `data-paid-name`, `data-cover-first`, and one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 49: first-time reader — occupied folio keeps one first click: Cover · #1; Claim stays after the listing
- **Description:** On occupied open `/`, Cover · #1 is the prize and the first occupied click. The listing blurb (`data-cover-first`) is that hop. **Claim the next cover** / Claim #1 is a later write after the listing (`data-claim-after-listing`), not a same-weight rail in the masthead flag above Cover · #1. Still one `#claim` hop. Empty open `/` stays empty stand + Claim #1. Closed empty stays empty-issue. Closed occupied stays frozen. Unpaid stays off the folio. Do not add another named hop. Do not stamp `claim-after-read-N`. Do not re-ship closed-frozen, paid-name, empty later-write, FOLIO vs ISSUE, or unpaid-off. Do not recolor. Do not rebuild the folio. Stamp-only = REJECT.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 48
- **Acceptance:** Occupied open `/` has Cover · #1 / `data-cover-first` before `data-claim-cover`. The existing `#claim` hop is one `data-claim-cover` / `data-claim-after-listing` after the listing, not in the masthead flag. Empty open `/` and closed archives have no `data-claim-after-listing`. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 51: first-time reader — occupied week window is rolling last-7-days from paid placement
- **Description:** Occupied live `/` ranks Polar-paid `createdAt` in the rolling last 7 days. Monday 00:00 UTC is not the drop. Empty stand stays empty. Occupied Cover · #1 still reads before money and stays the first occupied click. Claim stays after the listing. Unpaid stays off. Closed occupied stays frozen. Not a 24h lock on #1. Do not add another named hop. Do not stamp `claim-after-read-N`. Do not re-ship Cover-before-Claim, closed-frozen, paid-name, empty later-write, or unpaid-off. Do not recolor. Do not rebuild the folio. Stamp-only = REJECT.
- **Files:** `src/week.ts`, `src/issues.ts`, `src/rank.ts`, `src/views/skin.ts`, `src/http/routes/board.ts`, `src/http/routes/pages.ts`, `tests/week.test.ts`, `tests/issues.test.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 49 / PR 50
- **Acceptance:** Occupied open `/` stamps `data-rolling-week` and names rolling last 7 days from paid placement. Empty open `/` has no rolling stamp. Closed occupied `/issue/:date` stays frozen with no rolling stamp. A Sunday paid placement still occupies Monday 00:00 UTC and leaves live rank 7 days later. `bash scripts/test.sh` stays offline.

### PR 52: first-time sponsor — empty open stand names rolling last-7-days
- **Description:** On an empty open `/`, the blank stand names the fair occupied-rank window: rolling last 7 days from paid placement, not Monday 00:00 UTC as when live rank dies. Empty stand stays empty. Occupied Cover · #1 stays the first occupied click. Occupied week-window / `data-rolling-week` chrome stays off empty. Closed issues stay closed. Do not add another named hop. Do not stamp `*-after-*-N`. Do not re-ship occupied rolling chrome. Do not recolor. Do not rebuild the folio.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 51
- **Acceptance:** Empty open `/` has `data-fair-window="true"` and names rolling last 7 days from paid placement. Empty open has no `data-rolling-week` and no `class="week-window"`. Occupied open `/` keeps `data-rolling-week` / week-window and Cover · #1 first click. Closed empty archives stay `empty-issue`. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 57: first-time reader — closed occupied flag names frozen last-7-days rank snapshot
- **Description:** On a closed occupied `/issue/:date`, the masthead flag names a frozen last-7-days rank snapshot (`data-frozen-flag`), not only “this issue is closed.” The archive must not read as a live close line with a frozen ear. Closed empty stays empty-issue / Weekly · UTC. Occupied open Last 7 days stays. Empty open ear last-7-days stays. Occupied Cover · #1 first click stays. Occupied week-window stays. Frozen last 7 days ear stays. Do not add another named hop. Do not stamp `*-after-*-N`. Do not restamp the frozen ear. Do not recolor. Do not rebuild the folio. Stamp-only = REJECT.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 56
- **Acceptance:** Closed occupied `/issue/:date` has one `data-frozen-flag="true"` flag that names frozen last-7-days rank snapshot. Closed empty keeps `This issue is closed` / Weekly · UTC / `empty-issue`. Occupied open `/` keeps Last 7 days, Cover · #1 first click, and week-window. Frozen last 7 days ear stays. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 58: first-time reader — closed occupied after-rack hint names frozen last-7-days rank snapshot
- **Description:** On a closed occupied `/issue/:date`, the form-hint under the frozen rack names a frozen last-7-days rank snapshot (`data-frozen-hint`), not only “this issue is frozen / whoever paid the most before close.” Closed empty stays empty-issue / Weekly · UTC. Occupied open Last 7 days stays. Empty open ear last-7-days stays. Occupied Cover · #1 first click stays. Occupied week-window stays. Frozen ear copy stays. Frozen flag copy stays. Do not add another named hop. Do not stamp `*-after-*-N`. Do not restamp the frozen ear or freeze flag. Do not recolor. Do not rebuild the folio. Stamp-only = REJECT.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 57
- **Acceptance:** Closed occupied `/issue/:date` has one `data-frozen-hint="true"` after-rack hint that names frozen last-7-days rank snapshot and does not say before close. Closed empty keeps `This issue is frozen. No cover sold.` / Weekly · UTC / `empty-issue`. Occupied open `/` keeps Last 7 days, Cover · #1 first click, and week-window. Frozen last 7 days ear and freeze-flag copy stay. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 59: first-time reader — closed empty freeze line names no last-7-days cover, not a freeze of a live week
- **Description:** On a closed empty `/issue/:date`, the freeze line names that no last-7-days cover sold (`data-empty-freeze`), not “this issue is frozen.” Empty midnight close must not read as the same freeze as occupied last-7-days rank. Closed empty stays empty-issue / Weekly · UTC. Occupied freeze-hint / flag / Frozen last 7 days ear stay. Occupied Cover · #1 first click stays. Occupied week-window stays. Do not add another named hop. Do not stamp `*-after-*-N`. Do not restamp the frozen ear, freeze flag, occupied freeze-hint, occupied open Last 7 days, or occupied Cover · #1. Do not recolor. Do not rebuild the folio. Stamp-only = REJECT.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 58
- **Acceptance:** Closed empty `/issue/:date` has one `data-empty-freeze="true"` freeze line that names no last-7-days cover sold and does not say this issue is frozen. Closed empty keeps Weekly · UTC / `empty-issue`. Occupied closed `/issue/:date` keeps frozen last-7-days freeze-hint / flag / ear. Occupied open `/` keeps Last 7 days, Cover · #1 first click, and week-window. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

---

## 7. Live Polar (after fixture, not a substitute for PR 10)

`src/billing/polar.ts` + `createPolar()` env gate may land in PR 4 or a tiny follow-up on the same billing files. Default remains fixture. Image / CI / `scripts/test.sh` never set `POLAR_LIVE=1`.

Live smoke (PR 10) is what proves the process, not “adapter file exists.”
