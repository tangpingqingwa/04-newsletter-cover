# Newsletter Cover — Detailed Specification and Build Plan

**Contract:** [SPEC.md](./SPEC.md)  
**Git:** [CONTRIBUTING.md](./CONTRIBUTING.md)

Pay-to-rank clone of outbid.lol for one newsletter cover. Rank is money. Waffo Pancake takes payment. Tests stay on the fixture.

---

## 1. Stack

| Layer | Choice |
|---|---|
| App | Node 22, TypeScript, Fastify |
| DB | SQLite (issues, listings, checkouts) |
| Payments | `WaffoPort`. Explicit fixture adapter in tests. Live Waffo only with `WAFFO_MODE=waffo-test` or `waffo-prod` and complete credentials. Production requires `waffo-prod`. |
| Time | UTC. Empty close = `issueDate 00:00:00 UTC`. Occupied live rank = rolling last 7 days from paid placement. Catch-up on boot. |
| Tests | `node:test` + fixture Waffo. No provider network in `scripts/test.sh`. |

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

## 4. Waffo Pancake wiring

```
POST /listings
  validate url, blurb, min/max, raise-vs-create
  insert checkout pending (amount = full bid or difference)
  WaffoPort.createCheckout(...)
  return { url }   # Waffo hosted checkout
```

Signed Waffo webhook / fixture `complete(checkoutId)`:

- `paid` → upsert listing, set `bidUsd = targetBidUsd`, first time sets `createdAt`
- already `paid` → idempotent no-op
- unknown id → 404, board unchanged

The hosted success/cancel return is `GET /checkout/complete?intent=...` (fixture
returns may use `checkoutId=...`). It renders only the durable local intent
state—pending/open, unknown, paid, rejected, or needs reconciliation. It never
trusts a query-string status, calls Waffo, settles a payment, or mutates rank.

Live client lives in `src/billing/waffo.ts` and is selected only by `createWaffo()` for an explicit Waffo mode. App routes import the port, never the provider API directly.

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
| fixture is explicit | `WAFFO_MODE=fixture` is the only offline mode; legacy provider flags are ignored |
| about/rules | 200 and mention min $5 / rank is the bid |
| checkout return | durable pending/paid/reconciliation/rejected/unknown states; 200 HTML; no settlement |

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

### PR 4: Waffo fixture checkout and min $5
- **Files:** src/billing/port.ts, src/billing/fixture.ts, src/billing/create.ts, src/http/routes/polar-webhook.ts, tests/billing.test.ts
- **Dependencies:** PR 3
- **Acceptance:** unpaid checkout hidden; $5 paid appears; $4 never creates a paid row; no Waffo HTTP in fixture tests

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
- **Acceptance:** operator script starts a local process with explicit Waffo fixture mode; checks the empty board, below-minimum error, unpaid checkout, read-only browser return, unsigned webhook rejection, about/rules, and no provider host; production configuration is a separate fail-closed preflight with exact `BLOCKED-SECRET`/`BLOCKED-CONFIG`; **not** called from `scripts/test.sh` or Actions; CI remains fixture-only

### PR 14: product UI — next issue’s cover auction
- **Description:** Print masthead for the next issue’s one cover. Issue date + OPEN/CLOSED is editorial chrome. A listing is a cover pitch (sponsor URL + one-line blurb). Empty issue is “no cover sold,” never a placeholder sponsor. Auction DNA stays: Claim #1, dashed $amount, ±, Claim rank, $bid + clicks. Not a parchment recolor of a web form. One prize: the cover.
- **Files:** `src/views/skin.ts`, `src/http/routes/board.ts`, `src/http/routes/pages.ts`, `src/http/routes/listings.ts`, `tests/product-ui.test.ts`, `tests/rank.test.ts`, `tests/issues.test.ts`, `scripts/test.sh`, `scripts/live-smoke.sh`
- **Dependencies:** launch-path already shipped (PRs 1–10 / Waffo smoke)
- **Acceptance:** Empty issue says no cover sold and keeps `No paid listings on this board.` Issue chrome is the date + OPEN/CLOSED. Paid rows are cover lines, not cards in a cream form. No article list or subscriber count. `bash scripts/test.sh` stays offline.

### Historical UI iterations — PR 15–36 (superseded; non-normative)

PR 15–36 record an earlier first-user exploration of the folio. Their
numbered read-after-claim / claim-after-read generations and intermediate
empty-stand routing were deliberately retired by the compact flow below.
The attributes, ordering, copy, and acceptance criteria in those archived
iterations are historical evidence only: they are not implementation
requirements, must not be restored, and must not be used as a gate.

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

### Historical UI iteration — PR 46 (superseded; non-normative)

PR 46's staged empty identity experiment (the first-click marker, later-write
marker, and “Then the cover URL” copy) is retired. The current empty form
requires Sponsor URL and one-line cover pitch before one Claim rank submit; the
retired ordering and markers are historical evidence only, not acceptance
criteria or a gate.

### PR 47: first-time reader — occupied Cover · #1 identity is the paid name
- **Description:** On an occupied open `/`, Cover · #1 is the paid name (`data-paid-name`). Later ranks cannot wear that identity: they drop `class="hed"` and sit as quieter host/path + slot. The occupied claim rail cannot wear the cover pitch. Host/path stays a later fact. Empty open `/` stays empty stand + Claim #1. Closed empty archives stay empty-issue. Occupied Cover · #1 stays the first occupied click. Do not add another named hop. Do not stamp `*-after-*-N`. Do not re-ship FOLIO vs ISSUE, Cover-first size, or empty later-write. Do not recolor. Do not rebuild the folio. Stamp-only mute of later names = REJECT. Not a 24h lock on #1.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 46
- **Acceptance:** Occupied open `/` has one `data-paid-name="true"` on rank 1. Cover · #1 hed is the listing blurb; ranks 2+ have no `class="hed"` and no `data-paid-name`. The occupied direct form uses the Sponsor URL and one-line cover pitch fields from the current compact product UI contract, not a separate claim-rail identity. Empty open `/` and closed archives have no `data-paid-name`. `data-read-cover`, `data-claim-cover`, `data-cover-prize-line`, `data-prize-before-price`, `data-named-prize`, `data-later-fact`, `data-later-rank`, and `data-cover-first` stay. Still one `#claim` hop. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

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

### Current compact product UI contract (repair-04-functional-flow-and-probe-residue-r5)

- **Status:** Active. This contract supersedes the archived PR 15–36 and PR 46
  experiments for the first-user flow; it does not replace the independent Waffo,
  ranking, rolling-window, click, archive, or release contracts below.
- **Description:** The print folio has one truthful first action per state. Empty
  open `/` keeps the stand and honest no-cover copy, then one claim form whose
  required fields are Sponsor URL and one-line cover pitch, followed by one
  Claim rank submit. Occupied open `/` leads with the paid Cover · #1, then offers at
  most one quiet Claim the next cover route and the same direct raise/list form.
  No generated read/claim generations or staged later-write ordering is part of
  the product.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`,
  `scripts/test.sh`
- **Dependencies:** PR 14 and accepted Waffo/payment baseline.
- **Acceptance:** The masthead keeps exact Leaderboard, About, and Rules
  navigation at `/`, `/about`, and `/rules`. Empty open output preserves
  `data-read-stand`, Claim #1, dashed `$amount`, ±, cover-prize copy,
  rolling-last-7-days truth, and the form order Sponsor URL → one-line cover
  pitch → one Claim rank. It has no staged identity/later-write markers or
  redundant empty-cover claim link. Occupied open output renders the paid
  Cover · #1 prize before price/click facts, keeps later ranks quiet, and has at
  most one `data-claim-cover` route marked `data-claim-after-listing` to the
  direct form. Closed empty and occupied archives remain frozen/read-only and
  isolate live claim chrome. Unpaid rows stay off-board; paid-only rank, older
  ties, public sponsor clicks, and difference charging remain unchanged.
- **Verification:** Focused rendered product-UI tests plus the ordinary full
  test/gate/typecheck/build/audit and fixture-only smoke; no live provider
  action.

### PR 51: first-time reader — occupied week window is rolling last-7-days from paid placement
- **Description:** Occupied live `/` ranks Waffo-paid `createdAt` in the rolling last 7 days. Monday 00:00 UTC is not the drop. Empty stand stays empty. Occupied Cover · #1 still reads before money and stays the first occupied click. Claim stays after the listing. Unpaid stays off. Closed occupied stays frozen. Not a 24h lock on #1. Do not add another named hop. Do not stamp `claim-after-read-N`. Do not re-ship Cover-before-Claim, closed-frozen, paid-name, empty later-write, or unpaid-off. Do not recolor. Do not rebuild the folio. Stamp-only = REJECT.
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

### PR 60: first-time reader — closed empty empty-issue kicker names no last-7-days cover
- **Description:** On a closed empty `/issue/:date`, the empty-issue kicker names that no last-7-days cover sold (`data-empty-slab`), not a generic “No cover sold” / “Nobody bought the cover” next to the last-7-days freeze line. The slab must not read as a generic empty live week. Closed empty stays empty-issue / Weekly · UTC. Occupied freeze-hint / flag / Frozen last 7 days ear stay. Occupied Cover · #1 first click stays. Occupied week-window stays. Closed empty freeze line stays. Do not add another named hop. Do not stamp `*-after-*-N`. Do not restamp the frozen ear, freeze flag, occupied freeze-hint, occupied open Last 7 days, occupied Cover · #1, or the closed empty freeze line. Do not recolor. Do not rebuild the folio. Stamp-only = REJECT.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `tests/issues.test.ts`, `scripts/test.sh`
- **Acceptance:** Closed empty `/issue/:date` has one `data-empty-slab="true"` empty-issue kicker that names no last-7-days cover sold and does not say generic No cover sold / Nobody bought the cover. Closed empty keeps Weekly · UTC / `empty-issue` and the last-7-days freeze line. Occupied closed `/issue/:date` keeps frozen last-7-days freeze-hint / flag / ear. Occupied open `/` keeps Last 7 days, Cover · #1 first click, and week-window. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 61: first-time reader — closed empty empty-issue body names no last-7-days cover / closed empty week
- **Description:** On a closed empty `/issue/:date`, the empty-issue body names that this closed week has no last-7-days cover (`data-empty-week`), not “No paid listings on this board” under the last-7-days kicker. The slab must not rhyme with a generic empty live week. Closed empty stays empty-issue / Weekly · UTC. Occupied freeze-hint / flag / Frozen last 7 days ear stay. Occupied Cover · #1 first click stays. Occupied week-window stays. Closed empty freeze line stays. Closed empty last-7-days kicker stays. Do not add another named hop. Do not stamp `*-after-*-N`. Do not restamp the frozen ear, freeze flag, occupied freeze-hint, occupied open Last 7 days, occupied Cover · #1, the closed empty freeze line, or the closed empty last-7-days kicker. Do not recolor. Do not rebuild the folio. Stamp-only = REJECT.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `tests/issues.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 60
- **Acceptance:** Closed empty `/issue/:date` has one `data-empty-week="true"` empty-issue body that names no last-7-days cover / closed empty week and does not say No paid listings on this board. Closed empty keeps Weekly · UTC / `empty-issue`, the last-7-days freeze line, and the last-7-days kicker. Occupied closed `/issue/:date` keeps frozen last-7-days freeze-hint / flag / ear. Occupied open `/` keeps Last 7 days, Cover · #1 first click, and week-window. Empty open `/` keeps `No paid listings on this board.` Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

### PR 62: first-time reader — closed empty flag names last-7-days / closed empty week
- **Description:** On a closed empty `/issue/:date`, the masthead flag names last-7-days / closed empty week (`data-empty-flag`), not “This issue is closed.” The page must not rhyme with a generic closed archive above the last-7-days empty week. Closed empty stays empty-issue / Weekly · UTC. Occupied freeze-hint / flag / Frozen last 7 days ear stay. Occupied Cover · #1 first click stays. Occupied week-window stays. Closed empty freeze line stays. Closed empty last-7-days kicker stays. Closed empty empty-issue body stays. Do not add another named hop. Do not stamp `*-after-*-N`. Do not restamp the frozen ear, freeze flag, occupied freeze-hint, occupied open Last 7 days, occupied Cover · #1, the closed empty freeze line, the closed empty last-7-days kicker, or the closed empty empty-issue body. Do not recolor. Do not rebuild the folio. Stamp-only = REJECT.
- **Files:** `src/views/skin.ts`, `tests/product-ui.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 61
- **Acceptance:** Closed empty `/issue/:date` has one `data-empty-flag="true"` flag that names last-7-days / closed empty week and does not say This issue is closed. Closed empty keeps Weekly · UTC / `empty-issue`, the last-7-days freeze line, the last-7-days kicker, and the last-7-days empty-issue body. Occupied closed `/issue/:date` keeps frozen last-7-days freeze-hint / flag / ear. Occupied open `/` keeps Last 7 days, Cover · #1 first click, and week-window. Nav, palette, and masthead stay. `bash scripts/test.sh` stays offline.

---

## 7. Live Waffo Pancake (after fixture, not a substitute for PR 10)

`src/billing/waffo.ts` + `createWaffo()` are selected only by an explicit `WAFFO_MODE`. Default test and CI mode remains fixture. Image / CI / `scripts/test.sh` never select a live Waffo mode.

Fixture smoke (PR 10) is what proves the process, not “adapter file exists.”
