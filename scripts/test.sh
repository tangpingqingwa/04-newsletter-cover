#!/usr/bin/env bash
# Offline gate for main. Must exit 0 on a clean clone with no secrets.
# When application code lands, add unit/contract tests here. Do not delete the
# contract checks. Do not require live third-party networks.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

echo "== contract files =="
for f in README.md SPEC.md BUILD.md CONTRIBUTING.md scripts/test.sh; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done

echo "== contributing rules are documented =="
grep -q 'main must always be buildable' CONTRIBUTING.md \
  || grep -q 'main` must always be buildable' CONTRIBUTING.md \
  || fail "CONTRIBUTING.md does not state the main-branch rule"

echo "== SPEC mentions git collaboration =="
grep -q 'Git collaboration' SPEC.md || fail "SPEC.md missing Git collaboration section"

echo "== SPEC auction contract =="
grep -q '\$5' SPEC.md || fail "SPEC.md missing min \$5"
grep -q 'older' SPEC.md || fail "SPEC.md missing older-wins-ties"
grep -q 'difference' SPEC.md || fail "SPEC.md missing raise-pays-difference"
grep -q 'Polar' SPEC.md || fail "SPEC.md missing Polar"
grep -q 'EDITOR_VETO' SPEC.md || fail "SPEC.md missing EDITOR_VETO"
grep -q 'issue date' SPEC.md || fail "SPEC.md missing issue date on listing"
grep -q 'Weekly' SPEC.md || fail "SPEC.md missing weekly cadence"
grep -q 'rejected_content' SPEC.md || fail "SPEC.md missing rejected_content"
grep -q 'utm_' SPEC.md || fail "SPEC.md missing tracking-strip rule"
grep -q '/about' SPEC.md || fail "SPEC.md missing /about"
grep -q '/rules' SPEC.md || fail "SPEC.md missing /rules"
grep -q '/l/' SPEC.md || fail "SPEC.md missing public click path"

echo "== BUILD PR plan through live-smoke =="
grep -qE '^### PR 1:' BUILD.md || fail "BUILD.md missing ### PR 1:"
grep -qE '^### PR 10: live-smoke' BUILD.md || fail "BUILD.md missing ### PR 10: live-smoke"
if grep -Eqi 'POLAR_LIVE=1' .github/workflows/ci.yml 2>/dev/null; then
  fail "CI must not set POLAR_LIVE=1"
fi
if [[ -f .github/workflows/ci.yml ]]; then
  if grep -q 'bash scripts/live-smoke.sh\|scripts/live-smoke.sh' .github/workflows/ci.yml; then
    fail "live-smoke.sh must not be called from Actions"
  fi
fi
if grep -Eq '^\s*(bash )?scripts/live-smoke\.sh' scripts/test.sh; then
  fail "test.sh must not invoke live-smoke.sh"
fi

echo "== no committed secrets =="
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git ls-files | grep -E '(^|/)\.env$|(^|/)id_rsa$|\.pem$|credentials\.json$' >/dev/null; then
    fail "secret-like path is tracked"
  fi
fi

echo "== markdown is UTF-8 text =="
file -b --mime-encoding README.md SPEC.md BUILD.md CONTRIBUTING.md | grep -qiE 'utf-8|us-ascii' \
  || fail "docs are not UTF-8/ASCII"

echo "== skeleton files =="
for f in package.json tsconfig.json src/server.ts src/db.ts \
  src/migrations/001_issues.sql src/migrations/002_listings.sql \
  src/migrations/003_checkouts.sql tests/health.test.ts; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -q 'app.get' src/server.ts || fail "src/server.ts missing GET /healthz route"
grep -q '/healthz' src/server.ts || fail "src/server.ts missing /healthz"
grep -q 'CREATE TABLE issues' src/migrations/001_issues.sql || fail "issues migration missing"
grep -q 'issue_date' src/migrations/001_issues.sql || fail "issues schema missing issue_date"
grep -q 'CREATE TABLE listings' src/migrations/002_listings.sql || fail "listings migration missing"
grep -q 'sponsor_url' src/migrations/002_listings.sql || fail "listings schema missing sponsor_url"
grep -q 'bid_usd' src/migrations/002_listings.sql || fail "listings schema missing bid_usd"
grep -q 'CREATE TABLE checkouts' src/migrations/003_checkouts.sql || fail "checkouts migration missing"
grep -q 'polar_checkout_id' src/migrations/003_checkouts.sql || fail "checkouts schema missing polar_checkout_id"
grep -q 'target_bid_usd' src/migrations/003_checkouts.sql || fail "checkouts schema missing target_bid_usd"

echo "== public board + ranking =="
for f in src/rank.ts src/http/routes/board.ts tests/rank.test.ts; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -q 'bidUsd' src/rank.ts || fail "src/rank.ts missing bidUsd sort"
grep -q 'createdAt' src/rank.ts || fail "src/rank.ts missing createdAt older-wins-ties"
grep -q 'registerBoardRoutes' src/server.ts || fail "src/server.ts missing board routes"
grep -q 'older' tests/rank.test.ts || fail "tests/rank.test.ts missing older-wins-ties"
grep -q 'No paid listings' tests/rank.test.ts || fail "tests/rank.test.ts missing empty board"

echo "== listing create =="
for f in src/listings.ts src/http/routes/listings.ts tests/listings.test.ts; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -q 'sponsorUrl' src/listings.ts || fail "src/listings.ts missing sponsorUrl"
grep -q 'blurb' src/listings.ts || fail "src/listings.ts missing blurb"
grep -q 'issueDate' src/listings.ts || fail "src/listings.ts missing issueDate stamp"
grep -q 'registerListingRoutes' src/server.ts || fail "src/server.ts missing listing routes"
grep -q '/listings' src/http/routes/listings.ts || fail "listing route missing POST /listings"
grep -q 'open issue' tests/listings.test.ts || fail "tests/listings.test.ts missing open-issue stamp"
grep -q 'unique' tests/listings.test.ts || fail "tests/listings.test.ts missing unique (url, issue)"

echo "== polar fixture checkout =="
for f in src/billing/port.ts src/billing/fixture.ts src/billing/create.ts \
  src/http/routes/polar-webhook.ts tests/billing.test.ts; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -q 'createCheckout' src/billing/port.ts || fail "src/billing/port.ts missing createCheckout"
grep -q 'complete' src/billing/fixture.ts || fail "src/billing/fixture.ts missing complete"
grep -q 'createPolar' src/billing/create.ts || fail "src/billing/create.ts missing createPolar"
grep -q 'POLAR_FIXTURE_ONLY' src/billing/create.ts || fail "src/billing/create.ts missing POLAR_FIXTURE_ONLY"
grep -q 'below_minimum' src/billing/create.ts || fail "src/billing/create.ts missing below_minimum"
grep -q 'registerPolarWebhookRoutes' src/server.ts || fail "src/server.ts missing polar webhook routes"
grep -q 'unpaid' tests/billing.test.ts || fail "tests/billing.test.ts missing unpaid checkout"
grep -q 'below_minimum' tests/billing.test.ts || fail "tests/billing.test.ts missing \$4 below_minimum"
grep -q 'POLAR_FIXTURE_ONLY' tests/billing.test.ts || fail "tests/billing.test.ts missing fixture-wins"

echo "== raise pays the difference =="
for f in src/listings.ts tests/raise.test.ts; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -q 'quoteListingBid' src/listings.ts || fail "src/listings.ts missing quoteListingBid"
grep -q 'targetBidUsd - current' src/listings.ts || fail "src/listings.ts missing raise difference"
grep -q 'bid_not_higher' src/listings.ts || fail "src/listings.ts missing non-increasing reject"
grep -q 'createdAt' src/listings.ts || fail "src/listings.ts missing createdAt stability"
grep -q 'bid_not_higher' tests/raise.test.ts || fail "tests/raise.test.ts missing non-increasing reject"
grep -q 'createdAt' tests/raise.test.ts || fail "tests/raise.test.ts missing createdAt"
grep -q 'amountUsd, 3' tests/raise.test.ts || fail "tests/raise.test.ts missing \$5 → \$8 charges \$3"

echo "== url hygiene =="
for f in src/url.ts tests/url.test.ts; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -q 'canonicalizeSponsorUrl' src/url.ts || fail "src/url.ts missing canonicalizeSponsorUrl"
grep -q 'rejected_content' src/url.ts || fail "src/url.ts missing rejected_content"
grep -q 'utm_' src/url.ts || fail "src/url.ts missing utm_ tracking strip"
grep -q 'fbclid' src/url.ts || fail "src/url.ts missing fbclid"
grep -q 't.me' src/url.ts || fail "src/url.ts missing t.me chat host"
grep -q 'redirectTarget' src/url.ts || fail "src/url.ts missing redirectTarget"
grep -q 'canonicalizeSponsorUrl' src/listings.ts || fail "src/listings.ts must use canonicalizeSponsorUrl"
grep -q 'rejected_content' src/listings.ts || fail "src/listings.ts missing rejected_content"
grep -q 'utm_source' tests/url.test.ts || fail "tests/url.test.ts missing tracking strip"
grep -q 'fbclid' tests/url.test.ts || fail "tests/url.test.ts missing fbclid strip"
grep -q 't.me' tests/url.test.ts || fail "tests/url.test.ts missing t.me chat reject"
grep -q 'rejected_content' tests/url.test.ts || fail "tests/url.test.ts missing rejected_content"
grep -q 'redirectTarget' tests/url.test.ts || fail "tests/url.test.ts missing redirect target"
grep -q 'pornhub' tests/url.test.ts || fail "tests/url.test.ts missing NSFW host"

echo "== about and rules =="
for f in src/http/routes/pages.ts tests/pages.test.ts; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -q 'registerPageRoutes' src/server.ts || fail "src/server.ts missing page routes"
grep -q '/about' src/http/routes/pages.ts || fail "pages route missing /about"
grep -q '/rules' src/http/routes/pages.ts || fail "pages route missing /rules"
grep -q '\$5' src/http/routes/pages.ts || fail "rules page missing min \$5"
grep -q 'older' src/http/routes/pages.ts || fail "rules page missing older wins"
grep -q 'difference' src/http/routes/pages.ts || fail "rules page missing raise difference"
grep -q 'veto is off' src/http/routes/pages.ts || fail "rules page missing veto off"
grep -q '/about' tests/pages.test.ts || fail "tests/pages.test.ts missing /about"
grep -q '/rules' tests/pages.test.ts || fail "tests/pages.test.ts missing /rules"
grep -q '\$5' tests/pages.test.ts || fail "tests/pages.test.ts missing min \$5"
grep -q 'older' tests/pages.test.ts || fail "tests/pages.test.ts missing older wins"
grep -q 'difference' tests/pages.test.ts || fail "tests/pages.test.ts missing raise difference"
grep -q 'veto is off' tests/pages.test.ts || fail "tests/pages.test.ts missing veto off"

echo "== public clicks =="
for f in src/http/routes/click.ts tests/click.test.ts; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -q 'registerClickRoutes' src/server.ts || fail "src/server.ts missing click routes"
grep -q '/l/' src/http/routes/click.ts || fail "click route missing GET /l/:id"
grep -q 'redirectTarget' src/http/routes/click.ts || fail "click route missing redirectTarget"
grep -q 'clicks = clicks + 1' src/http/routes/click.ts || fail "click route missing click increment"
grep -q '302' tests/click.test.ts || fail "tests/click.test.ts missing 302"
grep -q 'utm_source' tests/click.test.ts || fail "tests/click.test.ts missing cleaned-URL strip"
grep -q 'fbclid' tests/click.test.ts || fail "tests/click.test.ts missing fbclid strip"
grep -q 'rank' tests/click.test.ts || fail "tests/click.test.ts missing rank-unchanged"
grep -q '404' tests/click.test.ts || fail "tests/click.test.ts missing unknown id 404"
grep -q 'unknown_listing' tests/click.test.ts || fail "tests/click.test.ts missing unknown listing"

echo "== weekly issue cadence =="
for f in src/issues.ts src/close.ts src/week.ts tests/issues.test.ts tests/week.test.ts; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -q 'issueDate 00:00:00 UTC' src/issues.ts || fail "src/issues.ts missing weekly UTC close instant"
grep -q 'nextWeeklyIssueDate' src/issues.ts || fail "src/issues.ts missing nextWeeklyIssueDate"
grep -q 'ROLLING_WEEK_MS' src/week.ts || fail "src/week.ts must export a rolling last-7-days window"
grep -q 'bidInRollingWeek' src/week.ts || fail "src/week.ts must test paid placement against the rolling week"
grep -q 'catchUpIssues' src/close.ts || fail "src/close.ts missing catchUpIssues"
grep -q 'closeIssue' src/close.ts || fail "src/close.ts missing closeIssue"
grep -q 'winner' src/close.ts || fail "src/close.ts missing winner lock"
grep -q 'invented cover' src/close.ts || fail "src/close.ts missing empty-close no-invent"
grep -q 'catchUpIssues' src/server.ts || fail "src/server.ts missing boot catch-up"
grep -q 'weekly UTC close' tests/issues.test.ts || fail "tests/issues.test.ts missing weekly UTC close"
grep -q 'issue #1' tests/issues.test.ts || fail "tests/issues.test.ts missing winner as #1"
grep -q 'invents no cover' tests/issues.test.ts || fail "tests/issues.test.ts missing empty close"
grep -q 'boot catch-up' tests/issues.test.ts || fail "tests/issues.test.ts missing boot catch-up"
grep -q 'frozen' tests/issues.test.ts || fail "tests/issues.test.ts missing archive frozen"

echo "== product UI print masthead =="
for f in src/views/skin.ts tests/product-ui.test.ts; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -qE '^### PR 14: product UI' BUILD.md || fail "BUILD.md missing ### PR 14: product UI"
grep -q 'class="masthead"' src/views/skin.ts || fail "board missing print masthead"
grep -q 'data-issue-status' src/views/skin.ts || fail "board missing OPEN/CLOSED chrome"
grep -q 'Claim #1 for' src/views/skin.ts || fail "board missing Claim #1"
grep -q 'class="amount-field"' src/views/skin.ts || fail "board missing dashed amount field"
grep -q 'underline dashed' src/views/skin.ts || fail "board missing dashed \$amount"
grep -q 'data-bid-step' src/views/skin.ts || fail "board missing ± stepper"
grep -q 'Outbid' src/views/skin.ts || fail "board missing Outbid"
grep -qi 'no cover sold' src/views/skin.ts || fail "empty issue must say no cover sold"
grep -q 'No paid listings on this board' src/views/skin.ts || fail "empty issue must keep honest empty copy"
grep -q 'name="sponsorUrl"' src/views/skin.ts || fail "claim form missing sponsorUrl"
grep -q 'name="blurb"' src/views/skin.ts || fail "claim form missing blurb"
grep -q 'name="bidUsd"' src/views/skin.ts || fail "claim form missing bidUsd"
grep -q 'cover-line' src/views/skin.ts || fail "paid listing must be a cover line"
grep -q '/l/' src/views/skin.ts || fail "cover pitch must hop through /l/:id"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "product UI must not invent subscribers, open rates, or an article list"
fi
grep -q 'data-rank="1"' tests/issues.test.ts || fail "empty archive must assert against data-rank=\"1\", not Claim #1"
grep -q 'no cover sold' tests/product-ui.test.ts || fail "tests/product-ui.test.ts missing no cover sold"
grep -q 'Claim #1 for' tests/product-ui.test.ts || fail "tests/product-ui.test.ts missing Claim #1"
grep -q 'application/x-www-form-urlencoded' tests/product-ui.test.ts || fail "tests/product-ui.test.ts missing form POST"
grep -q 'addContentTypeParser' src/http/routes/listings.ts || fail "listings route missing urlencoded parser"

echo "== first-time sponsor: Claim #1 wins the empty cover =="
grep -qE '^### PR 15: first-time sponsor' BUILD.md || fail "BUILD.md missing ### PR 15: first-time sponsor"
grep -q 'takes #1' src/views/skin.ts || fail "empty open claim must say \$5 takes #1"
grep -q 'data-empty-issue="true"' src/views/skin.ts || fail "empty open claim must mark data-empty-issue"
if ! awk '
  /function renderRack/ { in_rack = 1 }
  in_rack && /board.status === "closed"/ { saw_closed = 1 }
  in_rack && saw_closed && /class="empty-issue"/ { found = 1 }
  END { exit(found ? 0 : 1) }
' src/views/skin.ts; then
  fail "empty-issue slab must stay closed-archive only"
fi
grep -q 'class="claim-note" data-empty-issue="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must put data-empty-issue on the claim note"
grep -q 'class="empty-issue"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must still cover closed empty-issue"
grep -q 'doesNotMatch(body, /class="empty-issue"/)' tests/product-ui.test.ts \
  || fail "open empty / must not render a competing empty-issue slab"
grep -q 'doesNotMatch(html.body, /id="claim"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must drop Claim #1"
grep -q 'empty open cover lets Claim #1 win the eye' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing first-sponsor empty-cover case"
grep -q '\$5 takes #1' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must assert \$5 takes #1 on empty claim"

echo "== first-time reader: closed archive is not the next cover =="
grep -qE '^### PR 16: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 16: first-time reader"
grep -q 'data-open-cover="true"' src/views/skin.ts || fail "closed archive must point to the open cover"
grep -q 'not the next issue' src/views/skin.ts || fail "closed archive must say it is not the next issue"
grep -q 'The next issue' src/views/skin.ts || fail "open board must keep the next-issue pitch"
grep -q 'data-open-cover="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-open-cover"
grep -q 'doesNotMatch(closedEmpty, /goes to whoever pays the most/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not pitch the live next-issue auction"
grep -q 'closed empty archive is not the next open cover' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing closed-vs-open cover case"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "closed-archive UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: occupied open cover is the read =="
grep -qE '^### PR 17: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 17: first-time reader"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "occupied cover rack must mark data-read-cover"
if ! awk '
  /export function renderBoardHtml/ { in_fn = 1 }
  in_fn && /readSoldCover/ { saw_gate = 1 }
  in_fn && saw_gate && /\$\{rack\}/ { saw_rack = 1 }
  in_fn && saw_gate && saw_rack && /\$\{claim\}/ { found = 1 }
  END { exit(found ? 0 : 1) }
' src/views/skin.ts; then
  fail "occupied open / must render the cover rack before Claim #1"
fi
grep -q 'data-read-cover="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-read-cover"
grep -q 'occupied open / lets the sold cover win the eye' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied-open read-cover case"
grep -q 'doesNotMatch(emptyOpen, /data-read-cover/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-read-cover"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "sold-cover UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time sponsor: claim the next cover on occupied open / =="
grep -qE '^### PR 18: first-time sponsor' BUILD.md || fail "BUILD.md missing ### PR 18: first-time sponsor"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "occupied open must mark data-claim-cover"
grep -q 'href="#claim"' src/views/skin.ts || fail "occupied open must hop to #claim"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop must say Claim the next cover"
if ! awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_flag && /board.status === "closed"/ { saw_closed = 1 }
  in_rack && /data-read-cover="true"/ { saw_cover = 1 }
  in_rack && /OCCUPIED_CLAIM_HOP/ { saw_call = 1 }
  in_hop && /data-claim-after-listing="true"/ { saw_after = 1 }
  in_hop && /data-claim-cover="true"/ { found = 1 }
  END { exit(found && saw_closed && saw_cover && saw_call && saw_after ? 0 : 1) }
' src/views/skin.ts; then
  fail "claim hop must be occupied-open only, after Cover · #1"
fi
grep -q 'data-claim-cover="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-claim-cover"
grep -q 'occupied open / names one hop to claim the next cover' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied-open claim-cover hop case"
grep -q 'doesNotMatch(emptyOpen, /data-claim-cover="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-claim-cover"
grep -q 'doesNotMatch(closedOccupied, /data-claim-cover="true"/)' tests/product-ui.test.ts \
  || fail "closed archive must not stamp data-claim-cover"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "claim-cover UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: Cover · #1 is one prize line =="
grep -qE '^### PR 19: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 19: first-time reader"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "sold cover must mark data-cover-prize-line"
grep -q 'Cover · #1' src/views/skin.ts || fail "sold cover must still say Cover · #1"
grep -q 'white-space: nowrap' src/views/skin.ts || fail "Cover · #1 prize line must nowrap"
grep -q 'rank\[data-cover-prize-line\]' src/views/skin.ts || fail "nowrap must target the Cover · #1 prize line"
grep -q 'grid-template-columns: max-content 1fr auto' src/views/skin.ts \
  || fail "sold cover row must give Cover · #1 a single-line track"
if ! awk '
  /function renderPitch/ { in_fn = 1 }
  in_fn && /listing.rank === 1/ { saw_rank = 1 }
  in_fn && saw_rank && /data-cover-prize-line="true"/ { found = 1 }
  END { exit(found ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-cover-prize-line must stamp only rank 1"
fi
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'data-cover-prize-line="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-cover-prize-line"
grep -q 'Cover · #1 is one prize line' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing Cover · #1 prize-line case"
grep -q 'doesNotMatch(emptyOpen, /data-cover-prize-line="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-cover-prize-line"
grep -q 'doesNotMatch(closedEmpty, /data-cover-prize-line="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-cover-prize-line"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "cover prize-line UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time sponsor: empty open / names this issue’s cover =="
grep -qE '^### PR 20: first-time sponsor' BUILD.md || fail "BUILD.md missing ### PR 20: first-time sponsor"
grep -q 'data-cover-prize="true"' src/views/skin.ts || fail "empty open claim must mark data-cover-prize"
grep -q 'this issue’s cover' src/views/skin.ts || fail "empty open claim must name this issue’s cover"
grep -q 'takes #1' src/views/skin.ts || fail "empty open claim must still say \$5 takes #1"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-cover-prize="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-cover-prize"
grep -q 'this issue’s cover' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must name this issue’s cover"
grep -q 'empty open / names this issue' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing empty-cover prize case"
grep -q 'doesNotMatch(occupiedOpen, /data-cover-prize="true"/)' tests/product-ui.test.ts \
  || fail "occupied open / must not stamp data-cover-prize"
grep -q 'doesNotMatch(closedEmpty, /data-cover-prize="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-cover-prize"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "empty-cover claim must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: empty open stand before Claim #1 =="
grep -qE '^### PR 21: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 21: first-time reader"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty open stand must mark data-read-stand"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "empty open stand must use class empty-stand"
grep -q 'This issue’s cover is still open' src/views/skin.ts \
  || fail "empty open stand must say this issue’s cover is still open"
grep -q 'empty-kicker">This issue’s cover' src/views/skin.ts \
  || fail "empty open stand must kick with This issue’s cover"
grep -q 'data-cover-prize="true"' src/views/skin.ts || fail "empty open claim prize mark must stay"
grep -q 'this issue’s cover' src/views/skin.ts || fail "empty open claim must still name this issue’s cover"
if ! awk '
  /function renderClaim/ { in_fn = 1 }
  in_fn && /data-cover-prize="true"/ && /No cover sold/ && /No paid listings on this board/ { found = 1 }
  END { exit(found ? 0 : 1) }
' src/views/skin.ts; then
  fail "empty open claim must keep honest empty copy with the named prize"
fi
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
if ! awk '
  /function renderRack/ { in_rack = 1 }
  in_rack && /board.status === "closed"/ { saw_closed = 1 }
  in_rack && saw_closed && /class="empty-issue"/ { saw_closed_slab = 1 }
  in_rack && /class="empty-stand"/ { saw_open_stand = 1 }
  in_rack && saw_open_stand && /data-read-stand="true"/ { found = 1 }
  END { exit(found && saw_closed_slab ? 0 : 1) }
' src/views/skin.ts; then
  fail "empty-stand must be the open empty folio; empty-issue stays closed-archive only"
fi
if ! awk '
  /export function renderBoardHtml/ { in_fn = 1 }
  in_fn && /readEmptyStand/ { saw_gate = 1 }
  in_fn && saw_gate && /\$\{rack\}/ { saw_rack = 1 }
  in_fn && saw_gate && saw_rack && /\$\{claim\}/ { found = 1 }
  END { exit(found ? 0 : 1) }
' src/views/skin.ts; then
  fail "empty open / must render the stand before Claim #1"
fi
grep -q 'data-read-stand="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-read-stand"
grep -q 'empty open / lets a first-time reader hit the stand before Claim #1' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing empty-stand-first case"
grep -q 'doesNotMatch(occupiedOpen, /data-read-stand/)' tests/product-ui.test.ts \
  || fail "occupied open / must not stamp data-read-stand"
grep -q 'doesNotMatch(closedEmpty, /data-read-stand/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-read-stand"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "empty-stand UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time sponsor: claim after the empty stand =="
grep -qE '^### PR 22: first-time sponsor' BUILD.md || fail "BUILD.md missing ### PR 22: first-time sponsor"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts || fail "empty open stand must mark data-claim-after-stand"
grep -q 'href="#claim"' src/views/skin.ts || fail "empty open stand must hop to #claim"
grep -q 'Claim this issue’s cover' src/views/skin.ts || fail "empty hop must say Claim this issue’s cover"
grep -q 'class="claim-after-stand"' src/views/skin.ts || fail "empty hop must use class claim-after-stand"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty-stand-first must stay"
grep -q 'data-cover-prize="true"' src/views/skin.ts || fail "\$5 takes this issue’s cover must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
if ! awk '
  /function renderRack/ { in_rack = 1 }
  in_rack && /class="empty-stand"/ { saw_stand = 1 }
  in_rack && saw_stand && /data-read-stand="true"/ { saw_read = 1 }
  in_rack && saw_read && /data-claim-after-stand="true"/ { found = 1 }
  END { exit(found ? 0 : 1) }
' src/views/skin.ts; then
  fail "claim-after-stand hop must sit on the empty stand after the stand read"
fi
if ! awk '
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_rack && /data-read-cover="true"/ { saw_cover = 1 }
  in_rack && /OCCUPIED_CLAIM_HOP/ { saw_call = 1 }
  in_hop && /data-claim-after-listing="true"/ { saw_after = 1 }
  in_hop && /data-claim-cover="true"/ { found = 1 }
  END { exit(found && saw_cover && saw_call && saw_after ? 0 : 1) }
' src/views/skin.ts; then
  fail "occupied Claim the next cover hop must stay after Cover · #1"
fi
grep -q 'data-claim-after-stand="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-claim-after-stand"
grep -q 'empty open / names one hop to claim after the stand' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing claim-after-stand hop case"
grep -q 'doesNotMatch(occupiedOpen, /data-claim-after-stand/)' tests/product-ui.test.ts \
  || fail "occupied open / must not stamp data-claim-after-stand"
grep -q 'doesNotMatch(closedEmpty, /data-claim-after-stand/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-claim-after-stand"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "claim-after-stand UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: occupied sold cover is certain =="
grep -qE '^### PR 23: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 23: first-time reader"
grep -q 'data-sold-cover="true"' src/views/skin.ts || fail "occupied open flag must mark data-sold-cover"
grep -q 'This issue’s cover is sold' src/views/skin.ts || fail "occupied open flag must say this issue’s cover is sold"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty-stand-first must stay"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts || fail "claim-after-stand hop must stay"
grep -q 'The next issue' src/views/skin.ts || fail "empty open board must keep the next-issue pitch"
if ! awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_flag && /board.status === "closed"/ { saw_closed = 1 }
  in_flag && /listings.length > 0/ { saw_occupied = 1 }
  in_flag && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_hop && saw_sold && /data-claim-cover="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "sold-cover mark must sit on the occupied-open flag before Claim the next cover"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /The next issue/ { saw_next = 1 }
  in_fn && saw_next && /data-sold-cover="true"/ { leaked = 1 }
  END { exit(leaked ? 1 : (saw_next ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty open flag must keep the next-issue pitch and must not stamp data-sold-cover"
fi
grep -q 'data-sold-cover="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-sold-cover"
grep -q 'occupied open / names the sold cover before Claim the next cover' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied sold-cover certainty case"
grep -q 'doesNotMatch(emptyOpen, /data-sold-cover="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-sold-cover"
grep -q 'doesNotMatch(closedEmpty, /data-sold-cover="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-sold-cover"
grep -q 'doesNotMatch(closedOccupied, /data-sold-cover="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-sold-cover"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "sold-cover certainty UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time sponsor: claim after the sold cover =="
grep -qE '^### PR 24: first-time sponsor' BUILD.md || fail "BUILD.md missing ### PR 24: first-time sponsor"
grep -q 'data-claim-after-sold="true"' src/views/skin.ts || fail "occupied claim hop must mark data-claim-after-sold"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-sold-cover="true"' src/views/skin.ts || fail "sold-cover name must stay"
grep -q 'This issue’s cover is sold' src/views/skin.ts || fail "occupied flag must still say this issue’s cover is sold"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty-stand-first must stay"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts || fail "claim-after-stand hop must stay"
grep -q 'a\[data-claim-after-sold\]' src/views/skin.ts || fail "occupied claim hop must concentrate on the existing #claim hop after the listing"
if ! awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_flag && /board.status === "closed"/ { saw_closed = 1 }
  in_flag && /listings.length > 0/ { saw_occupied = 1 }
  in_flag && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_hop && saw_sold && /data-claim-cover="true"/ { saw_claim = 1 }
  in_hop && saw_claim && /data-claim-after-sold="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-claim-after-sold must concentrate the existing occupied-open Claim the next cover hop after the sold-cover line"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "occupied claim after sold must not add another #claim hop in the flag"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /The next issue/ { saw_next = 1 }
  in_fn && saw_next && /data-claim-after-sold/ { leaked = 1 }
  END { exit(leaked ? 1 : (saw_next ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty open flag must keep the next-issue pitch and must not stamp data-claim-after-sold"
fi
grep -q 'data-claim-after-sold="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-claim-after-sold"
grep -q 'occupied open / concentrates Claim the next cover after the sold cover' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied claim-after-sold case"
grep -q 'doesNotMatch(emptyOpen, /data-claim-after-sold="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-claim-after-sold"
grep -q 'doesNotMatch(closedEmpty, /data-claim-after-sold="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-claim-after-sold"
grep -q 'doesNotMatch(closedOccupied, /data-claim-after-sold="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-claim-after-sold"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "claim-after-sold UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: read after Claim the next cover is concentrated =="
grep -qE '^### PR 25: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 25: first-time reader"
grep -q 'data-read-after-claim-sold="true"' src/views/skin.ts || fail "occupied sold-cover read must mark data-read-after-claim-sold"
grep -q 'data-sold-cover="true"' src/views/skin.ts || fail "sold-cover name must stay"
grep -q 'This issue’s cover is sold' src/views/skin.ts || fail "occupied flag must still say this issue’s cover is sold"
grep -q 'data-claim-after-sold="true"' src/views/skin.ts || fail "claim-after-sold hop must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty-stand-first must stay"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts || fail "claim-after-stand hop must stay"
grep -q '\[data-read-after-claim-sold\]' src/views/skin.ts \
  || fail "occupied sold-cover read must concentrate on the existing sold-cover span"
if ! awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_flag && /board.status === "closed"/ { saw_closed = 1 }
  in_flag && /listings.length > 0/ { saw_occupied = 1 }
  in_flag && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_flag && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_hop && saw_read && /data-claim-cover="true"/ { saw_claim = 1 }
  in_hop && saw_claim && /data-claim-after-sold="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-read-after-claim-sold must concentrate the existing occupied-open sold-cover line before Claim the next cover"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "sold-cover read after claim must not add another #claim hop in the flag"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /The next issue/ { saw_next = 1 }
  in_fn && saw_next && /data-read-after-claim-sold/ { leaked = 1 }
  END { exit(leaked ? 1 : (saw_next ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty open flag must keep the next-issue pitch and must not stamp data-read-after-claim-sold"
fi
grep -q 'data-read-after-claim-sold="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-read-after-claim-sold"
grep -q 'occupied open / concentrates the sold-cover read after Claim the next cover' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied sold-cover read-after-claim case"
grep -q 'doesNotMatch(emptyOpen, /data-read-after-claim-sold="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-read-after-claim-sold"
grep -q 'doesNotMatch(closedEmpty, /data-read-after-claim-sold="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-read-after-claim-sold"
grep -q 'doesNotMatch(closedOccupied, /data-read-after-claim-sold="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-read-after-claim-sold"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "read-after-claim-sold UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time sponsor: claim after the sold-cover read is concentrated =="
grep -qE '^### PR 26: first-time sponsor' BUILD.md || fail "BUILD.md missing ### PR 26: first-time sponsor"
grep -q 'data-claim-after-read-sold="true"' src/views/skin.ts || fail "occupied claim hop must mark data-claim-after-read-sold"
grep -q 'data-claim-after-sold="true"' src/views/skin.ts || fail "claim-after-sold hop must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-sold-cover="true"' src/views/skin.ts || fail "sold-cover name must stay"
grep -q 'This issue’s cover is sold' src/views/skin.ts || fail "occupied flag must still say this issue’s cover is sold"
grep -q 'data-read-after-claim-sold="true"' src/views/skin.ts || fail "sold-cover read-after-claim must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty-stand-first must stay"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts || fail "claim-after-stand hop must stay"
grep -q 'a\[data-claim-after-read-sold\]' src/views/skin.ts \
  || fail "occupied claim hop must concentrate on the existing #claim hop after the listing after the sold-cover read"
if ! awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_flag && /board.status === "closed"/ { saw_closed = 1 }
  in_flag && /listings.length > 0/ { saw_occupied = 1 }
  in_flag && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_flag && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_hop && saw_read && /data-claim-cover="true"/ { saw_claim = 1 }
  in_hop && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_hop && saw_after_sold && /data-claim-after-read-sold="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-claim-after-read-sold must concentrate the existing occupied-open Claim the next cover hop after the sold-cover read"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "claim after the sold-cover read must not add another #claim hop in the flag"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /The next issue/ { saw_next = 1 }
  in_fn && saw_next && /data-claim-after-read-sold/ { leaked = 1 }
  END { exit(leaked ? 1 : (saw_next ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty open flag must keep the next-issue pitch and must not stamp data-claim-after-read-sold"
fi
grep -q 'data-claim-after-read-sold="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-claim-after-read-sold"
grep -q 'occupied open / concentrates Claim the next cover after the sold-cover read' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied claim-after-read-sold case"
grep -q 'doesNotMatch(emptyOpen, /data-claim-after-read-sold="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-claim-after-read-sold"
grep -q 'doesNotMatch(closedEmpty, /data-claim-after-read-sold="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-claim-after-read-sold"
grep -q 'doesNotMatch(closedOccupied, /data-claim-after-read-sold="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-claim-after-read-sold"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "claim-after-read-sold UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: read after Claim the next cover is re-concentrated =="
grep -qE '^### PR 27: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 27: first-time reader"
grep -q 'data-read-after-claim-two="true"' src/views/skin.ts || fail "occupied sold-cover read must mark data-read-after-claim-two"
grep -q 'data-read-after-claim-sold="true"' src/views/skin.ts || fail "sold-cover read-after-claim must stay"
grep -q 'data-sold-cover="true"' src/views/skin.ts || fail "sold-cover name must stay"
grep -q 'This issue’s cover is sold' src/views/skin.ts || fail "occupied flag must still say this issue’s cover is sold"
grep -q 'data-claim-after-read-sold="true"' src/views/skin.ts || fail "claim-after-read-sold hop must stay"
grep -q 'data-claim-after-sold="true"' src/views/skin.ts || fail "claim-after-sold hop must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty-stand-first must stay"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts || fail "claim-after-stand hop must stay"
grep -q '\[data-read-after-claim-two\]' src/views/skin.ts \
  || fail "occupied sold-cover read must re-concentrate on the existing sold-cover span"
if ! awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_flag && /board.status === "closed"/ { saw_closed = 1 }
  in_flag && /listings.length > 0/ { saw_occupied = 1 }
  in_flag && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_flag && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_flag && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_hop && saw_two && /data-claim-cover="true"/ { saw_claim = 1 }
  in_hop && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_hop && saw_after_sold && /data-claim-after-read-sold="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-read-after-claim-two must re-concentrate the existing occupied-open sold-cover line before Claim the next cover"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "sold-cover read after claim is re-concentrated must not add another #claim hop in the flag"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /The next issue/ { saw_next = 1 }
  in_fn && saw_next && /data-read-after-claim-two/ { leaked = 1 }
  END { exit(leaked ? 1 : (saw_next ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty open flag must keep the next-issue pitch and must not stamp data-read-after-claim-two"
fi
grep -q 'data-read-after-claim-two="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-read-after-claim-two"
grep -q 'occupied open / concentrates the sold-cover read after Claim is re-concentrated' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied sold-cover read-after-claim-two case"
grep -q 'doesNotMatch(emptyOpen, /data-read-after-claim-two="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-read-after-claim-two"
grep -q 'doesNotMatch(closedEmpty, /data-read-after-claim-two="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-read-after-claim-two"
grep -q 'doesNotMatch(closedOccupied, /data-read-after-claim-two="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-read-after-claim-two"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "read-after-claim-two UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time sponsor: claim after the sold-cover read is re-concentrated =="
grep -qE '^### PR 28: first-time sponsor' BUILD.md || fail "BUILD.md missing ### PR 28: first-time sponsor"
grep -q 'data-claim-after-read-two="true"' src/views/skin.ts || fail "occupied claim hop must mark data-claim-after-read-two"
grep -q 'data-claim-after-read-sold="true"' src/views/skin.ts || fail "claim-after-read-sold hop must stay"
grep -q 'data-claim-after-sold="true"' src/views/skin.ts || fail "claim-after-sold hop must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-sold-cover="true"' src/views/skin.ts || fail "sold-cover name must stay"
grep -q 'This issue’s cover is sold' src/views/skin.ts || fail "occupied flag must still say this issue’s cover is sold"
grep -q 'data-read-after-claim-two="true"' src/views/skin.ts || fail "sold-cover read-after-claim-two must stay"
grep -q 'data-read-after-claim-sold="true"' src/views/skin.ts || fail "sold-cover read-after-claim must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty-stand-first must stay"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts || fail "claim-after-stand hop must stay"
grep -q 'a\[data-claim-after-read-two\]' src/views/skin.ts \
  || fail "occupied claim hop must re-concentrate on the existing flag link after the sold-cover read"
if ! awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_flag && /board.status === "closed"/ { saw_closed = 1 }
  in_flag && /listings.length > 0/ { saw_occupied = 1 }
  in_flag && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_flag && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_flag && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_hop && saw_two && /data-claim-cover="true"/ { saw_claim = 1 }
  in_hop && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_hop && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_hop && saw_after_read && /data-claim-after-read-two="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-claim-after-read-two must re-concentrate the existing occupied-open Claim the next cover hop after the sold-cover read"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "claim after the sold-cover read is re-concentrated must not add another #claim hop in the flag"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /The next issue/ { saw_next = 1 }
  in_fn && saw_next && /data-claim-after-read-two/ { leaked = 1 }
  END { exit(leaked ? 1 : (saw_next ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty open flag must keep the next-issue pitch and must not stamp data-claim-after-read-two"
fi
grep -q 'data-claim-after-read-two="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-claim-after-read-two"
grep -q 'occupied open / concentrates Claim the next cover after the sold-cover read is re-concentrated' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied claim-after-read-two case"
grep -q 'doesNotMatch(emptyOpen, /data-claim-after-read-two="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-claim-after-read-two"
grep -q 'doesNotMatch(closedEmpty, /data-claim-after-read-two="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-claim-after-read-two"
grep -q 'doesNotMatch(closedOccupied, /data-claim-after-read-two="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-claim-after-read-two"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "claim-after-read-two UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: read after Claim the next cover is re-concentrated again =="
grep -qE '^### PR 29: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 29: first-time reader"
grep -q 'data-read-after-claim-three="true"' src/views/skin.ts || fail "occupied sold-cover read must mark data-read-after-claim-three"
grep -q 'data-read-after-claim-two="true"' src/views/skin.ts || fail "sold-cover read-after-claim-two must stay"
grep -q 'data-read-after-claim-sold="true"' src/views/skin.ts || fail "sold-cover read-after-claim must stay"
grep -q 'data-sold-cover="true"' src/views/skin.ts || fail "sold-cover name must stay"
grep -q 'This issue’s cover is sold' src/views/skin.ts || fail "occupied flag must still say this issue’s cover is sold"
grep -q 'data-claim-after-read-two="true"' src/views/skin.ts || fail "claim-after-read-two hop must stay"
grep -q 'data-claim-after-read-sold="true"' src/views/skin.ts || fail "claim-after-read-sold hop must stay"
grep -q 'data-claim-after-sold="true"' src/views/skin.ts || fail "claim-after-sold hop must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty-stand-first must stay"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts || fail "claim-after-stand hop must stay"
grep -q '\[data-read-after-claim-three\]' src/views/skin.ts \
  || fail "occupied sold-cover read must concentrate again on the existing sold-cover span"
if ! awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_flag && /board.status === "closed"/ { saw_closed = 1 }
  in_flag && /listings.length > 0/ { saw_occupied = 1 }
  in_flag && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_flag && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_flag && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_flag && saw_two && /data-read-after-claim-three="true"/ { saw_three = 1 }
  in_hop && saw_three && /data-claim-cover="true"/ { saw_claim = 1 }
  in_hop && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_hop && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_hop && saw_after_read && /data-claim-after-read-two="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-read-after-claim-three must concentrate the existing occupied-open sold-cover line before Claim the next cover"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "sold-cover read after claim is re-concentrated again must not add another #claim hop in the flag"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /The next issue/ { saw_next = 1 }
  in_fn && saw_next && /data-read-after-claim-three/ { leaked = 1 }
  END { exit(leaked ? 1 : (saw_next ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty open flag must keep the next-issue pitch and must not stamp data-read-after-claim-three"
fi
grep -q 'data-read-after-claim-three="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-read-after-claim-three"
grep -q 'occupied open / concentrates the sold-cover read after Claim is re-concentrated again' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied sold-cover read-after-claim-three case"
grep -q 'doesNotMatch(emptyOpen, /data-read-after-claim-three="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-read-after-claim-three"
grep -q 'doesNotMatch(closedEmpty, /data-read-after-claim-three="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-read-after-claim-three"
grep -q 'doesNotMatch(closedOccupied, /data-read-after-claim-three="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-read-after-claim-three"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "read-after-claim-three UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time sponsor: claim after the sold-cover read is re-concentrated again =="
grep -qE '^### PR 30: first-time sponsor' BUILD.md || fail "BUILD.md missing ### PR 30: first-time sponsor"
grep -q 'data-claim-after-read-three="true"' src/views/skin.ts || fail "occupied claim hop must mark data-claim-after-read-three"
grep -q 'data-claim-after-read-two="true"' src/views/skin.ts || fail "claim-after-read-two hop must stay"
grep -q 'data-claim-after-read-sold="true"' src/views/skin.ts || fail "claim-after-read-sold hop must stay"
grep -q 'data-claim-after-sold="true"' src/views/skin.ts || fail "claim-after-sold hop must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-sold-cover="true"' src/views/skin.ts || fail "sold-cover name must stay"
grep -q 'This issue’s cover is sold' src/views/skin.ts || fail "occupied flag must still say this issue’s cover is sold"
grep -q 'data-read-after-claim-three="true"' src/views/skin.ts || fail "sold-cover read-after-claim-three must stay"
grep -q 'data-read-after-claim-two="true"' src/views/skin.ts || fail "sold-cover read-after-claim-two must stay"
grep -q 'data-read-after-claim-sold="true"' src/views/skin.ts || fail "sold-cover read-after-claim must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty-stand-first must stay"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts || fail "claim-after-stand hop must stay"
grep -q 'a\[data-claim-after-read-three\]' src/views/skin.ts \
  || fail "occupied claim hop must concentrate again on the existing flag link after the sold-cover read"
if ! awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_flag && /board.status === "closed"/ { saw_closed = 1 }
  in_flag && /listings.length > 0/ { saw_occupied = 1 }
  in_flag && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_flag && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_flag && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_flag && saw_two && /data-read-after-claim-three="true"/ { saw_three = 1 }
  in_hop && saw_three && /data-claim-cover="true"/ { saw_claim = 1 }
  in_hop && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_hop && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_hop && saw_after_read && /data-claim-after-read-two="true"/ { saw_after_two = 1 }
  in_hop && saw_after_two && /data-claim-after-read-three="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-claim-after-read-three must concentrate the existing occupied-open Claim the next cover hop after the sold-cover read"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "claim after the sold-cover read is re-concentrated again must not add another #claim hop in the flag"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /The next issue/ { saw_next = 1 }
  in_fn && saw_next && /data-claim-after-read-three/ { leaked = 1 }
  END { exit(leaked ? 1 : (saw_next ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty open flag must keep the next-issue pitch and must not stamp data-claim-after-read-three"
fi
grep -q 'data-claim-after-read-three="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-claim-after-read-three"
grep -q 'occupied open / concentrates Claim the next cover after the sold-cover read is re-concentrated again' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied claim-after-read-three case"
grep -q 'doesNotMatch(emptyOpen, /data-claim-after-read-three="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-claim-after-read-three"
grep -q 'doesNotMatch(closedEmpty, /data-claim-after-read-three="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-claim-after-read-three"
grep -q 'doesNotMatch(closedOccupied, /data-claim-after-read-three="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-claim-after-read-three"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "claim-after-read-three UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: read after Claim the next cover is re-concentrated a fourth time =="
grep -qE '^### PR 31: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 31: first-time reader"
grep -q 'data-read-after-claim-four="true"' src/views/skin.ts || fail "occupied sold-cover read must mark data-read-after-claim-four"
grep -q 'data-read-after-claim-three="true"' src/views/skin.ts || fail "sold-cover read-after-claim-three must stay"
grep -q 'data-read-after-claim-two="true"' src/views/skin.ts || fail "sold-cover read-after-claim-two must stay"
grep -q 'data-read-after-claim-sold="true"' src/views/skin.ts || fail "sold-cover read-after-claim must stay"
grep -q 'data-sold-cover="true"' src/views/skin.ts || fail "sold-cover name must stay"
grep -q 'This issue’s cover is sold' src/views/skin.ts || fail "occupied flag must still say this issue’s cover is sold"
grep -q 'data-claim-after-read-three="true"' src/views/skin.ts || fail "claim-after-read-three hop must stay"
grep -q 'data-claim-after-read-two="true"' src/views/skin.ts || fail "claim-after-read-two hop must stay"
grep -q 'data-claim-after-read-sold="true"' src/views/skin.ts || fail "claim-after-read-sold hop must stay"
grep -q 'data-claim-after-sold="true"' src/views/skin.ts || fail "claim-after-sold hop must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty-stand-first must stay"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts || fail "claim-after-stand hop must stay"
grep -q '\[data-read-after-claim-four\]' src/views/skin.ts \
  || fail "occupied sold-cover read must concentrate a fourth time on the existing sold-cover span"
if ! awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_flag && /board.status === "closed"/ { saw_closed = 1 }
  in_flag && /listings.length > 0/ { saw_occupied = 1 }
  in_flag && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_flag && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_flag && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_flag && saw_two && /data-read-after-claim-three="true"/ { saw_three = 1 }
  in_flag && saw_three && /data-read-after-claim-four="true"/ { saw_four = 1 }
  in_hop && saw_four && /data-claim-cover="true"/ { saw_claim = 1 }
  in_hop && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_hop && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_hop && saw_after_read && /data-claim-after-read-two="true"/ { saw_after_two = 1 }
  in_hop && saw_after_two && /data-claim-after-read-three="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-read-after-claim-four must concentrate the existing occupied-open sold-cover line before Claim the next cover"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "sold-cover read after claim is re-concentrated a fourth time must not add another #claim hop in the flag"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /The next issue/ { saw_next = 1 }
  in_fn && saw_next && /data-read-after-claim-four/ { leaked = 1 }
  END { exit(leaked ? 1 : (saw_next ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty open flag must keep the next-issue pitch and must not stamp data-read-after-claim-four"
fi
grep -q 'data-read-after-claim-four="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-read-after-claim-four"
grep -q 'occupied open / concentrates the sold-cover read after Claim is re-concentrated a fourth time' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied sold-cover read-after-claim-four case"
grep -q 'doesNotMatch(emptyOpen, /data-read-after-claim-four="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-read-after-claim-four"
grep -q 'doesNotMatch(closedEmpty, /data-read-after-claim-four="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-read-after-claim-four"
grep -q 'doesNotMatch(closedOccupied, /data-read-after-claim-four="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-read-after-claim-four"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "read-after-claim-four UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time sponsor: claim after the sold-cover read is re-concentrated a fourth time =="
grep -qE '^### PR 32: first-time sponsor' BUILD.md || fail "BUILD.md missing ### PR 32: first-time sponsor"
grep -q 'data-claim-after-read-four="true"' src/views/skin.ts || fail "occupied claim hop must mark data-claim-after-read-four"
grep -q 'data-claim-after-read-three="true"' src/views/skin.ts || fail "claim-after-read-three hop must stay"
grep -q 'data-claim-after-read-two="true"' src/views/skin.ts || fail "claim-after-read-two hop must stay"
grep -q 'data-claim-after-read-sold="true"' src/views/skin.ts || fail "claim-after-read-sold hop must stay"
grep -q 'data-claim-after-sold="true"' src/views/skin.ts || fail "claim-after-sold hop must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-sold-cover="true"' src/views/skin.ts || fail "sold-cover name must stay"
grep -q 'This issue’s cover is sold' src/views/skin.ts || fail "occupied flag must still say this issue’s cover is sold"
grep -q 'data-read-after-claim-four="true"' src/views/skin.ts || fail "sold-cover read-after-claim-four must stay"
grep -q 'data-read-after-claim-three="true"' src/views/skin.ts || fail "sold-cover read-after-claim-three must stay"
grep -q 'data-read-after-claim-two="true"' src/views/skin.ts || fail "sold-cover read-after-claim-two must stay"
grep -q 'data-read-after-claim-sold="true"' src/views/skin.ts || fail "sold-cover read-after-claim must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty-stand-first must stay"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts || fail "claim-after-stand hop must stay"
grep -q 'a\[data-claim-after-read-four\]' src/views/skin.ts \
  || fail "occupied claim hop must concentrate a fourth time on the existing flag link after the sold-cover read"
if ! awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_flag && /board.status === "closed"/ { saw_closed = 1 }
  in_flag && /listings.length > 0/ { saw_occupied = 1 }
  in_flag && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_flag && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_flag && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_flag && saw_two && /data-read-after-claim-three="true"/ { saw_three = 1 }
  in_flag && saw_three && /data-read-after-claim-four="true"/ { saw_four = 1 }
  in_hop && saw_four && /data-claim-cover="true"/ { saw_claim = 1 }
  in_hop && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_hop && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_hop && saw_after_read && /data-claim-after-read-two="true"/ { saw_after_two = 1 }
  in_hop && saw_after_two && /data-claim-after-read-three="true"/ { saw_after_three = 1 }
  in_hop && saw_after_three && /data-claim-after-read-four="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-claim-after-read-four must concentrate the existing occupied-open Claim the next cover hop after the sold-cover read"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "claim after the sold-cover read is re-concentrated a fourth time must not add another #claim hop in the flag"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /The next issue/ { saw_next = 1 }
  in_fn && saw_next && /data-claim-after-read-four/ { leaked = 1 }
  END { exit(leaked ? 1 : (saw_next ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty open flag must keep the next-issue pitch and must not stamp data-claim-after-read-four"
fi
grep -q 'data-claim-after-read-four="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-claim-after-read-four"
grep -q 'occupied open / concentrates Claim the next cover after the sold-cover read is re-concentrated a fourth time' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied claim-after-read-four case"
grep -q 'doesNotMatch(emptyOpen, /data-claim-after-read-four="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-claim-after-read-four"
grep -q 'doesNotMatch(closedEmpty, /data-claim-after-read-four="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-claim-after-read-four"
grep -q 'doesNotMatch(closedOccupied, /data-claim-after-read-four="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-claim-after-read-four"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "claim-after-read-four UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: read after Claim the next cover is re-concentrated a fifth time =="
grep -qE '^### PR 33: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 33: first-time reader"
grep -q 'data-read-after-claim-five="true"' src/views/skin.ts || fail "occupied sold-cover read must mark data-read-after-claim-five"
grep -q 'data-read-after-claim-four="true"' src/views/skin.ts || fail "sold-cover read-after-claim-four must stay"
grep -q 'data-read-after-claim-three="true"' src/views/skin.ts || fail "sold-cover read-after-claim-three must stay"
grep -q 'data-read-after-claim-two="true"' src/views/skin.ts || fail "sold-cover read-after-claim-two must stay"
grep -q 'data-read-after-claim-sold="true"' src/views/skin.ts || fail "sold-cover read-after-claim must stay"
grep -q 'data-sold-cover="true"' src/views/skin.ts || fail "sold-cover name must stay"
grep -q 'This issue’s cover is sold' src/views/skin.ts || fail "occupied flag must still say this issue’s cover is sold"
grep -q 'data-claim-after-read-four="true"' src/views/skin.ts || fail "claim-after-read-four hop must stay"
grep -q 'data-claim-after-read-three="true"' src/views/skin.ts || fail "claim-after-read-three hop must stay"
grep -q 'data-claim-after-read-two="true"' src/views/skin.ts || fail "claim-after-read-two hop must stay"
grep -q 'data-claim-after-read-sold="true"' src/views/skin.ts || fail "claim-after-read-sold hop must stay"
grep -q 'data-claim-after-sold="true"' src/views/skin.ts || fail "claim-after-sold hop must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty-stand-first must stay"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts || fail "claim-after-stand hop must stay"
grep -q '\[data-read-after-claim-five\]' src/views/skin.ts \
  || fail "occupied sold-cover read must concentrate a fifth time on the existing sold-cover span"
if ! awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_flag && /board.status === "closed"/ { saw_closed = 1 }
  in_flag && /listings.length > 0/ { saw_occupied = 1 }
  in_flag && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_flag && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_flag && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_flag && saw_two && /data-read-after-claim-three="true"/ { saw_three = 1 }
  in_flag && saw_three && /data-read-after-claim-four="true"/ { saw_four = 1 }
  in_flag && saw_four && /data-read-after-claim-five="true"/ { saw_five = 1 }
  in_hop && saw_five && /data-claim-cover="true"/ { saw_claim = 1 }
  in_hop && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_hop && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_hop && saw_after_read && /data-claim-after-read-two="true"/ { saw_after_two = 1 }
  in_hop && saw_after_two && /data-claim-after-read-three="true"/ { saw_after_three = 1 }
  in_hop && saw_after_three && /data-claim-after-read-four="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-read-after-claim-five must concentrate the existing occupied-open sold-cover line before Claim the next cover"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "sold-cover read after claim is re-concentrated a fifth time must not add another #claim hop in the flag"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /The next issue/ { saw_next = 1 }
  in_fn && saw_next && /data-read-after-claim-five/ { leaked = 1 }
  END { exit(leaked ? 1 : (saw_next ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty open flag must keep the next-issue pitch and must not stamp data-read-after-claim-five"
fi
grep -q 'data-read-after-claim-five="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-read-after-claim-five"
grep -q 'occupied open / concentrates the sold-cover read after Claim is re-concentrated a fifth time' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied sold-cover read-after-claim-five case"
grep -q 'doesNotMatch(emptyOpen, /data-read-after-claim-five="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-read-after-claim-five"
grep -q 'doesNotMatch(closedEmpty, /data-read-after-claim-five="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-read-after-claim-five"
grep -q 'doesNotMatch(closedOccupied, /data-read-after-claim-five="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-read-after-claim-five"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "read-after-claim-five UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time sponsor: claim after the sold-cover read is re-concentrated a fifth time =="
grep -qE '^### PR 34: first-time sponsor' BUILD.md || fail "BUILD.md missing ### PR 34: first-time sponsor"
grep -q 'data-claim-after-read-five="true"' src/views/skin.ts || fail "occupied claim hop must mark data-claim-after-read-five"
grep -q 'data-claim-after-read-four="true"' src/views/skin.ts || fail "claim-after-read-four hop must stay"
grep -q 'data-claim-after-read-three="true"' src/views/skin.ts || fail "claim-after-read-three hop must stay"
grep -q 'data-claim-after-read-two="true"' src/views/skin.ts || fail "claim-after-read-two hop must stay"
grep -q 'data-claim-after-read-sold="true"' src/views/skin.ts || fail "claim-after-read-sold hop must stay"
grep -q 'data-claim-after-sold="true"' src/views/skin.ts || fail "claim-after-sold hop must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-sold-cover="true"' src/views/skin.ts || fail "sold-cover name must stay"
grep -q 'This issue’s cover is sold' src/views/skin.ts || fail "occupied flag must still say this issue’s cover is sold"
grep -q 'data-read-after-claim-five="true"' src/views/skin.ts || fail "sold-cover read-after-claim-five must stay"
grep -q 'data-read-after-claim-four="true"' src/views/skin.ts || fail "sold-cover read-after-claim-four must stay"
grep -q 'data-read-after-claim-three="true"' src/views/skin.ts || fail "sold-cover read-after-claim-three must stay"
grep -q 'data-read-after-claim-two="true"' src/views/skin.ts || fail "sold-cover read-after-claim-two must stay"
grep -q 'data-read-after-claim-sold="true"' src/views/skin.ts || fail "sold-cover read-after-claim must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty-stand-first must stay"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts || fail "claim-after-stand hop must stay"
grep -q 'a\[data-claim-after-read-five\]' src/views/skin.ts \
  || fail "occupied claim hop must concentrate a fifth time on the existing flag link after the sold-cover read"
if ! awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_flag && /board.status === "closed"/ { saw_closed = 1 }
  in_flag && /listings.length > 0/ { saw_occupied = 1 }
  in_flag && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_flag && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_flag && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_flag && saw_two && /data-read-after-claim-three="true"/ { saw_three = 1 }
  in_flag && saw_three && /data-read-after-claim-four="true"/ { saw_four = 1 }
  in_flag && saw_four && /data-read-after-claim-five="true"/ { saw_five = 1 }
  in_hop && saw_five && /data-claim-cover="true"/ { saw_claim = 1 }
  in_hop && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_hop && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_hop && saw_after_read && /data-claim-after-read-two="true"/ { saw_after_two = 1 }
  in_hop && saw_after_two && /data-claim-after-read-three="true"/ { saw_after_three = 1 }
  in_hop && saw_after_three && /data-claim-after-read-four="true"/ { saw_after_four = 1 }
  in_hop && saw_after_four && /data-claim-after-read-five="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-claim-after-read-five must concentrate the existing occupied-open Claim the next cover hop after the sold-cover read"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "claim after the sold-cover read is re-concentrated a fifth time must not add another #claim hop in the flag"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /The next issue/ { saw_next = 1 }
  in_fn && saw_next && /data-claim-after-read-five/ { leaked = 1 }
  END { exit(leaked ? 1 : (saw_next ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty open flag must keep the next-issue pitch and must not stamp data-claim-after-read-five"
fi
grep -q 'data-claim-after-read-five="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-claim-after-read-five"
grep -q 'occupied open / concentrates Claim the next cover after the sold-cover read is re-concentrated a fifth time' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied claim-after-read-five case"
grep -q 'doesNotMatch(emptyOpen, /data-claim-after-read-five="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-claim-after-read-five"
grep -q 'doesNotMatch(closedEmpty, /data-claim-after-read-five="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-claim-after-read-five"
grep -q 'doesNotMatch(closedOccupied, /data-claim-after-read-five="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-claim-after-read-five"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "claim-after-read-five UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: read after Claim the next cover is re-concentrated a sixth time =="
grep -qE '^### PR 35: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 35: first-time reader"
grep -q 'data-read-after-claim-six="true"' src/views/skin.ts || fail "occupied sold-cover read must mark data-read-after-claim-six"
grep -q 'data-read-after-claim-five="true"' src/views/skin.ts || fail "sold-cover read-after-claim-five must stay"
grep -q 'data-read-after-claim-four="true"' src/views/skin.ts || fail "sold-cover read-after-claim-four must stay"
grep -q 'data-read-after-claim-three="true"' src/views/skin.ts || fail "sold-cover read-after-claim-three must stay"
grep -q 'data-read-after-claim-two="true"' src/views/skin.ts || fail "sold-cover read-after-claim-two must stay"
grep -q 'data-read-after-claim-sold="true"' src/views/skin.ts || fail "sold-cover read-after-claim must stay"
grep -q 'data-sold-cover="true"' src/views/skin.ts || fail "sold-cover name must stay"
grep -q 'This issue’s cover is sold' src/views/skin.ts || fail "occupied flag must still say this issue’s cover is sold"
grep -q 'data-claim-after-read-five="true"' src/views/skin.ts || fail "claim-after-read-five hop must stay"
grep -q 'data-claim-after-read-four="true"' src/views/skin.ts || fail "claim-after-read-four hop must stay"
grep -q 'data-claim-after-read-three="true"' src/views/skin.ts || fail "claim-after-read-three hop must stay"
grep -q 'data-claim-after-read-two="true"' src/views/skin.ts || fail "claim-after-read-two hop must stay"
grep -q 'data-claim-after-read-sold="true"' src/views/skin.ts || fail "claim-after-read-sold hop must stay"
grep -q 'data-claim-after-sold="true"' src/views/skin.ts || fail "claim-after-sold hop must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty-stand-first must stay"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts || fail "claim-after-stand hop must stay"
grep -q '\[data-read-after-claim-six\]' src/views/skin.ts \
  || fail "occupied sold-cover read must concentrate a sixth time on the existing sold-cover span"
if ! awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_flag && /board.status === "closed"/ { saw_closed = 1 }
  in_flag && /listings.length > 0/ { saw_occupied = 1 }
  in_flag && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_flag && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_flag && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_flag && saw_two && /data-read-after-claim-three="true"/ { saw_three = 1 }
  in_flag && saw_three && /data-read-after-claim-four="true"/ { saw_four = 1 }
  in_flag && saw_four && /data-read-after-claim-five="true"/ { saw_five = 1 }
  in_flag && saw_five && /data-read-after-claim-six="true"/ { saw_six = 1 }
  in_hop && saw_six && /data-claim-cover="true"/ { saw_claim = 1 }
  in_hop && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_hop && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_hop && saw_after_read && /data-claim-after-read-two="true"/ { saw_after_two = 1 }
  in_hop && saw_after_two && /data-claim-after-read-three="true"/ { saw_after_three = 1 }
  in_hop && saw_after_three && /data-claim-after-read-four="true"/ { saw_after_four = 1 }
  in_hop && saw_after_four && /data-claim-after-read-five="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-read-after-claim-six must concentrate the existing occupied-open sold-cover line before Claim the next cover"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "sold-cover read after claim is re-concentrated a sixth time must not add another #claim hop in the flag"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /The next issue/ { saw_next = 1 }
  in_fn && saw_next && /data-read-after-claim-six/ { leaked = 1 }
  END { exit(leaked ? 1 : (saw_next ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty open flag must keep the next-issue pitch and must not stamp data-read-after-claim-six"
fi
grep -q 'data-read-after-claim-six="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-read-after-claim-six"
grep -q 'occupied open / concentrates the sold-cover read after Claim is re-concentrated a sixth time' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied sold-cover read-after-claim-six case"
grep -q 'doesNotMatch(emptyOpen, /data-read-after-claim-six="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-read-after-claim-six"
grep -q 'doesNotMatch(closedEmpty, /data-read-after-claim-six="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-read-after-claim-six"
grep -q 'doesNotMatch(closedOccupied, /data-read-after-claim-six="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-read-after-claim-six"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "read-after-claim-six UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time sponsor: claim after the sold-cover read is re-concentrated a sixth time =="
grep -qE '^### PR 36: first-time sponsor' BUILD.md || fail "BUILD.md missing ### PR 36: first-time sponsor"
grep -q 'data-claim-after-read-six="true"' src/views/skin.ts || fail "occupied claim hop must mark data-claim-after-read-six"
grep -q 'data-claim-after-read-five="true"' src/views/skin.ts || fail "claim-after-read-five hop must stay"
grep -q 'data-claim-after-read-four="true"' src/views/skin.ts || fail "claim-after-read-four hop must stay"
grep -q 'data-claim-after-read-three="true"' src/views/skin.ts || fail "claim-after-read-three hop must stay"
grep -q 'data-claim-after-read-two="true"' src/views/skin.ts || fail "claim-after-read-two hop must stay"
grep -q 'data-claim-after-read-sold="true"' src/views/skin.ts || fail "claim-after-read-sold hop must stay"
grep -q 'data-claim-after-sold="true"' src/views/skin.ts || fail "claim-after-sold hop must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-sold-cover="true"' src/views/skin.ts || fail "sold-cover name must stay"
grep -q 'This issue’s cover is sold' src/views/skin.ts || fail "occupied flag must still say this issue’s cover is sold"
grep -q 'data-read-after-claim-six="true"' src/views/skin.ts || fail "sold-cover read-after-claim-six must stay"
grep -q 'data-read-after-claim-five="true"' src/views/skin.ts || fail "sold-cover read-after-claim-five must stay"
grep -q 'data-read-after-claim-four="true"' src/views/skin.ts || fail "sold-cover read-after-claim-four must stay"
grep -q 'data-read-after-claim-three="true"' src/views/skin.ts || fail "sold-cover read-after-claim-three must stay"
grep -q 'data-read-after-claim-two="true"' src/views/skin.ts || fail "sold-cover read-after-claim-two must stay"
grep -q 'data-read-after-claim-sold="true"' src/views/skin.ts || fail "sold-cover read-after-claim must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty-stand-first must stay"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts || fail "claim-after-stand hop must stay"
grep -q 'a\[data-claim-after-read-six\]' src/views/skin.ts \
  || fail "occupied claim hop must concentrate a sixth time on the existing flag link after the sold-cover read"
if ! awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_flag && /board.status === "closed"/ { saw_closed = 1 }
  in_flag && /listings.length > 0/ { saw_occupied = 1 }
  in_flag && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_flag && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_flag && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_flag && saw_two && /data-read-after-claim-three="true"/ { saw_three = 1 }
  in_flag && saw_three && /data-read-after-claim-four="true"/ { saw_four = 1 }
  in_flag && saw_four && /data-read-after-claim-five="true"/ { saw_five = 1 }
  in_flag && saw_five && /data-read-after-claim-six="true"/ { saw_six = 1 }
  in_hop && saw_six && /data-claim-cover="true"/ { saw_claim = 1 }
  in_hop && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_hop && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_hop && saw_after_read && /data-claim-after-read-two="true"/ { saw_after_two = 1 }
  in_hop && saw_after_two && /data-claim-after-read-three="true"/ { saw_after_three = 1 }
  in_hop && saw_after_three && /data-claim-after-read-four="true"/ { saw_after_four = 1 }
  in_hop && saw_after_four && /data-claim-after-read-five="true"/ { saw_after_five = 1 }
  in_hop && saw_after_five && /data-claim-after-read-six="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-claim-after-read-six must concentrate the existing occupied-open Claim the next cover hop after the sold-cover read"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "claim after the sold-cover read is re-concentrated a sixth time must not add another #claim hop in the flag"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /The next issue/ { saw_next = 1 }
  in_fn && saw_next && /data-claim-after-read-six/ { leaked = 1 }
  END { exit(leaked ? 1 : (saw_next ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty open flag must keep the next-issue pitch and must not stamp data-claim-after-read-six"
fi
grep -q 'data-claim-after-read-six="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-claim-after-read-six"
grep -q 'occupied open / concentrates Claim the next cover after the sold-cover read is re-concentrated a sixth time' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied claim-after-read-six case"
grep -q 'doesNotMatch(emptyOpen, /data-claim-after-read-six="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-claim-after-read-six"
grep -q 'doesNotMatch(closedEmpty, /data-claim-after-read-six="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-claim-after-read-six"
grep -q 'doesNotMatch(closedOccupied, /data-claim-after-read-six="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-claim-after-read-six"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "claim-after-read-six UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: prize before price on the occupied cover =="
grep -qE '^### PR 37: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 37: first-time reader"
grep -q 'data-prize-before-price="true"' src/views/skin.ts || fail "occupied cover must mark data-prize-before-price"
grep -q 'Cover · #1' src/views/skin.ts || fail "occupied cover must still say Cover · #1"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q '\.cover-line\[data-prize-before-price\] \.rank' src/views/skin.ts \
  || fail "Cover · #1 must be larger than \$bid on the occupied cover"
grep -q '\.cover-line\[data-prize-before-price\] \.bid' src/views/skin.ts \
  || fail "\$bid must stay quieter than Cover · #1 on the occupied cover"
if ! awk '
  /function renderPitch/ { in_fn = 1 }
  in_fn && /listing.rank === 1/ { saw_rank = 1 }
  in_fn && saw_rank && /data-prize-before-price="true"/ { found = 1 }
  END { exit(found ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-prize-before-price must stamp only rank 1"
fi
if ! awk '
  /function renderPitch/ { in_fn = 1 }
  in_fn && /Cover · #1/ { saw_prize = 1 }
  in_fn && saw_prize && /class="bid"/ { found = 1 }
  END { exit(found ? 0 : 1) }
' src/views/skin.ts; then
  fail "Cover · #1 must read before \$bid in the occupied cover line"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "prize before price must not add another #claim hop in the flag"
fi
if grep -E 'data-claim-after-read-seven|data-read-after-claim-seven' src/views/skin.ts; then
  fail "prize before price must not stamp claim-after-read-N / read-after-claim-N"
fi
grep -q 'data-prize-before-price="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-prize-before-price"
grep -q 'occupied open / lets Cover · #1 read before \$bid' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied prize-before-price case"
grep -q 'doesNotMatch(emptyOpen, /data-prize-before-price="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-prize-before-price"
grep -q 'doesNotMatch(closedEmpty, /data-prize-before-price="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-prize-before-price"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "prize-before-price UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: later ranks stay quieter than Cover · #1 =="
grep -qE '^### PR 38: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 38: first-time reader"
grep -q 'data-later-rank="true"' src/views/skin.ts || fail "later ranks must mark data-later-rank"
grep -q 'Cover · #1' src/views/skin.ts || fail "occupied cover must still say Cover · #1"
grep -q 'data-prize-before-price="true"' src/views/skin.ts || fail "Cover · #1 prize-before-price must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q '\.cover-line\[data-later-rank\] \.slot' src/views/skin.ts \
  || fail "later-rank blurbs must stay quieter than Cover · #1"
grep -q '\.cover-line\[data-later-rank\] \.rank' src/views/skin.ts \
  || fail "later-rank kickers must stay quieter than Cover · #1"
if ! awk '
  /function renderPitch/ { in_fn = 1 }
  in_fn && /const laterRank = isCover \? ""/ && /data-later-rank="true"/ { found = 1 }
  in_fn && /const prizeBefore = isCover/ && /data-later-rank/ { leaked = 1 }
  END { exit(leaked ? 1 : (found ? 0 : 1)) }
' src/views/skin.ts; then
  fail "data-later-rank must stamp only ranks after Cover · #1"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "later-rank quiet must not add another #claim hop in the flag"
fi
if grep -E 'data-claim-after-read-seven|data-read-after-claim-seven' src/views/skin.ts; then
  fail "later-rank quiet must not stamp claim-after-read-N / read-after-claim-N"
fi
grep -q 'data-later-rank="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-later-rank"
grep -q 'occupied open / keeps later ranks quieter than Cover · #1' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied later-rank quiet case"
grep -q 'doesNotMatch(emptyOpen, /data-later-rank="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-later-rank"
grep -q 'doesNotMatch(closedEmpty, /data-later-rank="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-later-rank"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "later-rank quiet UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: closed issue stays empty-issue =="
grep -qE '^### PR 39: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 39: first-time reader"
grep -q 'data-closed-empty-issue="true"' src/views/skin.ts || fail "closed empty archive must mark data-closed-empty-issue"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "closed empty archive must keep class empty-issue"
grep -q 'data-open-cover="true"' src/views/skin.ts || fail "closed archive must still hop to the open stand"
grep -q 'The open cover is on the stand' src/views/skin.ts || fail "closed archive must still name the open stand"
grep -q 'data-sold-cover="true"' src/views/skin.ts || fail "occupied sold-cover name must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-prize-before-price="true"' src/views/skin.ts || fail "Cover · #1 prize-before-price must stay"
grep -q 'data-later-rank="true"' src/views/skin.ts || fail "later-rank quiet must stay"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty-stand-first must stay"
grep -q 'a\[data-open-cover\]' src/views/skin.ts || fail "closed archive must concentrate the existing open-stand hop"
if ! awk '
  /function renderRack/ { in_rack = 1 }
  in_rack && /board.status === "closed"/ { saw_closed = 1 }
  in_rack && saw_closed && /class="empty-issue"/ { saw_slab = 1 }
  in_rack && saw_slab && /data-closed-empty-issue="true"/ { found = 1 }
  END { exit(found ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-closed-empty-issue must stay on the closed empty-issue slab"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && saw_closed && /listings.length === 0/ { saw_empty = 1 }
  in_fn && saw_empty && /data-open-cover="true"/ { found = 1 }
  in_fn && /listings.length > 0/ { saw_occupied = 1 }
  in_fn && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  END { exit(found && saw_sold ? 0 : 1) }
' src/views/skin.ts; then
  fail "closed archive must keep the open-stand hop and must not steal occupied sold-cover"
fi
if ! awk '
  /function renderPitch/ { in_fn = 1 }
  in_fn && /openPrize/ { saw_gate = 1 }
  in_fn && saw_gate && /data-cover-prize-line="true"/ { saw_prize = 1 }
  in_fn && saw_gate && /stampedPrizeLine = openPrize/ { found = 1 }
  END { exit(found && saw_prize ? 0 : 1) }
' src/views/skin.ts; then
  fail "prize stamps must stay on the open issue only"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  in_fn && /href="\/"/ { open_hops++ }
  END { exit(hops == 0 && open_hops == 1 ? 0 : 1) }
' src/views/skin.ts; then
  fail "closed empty-issue must not add another named hop"
fi
if grep -E 'data-claim-after-read-seven|data-read-after-claim-seven' src/views/skin.ts; then
  fail "closed empty-issue must not stamp claim-after-read-N / read-after-claim-N"
fi
grep -q 'data-closed-empty-issue="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-closed-empty-issue"
grep -q 'closed archive stays empty-issue' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing closed empty-issue stand case"
grep -q 'doesNotMatch(closedOccupied, /data-sold-cover="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-sold-cover"
grep -q 'doesNotMatch(closedOccupied, /data-cover-prize-line="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-cover-prize-line"
grep -q 'doesNotMatch(closedOccupied, /data-prize-before-price="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-prize-before-price"
grep -q 'doesNotMatch(emptyOpen, /data-closed-empty-issue/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-closed-empty-issue"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "closed empty-issue UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: occupied Cover · #1 names the sponsor, not the host path =="
grep -qE '^### PR 40: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 40: first-time reader"
grep -q 'data-named-prize="true"' src/views/skin.ts || fail "occupied Cover · #1 must mark data-named-prize"
grep -q 'Cover · #1' src/views/skin.ts || fail "occupied cover must still say Cover · #1"
grep -q 'listing.blurb' src/views/skin.ts || fail "named prize must use the listing blurb already on the board"
grep -q 'displaySponsor' src/views/skin.ts || fail "host/path must stay a later fact via displaySponsor"
grep -q 'data-prize-before-price="true"' src/views/skin.ts || fail "Cover · #1 prize-before-price must stay"
grep -q 'data-later-rank="true"' src/views/skin.ts || fail "later-rank quiet must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-closed-empty-issue="true"' src/views/skin.ts || fail "closed empty-issue must stay"
grep -q '\.cover-line\[data-named-prize\] \.hed' src/views/skin.ts \
  || fail "Cover · #1 must name the sponsor on the hed"
grep -q '\.cover-line\[data-named-prize\] \.dek' src/views/skin.ts \
  || fail "host/path must stay quieter on the dek"
if ! awk '
  /function renderPitch/ { in_fn = 1 }
  in_fn && /const namedPrize = isCover/ && /data-named-prize="true"/ { found = 1 }
  in_fn && /const laterRank = isCover/ && /named-prize/ { leaked = 1 }
  END { exit(leaked ? 1 : (found ? 0 : 1)) }
' src/views/skin.ts; then
  fail "data-named-prize must stamp only Cover · #1"
fi
if ! awk '
  /function renderPitch/ { in_fn = 1 }
  in_fn && /openPrize/ { saw_gate = 1 }
  in_fn && saw_gate && /data-named-prize="true"/ { saw = 1 }
  in_fn && saw_gate && /stampedNamedPrize = openPrize/ { found = 1 }
  END { exit(found && saw ? 0 : 1) }
' src/views/skin.ts; then
  fail "named-prize stamp must stay on the open issue only"
fi
if ! awk '
  /function renderPitch/ { in_fn = 1 }
  in_fn && /class="hed"/ && /listing.blurb/ { saw_name = 1 }
  in_fn && saw_name && /class="dek"/ && /displaySponsor/ { found = 1 }
  END { exit(found ? 0 : 1) }
' src/views/skin.ts; then
  fail "Cover · #1 must name the blurb before host/path"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "named prize must not add another #claim hop in the flag"
fi
if grep -E 'data-claim-after-read-seven|data-read-after-claim-seven' src/views/skin.ts; then
  fail "named prize must not stamp claim-after-read-N / read-after-claim-N"
fi
if grep -E 'og:title|fetch\(' src/views/skin.ts src/http/routes/board.ts; then
  fail "named prize must not scrape a second title from the live web"
fi
grep -q 'data-named-prize="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-named-prize"
grep -q 'occupied open / names Cover · #1 from the listing blurb, not the host path' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied named-prize case"
grep -q 'doesNotMatch(emptyOpen, /data-named-prize="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-named-prize"
grep -q 'doesNotMatch(closedEmpty, /data-named-prize="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-named-prize"
grep -q 'doesNotMatch(closedOccupied, /data-named-prize="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-named-prize"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "named-prize UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time sponsor: empty open stand stays honest =="
grep -qE '^### PR 41: first-time sponsor' BUILD.md || fail "BUILD.md missing ### PR 41: first-time sponsor"
grep -q 'data-empty-open-stand="true"' src/views/skin.ts || fail "empty open stand must mark data-empty-open-stand"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "empty open stand must keep class empty-stand"
grep -q 'Claim #1 for' src/views/skin.ts || fail "empty open / must keep Claim #1"
grep -q 'This issue’s cover is still open' src/views/skin.ts \
  || fail "empty open stand must still say this issue’s cover is still open"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty-stand-first must stay"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts || fail "claim-after-stand hop must stay"
grep -q 'data-cover-prize="true"' src/views/skin.ts || fail "empty open \$5 prize mark must stay"
grep -q 'data-sold-cover="true"' src/views/skin.ts || fail "occupied sold-cover name must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'data-named-prize="true"' src/views/skin.ts || fail "occupied named prize must stay"
grep -q 'data-closed-empty-issue="true"' src/views/skin.ts || fail "closed empty-issue must stay"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "closed empty archive must keep class empty-issue"
if ! awk '
  /function renderRack/ { in_rack = 1 }
  in_rack && /board.status === "closed"/ { saw_closed = 1 }
  in_rack && saw_closed && /class="empty-issue"/ { saw_closed_slab = 1 }
  in_rack && /class="empty-stand"/ { saw_open_stand = 1 }
  in_rack && saw_open_stand && /data-read-stand="true"/ { saw_read = 1 }
  in_rack && saw_read && /data-empty-open-stand="true"/ { found = 1 }
  END { exit(found && saw_closed_slab ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-empty-open-stand must sit on the empty open stand; empty-issue stays closed-archive only"
fi
if ! awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_flag && /board.status === "closed"/ { saw_closed = 1 }
  in_flag && /listings.length > 0/ { saw_occupied = 1 }
  in_flag && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_hop && saw_sold && /data-claim-cover="true"/ { saw_claim = 1 }
  in_flag && /The next issue/ { saw_next = 1 }
  in_flag && saw_next && /data-empty-open-stand="true"/ { found = 1 }
  in_flag && saw_next && /data-sold-cover="true"/ { leaked = 1 }
  in_flag && saw_next && /data-claim-cover="true"/ { leaked = 1 }
  END { exit(leaked ? 1 : (found && saw_closed && saw_claim ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty open flag must stamp data-empty-open-stand and must not leak sold-cover"
fi
if ! awk '
  /function renderPitch/ { in_fn = 1 }
  in_fn && /data-named-prize="true"/ { saw = 1 }
  in_fn && /openPrize/ { saw_gate = 1 }
  END { exit(saw && saw_gate ? 0 : 1) }
' src/views/skin.ts; then
  fail "named-prize stamp must stay on occupied Cover · #1 only"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "empty open stand must not add another #claim hop in the flag"
fi
if grep -E 'data-claim-after-read-seven|data-read-after-claim-seven' src/views/skin.ts; then
  fail "empty open stand must not stamp claim-after-read-N / read-after-claim-N"
fi
grep -q 'data-empty-open-stand="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-empty-open-stand"
grep -q 'empty open / stays the empty stand' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing empty-open-stand honesty case"
grep -q 'doesNotMatch(emptyOpen, /data-sold-cover="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-sold-cover"
grep -q 'doesNotMatch(emptyOpen, /data-named-prize="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-named-prize"
grep -q 'doesNotMatch(emptyOpen, /Claim the next cover/)' tests/product-ui.test.ts \
  || fail "empty open / must not say Claim the next cover"
grep -q 'doesNotMatch(occupiedOpen, /data-empty-open-stand="true"/)' tests/product-ui.test.ts \
  || fail "occupied open / must not stamp data-empty-open-stand"
grep -q 'doesNotMatch(closedEmpty, /data-empty-open-stand="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-empty-open-stand"
grep -q 'doesNotMatch(closedOccupied, /data-empty-open-stand="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-empty-open-stand"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "empty-open-stand UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: empty open stand stays certain — occupied chrome cannot leak =="
grep -qE '^### PR 42: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 42: first-time reader"
grep -q 'class="week week-open-empty"' src/views/skin.ts || fail "empty open / must wrap in week-open-empty"
grep -q 'class="week week-open-sold"' src/views/skin.ts || fail "occupied open / must wrap in week-open-sold"
grep -q 'week-closed-empty' src/views/skin.ts || fail "closed empty archive must wrap in week-closed-empty"
grep -q 'week-closed-occupied' src/views/skin.ts || fail "closed occupied archive must wrap in week-closed-occupied"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "empty open stand must keep class empty-stand"
grep -q 'Claim #1 for' src/views/skin.ts || fail "empty open / must keep Claim #1"
grep -q 'data-sold-cover="true"' src/views/skin.ts || fail "occupied sold-cover name must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-named-prize="true"' src/views/skin.ts || fail "occupied named prize must stay"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "closed empty archive must keep class empty-issue"
grep -F -q '.week-open-sold .flag [data-read-after-claim-sold]' src/views/skin.ts \
  || fail "sold-cover flag CSS must be scoped to week-open-sold"
grep -F -q '.week-open-sold .cover-line[data-named-prize] .hed' src/views/skin.ts \
  || fail "named-prize CSS must be scoped to week-open-sold"
grep -F -q '.week-open-empty[data-empty-open-stand] [data-sold-cover]' src/views/skin.ts \
  || fail "empty open shell must hide leaked sold-cover chrome"
grep -F -q '.week-open-empty[data-empty-open-stand] [data-claim-cover]' src/views/skin.ts \
  || fail "empty open shell must hide leaked Claim the next cover chrome"
grep -F -q '.week-open-empty[data-empty-open-stand] [data-named-prize]' src/views/skin.ts \
  || fail "empty open shell must hide leaked named-prize chrome"
if grep -E '^\.flag \[data-read-after-claim-sold\]' src/views/skin.ts; then
  fail "sold-cover flag CSS must not apply outside week-open-sold"
fi
if grep -E '^\.cover-line\[data-named-prize\]' src/views/skin.ts; then
  fail "named-prize CSS must not apply outside week-open-sold"
fi
if ! awk '
  /function weekShell/ { in_fn = 1 }
  in_fn && /^export function / { in_fn = 0 }
  in_fn && /week-open-empty/ && /data-empty-open-stand="true"/ { found = 1 }
  in_fn && /week-open-sold/ { saw_sold = 1 }
  in_fn && /week-closed-empty/ { saw_closed = 1 }
  END { exit(found && saw_sold && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "weekShell must isolate empty open / from occupied sold-cover and closed empty-issue"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "empty-open certainty must not add another #claim hop in the flag"
fi
if grep -E 'data-claim-after-read-seven|data-read-after-claim-seven' src/views/skin.ts; then
  fail "empty-open certainty must not stamp claim-after-read-N / read-after-claim-N"
fi
grep -q 'week-open-empty' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must assert the empty-open week shell"
grep -q 'week-open-sold' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must assert the occupied-open week shell"
grep -q 'week-closed-empty' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must assert the closed-empty week shell"
grep -q 'doesNotMatch(emptyOpen, /class="week week-open-sold"/)' tests/product-ui.test.ts \
  || fail "empty open / must not wrap in week-open-sold"
grep -q 'doesNotMatch(occupiedOpen, /class="week week-open-empty"/)' tests/product-ui.test.ts \
  || fail "occupied open / must not wrap in week-open-empty"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "empty-open certainty UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: occupied Cover · #1 prize stays before \$bid =="
grep -qE '^### PR 43: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 43: first-time reader"
grep -q 'data-later-fact="true"' src/views/skin.ts || fail "occupied Cover · #1 must mark data-later-fact"
grep -q 'class="later-fact"' src/views/skin.ts || fail "occupied Cover · #1 must compose later-fact under the hed"
grep -q 'Cover · #1' src/views/skin.ts || fail "occupied cover must still say Cover · #1"
grep -q 'listing.blurb' src/views/skin.ts || fail "named prize must use the listing blurb already on the board"
grep -q 'displaySponsor' src/views/skin.ts || fail "host/path must stay a later fact via displaySponsor"
grep -q 'data-prize-before-price="true"' src/views/skin.ts || fail "Cover · #1 prize-before-price must stay"
grep -q 'data-named-prize="true"' src/views/skin.ts || fail "occupied named prize must stay"
grep -q 'data-later-rank="true"' src/views/skin.ts || fail "later-rank quiet must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "empty open stand must stay"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "closed empty archive must keep class empty-issue"
grep -F -q '.week-open-sold .cover-line.cover[data-prize-before-price]' src/views/skin.ts \
  || fail "occupied Cover · #1 must drop the money column"
grep -F -q 'grid-template-columns: max-content 1fr;' src/views/skin.ts \
  || fail "occupied Cover · #1 must stack prize before \$bid"
grep -F -q '.week-open-sold .cover-line[data-prize-before-price][data-named-prize] .later-fact[data-later-fact]' src/views/skin.ts \
  || fail "later-fact CSS must be scoped to occupied Cover · #1"
grep -F -q '.week-open-empty[data-empty-open-stand] [data-later-fact]' src/views/skin.ts \
  || fail "empty open shell must hide leaked later-fact chrome"
if grep -E '^\.cover-line\[data-prize-before-price\]\[data-named-prize\] \.later-fact' src/views/skin.ts; then
  fail "later-fact CSS must not apply outside week-open-sold"
fi
if ! awk '
  /function renderPitch/ { in_fn = 1 }
  in_fn && /laterFact = openPrize && isCover/ { saw_gate = 1 }
  in_fn && saw_gate && /class="hed"/ { saw_hed = 1 }
  in_fn && saw_hed && /listing.blurb/ { saw_name = 1 }
  in_fn && saw_name && /class="later-fact" data-later-fact="true"/ { saw_later = 1 }
  in_fn && saw_later && /class="dek"/ { saw_dek = 1 }
  in_fn && saw_dek && /displaySponsor/ { saw_host = 1 }
  in_fn && saw_host && /class="bid"/ { found = 1 }
  END { exit(found ? 0 : 1) }
' src/views/skin.ts; then
  fail "occupied Cover · #1 must name the blurb before host/path and \$bid"
fi
if ! awk '
  /function renderPitch/ { in_fn = 1 }
  in_fn && /const laterFact = openPrize && isCover/ { saw = 1 }
  in_fn && saw && /laterFact$/ { next }
  in_fn && /laterFact \?/ && /class="money"/ { leaked = 1 }
  in_fn && saw && /class="money"/ { money_else = 1 }
  END { exit(leaked ? 1 : (saw && money_else ? 0 : 1)) }
' src/views/skin.ts; then
  fail "class=money must stay on later ranks and closed archives, not occupied Cover · #1"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "prize before \$bid must not add another #claim hop in the flag"
fi
if grep -E 'data-claim-after-read-seven|data-read-after-claim-seven' src/views/skin.ts; then
  fail "prize before \$bid must not stamp claim-after-read-N / read-after-claim-N"
fi
if grep -E 'og:title|fetch\(' src/views/skin.ts src/http/routes/board.ts; then
  fail "prize before \$bid must not scrape a second title from the live web"
fi
grep -q 'data-later-fact="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-later-fact"
grep -q 'occupied open / keeps Cover · #1 prize before \$bid' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied prize-before-bid case"
grep -q 'doesNotMatch(emptyOpen, /data-later-fact="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-later-fact"
grep -q 'doesNotMatch(closedEmpty, /data-later-fact="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-later-fact"
grep -q 'doesNotMatch(closedOccupied, /data-later-fact="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-later-fact"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "prize-before-bid UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time sponsor: empty open stand stays Claim #1 — later-fact / named-prize cannot leak =="
grep -qE '^### PR 44: first-time sponsor' BUILD.md || fail "BUILD.md missing ### PR 44: first-time sponsor"
grep -q 'export const FOLIO_CSS' src/views/skin.ts || fail "empty/closed pages must export FOLIO_CSS"
grep -q 'export const OCCUPIED_CSS' src/views/skin.ts || fail "occupied later-fact / named-prize CSS must live in OCCUPIED_CSS"
grep -q 'ISSUE_CSS = `${FOLIO_CSS}' src/views/skin.ts || fail "occupied open / must concatenate FOLIO_CSS + OCCUPIED_CSS"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "empty open / closed archives must ship FOLIO_CSS only"
grep -q 'class="week week-open-empty"' src/views/skin.ts || fail "empty open / must wrap in week-open-empty"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "empty open stand must keep class empty-stand"
grep -q 'Claim #1 for' src/views/skin.ts || fail "empty open / must keep Claim #1"
grep -q 'data-later-fact="true"' src/views/skin.ts || fail "occupied Cover · #1 later-fact must stay"
grep -q 'data-named-prize="true"' src/views/skin.ts || fail "occupied named prize must stay"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "closed empty archive must keep class empty-issue"
if awk '/^export const FOLIO_CSS/{p=1} p{print} /^export const OCCUPIED_CSS/{exit}' src/views/skin.ts \
  | grep -Eq 'data-later-fact|later-fact|data-named-prize'; then
  fail "FOLIO_CSS must not contain later-fact / named-prize chrome"
fi
if awk '/^export const FOLIO_CSS/{p=1} p{print} /^export const OCCUPIED_CSS/{exit}' src/views/skin.ts \
  | grep -Eq 'data-sold-cover|data-claim-cover|data-prize-before-price'; then
  fail "FOLIO_CSS must not contain occupied sold-cover / named-prize CSS"
fi
if ! awk '
  /^export const OCCUPIED_CSS/ { p = 1 }
  p && /later-fact\[data-later-fact\]/ { later = 1 }
  p && /\[data-named-prize\]/ { named = 1 }
  END { exit(later && named ? 0 : 1) }
' src/views/skin.ts; then
  fail "OCCUPIED_CSS must keep later-fact / named-prize chrome for occupied Cover · #1"
fi
if ! awk '
  /function boardCss/ { in_fn = 1 }
  in_fn && /occupiedOpen \? ISSUE_CSS : FOLIO_CSS/ { found = 1 }
  in_fn && /^export function / { in_fn = 0 }
  END { exit(found ? 0 : 1) }
' src/views/skin.ts; then
  fail "empty open / must not concatenate OCCUPIED_CSS"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "empty-open later-fact isolation must not add another #claim hop in the flag"
fi
if grep -E 'data-claim-after-read-seven|data-read-after-claim-seven' src/views/skin.ts; then
  fail "empty-open later-fact isolation must not stamp claim-after-read-N / read-after-claim-N"
fi
grep -q 'FOLIO_CSS' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must assert FOLIO_CSS on empty open /"
grep -q 'empty open / stays Claim #1 — later-fact / named-prize cannot leak' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing empty-open later-fact isolation case"
grep -q 'doesNotMatch(emptyOpen, /data-later-fact="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-later-fact"
grep -q 'doesNotMatch(emptyOpen, /data-named-prize="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-named-prize"
grep -q 'doesNotMatch(closedEmpty, /data-later-fact="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-later-fact"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "empty-open later-fact isolation must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: occupied Claim the next cover stays quieter than Cover · #1 — prize stays first =="
grep -qE '^### PR 45: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 45: first-time reader"
grep -q 'data-cover-first="true"' src/views/skin.ts || fail "occupied Cover · #1 must mark data-cover-first"
grep -q 'Cover · #1' src/views/skin.ts || fail "occupied cover must still say Cover · #1"
grep -q 'listing.blurb' src/views/skin.ts || fail "cover-first prize must use the listing blurb already on the board"
grep -q 'displaySponsor' src/views/skin.ts || fail "host/path must stay a later fact via displaySponsor"
grep -q 'data-later-fact="true"' src/views/skin.ts || fail "occupied Cover · #1 later-fact must stay"
grep -q 'data-named-prize="true"' src/views/skin.ts || fail "occupied named prize must stay"
grep -q 'data-prize-before-price="true"' src/views/skin.ts || fail "Cover · #1 prize-before-price must stay"
grep -q 'data-later-rank="true"' src/views/skin.ts || fail "later-rank quiet must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "empty open stand must stay"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "closed empty archive must keep class empty-issue"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "empty open / closed archives must still ship FOLIO_CSS only"
grep -F -q '.week-open-sold .cover-line[data-named-prize] .hed a[data-cover-first]' src/views/skin.ts \
  || fail "Cover · #1 prize click must be the named hed"
grep -F -q '.week-open-sold .claim-after-listing a[data-claim-cover]' src/views/skin.ts \
  || fail "Claim the next cover must stay quieter than Cover · #1"
grep -F -q '.week-open-empty[data-empty-open-stand] [data-cover-first]' src/views/skin.ts \
  || fail "empty open shell must hide leaked cover-first chrome"
if grep -E '^\.cover-line\[data-named-prize\] \.hed a\[data-cover-first\]' src/views/skin.ts; then
  fail "cover-first CSS must not apply outside week-open-sold"
fi
if grep -E '^\.flag a\[data-claim-cover\]|^\.claim-after-listing a\[data-claim-cover\]' src/views/skin.ts; then
  fail "claim-cover quiet CSS must not apply outside week-open-sold"
fi
if ! awk '
  /function renderPitch/ { in_fn = 1 }
  in_fn && /laterFact = openPrize && isCover/ { saw_gate = 1 }
  in_fn && saw_gate && /class="hed"/ { saw_hed = 1 }
  in_fn && saw_hed && /data-cover-first="true"/ { saw_first = 1 }
  in_fn && saw_first && /listing.blurb/ { saw_name = 1 }
  in_fn && saw_name && /class="later-fact" data-later-fact="true"/ { saw_later = 1 }
  in_fn && saw_later && /class="dek"/ { saw_dek = 1 }
  in_fn && saw_dek && /displaySponsor/ { saw_host = 1 }
  in_fn && saw_host && /class="bid"/ { found = 1 }
  END { exit(found ? 0 : 1) }
' src/views/skin.ts; then
  fail "occupied Cover · #1 must be the first occupied click before host/path and \$bid"
fi
if ! awk '
  /function renderPitch/ { in_fn = 1 }
  in_fn && /^function / && !/renderPitch/ { in_fn = 0 }
  in_fn && /data-cover-first="true"/ { first++ }
  in_fn && /laterFact = openPrize && isCover/ { saw = 1 }
  in_fn && saw && /class="money"/ { money_else = 1 }
  END { exit(first == 1 && money_else ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-cover-first must stamp only occupied Cover · #1"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "cover-first prize must not add another #claim hop in the flag"
fi
if grep -E 'data-claim-after-read-seven|data-read-after-claim-seven' src/views/skin.ts; then
  fail "cover-first prize must not stamp claim-after-read-N / read-after-claim-N"
fi
if grep -E 'og:title|fetch\(' src/views/skin.ts src/http/routes/board.ts; then
  fail "cover-first prize must not scrape a second title from the live web"
fi
node -e '
const { readFileSync } = require("fs");
const src = readFileSync("src/views/skin.ts", "utf8");
const css = src.slice(src.indexOf("export const OCCUPIED_CSS"), src.indexOf("export const ISSUE_CSS"));
const hed = css.match(/\.week-open-sold \.cover-line\[data-named-prize\] \.hed \{([^}]*)\}/);
const claim = css.match(/\.week-open-sold \.claim-after-listing a\[data-claim-cover\] \{([^}]*)\}/);
if (!hed || !claim) {
  console.error("missing occupied Cover · #1 or Claim the next cover CSS");
  process.exit(1);
}
const hedSize = hed[1].match(/font-size:\s*([\d.]+)rem/);
const claimSize = claim[1].match(/font-size:\s*([\d.]+)rem/);
if (!hedSize || !claimSize) {
  console.error("missing font-size on Cover · #1 or Claim the next cover");
  process.exit(1);
}
if (Number(claimSize[1]) >= Number(hedSize[1])) {
  console.error("Claim the next cover is not quieter than Cover · #1");
  process.exit(1);
}
if (!claim[1].includes("color: var(--mute)")) {
  console.error("Claim the next cover must use mute ink");
  process.exit(1);
}
if (!claim[1].includes("text-transform: none")) {
  console.error("Claim the next cover must drop the shouty uppercase");
  process.exit(1);
}
' || fail "Claim the next cover must stay quieter than Cover · #1"
if awk '/^export const FOLIO_CSS/{p=1} p{print} /^export const OCCUPIED_CSS/{exit}' src/views/skin.ts \
  | grep -Eq 'data-cover-first|a\[data-cover-first\]|a\[data-claim-cover\]'; then
  fail "FOLIO_CSS must not contain cover-first / claim-cover quiet chrome"
fi
grep -q 'data-cover-first="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-cover-first"
grep -q 'occupied open / keeps Claim the next cover quieter than Cover · #1' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied claim-quieter-than-Cover · #1 case"
grep -q 'doesNotMatch(emptyOpen, /data-cover-first="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-cover-first"
grep -q 'doesNotMatch(closedEmpty, /data-cover-first="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-cover-first"
grep -q 'doesNotMatch(closedOccupied, /data-cover-first="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-cover-first"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "cover-first prize UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time sponsor: empty open has one first click — cover URL is a later write =="
grep -qE '^### PR 46: first-time sponsor' BUILD.md || fail "BUILD.md missing ### PR 46: first-time sponsor"
grep -q 'data-first-click="claim"' src/views/skin.ts || fail "empty open Claim #1 must mark data-first-click=claim"
grep -q 'data-empty-claim-first="true"' src/views/skin.ts || fail "empty open claim must mark data-empty-claim-first"
grep -q 'empty-claim-first' src/views/skin.ts || fail "empty open claim must use class empty-claim-first"
grep -q 'data-later-write="true"' src/views/skin.ts || fail "empty open cover URL must mark data-later-write"
grep -q 'data-cover-identity="true"' src/views/skin.ts || fail "empty open cover URL must wrap cover-identity"
grep -q 'Then the cover URL' src/views/skin.ts || fail "empty open must name Then the cover URL"
grep -q 'class="later-write-label"' src/views/skin.ts || fail "empty open later write must use later-write-label"
grep -q 'Claim #1 for' src/views/skin.ts || fail "empty open / must keep Claim #1"
grep -q 'Outbid' src/views/skin.ts || fail "empty open / must keep Outbid"
grep -q 'name="sponsorUrl"' src/views/skin.ts || fail "cover URL field must stay sponsorUrl"
grep -q 'name="blurb"' src/views/skin.ts || fail "cover pitch field must stay blurb"
grep -q 'class="bid-row"' src/views/skin.ts || fail "occupied claim must keep the bid-row"
grep -q 'data-cover-first="true"' src/views/skin.ts || fail "occupied Cover · #1 prize click must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "empty open stand must stay"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "closed empty archive must keep class empty-issue"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "empty open / closed archives must still ship FOLIO_CSS only"
grep -F -q '.week-open-empty #claim.empty-claim-first[data-empty-claim-first] .cover-identity[data-later-write]' src/views/skin.ts \
  || fail "empty open later-write CSS must compose cover identity off the claim rail"
grep -F -q '.week-open-empty #claim.empty-claim-first[data-empty-claim-first] .later-write-label' src/views/skin.ts \
  || fail "empty open later-write CSS must name Then the cover URL"
grep -F -q '.week-open-empty #claim.empty-claim-first[data-empty-claim-first] .claim-hed[data-first-click="claim"]' src/views/skin.ts \
  || fail "empty open Claim #1 first-click CSS must concentrate the claim hed"
grep -F -q '.week-open-sold .cover-line[data-named-prize] .hed a[data-cover-first]' src/views/skin.ts \
  || fail "Cover · #1 prize click must stay the named hed"
grep -F -q '.week-open-sold .claim-after-listing a[data-claim-cover]' src/views/skin.ts \
  || fail "Claim the next cover must stay quieter than Cover · #1"
if grep -E '^\.cover-identity\[data-later-write\]' src/views/skin.ts; then
  fail "later-write CSS must not apply outside week-open-empty"
fi
if grep -E '^\.claim-hed\[data-first-click="claim"\]' src/views/skin.ts; then
  fail "first-click CSS must not apply outside week-open-empty"
fi
if ! awk '
  /function renderClaim/ { in_fn = 1 }
  in_fn && /^function / && !/renderClaim/ { in_fn = 0 }
  in_fn && /const empty = board.listings.length === 0/ { saw_empty = 1 }
  in_fn && saw_empty && /data-first-click="claim"/ { saw_first = 1 }
  in_fn && saw_first && /class="outbid"/ { saw_outbid = 1 }
  in_fn && saw_outbid && /data-later-write="true"/ { saw_later = 1 }
  in_fn && saw_later && /Then the cover URL/ { saw_label = 1 }
  in_fn && saw_label && /name="sponsorUrl"/ { saw_url = 1 }
  in_fn && saw_url && /name="blurb"/ { found = 1 }
  END { exit(found ? 0 : 1) }
' src/views/skin.ts; then
  fail "empty open / must put Claim #1 then Outbid then the cover URL as a later write"
fi
if ! awk '
  /function renderClaim/ { in_fn = 1 }
  in_fn && /^function / && !/renderClaim/ { in_fn = 0 }
  in_fn && /const formFields = empty/ { saw = 1 }
  in_fn && saw && /class="bid-row"/ { bid++ }
  END { exit(bid == 1 ? 0 : 1) }
' src/views/skin.ts; then
  fail "class=bid-row must stay on occupied claim only, not empty open /"
fi
if ! awk '
  /function renderClaim/ { in_fn = 1 }
  in_fn && /^function / && !/renderClaim/ { in_fn = 0 }
  in_fn && /data-first-click="claim"/ { first++ }
  in_fn && /data-later-write="true"/ { later++ }
  END { exit(first == 1 && later == 1 ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-first-click and data-later-write must stamp only the empty open claim"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "empty-open later-write must not add another #claim hop in the flag"
fi
if grep -E 'data-claim-after-read-seven|data-read-after-claim-seven' src/views/skin.ts; then
  fail "empty-open later-write must not stamp claim-after-read-N / read-after-claim-N"
fi
node -e '
const { readFileSync } = require("fs");
const src = readFileSync("src/views/skin.ts", "utf8");
const occupied = src.slice(src.indexOf("export const OCCUPIED_CSS"), src.indexOf("export const ISSUE_CSS"));
const hed = occupied.match(/\.week-open-sold \.cover-line\[data-named-prize\] \.hed \{([^}]*)\}/);
const claim = occupied.match(/\.week-open-sold \.claim-after-listing a\[data-claim-cover\] \{([^}]*)\}/);
if (!hed || !claim) {
  console.error("missing occupied Cover · #1 or Claim the next cover CSS");
  process.exit(1);
}
const hedSize = hed[1].match(/font-size:\s*([\d.]+)rem/);
const claimSize = claim[1].match(/font-size:\s*([\d.]+)rem/);
if (!hedSize || !claimSize) {
  console.error("missing font-size on Cover · #1 or Claim the next cover");
  process.exit(1);
}
if (Number(claimSize[1]) >= Number(hedSize[1])) {
  console.error("Claim the next cover is not quieter than Cover · #1");
  process.exit(1);
}
if (hed[1].includes("font-size: 1.55rem") === false) {
  console.error("do not re-ship Cover-first size");
  process.exit(1);
}
' || fail "occupied Cover · #1 size and quieter Claim the next cover must stay"
if awk '/^export const OCCUPIED_CSS/{p=1} p{print} /^export const ISSUE_CSS/{exit}' src/views/skin.ts \
  | grep -Eq 'empty-claim-first|data-later-write|Then the cover URL|cover-identity'; then
  fail "OCCUPIED_CSS must not swallow empty later-write composition"
fi
grep -q 'data-later-write="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-later-write"
grep -q 'empty open / keeps Claim #1 the first click' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing empty-open Claim #1 then cover URL case"
grep -q 'doesNotMatch(emptyOpen, /class="bid-row"/)' tests/product-ui.test.ts \
  || fail "empty open / must not keep cover URL in bid-row with Outbid"
grep -q 'doesNotMatch(occupiedOpen, /data-later-write="true"/)' tests/product-ui.test.ts \
  || fail "occupied open / must not stamp data-later-write"
grep -q 'doesNotMatch(closedEmpty, /data-later-write="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-later-write"
grep -q 'doesNotMatch(occupiedOpen, /Then the cover URL/)' tests/product-ui.test.ts \
  || fail "occupied open / must not say Then the cover URL"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "empty-open later-write UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: occupied Cover · #1 identity is the paid name — later ranks cannot wear it =="
grep -qE '^### PR 47: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 47: first-time reader"
grep -q 'data-paid-name="true"' src/views/skin.ts || fail "occupied Cover · #1 must mark data-paid-name"
grep -q 'Cover · #1' src/views/skin.ts || fail "occupied cover must still say Cover · #1"
grep -q 'listing.blurb' src/views/skin.ts || fail "paid name must use the listing blurb already on the board"
grep -q 'displaySponsor' src/views/skin.ts || fail "host/path must stay a later fact via displaySponsor"
grep -q 'class="slot"' src/views/skin.ts || fail "later ranks must drop the hed and sit as a slot"
grep -q 'data-later-listing="true"' src/views/skin.ts || fail "occupied claim rail must mark data-later-listing"
grep -q 'One-line listing' src/views/skin.ts || fail "occupied claim rail must not wear the cover-pitch placeholder"
grep -q 'One-line cover pitch' src/views/skin.ts || fail "empty open cover identity must still name the cover pitch"
grep -q 'data-cover-first="true"' src/views/skin.ts || fail "occupied Cover · #1 prize click must stay"
grep -q 'data-later-fact="true"' src/views/skin.ts || fail "occupied Cover · #1 later-fact must stay"
grep -q 'data-named-prize="true"' src/views/skin.ts || fail "occupied named prize must stay"
grep -q 'data-prize-before-price="true"' src/views/skin.ts || fail "Cover · #1 prize-before-price must stay"
grep -q 'data-later-rank="true"' src/views/skin.ts || fail "later-rank quiet must stay"
grep -q 'data-cover-prize-line="true"' src/views/skin.ts || fail "Cover · #1 prize line must stay"
grep -q 'data-read-cover="true"' src/views/skin.ts || fail "sold-cover-first must stay"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-later-write="true"' src/views/skin.ts || fail "empty-open later-write must stay"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "empty open stand must stay"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "closed empty archive must keep class empty-issue"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "empty open / closed archives must still ship FOLIO_CSS only"
grep -F -q '.week-open-sold .cover-line[data-named-prize][data-paid-name] .hed' src/views/skin.ts \
  || fail "paid-name CSS must compose Cover · #1 as the only hed"
grep -F -q '.week-open-sold .cover-line[data-later-rank] .slot' src/views/skin.ts \
  || fail "later-rank CSS must compose a quieter slot, not a Cover · #1 hed"
grep -F -q '.week-open-sold .later-listing[data-later-listing]' src/views/skin.ts \
  || fail "occupied claim rail must compose later-listing off the cover name"
grep -F -q '.week-open-empty[data-empty-open-stand] [data-paid-name]' src/views/skin.ts \
  || fail "empty open shell must hide leaked paid-name chrome"
grep -F -q '.week-open-sold .cover-line[data-named-prize] .hed a[data-cover-first]' src/views/skin.ts \
  || fail "Cover · #1 prize click must stay the named hed"
grep -F -q '.week-open-sold .claim-after-listing a[data-claim-cover]' src/views/skin.ts \
  || fail "Claim the next cover must stay quieter than Cover · #1"
if grep -E '^\.cover-line\[data-named-prize\]\[data-paid-name\]' src/views/skin.ts; then
  fail "paid-name CSS must not apply outside week-open-sold"
fi
if grep -E '^\.cover-line\[data-later-rank\] \.slot' src/views/skin.ts; then
  fail "later-rank slot CSS must not apply outside week-open-sold"
fi
if grep -E '^\.later-listing\[data-later-listing\]' src/views/skin.ts; then
  fail "later-listing CSS must not apply outside week-open-sold"
fi
if ! awk '
  /function renderPitch/ { in_fn = 1 }
  in_fn && /^function / && !/renderPitch/ { in_fn = 0 }
  in_fn && /const paidName = isCover/ && /data-paid-name="true"/ { saw_paid = 1 }
  in_fn && /laterFact = openPrize && isCover/ { saw_gate = 1 }
  in_fn && saw_gate && /stampedPaidName/ { saw_stamp = 1 }
  in_fn && saw_gate && /class="hed"/ && /listing.blurb/ { saw_hed = 1 }
  in_fn && /openPrize && !isCover/ { saw_later = 1 }
  in_fn && saw_later && /class="slot"/ && /listing.blurb/ { saw_slot = 1 }
  in_fn && saw_later && /class="dek"/ && /displaySponsor/ { saw_dek = 1 }
  END { exit(saw_paid && saw_stamp && saw_hed && saw_slot && saw_dek ? 0 : 1) }
' src/views/skin.ts; then
  fail "occupied Cover · #1 must keep the paid-name hed; later ranks must drop class=hed"
fi
if ! awk '
  /function renderPitch/ { in_fn = 1 }
  in_fn && /^function / && !/renderPitch/ { in_fn = 0 }
  in_fn && /data-paid-name="true"/ { paid++ }
  in_fn && /openPrize && !isCover/ { later = 1 }
  later && /return `/ { in_ret = 1 }
  later && in_ret { body = body $0 }
  later && in_ret && /`;/ { in_ret = 0; later = 0 }
  END {
    if (paid != 1) exit 1
    if (body ~ /class="hed"/) exit 1
    if (body !~ /class="slot"/) exit 1
    exit 0
  }
' src/views/skin.ts; then
  fail "data-paid-name must stamp only occupied Cover · #1; later ranks must not wear class=hed"
fi
if ! awk '
  /function renderClaim/ { in_fn = 1 }
  in_fn && /^function / && !/renderClaim/ { in_fn = 0 }
  in_fn && /const formFields = empty/ { saw = 1 }
  in_fn && saw && /One-line cover pitch/ { empty_pitch++ }
  in_fn && saw && /data-later-listing="true"/ { later++ }
  in_fn && saw && /One-line listing/ { listing++ }
  END { exit(empty_pitch == 1 && later == 1 && listing == 1 ? 0 : 1) }
' src/views/skin.ts; then
  fail "occupied claim rail must drop the cover-pitch placeholder; empty open keeps it as a later write"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "paid-name identity must not add another #claim hop in the flag"
fi
if grep -E 'data-claim-after-read-seven|data-read-after-claim-seven' src/views/skin.ts; then
  fail "paid-name identity must not stamp claim-after-read-N / read-after-claim-N"
fi
if grep -E 'og:title|fetch\(' src/views/skin.ts src/http/routes/board.ts; then
  fail "paid-name identity must not scrape a second title from the live web"
fi
node -e '
const { readFileSync } = require("fs");
const src = readFileSync("src/views/skin.ts", "utf8");
const occupied = src.slice(src.indexOf("export const OCCUPIED_CSS"), src.indexOf("export const ISSUE_CSS"));
const hed = occupied.match(/\.week-open-sold \.cover-line\[data-named-prize\] \.hed \{([^}]*)\}/);
const claim = occupied.match(/\.week-open-sold \.claim-after-listing a\[data-claim-cover\] \{([^}]*)\}/);
const slot = occupied.match(/\.week-open-sold \.cover-line\[data-later-rank\] \.slot \{([^}]*)\}/);
if (!hed || !claim || !slot) {
  console.error("missing occupied Cover · #1, Claim the next cover, or later-rank slot CSS");
  process.exit(1);
}
const hedSize = hed[1].match(/font-size:\s*([\d.]+)rem/);
const claimSize = claim[1].match(/font-size:\s*([\d.]+)rem/);
const slotSize = slot[1].match(/font-size:\s*([\d.]+)rem/);
if (!hedSize || !claimSize || !slotSize) {
  console.error("missing font-size on Cover · #1, Claim the next cover, or later-rank slot");
  process.exit(1);
}
if (Number(claimSize[1]) >= Number(hedSize[1])) {
  console.error("Claim the next cover is not quieter than Cover · #1");
  process.exit(1);
}
if (Number(slotSize[1]) >= Number(hedSize[1])) {
  console.error("later ranks still wear Cover · #1 size");
  process.exit(1);
}
if (hed[1].includes("font-size: 1.55rem") === false) {
  console.error("do not re-ship Cover-first size");
  process.exit(1);
}
if (!slot[1].includes("text-transform: none")) {
  console.error("later-rank slot must drop the Cover · #1 shout");
  process.exit(1);
}
if (!slot[1].includes("color: var(--mute)")) {
  console.error("later-rank slot must use mute ink");
  process.exit(1);
}
' || fail "later ranks must not wear Cover · #1 identity; Cover-first size must stay"
if awk '/^export const FOLIO_CSS/{p=1} p{print} /^export const OCCUPIED_CSS/{exit}' src/views/skin.ts \
  | grep -Eq 'data-paid-name|later-listing|One-line listing'; then
  fail "FOLIO_CSS must not contain paid-name / later-listing chrome"
fi
if awk '/^export const OCCUPIED_CSS/{p=1} p{print} /^export const ISSUE_CSS/{exit}' src/views/skin.ts \
  | grep -Eq 'empty-claim-first|data-later-write|Then the cover URL|cover-identity'; then
  fail "OCCUPIED_CSS must not swallow empty later-write composition"
fi
grep -q 'data-paid-name="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-paid-name"
grep -q 'occupied open / keeps Cover · #1 as the paid name' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied paid-name identity case"
grep -q 'doesNotMatch(emptyOpen, /data-paid-name="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-paid-name"
grep -q 'doesNotMatch(closedEmpty, /data-paid-name="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-paid-name"
grep -q 'doesNotMatch(closedOccupied, /data-paid-name="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-paid-name"
grep -q 'doesNotMatch(twoSlice.slice(0, 800), /class="hed"/)' tests/product-ui.test.ts \
  || fail "later ranks on occupied open / must not wear class=hed"
grep -q 'doesNotMatch(occupiedOpen, /One-line cover pitch/)' tests/product-ui.test.ts \
  || fail "occupied claim rail must not wear the cover-pitch placeholder"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "paid-name identity UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: closed occupied keeps frozen Cover · #1 — live claim cannot steal the archive =="
grep -qE '^### PR 48: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 48: first-time reader"
grep -q 'data-frozen-cover="true"' src/views/skin.ts || fail "closed occupied Cover · #1 must mark data-frozen-cover"
grep -q 'data-archive-name="true"' src/views/skin.ts || fail "closed occupied Cover · #1 must mark data-archive-name"
grep -q 'data-frozen-board="true"' src/views/skin.ts || fail "closed occupied rack must mark data-frozen-board"
grep -q 'data-frozen-issue="true"' src/views/skin.ts || fail "closed occupied freeze note must mark data-frozen-issue"
grep -q 'Cover · #1' src/views/skin.ts || fail "closed occupied must still say Cover · #1"
grep -q 'data-open-cover="true"' src/views/skin.ts || fail "closed archive must still hop to the open stand"
grep -q 'The open cover is on the stand' src/views/skin.ts || fail "closed archive must still name the open stand"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "closed empty archive must keep class empty-issue"
grep -q 'data-paid-name="true"' src/views/skin.ts || fail "occupied open Cover · #1 paid name must stay"
grep -q 'data-cover-first="true"' src/views/skin.ts || fail "occupied Cover · #1 prize click must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-later-write="true"' src/views/skin.ts || fail "empty-open later-write must stay"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "empty open / closed archives must still ship FOLIO_CSS only"
grep -F -q '.week-closed-occupied .cover-line.cover[data-frozen-cover][data-archive-name]' src/views/skin.ts \
  || fail "frozen Cover · #1 CSS must compose the paid name on the closed occupied board"
grep -F -q '.week-closed-occupied .cover-line:not([data-frozen-cover]) .slot' src/views/skin.ts \
  || fail "closed occupied later ranks must drop the hed and sit as a slot"
grep -F -q '.week-closed-occupied .form-hint[data-frozen-issue] a[data-open-cover]' src/views/skin.ts \
  || fail "live open-cover hop must sit after the frozen rack, not above Cover · #1"
grep -F -q '.week-open-sold .cover-line[data-named-prize][data-paid-name] .hed' src/views/skin.ts \
  || fail "do not re-ship paid-name identity"
grep -F -q '.week-open-sold .cover-line[data-named-prize] .hed a[data-cover-first]' src/views/skin.ts \
  || fail "do not re-ship Cover-first size"
grep -F -q '.week-open-empty #claim.empty-claim-first[data-empty-claim-first] .cover-identity[data-later-write]' src/views/skin.ts \
  || fail "do not re-ship empty later-write"
if grep -E '^\.cover-line\.cover\[data-frozen-cover\]' src/views/skin.ts; then
  fail "frozen-cover CSS must not apply outside week-closed-occupied"
fi
if grep -E '^\.form-hint\[data-frozen-issue\]' src/views/skin.ts; then
  fail "frozen-issue CSS must not apply outside week-closed-occupied"
fi
if ! awk '
  /function renderPitch/ { in_fn = 1 }
  in_fn && /^function / && !/renderPitch/ { in_fn = 0 }
  in_fn && /!openPrize && isCover/ { saw_cover = 1 }
  in_fn && saw_cover && /data-frozen-cover="true"/ { saw_frozen = 1 }
  in_fn && saw_frozen && /data-archive-name="true"/ { saw_paid = 1 }
  in_fn && saw_paid && /class="hed"/ && /listing.blurb/ { saw_hed = 1 }
  in_fn && /!openPrize && !isCover/ { saw_later = 1 }
  in_fn && saw_later && /class="slot"/ && /listing.blurb/ { saw_slot = 1 }
  in_fn && saw_later && /class="dek"/ && /displaySponsor/ { saw_dek = 1 }
  END { exit(saw_hed && saw_slot && saw_dek ? 0 : 1) }
' src/views/skin.ts; then
  fail "closed occupied Cover · #1 must keep the paid-name hed; later ranks must drop class=hed"
fi
if ! awk '
  /export function renderBoardHtml/ { in_fn = 1 }
  in_fn && /readFrozenCover/ { saw_gate = 1 }
  in_fn && saw_gate && /\$\{rack\}/ { saw_rack = 1 }
  in_fn && saw_gate && saw_rack && /\$\{claim\}/ { found = 1 }
  END { exit(found ? 0 : 1) }
' src/views/skin.ts; then
  fail "closed occupied / must render the frozen rack before the live open-cover hop"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn {
    if ($0 ~ /board.status === "closed"/) closed = 1
    if (closed && $0 ~ /listings.length === 0/) empty = 1
    if (empty && $0 ~ /data-open-cover="true"/) empty_hop = 1
    if (closed && empty && $0 ~ /data-frozen-flag="true"/) occupied_line = $0
  }
  END {
    if (!empty_hop) exit 1
    if (occupied_line == "") exit 1
    if (occupied_line ~ /data-open-cover/) exit 1
    if (occupied_line !~ /frozen last-7-days rank snapshot/) exit 1
    exit 0
  }
' src/views/skin.ts; then
  fail "closed occupied flag must drop the live open-cover hop so Cover · #1 stays first"
fi
if ! awk '
  /function renderClaim/ { in_fn = 1 }
  in_fn && /^function / && !/renderClaim/ { in_fn = 0 }
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && saw_closed && /listings.length === 0/ { saw_empty = 1 }
  in_fn && saw_empty && /No last-7-days cover sold/ { empty_ok = 1 }
  in_fn && saw_closed && /data-frozen-issue="true"/ { saw_frozen = 1 }
  in_fn && saw_frozen && /data-open-cover="true"/ { found = 1 }
  END { exit(empty_ok && found ? 0 : 1) }
' src/views/skin.ts; then
  fail "closed occupied live hop must sit after the frozen rack; empty closed stays empty-issue"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 0 ? 0 : 1) }
' src/views/skin.ts; then
  fail "closed occupied freeze must not add another #claim hop in the flag"
fi
if grep -E 'data-claim-after-read-seven|data-read-after-claim-seven' src/views/skin.ts; then
  fail "closed occupied freeze must not stamp claim-after-read-N / read-after-claim-N"
fi
if awk '/^export const OCCUPIED_CSS/{p=1} p{print} /^export const ISSUE_CSS/{exit}' src/views/skin.ts \
  | grep -Eq 'data-frozen-cover|data-archive-name|data-frozen-board|data-frozen-issue'; then
  fail "OCCUPIED_CSS must not swallow closed occupied freeze composition"
fi
if awk '/^export const FOLIO_CSS/{p=1} p{print} /^export const OCCUPIED_CSS/{exit}' src/views/skin.ts \
  | grep -Eq 'data-paid-name|later-listing|One-line listing|data-cover-first'; then
  fail "do not re-ship FOLIO vs ISSUE, Cover-first, or paid-name into FOLIO_CSS"
fi
node -e '
const { readFileSync } = require("fs");
const src = readFileSync("src/views/skin.ts", "utf8");
const folio = src.slice(src.indexOf("export const FOLIO_CSS"), src.indexOf("export const OCCUPIED_CSS"));
const occupied = src.slice(src.indexOf("export const OCCUPIED_CSS"), src.indexOf("export const ISSUE_CSS"));
const frozenHed = folio.match(/\.week-closed-occupied \.cover-line\.cover\[data-frozen-cover\]\[data-archive-name\] \.hed \{([^}]*)\}/);
const laterSlot = folio.match(/\.week-closed-occupied \.cover-line:not\(\[data-frozen-cover\]\) \.slot \{([^}]*)\}/);
const liveHop = folio.match(/\.week-closed-occupied \.form-hint\[data-frozen-issue\] a\[data-open-cover\] \{([^}]*)\}/);
const openHed = occupied.match(/\.week-open-sold \.cover-line\[data-named-prize\] \.hed \{([^}]*)\}/);
if (!frozenHed || !laterSlot || !liveHop || !openHed) {
  console.error("missing frozen Cover · #1, later slot, live hop, or occupied Cover · #1 CSS");
  process.exit(1);
}
const frozenSize = frozenHed[1].match(/font-size:\s*([\d.]+)rem/);
const slotSize = laterSlot[1].match(/font-size:\s*([\d.]+)rem/);
const openSize = openHed[1].match(/font-size:\s*([\d.]+)rem/);
if (!frozenSize || !slotSize || !openSize) {
  console.error("missing font-size on frozen Cover · #1, later slot, or occupied Cover · #1");
  process.exit(1);
}
if (Number(slotSize[1]) >= Number(frozenSize[1])) {
  console.error("later frozen ranks still wear Cover · #1 size");
  process.exit(1);
}
if (openHed[1].includes("font-size: 1.55rem") === false) {
  console.error("do not re-ship Cover-first size");
  process.exit(1);
}
if (!liveHop[1].includes("color: var(--mute)")) {
  console.error("live open-cover hop on a frozen issue must stay quieter than Cover · #1");
  process.exit(1);
}
' || fail "closed occupied Cover · #1 must stay the paid name; live claim must stay off the archive"
grep -q 'data-frozen-cover="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-frozen-cover"
grep -q 'closed occupied / keeps frozen Cover · #1' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing closed occupied frozen Cover · #1 case"
grep -q 'doesNotMatch(closedOccupied, /id="claim"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp id=claim"
grep -q 'doesNotMatch(closedOccupied, /Claim the next cover/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not say Claim the next cover"
grep -q 'doesNotMatch(closedOccupied, /action="\\/listings"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not keep the open checkout form"
grep -q 'doesNotMatch(occupiedOpen, /data-frozen-cover="true"/)' tests/product-ui.test.ts \
  || fail "occupied open / must not stamp data-frozen-cover"
grep -q 'doesNotMatch(closedEmpty, /data-frozen-cover="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-frozen-cover"
grep -q 'doesNotMatch(twoSlice.slice(0, 800), /class="hed"/)' tests/product-ui.test.ts \
  || fail "later ranks on closed occupied / must not wear class=hed"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "closed occupied freeze UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: occupied folio keeps one first click — Cover · #1; Claim stays after the listing =="
grep -qE '^### PR 49: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 49: first-time reader"
grep -q 'data-claim-after-listing="true"' src/views/skin.ts || fail "occupied Claim the next cover must mark data-claim-after-listing"
grep -q 'class="claim-after-listing"' src/views/skin.ts || fail "occupied Claim the next cover must sit after the listing"
grep -q 'data-cover-first="true"' src/views/skin.ts || fail "occupied Cover · #1 prize click must stay"
grep -q 'Cover · #1' src/views/skin.ts || fail "occupied cover must still say Cover · #1"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "Claim the next cover hop must stay"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop Claim the next cover must stay"
grep -q 'data-paid-name="true"' src/views/skin.ts || fail "do not re-ship paid-name identity"
grep -q 'data-frozen-cover="true"' src/views/skin.ts || fail "do not re-ship closed occupied freeze"
grep -q 'data-later-write="true"' src/views/skin.ts || fail "do not re-ship empty later-write"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "do not re-ship FOLIO vs ISSUE"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "empty open stand must stay"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "closed empty archive must keep class empty-issue"
grep -F -q '.week-open-sold .claim-after-listing[data-claim-after-listing]' src/views/skin.ts \
  || fail "Claim the next cover must compose after Cover · #1, not above the rack"
grep -F -q '.week-open-sold .claim-after-listing a[data-claim-cover]' src/views/skin.ts \
  || fail "Claim the next cover must stay quieter than Cover · #1 after the listing"
grep -F -q '.week-open-sold .cover-line[data-named-prize] .hed a[data-cover-first]' src/views/skin.ts \
  || fail "Cover · #1 prize click must stay the named hed"
grep -F -q '.week-open-empty[data-empty-open-stand] [data-claim-after-listing]' src/views/skin.ts \
  || fail "empty open shell must hide leaked claim-after-listing chrome"
if grep -E '^\.claim-after-listing\[|^\.claim-after-listing a\[' src/views/skin.ts; then
  fail "claim-after-listing CSS must not apply outside week-open-sold"
fi
if grep -E '^\.flag a\[data-claim-cover\]' src/views/skin.ts; then
  fail "Claim the next cover must not stay a masthead-flag hop"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  in_fn && /data-claim-cover="true"/ { leaked = 1 }
  END { exit(hops == 0 && leaked != 1 ? 0 : 1) }
' src/views/skin.ts; then
  fail "occupied Claim the next cover must leave the masthead flag"
fi
if ! awk '
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_fn = 1 }
  in_fn && /^function / && !/renderRack/ { in_fn = 0 }
  /function renderPitch/ { in_pitch = 1 }
  in_pitch && /^function / && !/renderPitch/ { in_pitch = 0 }
  in_fn && /data-read-cover="true"/ { saw_cover = 1 }
  in_fn && /OCCUPIED_CLAIM_HOP/ { saw_call = 1 }
  in_pitch && /data-cover-first="true"/ { saw_first = 1 }
  in_hop && /data-claim-after-listing="true"/ { saw_after = 1 }
  in_hop && /data-claim-cover="true"/ { saw_claim = 1 }
  in_hop && /href="#claim"/ { hops++ }
  END { exit(saw_cover && saw_first && saw_after && saw_claim && saw_call && hops == 1 ? 0 : 1) }
' src/views/skin.ts; then
  fail "occupied Cover · #1 must be the first occupied click; Claim the next cover stays after the listing"
fi
if ! awk '
  /const OCCUPIED_CLAIM_HOP/ { in_hop = 1 }
  in_hop && /^function / && !/OCCUPIED_CLAIM_HOP/ { in_hop = 0 }
  /function renderRack/ { in_fn = 1 }
  in_fn && /^function / && !/renderRack/ { in_fn = 0 }
  in_hop && /href="#claim"/ { hops++ }
  in_fn && /data-claim-cover="true"/ { leaked = 1 }
  END { exit(hops == 1 && leaked != 1 ? 0 : 1) }
' src/views/skin.ts; then
  fail "cover-before-claim must not add another #claim hop"
fi
if grep -E 'data-claim-after-read-seven|data-read-after-claim-seven' src/views/skin.ts; then
  fail "cover-before-claim must not stamp claim-after-read-N / read-after-claim-N"
fi
if awk '/^export const FOLIO_CSS/{p=1} p{print} /^export const OCCUPIED_CSS/{exit}' src/views/skin.ts \
  | grep -Eq 'data-claim-after-listing|a\[data-claim-cover\]'; then
  fail "FOLIO_CSS must not swallow occupied claim-after-listing chrome"
fi
node -e '
const { readFileSync } = require("fs");
const src = readFileSync("src/views/skin.ts", "utf8");
const occupied = src.slice(src.indexOf("export const OCCUPIED_CSS"), src.indexOf("export const ISSUE_CSS"));
const hed = occupied.match(/\.week-open-sold \.cover-line\[data-named-prize\] \.hed \{([^}]*)\}/);
const claim = occupied.match(/\.week-open-sold \.claim-after-listing a\[data-claim-cover\] \{([^}]*)\}/);
if (!hed || !claim) {
  console.error("missing occupied Cover · #1 or Claim the next cover CSS");
  process.exit(1);
}
const hedSize = hed[1].match(/font-size:\s*([\d.]+)rem/);
const claimSize = claim[1].match(/font-size:\s*([\d.]+)rem/);
if (!hedSize || !claimSize) {
  console.error("missing font-size on Cover · #1 or Claim the next cover");
  process.exit(1);
}
if (Number(claimSize[1]) >= Number(hedSize[1])) {
  console.error("Claim the next cover is not quieter than Cover · #1");
  process.exit(1);
}
if (hed[1].includes("font-size: 1.55rem") === false) {
  console.error("do not re-ship Cover-first size");
  process.exit(1);
}
if (!claim[1].includes("color: var(--mute)")) {
  console.error("Claim the next cover must use mute ink");
  process.exit(1);
}
if (occupied.includes(".week-open-sold .flag a[data-claim-cover]")) {
  console.error("Claim the next cover must not stay a masthead-flag hop");
  process.exit(1);
}
' || fail "occupied Cover · #1 must stay the first click; Claim the next cover stays after the listing"
grep -q 'data-claim-after-listing="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-claim-after-listing"
grep -q 'occupied open / keeps Cover · #1 the first click' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied Cover · #1 first-click case"
grep -q 'doesNotMatch(emptyOpen, /data-claim-after-listing="true"/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-claim-after-listing"
grep -q 'doesNotMatch(closedEmpty, /data-claim-after-listing="true"/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-claim-after-listing"
grep -q 'doesNotMatch(closedOccupied, /data-claim-after-listing="true"/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp data-claim-after-listing"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "cover-before-claim UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: occupied week window is rolling last-7-days — not Monday 00:00 UTC =="
grep -qE '^### PR 51: first-time reader' BUILD.md || fail "BUILD.md missing ### PR 51: first-time reader"
grep -q 'ROLLING_WEEK_MS' src/week.ts || fail "week.ts must export the rolling last-7-days window"
grep -q 'export function rollingWeekStart' src/week.ts || fail "week.ts must export rollingWeekStart"
grep -q 'export function bidInRollingWeek' src/week.ts || fail "week.ts must test paid placement against the rolling week"
grep -q 'options.now' src/rank.ts || fail "rank.ts must rank occupied live against the rolling last-7-days window"
grep -q 'issueIsDueToClose' src/issues.ts || fail "issues.ts must close occupied weeks on the rolling window"
grep -q 'data-rolling-week="true"' src/views/skin.ts || fail "occupied board must stamp the rolling last-7-days window"
grep -q 'Rolling last 7 days from paid placement' src/views/skin.ts \
  || fail "occupied board must name the rolling last-7-days window, not Monday midnight"
grep -q 'Not Monday 00:00 UTC' src/views/skin.ts \
  || fail "occupied board must reject Monday 00:00 UTC lock"
grep -q 'class="week-window"' src/views/skin.ts || fail "occupied board missing week-window"
grep -F -q '.week-open-sold .cover-rack[data-rolling-week] + .week-window[data-rolling-week]' src/views/skin.ts \
  || fail "occupied rolling week cue must be composed in occupied CSS after Cover · #1"
grep -F -q '.week-open-empty[data-empty-open-stand] [data-rolling-week]' src/views/skin.ts \
  || fail "empty-open shell must hide leaked rolling-week chrome"
grep -F -q '.week-open-empty .week-window' src/views/skin.ts \
  || fail "empty-open shell must hide leaked week-window without stamp-only"
grep -F -q '.week-closed-occupied [data-rolling-week]' src/views/skin.ts \
  || fail "closed occupied archive must hide leaked rolling-week chrome"
grep -q 'Occupied live: rolling last-7-days window' src/views/skin.ts \
  || fail "occupied CSS must document rolling last-7-days window"
grep -q 'rolling last 7 days' SPEC.md || fail "SPEC.md missing rolling last-7-days occupied live window"
grep -q 'rolling last 7 days' src/http/routes/pages.ts || fail "about/rules must name the rolling last-7-days window"
grep -q 'occupied week window is rolling last-7-days' tests/product-ui.test.ts \
  || fail "product-ui tests must cover occupied rolling last-7-days window"
grep -Fq 'rolling last-7-days window is 7 * 24h' tests/week.test.ts \
  || fail "week tests must cover rolling last-7-days length"
grep -q 'Monday 00:00 UTC does not drop a bid still inside the rolling week' tests/week.test.ts \
  || fail "week tests must cover Monday midnight is not the drop"
grep -q 'occupied close is 7 days from paid placement' tests/issues.test.ts \
  || fail "issues tests must cover occupied rolling last-7-days close"
grep -q 'rankListings uses only the rolling last-7-days paidAt window' tests/rank.test.ts \
  || fail "rank tests must cover the rolling last-7-days live board"
grep -q 'data-cover-first="true"' src/views/skin.ts || fail "rolling-week cut must keep occupied Cover · #1 the first click"
grep -q 'data-claim-after-listing="true"' src/views/skin.ts || fail "rolling-week cut must keep Claim after the listing"
grep -q 'data-frozen-cover="true"' src/views/skin.ts || fail "rolling-week cut must keep closed occupied freeze"
grep -q 'data-later-write="true"' src/views/skin.ts || fail "rolling-week cut must keep empty later-write"
grep -q 'data-paid-name="true"' src/views/skin.ts || fail "rolling-week cut must keep paid-name"
grep -q 'Claim #1 for' src/views/skin.ts || fail "rolling-week cut must keep Claim #1"
grep -q 'class="amount-field"' src/views/skin.ts || fail "rolling-week cut must keep the dashed amount"
grep -q 'data-bid-step="-1"' src/views/skin.ts || fail "rolling-week cut must keep − stepper"
grep -q 'class="outbid"' src/views/skin.ts || fail "rolling-week cut must keep Outbid"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "rolling-week cut must keep empty stand"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "rolling-week cut must not re-ship FOLIO vs ISSUE"
if grep -nE 'data-claim-after-read-seven|data-read-after-claim-seven|data-rolling-after|rolling-after-N' \
  src/views/skin.ts src/http/routes/board.ts >/dev/null; then
  fail "do not stamp another named hop; compose occupied rolling last-7-days window"
fi
if grep -nE '24 \* 60 \* 60 \* 1000' src/week.ts src/issues.ts src/rank.ts | grep -v '7 \*'; then
  fail "rolling week is not a 24h lock on #1"
fi
if awk '/function renderUnpaid|function renderPending/' src/views/skin.ts | grep -q 'data-rolling-week'; then
  fail "unpaid cue must not stamp the rolling week window"
fi
if grep -E '^\.week-window' src/views/skin.ts; then
  fail "rolling-week CSS must not apply outside week-open-sold"
fi
node -e '
const { readFileSync } = require("fs");
const src = readFileSync("src/views/skin.ts", "utf8");
const occupied = src.slice(src.indexOf("export const OCCUPIED_CSS"), src.indexOf("export const ISSUE_CSS"));
const folio = src.slice(src.indexOf("export const FOLIO_CSS"), src.indexOf("export const OCCUPIED_CSS"));
const windowRule = occupied.match(/\.week-open-sold \.cover-rack\[data-rolling-week\] \+ \.week-window\[data-rolling-week\] \{([^}]*)\}/);
const hed = occupied.match(/\.week-open-sold \.cover-line\[data-named-prize\] \.hed \{([^}]*)\}/);
if (!windowRule || !hed) {
  console.error("missing occupied rolling week or Cover · #1 CSS");
  process.exit(1);
}
const windowSize = windowRule[1].match(/font-size:\s*([\d.]+)rem/);
const hedSize = hed[1].match(/font-size:\s*([\d.]+)rem/);
if (!windowSize || !hedSize) {
  console.error("missing font-size on rolling week or Cover · #1");
  process.exit(1);
}
if (Number(windowSize[1]) >= Number(hedSize[1])) {
  console.error("rolling week copy is not quieter than Cover · #1");
  process.exit(1);
}
if (windowRule[1].includes("background:")) {
  console.error("rolling week must name the window, not recolor the folio");
  process.exit(1);
}
if (!folio.includes("[data-rolling-week]") || !folio.includes(".week-window")) {
  console.error("FOLIO_CSS must hide leaked rolling-week chrome on empty/closed");
  process.exit(1);
}
' || fail "occupied rolling last-7-days window must be composed, not stamp-only"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "rolling-week UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time sponsor: empty open stand names rolling last-7-days — not Monday issue close =="
grep -qE '^### PR 52: first-time sponsor' BUILD.md \
  || fail "BUILD.md missing ### PR 52: first-time sponsor"
grep -q 'data-fair-window="true"' src/views/skin.ts \
  || fail "empty open stand must stamp data-fair-window"
grep -q 'Live rank is rolling last 7 days from paid placement' src/views/skin.ts \
  || fail "empty open stand must name rolling last 7 days from paid placement"
grep -q 'Not Monday 00:00 UTC' src/views/skin.ts \
  || fail "empty open stand must reject Monday 00:00 UTC as the live-rank drop"
grep -F -q '.week-open-empty .empty-stand .fair-window[data-fair-window]' src/views/skin.ts \
  || fail "empty fair-window copy must be composed in FOLIO_CSS, not stamp-only"
grep -F -q '.week-open-sold .fair-window' src/views/skin.ts \
  || fail "occupied sold week must hide leaked empty fair-window chrome"
grep -F -q '.week-closed-empty .fair-window' src/views/skin.ts \
  || fail "closed empty archive must hide leaked empty fair-window chrome"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "empty rolling copy must keep the empty stand"
grep -q 'This issue’s cover is still open' src/views/skin.ts \
  || fail "empty rolling copy must keep honest empty copy"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty rolling copy must keep empty-stand-first"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts \
  || fail "empty rolling copy must keep the existing claim-after-stand hop"
grep -q 'Claim #1 for' src/views/skin.ts || fail "empty rolling copy must keep Claim #1"
grep -q 'class="amount-field"' src/views/skin.ts || fail "empty rolling copy must keep the dashed amount"
grep -q 'data-bid-step="-1"' src/views/skin.ts || fail "empty rolling copy must keep − stepper"
grep -q 'class="outbid"' src/views/skin.ts || fail "empty rolling copy must keep Outbid"
grep -q 'data-cover-first="true"' src/views/skin.ts \
  || fail "empty rolling copy must keep occupied Cover · #1 the first click"
grep -q 'class="week-window"' src/views/skin.ts || fail "empty rolling copy must keep occupied week-window"
grep -q 'data-rolling-week="true"' src/views/skin.ts \
  || fail "empty rolling copy must keep occupied rolling-week stamp"
grep -q 'data-claim-after-listing="true"' src/views/skin.ts \
  || fail "empty rolling copy must keep Claim after the listing"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "empty rolling copy must keep closed empty-issue"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "empty rolling copy must not re-ship FOLIO vs ISSUE"
grep -q 'empty open stand names rolling last-7-days' tests/product-ui.test.ts \
  || fail "product-ui tests must cover empty stand rolling last-7-days copy"
grep -q 'doesNotMatch(emptyMarkup, /data-rolling-week=/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp occupied data-rolling-week"
grep -q 'doesNotMatch(emptyMarkup, /class="week-window"/)' tests/product-ui.test.ts \
  || fail "empty open / must not leak occupied week-window chrome"
grep -q 'doesNotMatch(occupiedMarkup, /data-fair-window=/)' tests/product-ui.test.ts \
  || fail "occupied open / must not stamp empty fair-window"
grep -q 'doesNotMatch(closedEmptyMarkup, /data-fair-window=/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp empty fair-window"
if ! awk '
  /function renderRack/ { in_rack = 1 }
  in_rack && /class="empty-stand"/ { in_stand = 1 }
  in_stand && /data-fair-window="true"/ { saw_fair = 1 }
  in_stand && /Live rank is rolling last 7 days from paid placement/ { saw_copy = 1 }
  in_stand && /Not Monday 00:00 UTC/ { saw_not_monday = 1 }
  in_stand && /data-rolling-week/ { leaked = 1 }
  in_stand && /week-window/ { leaked = 1 }
  in_stand && /<\/section>/ { in_stand = 0 }
  END { exit(leaked ? 1 : (saw_fair && saw_copy && saw_not_monday ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty-stand must name rolling last-7-days without occupied week-window chrome"
fi
if grep -nE 'data-claim-after-read-seven|data-read-after-claim-seven|data-fair-after|rolling-after-N' \
  src/views/skin.ts src/http/routes/board.ts >/dev/null; then
  fail "do not stamp another named hop; name the fair window on the empty stand"
fi
node -e '
const { readFileSync } = require("fs");
const src = readFileSync("src/views/skin.ts", "utf8");
const folio = src.slice(src.indexOf("export const FOLIO_CSS"), src.indexOf("export const OCCUPIED_CSS"));
const occupied = src.slice(src.indexOf("export const OCCUPIED_CSS"), src.indexOf("export const ISSUE_CSS"));
const fairRule = folio.match(/\.week-open-empty \.empty-stand \.fair-window\[data-fair-window\] \{([^}]*)\}/);
const hed = folio.match(/\n\.hed \{([^}]*)\}/);
if (!fairRule || !hed) {
  console.error("missing empty fair-window or hed CSS");
  process.exit(1);
}
const fairSize = fairRule[1].match(/font-size:\s*([\d.]+)rem/);
const hedSize = hed[1].match(/font-size:\s*([\d.]+)rem/);
if (!fairSize || !hedSize) {
  console.error("missing font-size on empty fair-window or hed");
  process.exit(1);
}
if (Number(fairSize[1]) >= Number(hedSize[1])) {
  console.error("empty fair-window copy is not quieter than No cover sold");
  process.exit(1);
}
if (fairRule[1].includes("background:")) {
  console.error("empty fair-window must name the window, not recolor the folio");
  process.exit(1);
}
if (!folio.includes(".week-open-sold .fair-window") || !folio.includes(".week-closed-empty .fair-window")) {
  console.error("FOLIO_CSS must hide leaked fair-window chrome on occupied/closed");
  process.exit(1);
}
if (occupied.includes("data-fair-window") || occupied.includes(".fair-window")) {
  console.error("occupied CSS must not own empty fair-window chrome");
  process.exit(1);
}
' || fail "empty fair-window must be composed on the empty stand, not stamp-only"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "empty rolling-copy UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time sponsor: empty open ear does not tax live rank as Weekly · UTC Monday =="
grep -q 'data-empty-ear="true"' src/views/skin.ts \
  || fail "empty open nameplate ear must stamp data-empty-ear"
grep -q 'Last 7 days · UTC' src/views/skin.ts \
  || fail "empty open ear must name last 7 days · UTC, not Monday week"
grep -q 'Weekly · UTC' src/views/skin.ts \
  || fail "closed mastheads must still print Weekly · UTC"
grep -F -q '.week-open-empty .nameplate .ear-right[data-empty-ear]' src/views/skin.ts \
  || fail "empty ear copy must be composed in FOLIO_CSS, not stamp-only"
grep -F -q '.week-open-sold [data-empty-ear]' src/views/skin.ts \
  || fail "occupied sold week must hide leaked empty-ear chrome"
grep -F -q '.week-closed-empty [data-empty-ear]' src/views/skin.ts \
  || fail "closed empty archive must hide leaked empty-ear chrome"
grep -F -q '.week-open-empty .nameplate .ear-right:not([data-empty-ear])' src/views/skin.ts \
  || fail "empty open must hide a leaked Weekly · UTC ear"
grep -q 'data-fair-window="true"' src/views/skin.ts \
  || fail "empty ear cut must keep empty stand data-fair-window"
grep -q 'Live rank is rolling last 7 days from paid placement' src/views/skin.ts \
  || fail "empty ear cut must keep empty stand fair-window copy"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "empty ear cut must keep the empty stand"
grep -q 'This issue’s cover is still open' src/views/skin.ts \
  || fail "empty ear cut must keep honest empty copy"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "empty ear cut must keep empty-stand-first"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts \
  || fail "empty ear cut must keep the existing claim-after-stand hop"
grep -q 'Claim #1 for' src/views/skin.ts || fail "empty ear cut must keep Claim #1"
grep -q 'class="amount-field"' src/views/skin.ts || fail "empty ear cut must keep the dashed amount"
grep -q 'data-bid-step="-1"' src/views/skin.ts || fail "empty ear cut must keep − stepper"
grep -q 'class="outbid"' src/views/skin.ts || fail "empty ear cut must keep Outbid"
grep -q 'data-cover-first="true"' src/views/skin.ts \
  || fail "empty ear cut must keep occupied Cover · #1 the first click"
grep -q 'class="week-window"' src/views/skin.ts || fail "empty ear cut must keep occupied week-window"
grep -q 'data-rolling-week="true"' src/views/skin.ts \
  || fail "empty ear cut must keep occupied rolling-week stamp"
grep -q 'data-claim-after-listing="true"' src/views/skin.ts \
  || fail "empty ear cut must keep Claim after the listing"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "empty ear cut must keep closed empty-issue"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "empty ear cut must not re-ship FOLIO vs ISSUE"
grep -q 'empty open ear does not tax live rank' tests/product-ui.test.ts \
  || fail "product-ui tests must cover empty open ear rolling copy"
grep -q 'doesNotMatch(emptyMarkup, /Weekly · UTC/)' tests/product-ui.test.ts \
  || fail "empty open / must not print Weekly · UTC on the nameplate ear"
grep -q 'doesNotMatch(occupiedMarkup, /data-empty-ear=/)' tests/product-ui.test.ts \
  || fail "occupied open / must not stamp empty-ear"
grep -q 'doesNotMatch(closedEmptyMarkup, /data-empty-ear=/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp empty-ear"
grep -q 'class="ear ear-right">Weekly · UTC' tests/product-ui.test.ts \
  || fail "closed issues must still print Weekly · UTC"
if ! awk '
  /function renderMasthead/ { in_head = 1 }
  in_head && /data-empty-ear="true"/ { saw_ear = 1 }
  in_head && /Last 7 days · UTC/ { saw_copy = 1 }
  in_head && /Weekly · UTC/ { saw_weekly = 1 }
  in_head && /function renderFlag/ { in_head = 0 }
  /function renderRack/ { in_rack = 1 }
  in_rack && /class="empty-stand"/ { in_stand = 1 }
  in_stand && /data-fair-window="true"/ { saw_fair = 1 }
  in_stand && /data-empty-ear/ { leaked = 1 }
  in_stand && /<\/section>/ { in_stand = 0 }
  END { exit(leaked ? 1 : (saw_ear && saw_copy && saw_weekly && saw_fair ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty-ear must live on the open nameplate, keep Weekly on closed, and leave the stand fair-window"
fi
if grep -nE 'data-claim-after-read-seven|data-read-after-claim-seven|data-ear-after|empty-ear-after-N' \
  src/views/skin.ts src/http/routes/board.ts >/dev/null; then
  fail "do not stamp another named hop; change the empty open nameplate ear only"
fi
node -e '
const { readFileSync } = require("fs");
const src = readFileSync("src/views/skin.ts", "utf8");
const folio = src.slice(src.indexOf("export const FOLIO_CSS"), src.indexOf("export const OCCUPIED_CSS"));
const occupied = src.slice(src.indexOf("export const OCCUPIED_CSS"), src.indexOf("export const ISSUE_CSS"));
const earRule = folio.match(/\.week-open-empty \.nameplate \.ear-right\[data-empty-ear\] \{([^}]*)\}/);
const nameplate = folio.match(/\.nameplate h1 \{([^}]*)\}/);
if (!earRule || !nameplate) {
  console.error("missing empty-ear or nameplate h1 CSS");
  process.exit(1);
}
const earSize = earRule[1].match(/font-size:\s*([\d.]+)rem/);
if (!earSize) {
  console.error("missing font-size on empty ear");
  process.exit(1);
}
if (Number(earSize[1]) >= 2.6) {
  console.error("empty ear is not quieter than The Cover nameplate");
  process.exit(1);
}
if (earRule[1].includes("background:")) {
  console.error("empty ear must name the window, not recolor the folio");
  process.exit(1);
}
if (!folio.includes(".week-open-sold [data-empty-ear]") || !folio.includes(".week-closed-empty [data-empty-ear]")) {
  console.error("FOLIO_CSS must hide leaked empty-ear chrome on occupied/closed");
  process.exit(1);
}
if (!folio.includes(".week-open-empty .nameplate .ear-right:not([data-empty-ear])")) {
  console.error("FOLIO_CSS must hide a leaked Weekly · UTC ear on empty open");
  process.exit(1);
}
if (occupied.includes("data-empty-ear") || occupied.includes(".ear-right[data-empty-ear]")) {
  console.error("occupied CSS must not own empty-ear chrome");
  process.exit(1);
}
' || fail "empty ear must be composed on the nameplate, not stamp-only"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "empty-ear UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: occupied open ear does not tax live rank as Weekly · UTC Monday =="
grep -q 'data-occupied-ear="true"' src/views/skin.ts \
  || fail "occupied open nameplate ear must stamp data-occupied-ear"
grep -q 'Last 7 days · UTC' src/views/skin.ts \
  || fail "occupied open ear must name last 7 days · UTC, not Monday week"
grep -q 'data-empty-ear="true"' src/views/skin.ts \
  || fail "occupied ear cut must not restamp empty-ear"
grep -q 'Weekly · UTC' src/views/skin.ts \
  || fail "closed mastheads must still print Weekly · UTC"
grep -F -q '.week-open-sold .nameplate .ear-right[data-occupied-ear]' src/views/skin.ts \
  || fail "occupied ear copy must be composed in OCCUPIED_CSS, not stamp-only"
grep -F -q '.week-open-empty [data-occupied-ear]' src/views/skin.ts \
  || fail "empty open must hide leaked occupied-ear chrome"
grep -F -q '.week-closed-empty [data-occupied-ear]' src/views/skin.ts \
  || fail "closed empty archive must hide leaked occupied-ear chrome"
grep -F -q '.week-closed-occupied [data-occupied-ear]' src/views/skin.ts \
  || fail "closed occupied archive must hide leaked occupied-ear chrome"
grep -F -q '.week-open-sold .nameplate .ear-right:not([data-occupied-ear])' src/views/skin.ts \
  || fail "occupied open must hide a leaked Weekly · UTC ear"
grep -q 'data-cover-first="true"' src/views/skin.ts \
  || fail "occupied ear cut must keep Cover · #1 the first click"
grep -q 'class="week-window"' src/views/skin.ts || fail "occupied ear cut must keep occupied week-window"
grep -q 'data-rolling-week="true"' src/views/skin.ts \
  || fail "occupied ear cut must keep occupied rolling-week stamp"
grep -q 'data-claim-after-listing="true"' src/views/skin.ts \
  || fail "occupied ear cut must keep Claim after the listing"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "occupied ear cut must keep the empty stand"
grep -q 'data-fair-window="true"' src/views/skin.ts \
  || fail "occupied ear cut must keep empty stand data-fair-window"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "occupied ear cut must keep empty-stand-first"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts \
  || fail "occupied ear cut must keep the existing claim-after-stand hop"
grep -q 'Claim #1 for' src/views/skin.ts || fail "occupied ear cut must keep Claim #1"
grep -q 'class="amount-field"' src/views/skin.ts || fail "occupied ear cut must keep the dashed amount"
grep -q 'data-bid-step="-1"' src/views/skin.ts || fail "occupied ear cut must keep − stepper"
grep -q 'class="outbid"' src/views/skin.ts || fail "occupied ear cut must keep Outbid"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "occupied ear cut must keep closed empty-issue"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "occupied ear cut must not re-ship FOLIO vs ISSUE"
grep -q 'occupied open ear does not tax live rank' tests/product-ui.test.ts \
  || fail "product-ui tests must cover occupied open ear rolling copy"
grep -q 'doesNotMatch(occupiedMarkup, /Weekly · UTC/)' tests/product-ui.test.ts \
  || fail "occupied open / must not print Weekly · UTC on the nameplate ear"
grep -q 'doesNotMatch(emptyMarkup, /data-occupied-ear=/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp occupied-ear"
grep -q 'doesNotMatch(closedEmptyMarkup, /data-occupied-ear=/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp occupied-ear"
grep -q 'class="ear ear-right" data-empty-ear="true">Last 7 days · UTC' tests/product-ui.test.ts \
  || fail "empty open ear last-7-days must stay"
grep -q 'class="ear ear-right">Weekly · UTC' tests/product-ui.test.ts \
  || fail "closed issues must still print Weekly · UTC"
if ! awk '
  /function renderMasthead/ { in_head = 1 }
  in_head && /data-occupied-ear="true"/ { saw_ear = 1 }
  in_head && /Last 7 days · UTC/ { saw_copy = 1 }
  in_head && /data-empty-ear="true"/ { saw_empty = 1 }
  in_head && /Weekly · UTC/ { saw_weekly = 1 }
  in_head && /function renderFlag/ { in_head = 0 }
  /class="week-window"/ { saw_window = 1 }
  /data-cover-first="true"/ { saw_cover = 1 }
  /class="empty-stand"/ { in_stand = 1 }
  in_stand && /data-occupied-ear/ { leaked = 1 }
  in_stand && /<\/section>/ { in_stand = 0 }
  END { exit(leaked ? 1 : (saw_ear && saw_copy && saw_empty && saw_weekly && saw_window && saw_cover ? 0 : 1)) }
' src/views/skin.ts; then
  fail "occupied-ear must live on the occupied nameplate, keep empty-ear and closed Weekly, and leave Cover · #1 / week-window"
fi
if grep -nE 'data-claim-after-read-seven|data-read-after-claim-seven|data-ear-after|occupied-ear-after-N' \
  src/views/skin.ts src/http/routes/board.ts >/dev/null; then
  fail "do not stamp another named hop; change the occupied open nameplate ear only"
fi
node -e '
const { readFileSync } = require("fs");
const src = readFileSync("src/views/skin.ts", "utf8");
const folio = src.slice(src.indexOf("export const FOLIO_CSS"), src.indexOf("export const OCCUPIED_CSS"));
const occupied = src.slice(src.indexOf("export const OCCUPIED_CSS"), src.indexOf("export const ISSUE_CSS"));
const earRule = occupied.match(/\.week-open-sold \.nameplate \.ear-right\[data-occupied-ear\] \{([^}]*)\}/);
const nameplate = folio.match(/\.nameplate h1 \{([^}]*)\}/);
if (!earRule || !nameplate) {
  console.error("missing occupied-ear or nameplate h1 CSS");
  process.exit(1);
}
const earSize = earRule[1].match(/font-size:\s*([\d.]+)rem/);
if (!earSize) {
  console.error("missing font-size on occupied ear");
  process.exit(1);
}
if (Number(earSize[1]) >= 2.6) {
  console.error("occupied ear is not quieter than The Cover nameplate");
  process.exit(1);
}
if (earRule[1].includes("background:")) {
  console.error("occupied ear must name the window, not recolor the folio");
  process.exit(1);
}
if (!folio.includes(".week-open-empty [data-occupied-ear]") || !folio.includes(".week-closed-empty [data-occupied-ear]") || !folio.includes(".week-closed-occupied [data-occupied-ear]")) {
  console.error("FOLIO_CSS must hide leaked occupied-ear chrome on empty/closed");
  process.exit(1);
}
if (!folio.includes(".week-open-sold .nameplate .ear-right:not([data-occupied-ear])")) {
  console.error("FOLIO_CSS must hide a leaked Weekly · UTC ear on occupied open");
  process.exit(1);
}
if (folio.includes(".week-open-sold .nameplate .ear-right[data-occupied-ear]")) {
  console.error("FOLIO_CSS must not own occupied-ear composition");
  process.exit(1);
}
if (!folio.includes(".week-open-empty .nameplate .ear-right[data-empty-ear]")) {
  console.error("empty-ear composition must stay in FOLIO_CSS");
  process.exit(1);
}
if (occupied.includes("data-empty-ear") || occupied.includes(".ear-right[data-empty-ear]")) {
  console.error("occupied CSS must not own empty-ear chrome");
  process.exit(1);
}
' || fail "occupied ear must be composed on the nameplate, not stamp-only"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "occupied-ear UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: closed occupied ear does not tax frozen rank as Weekly · UTC Monday =="
grep -q 'data-frozen-ear="true"' src/views/skin.ts \
  || fail "closed occupied nameplate ear must stamp data-frozen-ear"
grep -q 'Last 7 days · UTC' src/views/skin.ts \
  || fail "closed occupied ear must name last 7 days · UTC, not Monday week"
grep -q 'data-occupied-ear="true"' src/views/skin.ts \
  || fail "closed occupied ear cut must not restamp occupied-ear"
grep -q 'data-empty-ear="true"' src/views/skin.ts \
  || fail "closed occupied ear cut must not restamp empty-ear"
grep -q 'Weekly · UTC' src/views/skin.ts \
  || fail "closed empty mastheads must still print Weekly · UTC"
grep -F -q '.week-closed-occupied .nameplate .ear-right[data-frozen-ear]' src/views/skin.ts \
  || fail "closed occupied ear copy must be composed in FOLIO_CSS, not stamp-only"
grep -F -q '.week-open-empty [data-frozen-ear]' src/views/skin.ts \
  || fail "empty open must hide leaked frozen-ear chrome"
grep -F -q '.week-open-sold [data-frozen-ear]' src/views/skin.ts \
  || fail "occupied open must hide leaked frozen-ear chrome"
grep -F -q '.week-closed-empty [data-frozen-ear]' src/views/skin.ts \
  || fail "closed empty archive must hide leaked frozen-ear chrome"
grep -F -q '.week-closed-occupied .nameplate .ear-right:not([data-frozen-ear])' src/views/skin.ts \
  || fail "closed occupied must hide a leaked Weekly · UTC ear"
grep -F -q '.week-closed-occupied [data-occupied-ear]' src/views/skin.ts \
  || fail "closed occupied must not wear occupied-ear chrome"
grep -q 'data-cover-first="true"' src/views/skin.ts \
  || fail "closed occupied ear cut must keep occupied Cover · #1 the first click"
grep -q 'class="week-window"' src/views/skin.ts || fail "closed occupied ear cut must keep occupied week-window"
grep -q 'data-rolling-week="true"' src/views/skin.ts \
  || fail "closed occupied ear cut must keep occupied rolling-week stamp"
grep -q 'data-claim-after-listing="true"' src/views/skin.ts \
  || fail "closed occupied ear cut must keep Claim after the listing"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "closed occupied ear cut must keep the empty stand"
grep -q 'data-fair-window="true"' src/views/skin.ts \
  || fail "closed occupied ear cut must keep empty stand data-fair-window"
grep -q 'data-read-stand="true"' src/views/skin.ts || fail "closed occupied ear cut must keep empty-stand-first"
grep -q 'data-claim-after-stand="true"' src/views/skin.ts \
  || fail "closed occupied ear cut must keep the existing claim-after-stand hop"
grep -q 'Claim #1 for' src/views/skin.ts || fail "closed occupied ear cut must keep Claim #1"
grep -q 'class="amount-field"' src/views/skin.ts || fail "closed occupied ear cut must keep the dashed amount"
grep -q 'data-bid-step="-1"' src/views/skin.ts || fail "closed occupied ear cut must keep − stepper"
grep -q 'class="outbid"' src/views/skin.ts || fail "closed occupied ear cut must keep Outbid"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "closed occupied ear cut must keep closed empty-issue"
grep -q 'data-frozen-cover="true"' src/views/skin.ts \
  || fail "closed occupied ear cut must keep frozen Cover · #1"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "closed occupied ear cut must not re-ship FOLIO vs ISSUE"
grep -q 'closed occupied ear does not tax frozen rank' tests/product-ui.test.ts \
  || fail "product-ui tests must cover closed occupied ear rolling copy"
grep -q 'doesNotMatch(closedOccupiedMarkup, /Weekly · UTC/)' tests/product-ui.test.ts \
  || fail "closed occupied /issue must not print Weekly · UTC on the nameplate ear"
grep -q 'doesNotMatch(occupiedMarkup, /data-frozen-ear=/)' tests/product-ui.test.ts \
  || fail "occupied open / must not stamp frozen-ear"
grep -q 'doesNotMatch(emptyMarkup, /data-frozen-ear=/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp frozen-ear"
grep -q 'doesNotMatch(closedEmptyMarkup, /data-frozen-ear=/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp frozen-ear"
grep -q 'class="ear ear-right" data-occupied-ear="true">Last 7 days · UTC' tests/product-ui.test.ts \
  || fail "occupied open ear last-7-days must stay"
grep -q 'class="ear ear-right" data-empty-ear="true">Last 7 days · UTC' tests/product-ui.test.ts \
  || fail "empty open ear last-7-days must stay"
grep -q 'class="ear ear-right">Weekly · UTC' tests/product-ui.test.ts \
  || fail "closed empty must still print Weekly · UTC"
if ! awk '
  /function renderMasthead/ { in_head = 1 }
  in_head && /data-frozen-ear="true"/ { saw_ear = 1 }
  in_head && /Last 7 days · UTC/ { saw_copy = 1 }
  in_head && /data-occupied-ear="true"/ { saw_occupied = 1 }
  in_head && /data-empty-ear="true"/ { saw_empty = 1 }
  in_head && /Weekly · UTC/ { saw_weekly = 1 }
  in_head && /function renderFlag/ { in_head = 0 }
  /class="week-window"/ { saw_window = 1 }
  /data-cover-first="true"/ { saw_cover = 1 }
  /data-frozen-cover="true"/ { saw_frozen = 1 }
  /class="empty-stand"/ { in_stand = 1 }
  in_stand && /data-frozen-ear/ { leaked = 1 }
  in_stand && /<\/section>/ { in_stand = 0 }
  END { exit(leaked ? 1 : (saw_ear && saw_copy && saw_occupied && saw_empty && saw_weekly && saw_window && saw_cover && saw_frozen ? 0 : 1)) }
' src/views/skin.ts; then
  fail "frozen-ear must live on the closed occupied nameplate, keep occupied/empty ears and closed-empty Weekly, and leave Cover · #1 / week-window"
fi
if grep -nE 'data-claim-after-read-seven|data-read-after-claim-seven|data-ear-after|frozen-ear-after-N' \
  src/views/skin.ts src/http/routes/board.ts >/dev/null; then
  fail "do not stamp another named hop; change the closed occupied nameplate ear only"
fi
node -e '
const { readFileSync } = require("fs");
const src = readFileSync("src/views/skin.ts", "utf8");
const folio = src.slice(src.indexOf("export const FOLIO_CSS"), src.indexOf("export const OCCUPIED_CSS"));
const occupied = src.slice(src.indexOf("export const OCCUPIED_CSS"), src.indexOf("export const ISSUE_CSS"));
const earRule = folio.match(/\.week-closed-occupied \.nameplate \.ear-right\[data-frozen-ear\] \{([^}]*)\}/);
const nameplate = folio.match(/\.nameplate h1 \{([^}]*)\}/);
if (!earRule || !nameplate) {
  console.error("missing frozen-ear or nameplate h1 CSS");
  process.exit(1);
}
const earSize = earRule[1].match(/font-size:\s*([\d.]+)rem/);
if (!earSize) {
  console.error("missing font-size on frozen ear");
  process.exit(1);
}
if (Number(earSize[1]) >= 2.6) {
  console.error("frozen ear is not quieter than The Cover nameplate");
  process.exit(1);
}
if (earRule[1].includes("background:")) {
  console.error("frozen ear must name the window, not recolor the folio");
  process.exit(1);
}
if (!folio.includes(".week-open-empty [data-frozen-ear]") || !folio.includes(".week-open-sold [data-frozen-ear]") || !folio.includes(".week-closed-empty [data-frozen-ear]")) {
  console.error("FOLIO_CSS must hide leaked frozen-ear chrome on empty/open/closed-empty");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .nameplate .ear-right:not([data-frozen-ear])")) {
  console.error("FOLIO_CSS must hide a leaked Weekly · UTC ear on closed occupied");
  process.exit(1);
}
if (occupied.includes("data-frozen-ear") || occupied.includes(".ear-right[data-frozen-ear]")) {
  console.error("occupied CSS must not own frozen-ear chrome");
  process.exit(1);
}
if (folio.includes(".week-open-sold .nameplate .ear-right[data-occupied-ear]")) {
  console.error("do not restamp occupied-ear composition into FOLIO_CSS");
  process.exit(1);
}
if (!occupied.includes(".week-open-sold .nameplate .ear-right[data-occupied-ear]")) {
  console.error("occupied-ear composition must stay in OCCUPIED_CSS");
  process.exit(1);
}
if (!folio.includes(".week-open-empty .nameplate .ear-right[data-empty-ear]")) {
  console.error("empty-ear composition must stay in FOLIO_CSS");
  process.exit(1);
}
' || fail "frozen ear must be composed on the nameplate, not stamp-only"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "frozen-ear UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: closed occupied ear names frozen last-7-days, not live Last 7 days =="
grep -q 'data-frozen-ear="true">Frozen last 7 days · UTC' src/views/skin.ts \
  || fail "closed occupied ear must name Frozen last 7 days · UTC"
if grep -q 'data-frozen-ear="true">Last 7 days · UTC' src/views/skin.ts; then
  fail "closed occupied ear must not print live Last 7 days · UTC"
fi
grep -q 'data-occupied-ear="true">Last 7 days · UTC' src/views/skin.ts \
  || fail "occupied open Last 7 days must stay"
grep -q 'data-empty-ear="true">Last 7 days · UTC' src/views/skin.ts \
  || fail "empty open ear last-7-days must stay"
grep -q 'class="ear ear-right">Weekly · UTC' src/views/skin.ts \
  || fail "closed empty must still print Weekly · UTC"
grep -q 'data-cover-first="true"' src/views/skin.ts \
  || fail "frozen last-7-days ear cut must keep occupied Cover · #1 the first click"
grep -q 'class="week-window"' src/views/skin.ts \
  || fail "frozen last-7-days ear cut must keep occupied week-window"
grep -q 'data-rolling-week="true"' src/views/skin.ts \
  || fail "frozen last-7-days ear cut must keep occupied rolling-week stamp"
grep -q 'Claim #1 for' src/views/skin.ts || fail "frozen last-7-days ear cut must keep Claim #1"
grep -q 'class="amount-field"' src/views/skin.ts || fail "frozen last-7-days ear cut must keep the dashed amount"
grep -q 'data-bid-step="-1"' src/views/skin.ts || fail "frozen last-7-days ear cut must keep − stepper"
grep -q 'class="outbid"' src/views/skin.ts || fail "frozen last-7-days ear cut must keep Outbid"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "frozen last-7-days ear cut must keep closed empty-issue"
grep -q 'data-frozen-cover="true"' src/views/skin.ts \
  || fail "frozen last-7-days ear cut must keep frozen Cover · #1"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "frozen last-7-days ear cut must not rebuild the print folio"
grep -q 'closed occupied ear names frozen last-7-days' tests/product-ui.test.ts \
  || fail "product-ui tests must cover frozen last-7-days closed occupied ear copy"
grep -q 'doesNotMatch(closedOccupiedMarkup, /data-frozen-ear="true">Last 7 days · UTC</)' tests/product-ui.test.ts \
  || fail "closed occupied /issue must not print live Last 7 days on the frozen ear"
grep -q 'doesNotMatch(occupiedMarkup, /Frozen last 7 days/)' tests/product-ui.test.ts \
  || fail "occupied open / must not print Frozen last 7 days"
grep -q 'doesNotMatch(emptyMarkup, /Frozen last 7 days/)' tests/product-ui.test.ts \
  || fail "empty open / must not print Frozen last 7 days"
grep -q 'doesNotMatch(closedEmptyMarkup, /Frozen last 7 days/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not print Frozen last 7 days"
grep -q 'class="ear ear-right" data-occupied-ear="true">Last 7 days · UTC' tests/product-ui.test.ts \
  || fail "occupied open ear last-7-days must stay"
grep -q 'class="ear ear-right" data-empty-ear="true">Last 7 days · UTC' tests/product-ui.test.ts \
  || fail "empty open ear last-7-days must stay"
grep -q 'class="ear ear-right">Weekly · UTC' tests/product-ui.test.ts \
  || fail "closed empty must still print Weekly · UTC"
if ! awk '
  /function renderMasthead/ { in_head = 1 }
  in_head && /data-frozen-ear="true">Frozen last 7 days · UTC/ { saw_frozen = 1 }
  in_head && /data-frozen-ear="true">Last 7 days · UTC/ { live_on_archive = 1 }
  in_head && /data-occupied-ear="true">Last 7 days · UTC/ { saw_occupied = 1 }
  in_head && /data-empty-ear="true">Last 7 days · UTC/ { saw_empty = 1 }
  in_head && />Weekly · UTC</ { saw_weekly = 1 }
  in_head && /function renderFlag/ { in_head = 0 }
  /class="week-window"/ { saw_window = 1 }
  /data-cover-first="true"/ { saw_cover = 1 }
  /data-frozen-cover="true"/ { saw_archive = 1 }
  END { exit(live_on_archive ? 1 : (saw_frozen && saw_occupied && saw_empty && saw_weekly && saw_window && saw_cover && saw_archive ? 0 : 1)) }
' src/views/skin.ts; then
  fail "closed occupied ear must name Frozen last 7 days, keep occupied/empty Last 7 days and closed-empty Weekly, and leave Cover · #1 / week-window"
fi
if grep -nE 'data-claim-after-read-seven|data-read-after-claim-seven|data-ear-after|frozen-ear-after-N' \
  src/views/skin.ts src/http/routes/board.ts >/dev/null; then
  fail "do not stamp another named hop; change the closed occupied nameplate ear copy only"
fi
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "frozen last-7-days ear UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: closed occupied flag names frozen last-7-days snapshot, not only closed =="
grep -qE '^### PR 57: first-time reader' BUILD.md \
  || fail "BUILD.md missing ### PR 57: first-time reader"
grep -q 'data-frozen-flag="true"' src/views/skin.ts \
  || fail "closed occupied flag must stamp data-frozen-flag"
grep -q 'frozen last-7-days rank snapshot' src/views/skin.ts \
  || fail "closed occupied flag must name frozen last-7-days rank snapshot"
if grep -q 'data-frozen-flag="true">This issue is closed' src/views/skin.ts; then
  fail "closed occupied flag must not only say this issue is closed"
fi
grep -q 'data-frozen-ear="true">Frozen last 7 days · UTC' src/views/skin.ts \
  || fail "frozen last 7 days ear copy must stay"
grep -q 'data-occupied-ear="true">Last 7 days · UTC' src/views/skin.ts \
  || fail "occupied open Last 7 days must stay"
grep -q 'data-empty-ear="true">Last 7 days · UTC' src/views/skin.ts \
  || fail "empty open ear last-7-days must stay"
grep -q 'class="ear ear-right">Weekly · UTC' src/views/skin.ts \
  || fail "closed empty must still print Weekly · UTC"
grep -q 'data-empty-flag="true">This issue is a closed empty week' src/views/skin.ts \
  || fail "closed empty flag must name last-7-days / closed empty week"
grep -F -q '.week-closed-occupied .flag[data-frozen-flag]' src/views/skin.ts \
  || fail "closed occupied flag copy must be composed in FOLIO_CSS, not stamp-only"
grep -F -q '.week-open-empty [data-frozen-flag]' src/views/skin.ts \
  || fail "empty open must hide leaked frozen-flag chrome"
grep -F -q '.week-open-sold [data-frozen-flag]' src/views/skin.ts \
  || fail "occupied open must hide leaked frozen-flag chrome"
grep -F -q '.week-closed-empty [data-frozen-flag]' src/views/skin.ts \
  || fail "closed empty archive must hide leaked frozen-flag chrome"
grep -F -q '.week-closed-occupied .flag:not([data-frozen-flag])' src/views/skin.ts \
  || fail "closed occupied must hide a leaked live close flag"
grep -q 'data-cover-first="true"' src/views/skin.ts \
  || fail "closed occupied flag cut must keep occupied Cover · #1 the first click"
grep -q 'class="week-window"' src/views/skin.ts \
  || fail "closed occupied flag cut must keep occupied week-window"
grep -q 'data-rolling-week="true"' src/views/skin.ts \
  || fail "closed occupied flag cut must keep occupied rolling-week stamp"
grep -q 'data-claim-after-listing="true"' src/views/skin.ts \
  || fail "closed occupied flag cut must keep Claim after the listing"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "closed occupied flag cut must keep the empty stand"
grep -q 'data-fair-window="true"' src/views/skin.ts \
  || fail "closed occupied flag cut must keep empty stand data-fair-window"
grep -q 'Claim #1 for' src/views/skin.ts || fail "closed occupied flag cut must keep Claim #1"
grep -q 'class="amount-field"' src/views/skin.ts || fail "closed occupied flag cut must keep the dashed amount"
grep -q 'data-bid-step="-1"' src/views/skin.ts || fail "closed occupied flag cut must keep − stepper"
grep -q 'class="outbid"' src/views/skin.ts || fail "closed occupied flag cut must keep Outbid"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "closed occupied flag cut must keep closed empty-issue"
grep -q 'data-frozen-cover="true"' src/views/skin.ts \
  || fail "closed occupied flag cut must keep frozen Cover · #1"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "closed occupied flag cut must not rebuild the print folio"
grep -q 'closed occupied flag names frozen last-7-days snapshot' tests/product-ui.test.ts \
  || fail "product-ui tests must cover closed occupied frozen last-7-days flag copy"
grep -q 'doesNotMatch(closedOccupiedMarkup, /class="flag">This issue is closed' tests/product-ui.test.ts \
  || fail "closed occupied /issue must not keep the live close flag line"
grep -q 'doesNotMatch(occupiedMarkup, /data-frozen-flag=/)' tests/product-ui.test.ts \
  || fail "occupied open / must not stamp frozen-flag"
grep -q 'doesNotMatch(emptyMarkup, /data-frozen-flag=/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp frozen-flag"
grep -q 'doesNotMatch(closedEmptyMarkup, /data-frozen-flag=/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp frozen-flag"
grep -q 'class="ear ear-right" data-frozen-ear="true">Frozen last 7 days · UTC' tests/product-ui.test.ts \
  || fail "frozen last 7 days ear copy must stay"
grep -q 'class="ear ear-right" data-occupied-ear="true">Last 7 days · UTC' tests/product-ui.test.ts \
  || fail "occupied open ear last-7-days must stay"
grep -q 'class="ear ear-right" data-empty-ear="true">Last 7 days · UTC' tests/product-ui.test.ts \
  || fail "empty open ear last-7-days must stay"
grep -q 'class="ear ear-right">Weekly · UTC' tests/product-ui.test.ts \
  || fail "closed empty must still print Weekly · UTC"
if ! awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  in_flag && /data-frozen-flag="true"/ { saw_flag = 1 }
  in_flag && /frozen last-7-days rank snapshot/ { saw_copy = 1 }
  in_flag && /data-frozen-flag="true">This issue is closed/ { closed_only = 1 }
  in_flag && /listings.length === 0/ { empty = 1 }
  in_flag && empty && /data-empty-flag="true">This issue is a closed empty week/ { saw_empty_closed = 1 }
  in_flag && /href="#claim"/ { hops++ }
  /function renderMasthead/ { in_head = 1 }
  in_head && /data-frozen-ear="true">Frozen last 7 days · UTC/ { saw_ear = 1 }
  in_head && /function renderFlag/ { in_head = 0 }
  /class="week-window"/ { saw_window = 1 }
  /data-cover-first="true"/ { saw_cover = 1 }
  /data-frozen-cover="true"/ { saw_archive = 1 }
  END { exit(closed_only || hops ? 1 : (saw_flag && saw_copy && saw_empty_closed && saw_ear && saw_window && saw_cover && saw_archive ? 0 : 1)) }
' src/views/skin.ts; then
  fail "closed occupied flag must name the freeze snapshot, keep closed-empty close copy and frozen ear, and leave Cover · #1 / week-window"
fi
if grep -nE 'data-claim-after-read-seven|data-read-after-claim-seven|data-flag-after|frozen-flag-after-N' \
  src/views/skin.ts src/http/routes/board.ts >/dev/null; then
  fail "do not stamp another named hop; change the closed occupied flag only"
fi
node -e '
const { readFileSync } = require("fs");
const src = readFileSync("src/views/skin.ts", "utf8");
const folio = src.slice(src.indexOf("export const FOLIO_CSS"), src.indexOf("export const OCCUPIED_CSS"));
const occupied = src.slice(src.indexOf("export const OCCUPIED_CSS"), src.indexOf("export const ISSUE_CSS"));
const flagRule = folio.match(/\.week-closed-occupied \.flag\[data-frozen-flag\] \{([^}]*)\}/);
if (!flagRule) {
  console.error("missing frozen-flag CSS");
  process.exit(1);
}
if (!flagRule[1].includes("font-weight:")) {
  console.error("frozen-flag must be composed, not stamp-only");
  process.exit(1);
}
if (flagRule[1].includes("background:")) {
  console.error("frozen-flag must name the snapshot, not recolor the folio");
  process.exit(1);
}
if (!folio.includes(".week-open-empty [data-frozen-flag]") || !folio.includes(".week-open-sold [data-frozen-flag]") || !folio.includes(".week-closed-empty [data-frozen-flag]")) {
  console.error("FOLIO_CSS must hide leaked frozen-flag chrome on empty/open/closed-empty");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .flag:not([data-frozen-flag])")) {
  console.error("FOLIO_CSS must hide a leaked live close flag on closed occupied");
  process.exit(1);
}
if (occupied.includes("data-frozen-flag") || occupied.includes(".flag[data-frozen-flag]")) {
  console.error("occupied CSS must not own frozen-flag chrome");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .nameplate .ear-right[data-frozen-ear]")) {
  console.error("do not restamp the frozen ear out of FOLIO_CSS");
  process.exit(1);
}
if (folio.includes(".week-open-sold .nameplate .ear-right[data-occupied-ear]")) {
  console.error("do not restamp occupied-ear composition into FOLIO_CSS");
  process.exit(1);
}
if (!occupied.includes(".week-open-sold .nameplate .ear-right[data-occupied-ear]")) {
  console.error("occupied-ear composition must stay in OCCUPIED_CSS");
  process.exit(1);
}
if (!folio.includes(".week-open-empty .nameplate .ear-right[data-empty-ear]")) {
  console.error("empty-ear composition must stay in FOLIO_CSS");
  process.exit(1);
}
' || fail "frozen flag must be composed on the closed occupied masthead, not stamp-only"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "frozen last-7-days flag UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: closed occupied after-rack hint names frozen last-7-days snapshot, not only before close =="
grep -qE '^### PR 58: first-time reader' BUILD.md \
  || fail "BUILD.md missing ### PR 58: first-time reader"
grep -q 'data-frozen-hint="true"' src/views/skin.ts \
  || fail "closed occupied after-rack hint must stamp data-frozen-hint"
grep -q 'frozen last-7-days rank snapshot' src/views/skin.ts \
  || fail "closed occupied after-rack hint must name frozen last-7-days rank snapshot"
if grep -q 'data-frozen-hint="true">This issue is frozen' src/views/skin.ts; then
  fail "closed occupied after-rack hint must not only say this issue is frozen"
fi
if grep -n 'before close' src/views/skin.ts | grep -q 'data-frozen-hint\|data-frozen-issue'; then
  fail "closed occupied after-rack hint must not say before close"
fi
grep -q 'data-frozen-flag="true">This issue is a frozen last-7-days rank snapshot' src/views/skin.ts \
  || fail "frozen flag copy must stay"
grep -q 'data-frozen-ear="true">Frozen last 7 days · UTC' src/views/skin.ts \
  || fail "frozen last 7 days ear copy must stay"
grep -q 'data-occupied-ear="true">Last 7 days · UTC' src/views/skin.ts \
  || fail "occupied open Last 7 days must stay"
grep -q 'data-empty-ear="true">Last 7 days · UTC' src/views/skin.ts \
  || fail "empty open ear last-7-days must stay"
grep -q 'class="ear ear-right">Weekly · UTC' src/views/skin.ts \
  || fail "closed empty must still print Weekly · UTC"
grep -q 'data-empty-freeze="true">No last-7-days cover sold' src/views/skin.ts \
  || fail "closed empty freeze line must name no last-7-days cover sold"
grep -q 'data-empty-flag="true">This issue is a closed empty week' src/views/skin.ts \
  || fail "closed empty flag must name last-7-days / closed empty week"
grep -F -q '.week-closed-occupied .form-hint[data-frozen-issue][data-frozen-hint]' src/views/skin.ts \
  || fail "closed occupied after-rack hint must be composed in FOLIO_CSS, not stamp-only"
grep -F -q '.week-open-empty [data-frozen-hint]' src/views/skin.ts \
  || fail "empty open must hide leaked frozen-hint chrome"
grep -F -q '.week-open-sold [data-frozen-hint]' src/views/skin.ts \
  || fail "occupied open must hide leaked frozen-hint chrome"
grep -F -q '.week-closed-empty [data-frozen-hint]' src/views/skin.ts \
  || fail "closed empty archive must hide leaked frozen-hint chrome"
grep -F -q '.week-closed-occupied .form-hint[data-frozen-issue]:not([data-frozen-hint])' src/views/skin.ts \
  || fail "closed occupied must hide a leaked before-close freeze hint"
grep -q 'data-cover-first="true"' src/views/skin.ts \
  || fail "closed occupied hint cut must keep occupied Cover · #1 the first click"
grep -q 'class="week-window"' src/views/skin.ts \
  || fail "closed occupied hint cut must keep occupied week-window"
grep -q 'data-rolling-week="true"' src/views/skin.ts \
  || fail "closed occupied hint cut must keep occupied rolling-week stamp"
grep -q 'data-claim-after-listing="true"' src/views/skin.ts \
  || fail "closed occupied hint cut must keep Claim after the listing"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "closed occupied hint cut must keep the empty stand"
grep -q 'data-fair-window="true"' src/views/skin.ts \
  || fail "closed occupied hint cut must keep empty stand data-fair-window"
grep -q 'Claim #1 for' src/views/skin.ts || fail "closed occupied hint cut must keep Claim #1"
grep -q 'class="amount-field"' src/views/skin.ts || fail "closed occupied hint cut must keep the dashed amount"
grep -q 'data-bid-step="-1"' src/views/skin.ts || fail "closed occupied hint cut must keep − stepper"
grep -q 'class="outbid"' src/views/skin.ts || fail "closed occupied hint cut must keep Outbid"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "closed occupied hint cut must keep closed empty-issue"
grep -q 'data-frozen-cover="true"' src/views/skin.ts \
  || fail "closed occupied hint cut must keep frozen Cover · #1"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "closed occupied hint cut must not rebuild the print folio"
grep -q 'closed occupied after-rack hint names frozen last-7-days snapshot' tests/product-ui.test.ts \
  || fail "product-ui tests must cover closed occupied frozen last-7-days after-rack hint"
grep -q 'doesNotMatch(closedOccupiedMarkup, /before close/)' tests/product-ui.test.ts \
  || fail "closed occupied /issue must not keep the before-close freeze hint"
grep -q 'doesNotMatch(occupiedMarkup, /data-frozen-hint=/)' tests/product-ui.test.ts \
  || fail "occupied open / must not stamp frozen-hint"
grep -q 'doesNotMatch(emptyMarkup, /data-frozen-hint=/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp frozen-hint"
grep -q 'doesNotMatch(closedEmptyMarkup, /data-frozen-hint=/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp frozen-hint"
grep -q 'class="ear ear-right" data-frozen-ear="true">Frozen last 7 days · UTC' tests/product-ui.test.ts \
  || fail "frozen last 7 days ear copy must stay"
grep -q 'class="flag" data-frozen-flag="true">This issue is a frozen last-7-days rank snapshot' tests/product-ui.test.ts \
  || fail "frozen flag copy must stay"
grep -q 'class="ear ear-right" data-occupied-ear="true">Last 7 days · UTC' tests/product-ui.test.ts \
  || fail "occupied open ear last-7-days must stay"
grep -q 'class="ear ear-right" data-empty-ear="true">Last 7 days · UTC' tests/product-ui.test.ts \
  || fail "empty open ear last-7-days must stay"
grep -q 'class="ear ear-right">Weekly · UTC' tests/product-ui.test.ts \
  || fail "closed empty must still print Weekly · UTC"
grep -F -q 'No last-7-days cover sold\. This empty close is not a freeze of a live week' tests/product-ui.test.ts \
  || fail "closed empty must name no last-7-days cover sold, not a freeze of a live week"
if ! awk '
  /function renderClaim/ { in_claim = 1 }
  in_claim && /^function / && !/renderClaim/ { in_claim = 0 }
  in_claim && /data-frozen-hint="true"/ { saw_hint = 1 }
  in_claim && /frozen last-7-days rank snapshot/ { saw_copy = 1 }
  in_claim && /before close/ { before_close = 1 }
  in_claim && /data-empty-freeze="true"/ { saw_empty = 1 }
  in_claim && /No last-7-days cover sold/ { saw_empty_copy = 1 }
  in_claim && /This issue is frozen. No cover sold/ { old_empty = 1 }
  in_claim && /href="#claim"/ { hops++ }
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  in_flag && /data-frozen-flag="true">This issue is a frozen last-7-days rank snapshot/ { saw_flag = 1 }
  in_flag && /data-empty-flag="true">This issue is a closed empty week/ { saw_empty_closed = 1 }
  /function renderMasthead/ { in_head = 1 }
  in_head && /data-frozen-ear="true">Frozen last 7 days · UTC/ { saw_ear = 1 }
  in_head && /function renderFlag/ { in_head = 0 }
  /class="week-window"/ { saw_window = 1 }
  /data-cover-first="true"/ { saw_cover = 1 }
  /data-frozen-cover="true"/ { saw_archive = 1 }
  END { exit(before_close || hops || old_empty ? 1 : (saw_hint && saw_copy && saw_empty && saw_empty_copy && saw_flag && saw_empty_closed && saw_ear && saw_window && saw_cover && saw_archive ? 0 : 1)) }
' src/views/skin.ts; then
  fail "closed occupied after-rack hint must name the freeze snapshot, keep closed-empty last-7-days empty freeze copy, frozen flag, frozen ear, and leave Cover · #1 / week-window"
fi
if grep -nE 'data-claim-after-read-seven|data-read-after-claim-seven|data-hint-after|frozen-hint-after-N' \
  src/views/skin.ts src/http/routes/board.ts >/dev/null; then
  fail "do not stamp another named hop; change the closed occupied after-rack hint only"
fi
node -e '
const { readFileSync } = require("fs");
const src = readFileSync("src/views/skin.ts", "utf8");
const folio = src.slice(src.indexOf("export const FOLIO_CSS"), src.indexOf("export const OCCUPIED_CSS"));
const occupied = src.slice(src.indexOf("export const OCCUPIED_CSS"), src.indexOf("export const ISSUE_CSS"));
const hintRule = folio.match(/\.week-closed-occupied \.form-hint\[data-frozen-issue\]\[data-frozen-hint\] \{([^}]*)\}/);
if (!hintRule) {
  console.error("missing frozen-hint CSS");
  process.exit(1);
}
if (!hintRule[1].includes("font-weight:")) {
  console.error("frozen-hint must be composed, not stamp-only");
  process.exit(1);
}
if (hintRule[1].includes("background:")) {
  console.error("frozen-hint must name the snapshot, not recolor the folio");
  process.exit(1);
}
if (!folio.includes(".week-open-empty [data-frozen-hint]") || !folio.includes(".week-open-sold [data-frozen-hint]") || !folio.includes(".week-closed-empty [data-frozen-hint]")) {
  console.error("FOLIO_CSS must hide leaked frozen-hint chrome on empty/open/closed-empty");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .form-hint[data-frozen-issue]:not([data-frozen-hint])")) {
  console.error("FOLIO_CSS must hide a leaked before-close freeze hint on closed occupied");
  process.exit(1);
}
if (occupied.includes("data-frozen-hint") || occupied.includes(".form-hint[data-frozen-hint]")) {
  console.error("occupied CSS must not own frozen-hint chrome");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .flag[data-frozen-flag]")) {
  console.error("do not restamp the frozen flag out of FOLIO_CSS");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .nameplate .ear-right[data-frozen-ear]")) {
  console.error("do not restamp the frozen ear out of FOLIO_CSS");
  process.exit(1);
}
if (folio.includes(".week-open-sold .nameplate .ear-right[data-occupied-ear]")) {
  console.error("do not restamp occupied-ear composition into FOLIO_CSS");
  process.exit(1);
}
if (!occupied.includes(".week-open-sold .nameplate .ear-right[data-occupied-ear]")) {
  console.error("occupied-ear composition must stay in OCCUPIED_CSS");
  process.exit(1);
}
if (!folio.includes(".week-open-empty .nameplate .ear-right[data-empty-ear]")) {
  console.error("empty-ear composition must stay in FOLIO_CSS");
  process.exit(1);
}
' || fail "frozen after-rack hint must be composed on the closed occupied freeze note, not stamp-only"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "frozen last-7-days after-rack hint UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: closed empty freeze line names no last-7-days cover, not a freeze of a live week =="
grep -qE '^### PR 59: first-time reader' BUILD.md \
  || fail "BUILD.md missing ### PR 59: first-time reader"
grep -q 'data-empty-freeze="true"' src/views/skin.ts \
  || fail "closed empty freeze line must stamp data-empty-freeze"
grep -q 'No last-7-days cover sold' src/views/skin.ts \
  || fail "closed empty freeze line must name no last-7-days cover sold"
grep -q 'This empty close is not a freeze of a live week' src/views/skin.ts \
  || fail "closed empty freeze line must say this empty close is not a freeze of a live week"
if grep -q 'This issue is frozen. No cover sold' src/views/skin.ts; then
  fail "closed empty freeze line must not say this issue is frozen / no cover sold"
fi
if grep -q 'data-empty-freeze="true">This issue is frozen' src/views/skin.ts; then
  fail "closed empty freeze line must not read as the occupied freeze"
fi
grep -q 'data-frozen-hint="true">This issue is a frozen last-7-days rank snapshot' src/views/skin.ts \
  || fail "occupied freeze-hint copy must stay"
grep -q 'data-frozen-flag="true">This issue is a frozen last-7-days rank snapshot' src/views/skin.ts \
  || fail "frozen flag copy must stay"
grep -q 'data-frozen-ear="true">Frozen last 7 days · UTC' src/views/skin.ts \
  || fail "frozen last 7 days ear copy must stay"
grep -q 'data-occupied-ear="true">Last 7 days · UTC' src/views/skin.ts \
  || fail "occupied open Last 7 days must stay"
grep -q 'data-empty-ear="true">Last 7 days · UTC' src/views/skin.ts \
  || fail "empty open ear last-7-days must stay"
grep -q 'class="ear ear-right">Weekly · UTC' src/views/skin.ts \
  || fail "closed empty must still print Weekly · UTC"
grep -q 'data-empty-flag="true">This issue is a closed empty week' src/views/skin.ts \
  || fail "closed empty flag must name last-7-days / closed empty week"
grep -F -q '.week-closed-empty .form-hint[data-empty-freeze]' src/views/skin.ts \
  || fail "closed empty freeze line must be composed in FOLIO_CSS, not stamp-only"
grep -F -q '.week-open-empty [data-empty-freeze]' src/views/skin.ts \
  || fail "empty open must hide leaked empty-freeze chrome"
grep -F -q '.week-open-sold [data-empty-freeze]' src/views/skin.ts \
  || fail "occupied open must hide leaked empty-freeze chrome"
grep -F -q '.week-closed-occupied [data-empty-freeze]' src/views/skin.ts \
  || fail "closed occupied archive must hide leaked empty-freeze chrome"
grep -F -q '.week-closed-empty .form-hint:not([data-empty-freeze])' src/views/skin.ts \
  || fail "closed empty must hide a leaked frozen live-week freeze line"
grep -q 'data-cover-first="true"' src/views/skin.ts \
  || fail "closed empty freeze cut must keep occupied Cover · #1 the first click"
grep -q 'class="week-window"' src/views/skin.ts \
  || fail "closed empty freeze cut must keep occupied week-window"
grep -q 'data-rolling-week="true"' src/views/skin.ts \
  || fail "closed empty freeze cut must keep occupied rolling-week stamp"
grep -q 'data-claim-after-listing="true"' src/views/skin.ts \
  || fail "closed empty freeze cut must keep Claim after the listing"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "closed empty freeze cut must keep the empty stand"
grep -q 'data-fair-window="true"' src/views/skin.ts \
  || fail "closed empty freeze cut must keep empty stand data-fair-window"
grep -q 'Claim #1 for' src/views/skin.ts || fail "closed empty freeze cut must keep Claim #1"
grep -q 'class="amount-field"' src/views/skin.ts || fail "closed empty freeze cut must keep the dashed amount"
grep -q 'data-bid-step="-1"' src/views/skin.ts || fail "closed empty freeze cut must keep − stepper"
grep -q 'class="outbid"' src/views/skin.ts || fail "closed empty freeze cut must keep Outbid"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "closed empty freeze cut must keep closed empty-issue"
grep -q 'data-frozen-cover="true"' src/views/skin.ts \
  || fail "closed empty freeze cut must keep frozen Cover · #1"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "closed empty freeze cut must not rebuild the print folio"
grep -q 'closed empty freeze line names no last-7-days cover' tests/product-ui.test.ts \
  || fail "product-ui tests must cover closed empty last-7-days freeze line"
grep -q 'doesNotMatch(closedEmptyMarkup, /This issue is frozen/)' tests/product-ui.test.ts \
  || fail "closed empty /issue must not keep this issue is frozen"
grep -q 'doesNotMatch(occupiedMarkup, /data-empty-freeze=/)' tests/product-ui.test.ts \
  || fail "occupied open / must not stamp empty-freeze"
grep -q 'doesNotMatch(emptyMarkup, /data-empty-freeze=/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp empty-freeze"
grep -q 'doesNotMatch(closedOccupiedMarkup, /data-empty-freeze=/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp empty-freeze"
grep -q 'class="ear ear-right" data-frozen-ear="true">Frozen last 7 days · UTC' tests/product-ui.test.ts \
  || fail "frozen last 7 days ear copy must stay"
grep -q 'class="flag" data-frozen-flag="true">This issue is a frozen last-7-days rank snapshot' tests/product-ui.test.ts \
  || fail "frozen flag copy must stay"
grep -q 'data-frozen-hint="true">This issue is a frozen last-7-days rank snapshot' tests/product-ui.test.ts \
  || fail "occupied freeze-hint copy must stay"
grep -q 'class="ear ear-right" data-occupied-ear="true">Last 7 days · UTC' tests/product-ui.test.ts \
  || fail "occupied open ear last-7-days must stay"
grep -q 'class="ear ear-right" data-empty-ear="true">Last 7 days · UTC' tests/product-ui.test.ts \
  || fail "empty open ear last-7-days must stay"
grep -q 'class="ear ear-right">Weekly · UTC' tests/product-ui.test.ts \
  || fail "closed empty must still print Weekly · UTC"
if ! awk '
  /function renderClaim/ { in_claim = 1 }
  in_claim && /^function / && !/renderClaim/ { in_claim = 0 }
  in_claim && /data-empty-freeze="true"/ { saw_empty = 1 }
  in_claim && /No last-7-days cover sold/ { saw_copy = 1 }
  in_claim && /not a freeze of a live week/ { saw_not_live = 1 }
  in_claim && /This issue is frozen. No cover sold/ { old_empty = 1 }
  in_claim && /data-frozen-hint="true"/ { saw_hint = 1 }
  in_claim && /frozen last-7-days rank snapshot/ { saw_occupied = 1 }
  in_claim && /href="#claim"/ { hops++ }
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  in_flag && /data-frozen-flag="true">This issue is a frozen last-7-days rank snapshot/ { saw_flag = 1 }
  in_flag && /data-empty-flag="true">This issue is a closed empty week/ { saw_empty_closed = 1 }
  /function renderMasthead/ { in_head = 1 }
  in_head && /data-frozen-ear="true">Frozen last 7 days · UTC/ { saw_ear = 1 }
  in_head && /function renderFlag/ { in_head = 0 }
  /class="week-window"/ { saw_window = 1 }
  /data-cover-first="true"/ { saw_cover = 1 }
  /data-frozen-cover="true"/ { saw_archive = 1 }
  /class="empty-issue"/ { saw_slab = 1 }
  END { exit(old_empty || hops ? 1 : (saw_empty && saw_copy && saw_not_live && saw_hint && saw_occupied && saw_flag && saw_empty_closed && saw_ear && saw_window && saw_cover && saw_archive && saw_slab ? 0 : 1)) }
' src/views/skin.ts; then
  fail "closed empty freeze line must name no last-7-days cover, keep occupied freeze-hint / flag / ear, empty-issue, and leave Cover · #1 / week-window"
fi
if grep -nE 'data-claim-after-read-seven|data-read-after-claim-seven|data-empty-freeze-after-N|freeze-after-N' \
  src/views/skin.ts src/http/routes/board.ts >/dev/null; then
  fail "do not stamp another named hop; change the closed empty freeze line only"
fi
node -e '
const { readFileSync } = require("fs");
const src = readFileSync("src/views/skin.ts", "utf8");
const folio = src.slice(src.indexOf("export const FOLIO_CSS"), src.indexOf("export const OCCUPIED_CSS"));
const occupied = src.slice(src.indexOf("export const OCCUPIED_CSS"), src.indexOf("export const ISSUE_CSS"));
const emptyRule = folio.match(/\.week-closed-empty \.form-hint\[data-empty-freeze\] \{([^}]*)\}/);
if (!emptyRule) {
  console.error("missing empty-freeze CSS");
  process.exit(1);
}
if (!emptyRule[1].includes("font-weight:")) {
  console.error("empty-freeze must be composed, not stamp-only");
  process.exit(1);
}
if (emptyRule[1].includes("background:")) {
  console.error("empty-freeze must name the leftover, not recolor the folio");
  process.exit(1);
}
if (!folio.includes(".week-open-empty [data-empty-freeze]") || !folio.includes(".week-open-sold [data-empty-freeze]") || !folio.includes(".week-closed-occupied [data-empty-freeze]")) {
  console.error("FOLIO_CSS must hide leaked empty-freeze chrome on empty/open/closed-occupied");
  process.exit(1);
}
if (!folio.includes(".week-closed-empty .form-hint:not([data-empty-freeze])")) {
  console.error("FOLIO_CSS must hide a leaked frozen live-week freeze line on closed empty");
  process.exit(1);
}
if (occupied.includes("data-empty-freeze") || occupied.includes(".form-hint[data-empty-freeze]")) {
  console.error("occupied CSS must not own empty-freeze chrome");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .form-hint[data-frozen-issue][data-frozen-hint]")) {
  console.error("do not restamp the occupied freeze-hint out of FOLIO_CSS");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .flag[data-frozen-flag]")) {
  console.error("do not restamp the frozen flag out of FOLIO_CSS");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .nameplate .ear-right[data-frozen-ear]")) {
  console.error("do not restamp the frozen ear out of FOLIO_CSS");
  process.exit(1);
}
if (folio.includes(".week-open-sold .nameplate .ear-right[data-occupied-ear]")) {
  console.error("do not restamp occupied-ear composition into FOLIO_CSS");
  process.exit(1);
}
if (!occupied.includes(".week-open-sold .nameplate .ear-right[data-occupied-ear]")) {
  console.error("occupied-ear composition must stay in OCCUPIED_CSS");
  process.exit(1);
}
if (!folio.includes(".week-open-empty .nameplate .ear-right[data-empty-ear]")) {
  console.error("empty-ear composition must stay in FOLIO_CSS");
  process.exit(1);
}
' || fail "empty freeze line must be composed on the closed empty freeze note, not stamp-only"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "closed empty last-7-days freeze UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: closed empty empty-issue kicker names no last-7-days cover, not a generic empty live week =="
grep -qE '^### PR 60: first-time reader' BUILD.md \
  || fail "BUILD.md missing ### PR 60: first-time reader"
grep -q 'data-empty-slab="true"' src/views/skin.ts \
  || fail "closed empty empty-issue kicker must stamp data-empty-slab"
grep -q 'empty-kicker" data-empty-slab="true">No last-7-days cover sold' src/views/skin.ts \
  || fail "closed empty empty-issue kicker must name no last-7-days cover sold"
grep -q 'Nobody bought a last-7-days cover' src/views/skin.ts \
  || fail "closed empty empty-issue dek must name nobody bought a last-7-days cover"
if grep -q 'empty-kicker">No cover sold' src/views/skin.ts; then
  fail "closed empty empty-issue kicker must not stay generic No cover sold"
fi
if grep -q 'Nobody bought the cover' src/views/skin.ts; then
  fail "closed empty empty-issue dek must not stay generic Nobody bought the cover"
fi
grep -q 'data-empty-freeze="true">No last-7-days cover sold' src/views/skin.ts \
  || fail "closed empty freeze line copy must stay"
grep -q 'This empty close is not a freeze of a live week' src/views/skin.ts \
  || fail "closed empty freeze line must still say this empty close is not a freeze of a live week"
grep -q 'data-frozen-hint="true">This issue is a frozen last-7-days rank snapshot' src/views/skin.ts \
  || fail "occupied freeze-hint copy must stay"
grep -q 'data-frozen-flag="true">This issue is a frozen last-7-days rank snapshot' src/views/skin.ts \
  || fail "frozen flag copy must stay"
grep -q 'data-frozen-ear="true">Frozen last 7 days · UTC' src/views/skin.ts \
  || fail "frozen last 7 days ear copy must stay"
grep -q 'data-occupied-ear="true">Last 7 days · UTC' src/views/skin.ts \
  || fail "occupied open Last 7 days must stay"
grep -q 'data-empty-ear="true">Last 7 days · UTC' src/views/skin.ts \
  || fail "empty open ear last-7-days must stay"
grep -q 'class="ear ear-right">Weekly · UTC' src/views/skin.ts \
  || fail "closed empty must still print Weekly · UTC"
grep -q 'data-empty-flag="true">This issue is a closed empty week' src/views/skin.ts \
  || fail "closed empty flag must name last-7-days / closed empty week"
grep -F -q '.week-closed-empty .empty-issue .empty-kicker[data-empty-slab]' src/views/skin.ts \
  || fail "closed empty empty-issue kicker must be composed in FOLIO_CSS, not stamp-only"
grep -F -q '.week-open-empty [data-empty-slab]' src/views/skin.ts \
  || fail "empty open must hide leaked empty-slab chrome"
grep -F -q '.week-open-sold [data-empty-slab]' src/views/skin.ts \
  || fail "occupied open must hide leaked empty-slab chrome"
grep -F -q '.week-closed-occupied [data-empty-slab]' src/views/skin.ts \
  || fail "closed occupied archive must hide leaked empty-slab chrome"
grep -F -q '.week-closed-empty .empty-issue .empty-kicker:not([data-empty-slab])' src/views/skin.ts \
  || fail "closed empty must hide a leaked generic empty-issue kicker"
grep -F -q '.week-closed-empty .form-hint[data-empty-freeze]' src/views/skin.ts \
  || fail "closed empty freeze line composition must stay"
grep -q 'data-cover-first="true"' src/views/skin.ts \
  || fail "closed empty slab cut must keep occupied Cover · #1 the first click"
grep -q 'class="week-window"' src/views/skin.ts \
  || fail "closed empty slab cut must keep occupied week-window"
grep -q 'data-rolling-week="true"' src/views/skin.ts \
  || fail "closed empty slab cut must keep occupied rolling-week stamp"
grep -q 'data-claim-after-listing="true"' src/views/skin.ts \
  || fail "closed empty slab cut must keep Claim after the listing"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "closed empty slab cut must keep the empty stand"
grep -q 'data-fair-window="true"' src/views/skin.ts \
  || fail "closed empty slab cut must keep empty stand data-fair-window"
grep -q 'empty-kicker">This issue’s cover' src/views/skin.ts \
  || fail "closed empty slab cut must keep the empty-stand kicker"
grep -q 'Claim #1 for' src/views/skin.ts || fail "closed empty slab cut must keep Claim #1"
grep -q 'class="amount-field"' src/views/skin.ts || fail "closed empty slab cut must keep the dashed amount"
grep -q 'data-bid-step="-1"' src/views/skin.ts || fail "closed empty slab cut must keep − stepper"
grep -q 'class="outbid"' src/views/skin.ts || fail "closed empty slab cut must keep Outbid"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "closed empty slab cut must keep closed empty-issue"
grep -q 'data-frozen-cover="true"' src/views/skin.ts \
  || fail "closed empty slab cut must keep frozen Cover · #1"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "closed empty slab cut must not rebuild the print folio"
grep -q 'closed empty empty-issue kicker names no last-7-days cover' tests/product-ui.test.ts \
  || fail "product-ui tests must cover closed empty last-7-days empty-issue kicker"
grep -q 'doesNotMatch(closedEmptyMarkup, /Nobody bought the cover/)' tests/product-ui.test.ts \
  || fail "closed empty /issue must not keep generic Nobody bought the cover"
grep -q 'doesNotMatch(occupiedMarkup, /data-empty-slab=/)' tests/product-ui.test.ts \
  || fail "occupied open / must not stamp empty-slab"
grep -q 'doesNotMatch(emptyMarkup, /data-empty-slab=/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp empty-slab"
grep -q 'doesNotMatch(closedOccupiedMarkup, /data-empty-slab=/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp empty-slab"
grep -q 'class="ear ear-right" data-frozen-ear="true">Frozen last 7 days · UTC' tests/product-ui.test.ts \
  || fail "frozen last 7 days ear copy must stay"
grep -q 'class="flag" data-frozen-flag="true">This issue is a frozen last-7-days rank snapshot' tests/product-ui.test.ts \
  || fail "frozen flag copy must stay"
grep -q 'data-frozen-hint="true">This issue is a frozen last-7-days rank snapshot' tests/product-ui.test.ts \
  || fail "occupied freeze-hint copy must stay"
grep -q 'class="form-hint" data-empty-freeze="true">No last-7-days cover sold' tests/product-ui.test.ts \
  || fail "closed empty freeze line copy must stay in tests"
grep -q 'class="ear ear-right" data-occupied-ear="true">Last 7 days · UTC' tests/product-ui.test.ts \
  || fail "occupied open ear last-7-days must stay"
grep -q 'class="ear ear-right" data-empty-ear="true">Last 7 days · UTC' tests/product-ui.test.ts \
  || fail "empty open ear last-7-days must stay"
grep -q 'class="ear ear-right">Weekly · UTC' tests/product-ui.test.ts \
  || fail "closed empty must still print Weekly · UTC"
if ! awk '
  /function renderClaim/ { in_claim = 1 }
  in_claim && /^function / && !/renderClaim/ { in_claim = 0 }
  in_claim && /data-empty-freeze="true"/ { saw_freeze = 1 }
  in_claim && /No last-7-days cover sold/ { saw_freeze_copy = 1 }
  in_claim && /not a freeze of a live week/ { saw_not_live = 1 }
  in_claim && /This issue is frozen. No cover sold/ { old_empty = 1 }
  in_claim && /data-frozen-hint="true"/ { saw_hint = 1 }
  in_claim && /frozen last-7-days rank snapshot/ { saw_occupied = 1 }
  in_claim && /href="#claim"/ { hops++ }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_rack && /data-empty-slab="true">No last-7-days cover sold/ { saw_kicker = 1 }
  in_rack && /Nobody bought a last-7-days cover/ { saw_dek = 1 }
  in_rack && /empty-kicker">No cover sold/ { old_kicker = 1 }
  in_rack && /Nobody bought the cover/ { old_dek = 1 }
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  in_flag && /data-frozen-flag="true">This issue is a frozen last-7-days rank snapshot/ { saw_flag = 1 }
  in_flag && /data-empty-flag="true">This issue is a closed empty week/ { saw_empty_closed = 1 }
  /function renderMasthead/ { in_head = 1 }
  in_head && /data-frozen-ear="true">Frozen last 7 days · UTC/ { saw_ear = 1 }
  in_head && /function renderFlag/ { in_head = 0 }
  /class="week-window"/ { saw_window = 1 }
  /data-cover-first="true"/ { saw_cover = 1 }
  /data-frozen-cover="true"/ { saw_archive = 1 }
  /class="empty-issue"/ { saw_slab = 1 }
  END { exit(old_empty || old_kicker || old_dek || hops ? 1 : (saw_freeze && saw_freeze_copy && saw_not_live && saw_kicker && saw_dek && saw_hint && saw_occupied && saw_flag && saw_empty_closed && saw_ear && saw_window && saw_cover && saw_archive && saw_slab ? 0 : 1)) }
' src/views/skin.ts; then
  fail "closed empty empty-issue kicker must name no last-7-days cover, keep freeze line / occupied freeze-hint / flag / ear, empty-issue, and leave Cover · #1 / week-window"
fi
if grep -nE 'data-claim-after-read-seven|data-read-after-claim-seven|data-empty-slab-after-N|slab-after-N' \
  src/views/skin.ts src/http/routes/board.ts >/dev/null; then
  fail "do not stamp another named hop; change the closed empty empty-issue kicker only"
fi
node -e '
const { readFileSync } = require("fs");
const src = readFileSync("src/views/skin.ts", "utf8");
const folio = src.slice(src.indexOf("export const FOLIO_CSS"), src.indexOf("export const OCCUPIED_CSS"));
const occupied = src.slice(src.indexOf("export const OCCUPIED_CSS"), src.indexOf("export const ISSUE_CSS"));
const slabRule = folio.match(/\.week-closed-empty \.empty-issue \.empty-kicker\[data-empty-slab\] \{([^}]*)\}/);
if (!slabRule) {
  console.error("missing empty-slab CSS");
  process.exit(1);
}
if (!slabRule[1].includes("font-weight:")) {
  console.error("empty-slab must be composed, not stamp-only");
  process.exit(1);
}
if (slabRule[1].includes("background:")) {
  console.error("empty-slab must name the leftover, not recolor the folio");
  process.exit(1);
}
if (!folio.includes(".week-open-empty [data-empty-slab]") || !folio.includes(".week-open-sold [data-empty-slab]") || !folio.includes(".week-closed-occupied [data-empty-slab]")) {
  console.error("FOLIO_CSS must hide leaked empty-slab chrome on empty/open/closed-occupied");
  process.exit(1);
}
if (!folio.includes(".week-closed-empty .empty-issue .empty-kicker:not([data-empty-slab])")) {
  console.error("FOLIO_CSS must hide a leaked generic empty-issue kicker on closed empty");
  process.exit(1);
}
if (occupied.includes("data-empty-slab") || occupied.includes(".empty-kicker[data-empty-slab]")) {
  console.error("occupied CSS must not own empty-slab chrome");
  process.exit(1);
}
if (!folio.includes(".week-closed-empty .form-hint[data-empty-freeze]")) {
  console.error("do not restamp the closed empty freeze line out of FOLIO_CSS");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .form-hint[data-frozen-issue][data-frozen-hint]")) {
  console.error("do not restamp the occupied freeze-hint out of FOLIO_CSS");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .flag[data-frozen-flag]")) {
  console.error("do not restamp the frozen flag out of FOLIO_CSS");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .nameplate .ear-right[data-frozen-ear]")) {
  console.error("do not restamp the frozen ear out of FOLIO_CSS");
  process.exit(1);
}
if (folio.includes(".week-open-sold .nameplate .ear-right[data-occupied-ear]")) {
  console.error("do not restamp occupied-ear composition into FOLIO_CSS");
  process.exit(1);
}
if (!occupied.includes(".week-open-sold .nameplate .ear-right[data-occupied-ear]")) {
  console.error("occupied-ear composition must stay in OCCUPIED_CSS");
  process.exit(1);
}
if (!folio.includes(".week-open-empty .nameplate .ear-right[data-empty-ear]")) {
  console.error("empty-ear composition must stay in FOLIO_CSS");
  process.exit(1);
}
' || fail "empty-issue kicker must be composed on the closed empty slab, not stamp-only"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "closed empty last-7-days empty-issue kicker UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: closed empty empty-issue body names no last-7-days cover / closed empty week, not the live empty stand line =="
grep -qE '^### PR 61: first-time reader' BUILD.md \
  || fail "BUILD.md missing ### PR 61: first-time reader"
grep -q 'data-empty-week="true"' src/views/skin.ts \
  || fail "closed empty empty-issue body must stamp data-empty-week"
grep -q 'dek" data-empty-week="true">This closed week has no last-7-days cover' src/views/skin.ts \
  || fail "closed empty empty-issue body must name no last-7-days cover / closed empty week"
grep -q 'Nobody bought a last-7-days cover' src/views/skin.ts \
  || fail "closed empty empty-issue dek must still name nobody bought a last-7-days cover"
if awk '
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_rack && /status === "closed"/ { in_closed = 1 }
  in_closed && /class="empty-stand"/ { in_closed = 0 }
  in_closed && /No paid listings on this board/ { leaked = 1 }
  END { exit(leaked ? 0 : 1) }
' src/views/skin.ts; then
  fail "closed empty empty-issue body must not lead with No paid listings on this board"
fi
grep -q 'empty-kicker" data-empty-slab="true">No last-7-days cover sold' src/views/skin.ts \
  || fail "closed empty last-7-days kicker copy must stay"
grep -q 'data-empty-freeze="true">No last-7-days cover sold' src/views/skin.ts \
  || fail "closed empty freeze line copy must stay"
grep -q 'This empty close is not a freeze of a live week' src/views/skin.ts \
  || fail "closed empty freeze line must still say this empty close is not a freeze of a live week"
grep -q 'data-frozen-hint="true">This issue is a frozen last-7-days rank snapshot' src/views/skin.ts \
  || fail "occupied freeze-hint copy must stay"
grep -q 'data-frozen-flag="true">This issue is a frozen last-7-days rank snapshot' src/views/skin.ts \
  || fail "frozen flag copy must stay"
grep -q 'data-frozen-ear="true">Frozen last 7 days · UTC' src/views/skin.ts \
  || fail "frozen last 7 days ear copy must stay"
grep -q 'data-occupied-ear="true">Last 7 days · UTC' src/views/skin.ts \
  || fail "occupied open Last 7 days must stay"
grep -q 'data-empty-ear="true">Last 7 days · UTC' src/views/skin.ts \
  || fail "empty open ear last-7-days must stay"
grep -q 'class="ear ear-right">Weekly · UTC' src/views/skin.ts \
  || fail "closed empty must still print Weekly · UTC"
grep -q 'data-empty-flag="true">This issue is a closed empty week' src/views/skin.ts \
  || fail "closed empty flag must name last-7-days / closed empty week"
grep -q 'dek">No paid listings on this board. This issue’s cover is still open' src/views/skin.ts \
  || fail "empty open stand must keep No paid listings on this board"
grep -F -q '.week-closed-empty .empty-issue .dek[data-empty-week]' src/views/skin.ts \
  || fail "closed empty empty-issue body must be composed in FOLIO_CSS, not stamp-only"
grep -F -q '.week-open-empty [data-empty-week]' src/views/skin.ts \
  || fail "empty open must hide leaked empty-week chrome"
grep -F -q '.week-open-sold [data-empty-week]' src/views/skin.ts \
  || fail "occupied open must hide leaked empty-week chrome"
grep -F -q '.week-closed-occupied [data-empty-week]' src/views/skin.ts \
  || fail "closed occupied archive must hide leaked empty-week chrome"
grep -F -q '.week-closed-empty .empty-issue p:not(.empty-kicker):not([data-empty-week])' src/views/skin.ts \
  || fail "closed empty must hide a leaked live empty stand line"
grep -F -q '.week-closed-empty .empty-issue .empty-kicker[data-empty-slab]' src/views/skin.ts \
  || fail "closed empty last-7-days kicker composition must stay"
grep -F -q '.week-closed-empty .form-hint[data-empty-freeze]' src/views/skin.ts \
  || fail "closed empty freeze line composition must stay"
grep -q 'data-cover-first="true"' src/views/skin.ts \
  || fail "closed empty body cut must keep occupied Cover · #1 the first click"
grep -q 'class="week-window"' src/views/skin.ts \
  || fail "closed empty body cut must keep occupied week-window"
grep -q 'data-rolling-week="true"' src/views/skin.ts \
  || fail "closed empty body cut must keep occupied rolling-week stamp"
grep -q 'data-claim-after-listing="true"' src/views/skin.ts \
  || fail "closed empty body cut must keep Claim after the listing"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "closed empty body cut must keep the empty stand"
grep -q 'data-fair-window="true"' src/views/skin.ts \
  || fail "closed empty body cut must keep empty stand data-fair-window"
grep -q 'empty-kicker">This issue’s cover' src/views/skin.ts \
  || fail "closed empty body cut must keep the empty-stand kicker"
grep -q 'Claim #1 for' src/views/skin.ts || fail "closed empty body cut must keep Claim #1"
grep -q 'class="amount-field"' src/views/skin.ts || fail "closed empty body cut must keep the dashed amount"
grep -q 'data-bid-step="-1"' src/views/skin.ts || fail "closed empty body cut must keep − stepper"
grep -q 'class="outbid"' src/views/skin.ts || fail "closed empty body cut must keep Outbid"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "closed empty body cut must keep closed empty-issue"
grep -q 'data-frozen-cover="true"' src/views/skin.ts \
  || fail "closed empty body cut must keep frozen Cover · #1"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "closed empty body cut must not rebuild the print folio"
grep -q 'closed empty empty-issue body names no last-7-days cover' tests/product-ui.test.ts \
  || fail "product-ui tests must cover closed empty last-7-days empty-issue body"
grep -q 'doesNotMatch(closedEmptyMarkup, /No paid listings on this board/)' tests/product-ui.test.ts \
  || fail "closed empty /issue must not keep No paid listings on this board"
grep -q 'doesNotMatch(occupiedMarkup, /data-empty-week=/)' tests/product-ui.test.ts \
  || fail "occupied open / must not stamp empty-week"
grep -q 'doesNotMatch(emptyMarkup, /data-empty-week=/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp empty-week"
grep -q 'doesNotMatch(closedOccupiedMarkup, /data-empty-week=/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp empty-week"
grep -q 'class="ear ear-right" data-frozen-ear="true">Frozen last 7 days · UTC' tests/product-ui.test.ts \
  || fail "frozen last 7 days ear copy must stay"
grep -q 'class="flag" data-frozen-flag="true">This issue is a frozen last-7-days rank snapshot' tests/product-ui.test.ts \
  || fail "frozen flag copy must stay"
grep -q 'data-frozen-hint="true">This issue is a frozen last-7-days rank snapshot' tests/product-ui.test.ts \
  || fail "occupied freeze-hint copy must stay"
grep -q 'class="form-hint" data-empty-freeze="true">No last-7-days cover sold' tests/product-ui.test.ts \
  || fail "closed empty freeze line copy must stay in tests"
grep -q 'class="empty-kicker" data-empty-slab="true">No last-7-days cover sold' tests/product-ui.test.ts \
  || fail "closed empty last-7-days kicker copy must stay in tests"
grep -q 'class="ear ear-right" data-occupied-ear="true">Last 7 days · UTC' tests/product-ui.test.ts \
  || fail "occupied open ear last-7-days must stay"
grep -q 'class="ear ear-right" data-empty-ear="true">Last 7 days · UTC' tests/product-ui.test.ts \
  || fail "empty open ear last-7-days must stay"
grep -q 'class="ear ear-right">Weekly · UTC' tests/product-ui.test.ts \
  || fail "closed empty must still print Weekly · UTC"
if ! awk '
  /function renderClaim/ { in_claim = 1 }
  in_claim && /^function / && !/renderClaim/ { in_claim = 0 }
  in_claim && /data-empty-freeze="true"/ { saw_freeze = 1 }
  in_claim && /No last-7-days cover sold/ { saw_freeze_copy = 1 }
  in_claim && /not a freeze of a live week/ { saw_not_live = 1 }
  in_claim && /This issue is frozen. No cover sold/ { old_empty = 1 }
  in_claim && /data-frozen-hint="true"/ { saw_hint = 1 }
  in_claim && /frozen last-7-days rank snapshot/ { saw_occupied = 1 }
  in_claim && /href="#claim"/ { hops++ }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_rack && /status === "closed"/ { in_closed = 1 }
  in_closed && /class="empty-stand"/ { in_closed = 0 }
  in_closed && /data-empty-week="true">This closed week has no last-7-days cover/ { saw_body = 1 }
  in_closed && /Nobody bought a last-7-days cover/ { saw_dek = 1 }
  in_closed && /No paid listings on this board/ { leaked_stand = 1 }
  in_rack && /data-empty-slab="true">No last-7-days cover sold/ { saw_kicker = 1 }
  in_rack && /empty-kicker">No cover sold/ { old_kicker = 1 }
  in_rack && /Nobody bought the cover/ { old_dek = 1 }
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  in_flag && /data-frozen-flag="true">This issue is a frozen last-7-days rank snapshot/ { saw_flag = 1 }
  in_flag && /data-empty-flag="true">This issue is a closed empty week/ { saw_empty_closed = 1 }
  /function renderMasthead/ { in_head = 1 }
  in_head && /data-frozen-ear="true">Frozen last 7 days · UTC/ { saw_ear = 1 }
  in_head && /function renderFlag/ { in_head = 0 }
  /class="week-window"/ { saw_window = 1 }
  /data-cover-first="true"/ { saw_cover = 1 }
  /data-frozen-cover="true"/ { saw_archive = 1 }
  /class="empty-issue"/ { saw_slab = 1 }
  END { exit(old_empty || old_kicker || old_dek || leaked_stand || hops ? 1 : (saw_freeze && saw_freeze_copy && saw_not_live && saw_body && saw_dek && saw_kicker && saw_hint && saw_occupied && saw_flag && saw_empty_closed && saw_ear && saw_window && saw_cover && saw_archive && saw_slab ? 0 : 1)) }
' src/views/skin.ts; then
  fail "closed empty empty-issue body must name no last-7-days cover / closed empty week, keep kicker / freeze line / occupied freeze-hint / flag / ear, empty-issue, and leave Cover · #1 / week-window"
fi
if grep -nE 'data-claim-after-read-seven|data-read-after-claim-seven|data-empty-slab-after-N|data-empty-week-after-N|slab-after-N' \
  src/views/skin.ts src/http/routes/board.ts >/dev/null; then
  fail "do not stamp another named hop; change the closed empty empty-issue body only"
fi
node -e '
const { readFileSync } = require("fs");
const src = readFileSync("src/views/skin.ts", "utf8");
const folio = src.slice(src.indexOf("export const FOLIO_CSS"), src.indexOf("export const OCCUPIED_CSS"));
const occupied = src.slice(src.indexOf("export const OCCUPIED_CSS"), src.indexOf("export const ISSUE_CSS"));
const weekRule = folio.match(/\.week-closed-empty \.empty-issue \.dek\[data-empty-week\] \{([^}]*)\}/);
if (!weekRule) {
  console.error("missing empty-week CSS");
  process.exit(1);
}
if (!weekRule[1].includes("font-weight:")) {
  console.error("empty-week must be composed, not stamp-only");
  process.exit(1);
}
if (weekRule[1].includes("background:")) {
  console.error("empty-week must name the leftover, not recolor the folio");
  process.exit(1);
}
if (!folio.includes(".week-open-empty [data-empty-week]") || !folio.includes(".week-open-sold [data-empty-week]") || !folio.includes(".week-closed-occupied [data-empty-week]")) {
  console.error("FOLIO_CSS must hide leaked empty-week chrome on empty/open/closed-occupied");
  process.exit(1);
}
if (!folio.includes(".week-closed-empty .empty-issue p:not(.empty-kicker):not([data-empty-week])")) {
  console.error("FOLIO_CSS must hide a leaked live empty stand line on closed empty");
  process.exit(1);
}
if (occupied.includes("data-empty-week") || occupied.includes(".dek[data-empty-week]")) {
  console.error("occupied CSS must not own empty-week chrome");
  process.exit(1);
}
if (!folio.includes(".week-closed-empty .empty-issue .empty-kicker[data-empty-slab]")) {
  console.error("do not restamp the closed empty last-7-days kicker out of FOLIO_CSS");
  process.exit(1);
}
if (!folio.includes(".week-closed-empty .form-hint[data-empty-freeze]")) {
  console.error("do not restamp the closed empty freeze line out of FOLIO_CSS");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .form-hint[data-frozen-issue][data-frozen-hint]")) {
  console.error("do not restamp the occupied freeze-hint out of FOLIO_CSS");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .flag[data-frozen-flag]")) {
  console.error("do not restamp the frozen flag out of FOLIO_CSS");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .nameplate .ear-right[data-frozen-ear]")) {
  console.error("do not restamp the frozen ear out of FOLIO_CSS");
  process.exit(1);
}
if (folio.includes(".week-open-sold .nameplate .ear-right[data-occupied-ear]")) {
  console.error("do not restamp occupied-ear composition into FOLIO_CSS");
  process.exit(1);
}
if (!occupied.includes(".week-open-sold .nameplate .ear-right[data-occupied-ear]")) {
  console.error("occupied-ear composition must stay in OCCUPIED_CSS");
  process.exit(1);
}
if (!folio.includes(".week-open-empty .nameplate .ear-right[data-empty-ear]")) {
  console.error("empty-ear composition must stay in FOLIO_CSS");
  process.exit(1);
}
' || fail "empty-issue body must be composed on the closed empty slab, not stamp-only"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "closed empty last-7-days empty-issue body UX must not invent subscribers, open rates, or an article list"
fi

echo "== first-time reader: closed empty flag names last-7-days / closed empty week, not a generic closed archive =="
grep -qE '^### PR 62: first-time reader' BUILD.md \
  || fail "BUILD.md missing ### PR 62: first-time reader"
grep -q 'data-empty-flag="true"' src/views/skin.ts \
  || fail "closed empty flag must stamp data-empty-flag"
grep -q 'data-empty-flag="true">This issue is a closed empty week' src/views/skin.ts \
  || fail "closed empty flag must name last-7-days / closed empty week"
grep -q 'No last-7-days cover. It is not the next issue' src/views/skin.ts \
  || fail "closed empty flag must still say it is not the next issue"
if grep -q 'class="flag">This issue is closed' src/views/skin.ts; then
  fail "closed empty flag must not still say this issue is closed"
fi
if awk '
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  in_flag && /listings.length === 0/ { empty = 1 }
  in_flag && empty && /This issue is closed/ { leaked = 1 }
  END { exit(leaked ? 0 : 1) }
' src/views/skin.ts; then
  fail "closed empty flag must not keep This issue is closed"
fi
grep -q 'dek" data-empty-week="true">This closed week has no last-7-days cover' src/views/skin.ts \
  || fail "closed empty empty-issue body copy must stay"
grep -q 'Nobody bought a last-7-days cover' src/views/skin.ts \
  || fail "closed empty empty-issue dek must still name nobody bought a last-7-days cover"
grep -q 'empty-kicker" data-empty-slab="true">No last-7-days cover sold' src/views/skin.ts \
  || fail "closed empty last-7-days kicker copy must stay"
grep -q 'data-empty-freeze="true">No last-7-days cover sold' src/views/skin.ts \
  || fail "closed empty freeze line copy must stay"
grep -q 'This empty close is not a freeze of a live week' src/views/skin.ts \
  || fail "closed empty freeze line must still say this empty close is not a freeze of a live week"
grep -q 'data-frozen-hint="true">This issue is a frozen last-7-days rank snapshot' src/views/skin.ts \
  || fail "occupied freeze-hint copy must stay"
grep -q 'data-frozen-flag="true">This issue is a frozen last-7-days rank snapshot' src/views/skin.ts \
  || fail "frozen flag copy must stay"
grep -q 'data-frozen-ear="true">Frozen last 7 days · UTC' src/views/skin.ts \
  || fail "frozen last 7 days ear copy must stay"
grep -q 'data-occupied-ear="true">Last 7 days · UTC' src/views/skin.ts \
  || fail "occupied open Last 7 days must stay"
grep -q 'data-empty-ear="true">Last 7 days · UTC' src/views/skin.ts \
  || fail "empty open ear last-7-days must stay"
grep -q 'class="ear ear-right">Weekly · UTC' src/views/skin.ts \
  || fail "closed empty must still print Weekly · UTC"
grep -q 'dek">No paid listings on this board. This issue’s cover is still open' src/views/skin.ts \
  || fail "empty open stand must keep No paid listings on this board"
grep -F -q '.week-closed-empty .flag[data-empty-flag]' src/views/skin.ts \
  || fail "closed empty flag must be composed in FOLIO_CSS, not stamp-only"
grep -F -q '.week-open-empty [data-empty-flag]' src/views/skin.ts \
  || fail "empty open must hide leaked empty-flag chrome"
grep -F -q '.week-open-sold [data-empty-flag]' src/views/skin.ts \
  || fail "occupied open must hide leaked empty-flag chrome"
grep -F -q '.week-closed-occupied [data-empty-flag]' src/views/skin.ts \
  || fail "closed occupied archive must hide leaked empty-flag chrome"
grep -F -q '.week-closed-empty .flag:not([data-empty-flag])' src/views/skin.ts \
  || fail "closed empty must hide a leaked generic closed flag"
grep -F -q '.week-closed-empty .flag a[data-open-cover]' src/views/skin.ts \
  || fail "closed empty open-cover hop composition must stay"
grep -F -q '.week-closed-empty .empty-issue .dek[data-empty-week]' src/views/skin.ts \
  || fail "closed empty empty-issue body composition must stay"
grep -F -q '.week-closed-empty .empty-issue .empty-kicker[data-empty-slab]' src/views/skin.ts \
  || fail "closed empty last-7-days kicker composition must stay"
grep -F -q '.week-closed-empty .form-hint[data-empty-freeze]' src/views/skin.ts \
  || fail "closed empty freeze line composition must stay"
grep -q 'data-cover-first="true"' src/views/skin.ts \
  || fail "closed empty flag cut must keep occupied Cover · #1 the first click"
grep -q 'class="week-window"' src/views/skin.ts \
  || fail "closed empty flag cut must keep occupied week-window"
grep -q 'data-rolling-week="true"' src/views/skin.ts \
  || fail "closed empty flag cut must keep occupied rolling-week stamp"
grep -q 'data-claim-after-listing="true"' src/views/skin.ts \
  || fail "closed empty flag cut must keep Claim after the listing"
grep -q 'class="empty-stand"' src/views/skin.ts || fail "closed empty flag cut must keep the empty stand"
grep -q 'data-fair-window="true"' src/views/skin.ts \
  || fail "closed empty flag cut must keep empty stand data-fair-window"
grep -q 'empty-kicker">This issue’s cover' src/views/skin.ts \
  || fail "closed empty flag cut must keep the empty-stand kicker"
grep -q 'Claim #1 for' src/views/skin.ts || fail "closed empty flag cut must keep Claim #1"
grep -q 'class="amount-field"' src/views/skin.ts || fail "closed empty flag cut must keep the dashed amount"
grep -q 'data-bid-step="-1"' src/views/skin.ts || fail "closed empty flag cut must keep − stepper"
grep -q 'class="outbid"' src/views/skin.ts || fail "closed empty flag cut must keep Outbid"
grep -q 'class="empty-issue"' src/views/skin.ts || fail "closed empty flag cut must keep closed empty-issue"
grep -q 'data-frozen-cover="true"' src/views/skin.ts \
  || fail "closed empty flag cut must keep frozen Cover · #1"
grep -q 'occupiedOpen ? ISSUE_CSS : FOLIO_CSS' src/views/skin.ts \
  || fail "closed empty flag cut must not rebuild the print folio"
grep -q 'closed empty flag names last-7-days' tests/product-ui.test.ts \
  || fail "product-ui tests must cover closed empty last-7-days flag copy"
grep -q 'doesNotMatch(closedEmptyMarkup, /This issue is closed/)' tests/product-ui.test.ts \
  || fail "closed empty /issue must not keep This issue is closed"
grep -q 'doesNotMatch(occupiedMarkup, /data-empty-flag=/)' tests/product-ui.test.ts \
  || fail "occupied open / must not stamp empty-flag"
grep -q 'doesNotMatch(emptyMarkup, /data-empty-flag=/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp empty-flag"
grep -q 'doesNotMatch(closedOccupiedMarkup, /data-empty-flag=/)' tests/product-ui.test.ts \
  || fail "closed occupied archive must not stamp empty-flag"
grep -q 'class="ear ear-right" data-frozen-ear="true">Frozen last 7 days · UTC' tests/product-ui.test.ts \
  || fail "frozen last 7 days ear copy must stay"
grep -q 'class="flag" data-frozen-flag="true">This issue is a frozen last-7-days rank snapshot' tests/product-ui.test.ts \
  || fail "frozen flag copy must stay"
grep -q 'data-frozen-hint="true">This issue is a frozen last-7-days rank snapshot' tests/product-ui.test.ts \
  || fail "occupied freeze-hint copy must stay"
grep -q 'class="form-hint" data-empty-freeze="true">No last-7-days cover sold' tests/product-ui.test.ts \
  || fail "closed empty freeze line copy must stay in tests"
grep -q 'class="empty-kicker" data-empty-slab="true">No last-7-days cover sold' tests/product-ui.test.ts \
  || fail "closed empty last-7-days kicker copy must stay in tests"
grep -q 'class="dek" data-empty-week="true">This closed week has no last-7-days cover' tests/product-ui.test.ts \
  || fail "closed empty empty-issue body copy must stay in tests"
grep -q 'class="ear ear-right" data-occupied-ear="true">Last 7 days · UTC' tests/product-ui.test.ts \
  || fail "occupied open ear last-7-days must stay"
grep -q 'class="ear ear-right" data-empty-ear="true">Last 7 days · UTC' tests/product-ui.test.ts \
  || fail "empty open ear last-7-days must stay"
grep -q 'class="ear ear-right">Weekly · UTC' tests/product-ui.test.ts \
  || fail "closed empty must still print Weekly · UTC"
if ! awk '
  /function renderClaim/ { in_claim = 1 }
  in_claim && /^function / && !/renderClaim/ { in_claim = 0 }
  in_claim && /data-empty-freeze="true"/ { saw_freeze = 1 }
  in_claim && /No last-7-days cover sold/ { saw_freeze_copy = 1 }
  in_claim && /not a freeze of a live week/ { saw_not_live = 1 }
  in_claim && /This issue is frozen. No cover sold/ { old_empty = 1 }
  in_claim && /data-frozen-hint="true"/ { saw_hint = 1 }
  in_claim && /frozen last-7-days rank snapshot/ { saw_occupied = 1 }
  in_claim && /href="#claim"/ { hops++ }
  /function renderRack/ { in_rack = 1 }
  in_rack && /^function / && !/renderRack/ { in_rack = 0 }
  in_rack && /status === "closed"/ { in_closed = 1 }
  in_closed && /class="empty-stand"/ { in_closed = 0 }
  in_closed && /data-empty-week="true">This closed week has no last-7-days cover/ { saw_body = 1 }
  in_closed && /Nobody bought a last-7-days cover/ { saw_dek = 1 }
  in_closed && /No paid listings on this board/ { leaked_stand = 1 }
  in_rack && /data-empty-slab="true">No last-7-days cover sold/ { saw_kicker = 1 }
  in_rack && /empty-kicker">No cover sold/ { old_kicker = 1 }
  in_rack && /Nobody bought the cover/ { old_dek = 1 }
  /function renderFlag/ { in_flag = 1 }
  in_flag && /^function / && !/renderFlag/ { in_flag = 0 }
  in_flag && /data-frozen-flag="true">This issue is a frozen last-7-days rank snapshot/ { saw_flag = 1 }
  in_flag && /data-empty-flag="true">This issue is a closed empty week/ { saw_empty_flag = 1 }
  in_flag && /This issue is closed/ { old_closed = 1 }
  /function renderMasthead/ { in_head = 1 }
  in_head && /data-frozen-ear="true">Frozen last 7 days · UTC/ { saw_ear = 1 }
  in_head && /function renderFlag/ { in_head = 0 }
  /class="week-window"/ { saw_window = 1 }
  /data-cover-first="true"/ { saw_cover = 1 }
  /data-frozen-cover="true"/ { saw_archive = 1 }
  /class="empty-issue"/ { saw_slab = 1 }
  END { exit(old_empty || old_kicker || old_dek || leaked_stand || old_closed || hops ? 1 : (saw_freeze && saw_freeze_copy && saw_not_live && saw_body && saw_dek && saw_kicker && saw_hint && saw_occupied && saw_flag && saw_empty_flag && saw_ear && saw_window && saw_cover && saw_archive && saw_slab ? 0 : 1)) }
' src/views/skin.ts; then
  fail "closed empty flag must name last-7-days / closed empty week, keep body / kicker / freeze line / occupied freeze-hint / flag / ear, empty-issue, and leave Cover · #1 / week-window"
fi
if grep -nE 'data-claim-after-read-seven|data-read-after-claim-seven|data-empty-flag-after-N|data-empty-week-after-N|slab-after-N' \
  src/views/skin.ts src/http/routes/board.ts >/dev/null; then
  fail "do not stamp another named hop; change the closed empty flag only"
fi
node -e '
const { readFileSync } = require("fs");
const src = readFileSync("src/views/skin.ts", "utf8");
const folio = src.slice(src.indexOf("export const FOLIO_CSS"), src.indexOf("export const OCCUPIED_CSS"));
const occupied = src.slice(src.indexOf("export const OCCUPIED_CSS"), src.indexOf("export const ISSUE_CSS"));
const flagRule = folio.match(/\.week-closed-empty \.flag\[data-empty-flag\] \{([^}]*)\}/);
if (!flagRule) {
  console.error("missing empty-flag CSS");
  process.exit(1);
}
if (!flagRule[1].includes("font-weight:")) {
  console.error("empty-flag must be composed, not stamp-only");
  process.exit(1);
}
if (flagRule[1].includes("background:")) {
  console.error("empty-flag must name the leftover, not recolor the folio");
  process.exit(1);
}
if (!folio.includes(".week-open-empty [data-empty-flag]") || !folio.includes(".week-open-sold [data-empty-flag]") || !folio.includes(".week-closed-occupied [data-empty-flag]")) {
  console.error("FOLIO_CSS must hide leaked empty-flag chrome on empty/open/closed-occupied");
  process.exit(1);
}
if (!folio.includes(".week-closed-empty .flag:not([data-empty-flag])")) {
  console.error("FOLIO_CSS must hide a leaked generic closed flag on closed empty");
  process.exit(1);
}
if (occupied.includes("data-empty-flag") || occupied.includes(".flag[data-empty-flag]")) {
  console.error("occupied CSS must not own empty-flag chrome");
  process.exit(1);
}
if (!folio.includes(".week-closed-empty .empty-issue .dek[data-empty-week]")) {
  console.error("do not restamp the closed empty empty-issue body out of FOLIO_CSS");
  process.exit(1);
}
if (!folio.includes(".week-closed-empty .empty-issue .empty-kicker[data-empty-slab]")) {
  console.error("do not restamp the closed empty last-7-days kicker out of FOLIO_CSS");
  process.exit(1);
}
if (!folio.includes(".week-closed-empty .form-hint[data-empty-freeze]")) {
  console.error("do not restamp the closed empty freeze line out of FOLIO_CSS");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .form-hint[data-frozen-issue][data-frozen-hint]")) {
  console.error("do not restamp the occupied freeze-hint out of FOLIO_CSS");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .flag[data-frozen-flag]")) {
  console.error("do not restamp the frozen flag out of FOLIO_CSS");
  process.exit(1);
}
if (!folio.includes(".week-closed-occupied .nameplate .ear-right[data-frozen-ear]")) {
  console.error("do not restamp the frozen ear out of FOLIO_CSS");
  process.exit(1);
}
if (folio.includes(".week-open-sold .nameplate .ear-right[data-occupied-ear]")) {
  console.error("do not restamp occupied-ear composition into FOLIO_CSS");
  process.exit(1);
}
if (!occupied.includes(".week-open-sold .nameplate .ear-right[data-occupied-ear]")) {
  console.error("occupied-ear composition must stay in OCCUPIED_CSS");
  process.exit(1);
}
if (!folio.includes(".week-open-empty .nameplate .ear-right[data-empty-ear]")) {
  console.error("empty-ear composition must stay in FOLIO_CSS");
  process.exit(1);
}
' || fail "closed empty flag must be composed on the masthead, not stamp-only"
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "closed empty last-7-days flag UX must not invent subscribers, open rates, or an article list"
fi

echo "== live-smoke stays operator-only =="
[[ -f scripts/live-smoke.sh ]] || fail "missing scripts/live-smoke.sh"
[[ -x scripts/live-smoke.sh ]] || fail "scripts/live-smoke.sh must be executable"
[[ -f docs/live-smoke.md ]] || fail "missing docs/live-smoke.md"
[[ -s docs/live-smoke.md ]] || fail "empty docs/live-smoke.md"
if grep -Eq '^\s*(bash )?(\./)?scripts/live-smoke\.sh' scripts/test.sh; then
  fail "test.sh must not invoke live-smoke.sh"
fi
if grep -E '^[[:space:]]*(export[[:space:]]+)?POLAR_LIVE=1' scripts/test.sh >/dev/null; then
  fail "test.sh must not set POLAR_LIVE=1"
fi
grep -q 'BLOCKED-SECRET: POLAR_ACCESS_TOKEN' scripts/live-smoke.sh \
  || fail "live-smoke.sh must name BLOCKED-SECRET: POLAR_ACCESS_TOKEN"
grep -q 'POLAR_LIVE' scripts/live-smoke.sh \
  || fail "live-smoke.sh must gate live Polar on POLAR_LIVE"
grep -q 'live-smoke refuses CI=true' scripts/live-smoke.sh \
  || fail "live-smoke.sh must refuse CI=true"
grep -q 'PASS-ERROR' docs/live-smoke.md || fail "docs/live-smoke.md missing PASS-ERROR"
grep -q 'BLOCKED-SECRET' docs/live-smoke.md || fail "docs/live-smoke.md missing BLOCKED-SECRET"

if grep -RInE 'https?://([^/]*\.)?polar\.sh' src tests \
  | grep -v 'src/billing/polar.ts' \
  | grep -v 'tests/billing.test.ts' >/dev/null 2>&1; then
  fail "only src/billing/polar.ts (and its unit tests) may mention polar.sh HTTP"
fi
if grep -RInE 'https?://api\.polar\.sh' src/http src/server.ts >/dev/null 2>&1; then
  fail "HTTP / pages must not hard-code https://api.polar.sh"
fi
if grep -RInE "from ['\\\"].*billing/polar" src/http src/server.ts >/dev/null 2>&1; then
  fail "HTTP / pages must not import billing/polar.ts directly"
fi
grep -q 'POLAR_API_BASE' src/billing/polar.ts \
  || fail "src/billing/polar.ts missing POLAR_API_BASE override"
grep -q 'export class LivePolar' src/billing/polar.ts \
  || fail "src/billing/polar.ts must export LivePolar"
grep -q 'LivePolar' src/billing/create.ts \
  || fail "createPolar must select LivePolar when live is enabled"

if [[ -f package.json ]]; then
  echo "== install =="
  if [[ ! -d node_modules ]]; then
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
  fi

  unset POLAR_ACCESS_TOKEN POLAR_WEBHOOK_SECRET POLAR_LIVE
  export POLAR_FIXTURE_ONLY=1
  [[ "${POLAR_LIVE:-}" != "1" ]] || fail "POLAR_LIVE must stay unset in test.sh"

  echo "== tsc --noEmit =="
  npx tsc --noEmit

  echo "== unit tests =="
  test_log="$(mktemp)"
  trap 'rm -f "$test_log"' EXIT
  set +e
  npx tsx --test --test-reporter spec 'tests/**/*.test.ts' | tee "$test_log"
  test_status=${PIPESTATUS[0]}
  set -e
  [[ $test_status -eq 0 ]] || fail "unit tests failed"
  grep -Eq 'tests[[:space:]]+[1-9][0-9]*' "$test_log" \
    || fail "test runner reported 0 tests"
  grep -q 'occupied week window is rolling last-7-days' "$test_log" \
    || fail "occupied rolling last-7-days leftover test did not run"
  grep -q 'empty open stand names rolling last-7-days' "$test_log" \
    || fail "empty stand rolling last-7-days leftover test did not run"
  grep -q 'empty open ear does not tax live rank' "$test_log" \
    || fail "empty open ear leftover test did not run"
  grep -q 'occupied open ear does not tax live rank' "$test_log" \
    || fail "occupied open ear leftover test did not run"
  grep -q 'closed occupied ear names frozen last-7-days' "$test_log" \
    || fail "closed occupied frozen last-7-days ear leftover test did not run"
  grep -q 'closed occupied flag names frozen last-7-days snapshot' "$test_log" \
    || fail "closed occupied frozen last-7-days flag leftover test did not run"
  grep -q 'closed occupied after-rack hint names frozen last-7-days snapshot' "$test_log" \
    || fail "closed occupied frozen last-7-days after-rack hint leftover test did not run"
  grep -q 'closed empty freeze line names no last-7-days cover' "$test_log" \
    || fail "closed empty last-7-days freeze leftover test did not run"
  grep -q 'closed empty empty-issue kicker names no last-7-days cover' "$test_log" \
    || fail "closed empty last-7-days empty-issue kicker leftover test did not run"
  grep -q 'closed empty empty-issue body names no last-7-days cover' "$test_log" \
    || fail "closed empty last-7-days empty-issue body leftover test did not run"
  grep -q 'closed empty flag names last-7-days' "$test_log" \
    || fail "closed empty last-7-days flag leftover test did not run"
  grep -Fq 'rolling last-7-days window is 7 * 24h' "$test_log" \
    || fail "week tests must cover rolling last-7-days window"
  grep -q 'Monday 00:00 UTC does not drop a bid still inside the rolling week' "$test_log" \
    || fail "Monday midnight rolling-week test did not run"
  grep -q 'occupied close is 7 days from paid placement' "$test_log" \
    || fail "occupied rolling close test did not run"
fi

echo "OK: buildable and testable"
