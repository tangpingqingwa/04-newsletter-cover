# Newsletter Cover — Product Development Spec

**Version:** 1.0  
**Status:** Ready to build  
**Repo:** https://github.com/tangpingqingwa/04-newsletter-cover  
**Market:** global English  
**Clone of:** [outbid.lol](https://outbid.lol) pay-to-rank mechanics  
**Payments:** Polar (live, env-gated) + fixture adapter  

Public auction for the next issue’s cover / first slot of one vertical newsletter. Readers watch the bidding. When the issue closes, the highest bid is issue **#1**. Rank is the bid — nothing else.

---

## 1. Product statement

Sponsors bid whole USD so their link sits on the cover (first slot) of the next newsletter issue. The board is public. Anyone can watch who is paying, click the cleaned sponsor URL, and see the live rank.

One-line pitch: **The next issue’s cover goes to whoever pays the most.**

v1 is **one** English-language vertical newsletter (one board). Architecture may not hard-code a single city, language pack, or issue calendar so a second newsletter can be added later without rewriting ranking.

---

## 2. Goals and non-goals

### Goals

- Public leaderboard for the open issue. No login to read.
- Whole-dollar USD bids. Documented minimum **$5**. Documented maximum **$10,000**.
- Rank = bid descending. Equal bids: the **older** listing keeps the higher rank.
- A bid below #1 still lists at the rank that amount can take.
- The same canonical sponsor URL on the same issue can **raise**; the sponsor pays only the **difference**.
- Strip tracking / click-id query strings before store, display, or redirect.
- Reject chat-app links and NSFW. No on-site chat.
- Polar checkout for money in. Tests use a fixture Polar port. No ads, no API keys for readers, no revenue share.
- `/about` and `/rules` exist and match this SPEC.
- Clicks on the sponsor URL are public (count + redirect).
- Cadence is **per issue**. Default close is **weekly**. Occupied live rank is rolling last 7 days from paid placement, not Monday 00:00 UTC.

### Non-goals

- Comments, DMs, or any chat surface.
- Invented subscriber counts, open rates, or “editor’s pick” scores.
- Multi-newsletter marketplace in v1 (schema may allow a `newsletterId`; UI is one board).
- Editor approval queue in v1 (veto exists as a documented off switch only).
- Cents, non-USD, or sealed bids.
- A native newsletter composer / ESP. This product is the auction, not the mailer.

---

## 3. Listing

A listing is exactly:

| Field | Rule |
|---|---|
| Sponsor URL | `http` or `https`. Canonicalized (see §6). Identity key with issue date. |
| One-line blurb | 1–120 characters, single line, no URLs, English UI copy. Trimmed. |
| Issue date | `YYYY-MM-DD` (UTC calendar date of the issue being auctioned). |

v1: sponsors do not pick an arbitrary date. The **open issue** stamps `issueDate`. Only the open issue accepts new bids or raises.

Identity: `(canonicalSponsorUrl, issueDate)` is unique. A second submit of the same URL on the same issue is a **raise**, not a second row.

No company name, logo, or extra creative in v1. The cover slot is the ranked listing: blurb + cleaned URL + bid.

---

## 4. Auction mechanics (normative)

Currency is **USD**. Amounts are **integers** (whole dollars). Reject cents and non-integers.

| Rule | Requirement |
|---|---|
| Minimum | First bid on a listing ≥ **$5**. |
| Maximum | Bid ≤ **$10,000**. |
| Rank | `ORDER BY bid_usd DESC, created_at ASC`. |
| Ties | Older `created_at` wins the higher rank. Never break ties with blurb, URL, or clicks. |
| Below #1 | Still listed. Rank is whatever that bid occupies. |
| Raise | Same canonical URL + same issue. `new_bid > current_bid`. Charge `new_bid - current_bid` only. `created_at` does **not** change. |
| Unpaid | A Polar checkout that is not paid must not change bid or rank. |
| Withdraw | Not in v1. Paid bids stay until the issue closes. |
| #1 | At close, rank 1 is the issue cover / first slot. Readers may still see the full frozen board. |

There is no reserve, no soft-close sniping extension, and no bid increments other than “any whole dollar above current (or ≥ $5 on first bid).”

---

## 5. Issues and cadence

An **issue** is one auction window that ends in one cover.

| Field | Rule |
|---|---|
| `issueDate` | UTC date the issue is identified by (cover date). |
| Cadence | **Weekly** default. Empty issues close at `issueDate 00:00:00 UTC`. Occupied live rank is the **rolling last 7 days** from paid placement (`createdAt`). Not Monday 00:00 UTC. Not a 24h lock on #1. |
| Open issue | The next `issueDate` strictly after `now` (UTC). Exactly one open issue accepts bids. |
| Close | Occupied: freeze when every paid placement is outside the rolling last-7-days window. Empty: freeze at `issueDate 00:00:00 UTC`. Winner (rank 1) is issue #1. Do not accept bids or raises after close. |
| Next | Opening the following weekly `issueDate` is automatic. Empty open boards are allowed. |
| Empty close | If the issue has zero **paid** listings, there is no cover. Archive shows an empty board. Do not invent a winner. |
| Archive | `GET /issue/YYYY-MM-DD` stays readable. Ranking is the close snapshot. |

A process restart must catch up: if `now` is past an open issue’s close and it is not frozen, freeze it before accepting bids on the next issue.

Changing cadence later is a SPEC change. v1 does not ship a public “pick daily/weekly” control.

---

## 6. URL hygiene

Before persist, compare, or redirect:

1. Require `http` or `https`. Reject everything else (`javascript:`, `data:`, `mailto:`, …).
2. Drop the fragment.
3. Lowercase host. Strip default ports (`:80`, `:443`).
4. Remove tracking / click-id query keys (at least): `utm_*`, `fbclid`, `gclid`, `gbraid`, `wbraid`, `msclkid`, `mc_eid`, `mc_cid`, `igshid`, `ref`, `ref_`, `ref_src`, `yclid`, `tbclid`, `_ga`, `_gl`.
5. Reject if the host or path is a **chat** surface (at least): `t.me`, `telegram.me`, `wa.me`, `api.whatsapp.com`, `chat.whatsapp.com`, `discord.gg`, `discord.com/invite`, `line.me`, `m.me`.
6. Reject **NSFW** hosts and blurbs via a denylist (adult video/cam/porn terms and known adult hosts). Fail with `rejected_content`. Do not list a redacted teaser.

Canonical form is what is stored, shown, and used as the identity key. Public redirects go to that cleaned URL, never the raw pasted string.

---

## 7. Editor veto (documented, default off)

`EDITOR_VETO` is an optional kill switch for a later admin queue.

| Value | Meaning |
|---|---|
| unset / `0` / anything other than `1` | **v1 default.** Paid listings appear on the public board immediately. No pending state. No admin UI. |
| `1` | Reserved. New paid listings would sit `pending` until an editor approves or rejects. |

**v1 ships veto off.** Do not build the admin approve/reject UI in the launch-path PRs. Turning the flag on without that UI is unsupported. Enabling veto is a later SPEC + BUILD PR, not a silent default.

There is no silent human re-ranking while veto is off. Rank is money.

---

## 8. Payments (Polar)

Money in is **Polar**. Readers never see an API key.

```ts
type PolarPort = {
  createCheckout(input: {
    amountUsd: number        // integer dollars to charge now (full bid or raise difference)
    listingId: string
    successUrl: string
    cancelUrl: string
  }): Promise<{ checkoutId: string; url: string }>
}
```

- Tests and `scripts/test.sh` use a **fixture** Polar adapter. They must not call `polar.sh` / Polar HTTP.
- Live Polar is env-gated: `POLAR_LIVE=1` plus the documented secrets. `POLAR_FIXTURE_ONLY=1` always wins (fixture, even if live is set).
- CI and `scripts/test.sh` must not set `POLAR_LIVE=1` or Polar secrets.
- Apply the bid only after a paid checkout (fixture `complete` in tests; Polar webhook / confirmed checkout live).
- Polar’s processing fee is theirs. This product does not revenue-share the bid with a third marketplace.

No Stripe, no crypto, no invoice-net-30 in v1.

---

## 9. Public clicks

The sponsor URL on the board is a **public** click-through, not a raw outbound `<a href>` to the pasted URL.

- `GET /l/:listingId` increments `clicks` by 1 and **302**s to the cleaned sponsor URL.
- `clicks` is visible on the public board and on archives.
- Clicks do **not** affect rank.
- Missing / unpublished / pending (if veto ever on) listings → 404. Do not redirect to a guessed URL.

---

## 10. Pages

```
GET  /                     public board for the open issue
GET  /issue/:date          board for that issueDate (open or frozen archive)
POST /listings             start a listing or raise (returns Polar checkout URL)
GET  /l/:listingId         public click → 302 cleaned sponsor URL
GET  /about                what this is
GET  /rules                auction rules (this SPEC, human-readable)
GET  /healthz              liveness
```

No account required to read the board, about, or rules. Creating/raising a listing collects whatever Polar needs to take payment; v1 does not add a separate member area.

`/about` states: public auction, rank is the bid, weekly issue, winner is cover #1, no ads, no chat.

`/rules` states: min $5, max $10,000, whole USD, older wins ties, raise = difference, tracking stripped, no chat/NSFW, veto off.

---

## 11. Data model (implementation shape)

```ts
type Issue = {
  issueDate: string          // YYYY-MM-DD UTC
  status: "open" | "closed"
  closedAt: string | null
}

type Listing = {
  id: string
  issueDate: string
  sponsorUrl: string         // canonical, tracking stripped
  blurb: string
  bidUsd: number             // integer, current paid bid
  createdAt: string          // first paid bid; immutable on raise
  clicks: number
  status: "active" | "rejected"
}

type Checkout = {
  id: string
  listingId: string
  amountUsd: number          // charged now (first bid or difference)
  targetBidUsd: number
  polarCheckoutId: string
  status: "pending" | "paid" | "failed"
}
```

`status: "rejected"` is reserved for veto / policy takedown. v1 with veto off does not create `pending` rows.

---

## 12. Acceptance

| # | Case | Expected |
|---|---|---|
| 1 | First paid bid $5 on empty open issue | Lists at rank 1 |
| 2 | Second paid bid $4 | Rejected (`below_minimum`) |
| 3 | Second paid bid $5 on a different URL, later | Rank 2 (older keeps #1) |
| 4 | Second paid bid $6 | New URL is rank 1; first drops to 2 |
| 5 | Same URL raises $5 → $8 | Charge $3; `created_at` unchanged; rank recomputed |
| 6 | Two $10 bids | Older is rank 1 |
| 7 | Paste URL with `?utm_source=x&fbclid=y` | Stored and redirected without those keys |
| 8 | Telegram / WhatsApp / Discord invite URL | `rejected_content`, no row |
| 9 | NSFW URL or blurb | `rejected_content`, no row |
| 10 | Unpaid Polar checkout | Board unchanged |
| 11 | `GET /l/:id` | 302 to cleaned URL; `clicks` +1; public count updates |
| 12 | Occupied issue at Monday 00:00 UTC after a Sunday paid placement | Still live; expires 7 days after paid placement. Not a 24h lock. |
| 13 | Issue close with no paid listings | Empty archive; no invented cover |
| 14 | `GET /about` and `GET /rules` | 200, state min $5, rank=bid, veto off |
| 15 | `EDITOR_VETO` unset | Paid listing visible immediately |

---

## 13. Out of scope / will not do

- On-site chat, comments, or “message the sponsor.”
- NSFW, escort, or weapons creatives. Takedown is remove-the-row, not a warning label.
- Fake star ratings or “readers also liked.”
- Selling the whole issue, a house ad network, or a second slot SKU in v1.
- Turning editor veto on in launch PRs.

---

## 14. Layout

```
/
  SPEC.md
  BUILD.md
  README.md
  CONTRIBUTING.md
  scripts/test.sh
  src/                 # later PRs
  tests/
```

---

## 15. Git collaboration (normative)

Development is GitHub trunk-based. **`main` is always cloneable, buildable, and testable.**

| Rule | Requirement |
|---|---|
| Integration branch | `main` only. No long-lived `develop`. |
| How code lands | Pull request into `main`. No direct push. |
| Required check | GitHub Actions workflow `ci` (job id `ci`) must be green. |
| Local / CI test | `bash scripts/test.sh` — offline, no production secrets. |
| Branch names | `feat/` `fix/` `docs/` `chore/` `test/` + short slug. |
| Merge | Squash. Delete the head branch. |
| Broken `main` | Treat as an incident. Fix on `fix/…` via PR. |

Full process: [CONTRIBUTING.md](./CONTRIBUTING.md).

Implementation plan (stack, modules, PR DAG): [BUILD.md](./BUILD.md).

Until there is an application binary, `scripts/test.sh` still has to pass: contract files exist, SPEC/CONTRIBUTING agree, no tracked secrets. Adding a server means **extending** that script with unit/contract tests. Live Polar calls are optional and must not be required for `main` to stay green.
