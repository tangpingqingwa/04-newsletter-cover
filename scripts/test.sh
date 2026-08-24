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
for f in src/issues.ts src/close.ts tests/issues.test.ts; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -q 'issueDate 00:00:00 UTC' src/issues.ts || fail "src/issues.ts missing weekly UTC close instant"
grep -q 'nextWeeklyIssueDate' src/issues.ts || fail "src/issues.ts missing nextWeeklyIssueDate"
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
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "occupied open flag must mark data-claim-cover"
grep -q 'href="#claim"' src/views/skin.ts || fail "occupied open flag must hop to #claim"
grep -q 'Claim the next cover' src/views/skin.ts || fail "occupied hop must say Claim the next cover"
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && /listings.length > 0/ { saw_occupied = 1 }
  in_fn && saw_occupied && /data-claim-cover="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "claim hop must be occupied-open only, after the closed-archive flag"
fi
grep -q 'data-claim-cover="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-claim-cover"
grep -q 'occupied open / names one hop to claim the next cover' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied-open claim-cover hop case"
grep -q 'doesNotMatch(emptyOpen, /data-claim-cover/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-claim-cover"
grep -q 'doesNotMatch(closedOccupied, /data-claim-cover/)' tests/product-ui.test.ts \
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
  /function renderFlag/ { in_fn = 1 }
  in_fn && /listings.length > 0/ { saw_occupied = 1 }
  in_fn && saw_occupied && /data-claim-cover="true"/ { found = 1 }
  END { exit(found ? 0 : 1) }
' src/views/skin.ts; then
  fail "occupied Claim the next cover hop must stay on the flag"
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
  /function renderFlag/ { in_fn = 1 }
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && /listings.length > 0/ { saw_occupied = 1 }
  in_fn && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_fn && saw_sold && /data-claim-cover="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "sold-cover mark must sit on the occupied-open flag before Claim the next cover"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /The next issue/ { saw_next = 1 }
  in_fn && saw_next && /data-sold-cover/ { leaked = 1 }
  END { exit(leaked ? 1 : (saw_next ? 0 : 1)) }
' src/views/skin.ts; then
  fail "empty open flag must keep the next-issue pitch and must not stamp data-sold-cover"
fi
grep -q 'data-sold-cover="true"' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts must cover data-sold-cover"
grep -q 'occupied open / names the sold cover before Claim the next cover' tests/product-ui.test.ts \
  || fail "tests/product-ui.test.ts missing occupied sold-cover certainty case"
grep -q 'doesNotMatch(emptyOpen, /data-sold-cover/)' tests/product-ui.test.ts \
  || fail "empty open / must not stamp data-sold-cover"
grep -q 'doesNotMatch(closedEmpty, /data-sold-cover/)' tests/product-ui.test.ts \
  || fail "closed empty archive must not stamp data-sold-cover"
grep -q 'doesNotMatch(closedOccupied, /data-sold-cover/)' tests/product-ui.test.ts \
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
grep -q 'a\[data-claim-after-sold\]' src/views/skin.ts || fail "occupied claim hop must concentrate on the existing flag link"
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && /listings.length > 0/ { saw_occupied = 1 }
  in_fn && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_fn && saw_sold && /data-claim-cover="true"/ { saw_claim = 1 }
  in_fn && saw_claim && /data-claim-after-sold="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-claim-after-sold must concentrate the existing occupied-open Claim the next cover hop after the sold-cover line"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 1 ? 0 : 1) }
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
  /function renderFlag/ { in_fn = 1 }
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && /listings.length > 0/ { saw_occupied = 1 }
  in_fn && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_fn && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_fn && saw_read && /data-claim-cover="true"/ { saw_claim = 1 }
  in_fn && saw_claim && /data-claim-after-sold="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-read-after-claim-sold must concentrate the existing occupied-open sold-cover line before Claim the next cover"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 1 ? 0 : 1) }
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
  || fail "occupied claim hop must concentrate on the existing flag link after the sold-cover read"
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && /listings.length > 0/ { saw_occupied = 1 }
  in_fn && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_fn && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_fn && saw_read && /data-claim-cover="true"/ { saw_claim = 1 }
  in_fn && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_fn && saw_after_sold && /data-claim-after-read-sold="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-claim-after-read-sold must concentrate the existing occupied-open Claim the next cover hop after the sold-cover read"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 1 ? 0 : 1) }
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
  /function renderFlag/ { in_fn = 1 }
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && /listings.length > 0/ { saw_occupied = 1 }
  in_fn && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_fn && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_fn && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_fn && saw_two && /data-claim-cover="true"/ { saw_claim = 1 }
  in_fn && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_fn && saw_after_sold && /data-claim-after-read-sold="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-read-after-claim-two must re-concentrate the existing occupied-open sold-cover line before Claim the next cover"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 1 ? 0 : 1) }
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
  /function renderFlag/ { in_fn = 1 }
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && /listings.length > 0/ { saw_occupied = 1 }
  in_fn && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_fn && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_fn && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_fn && saw_two && /data-claim-cover="true"/ { saw_claim = 1 }
  in_fn && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_fn && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_fn && saw_after_read && /data-claim-after-read-two="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-claim-after-read-two must re-concentrate the existing occupied-open Claim the next cover hop after the sold-cover read"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 1 ? 0 : 1) }
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
  /function renderFlag/ { in_fn = 1 }
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && /listings.length > 0/ { saw_occupied = 1 }
  in_fn && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_fn && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_fn && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_fn && saw_two && /data-read-after-claim-three="true"/ { saw_three = 1 }
  in_fn && saw_three && /data-claim-cover="true"/ { saw_claim = 1 }
  in_fn && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_fn && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_fn && saw_after_read && /data-claim-after-read-two="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-read-after-claim-three must concentrate the existing occupied-open sold-cover line before Claim the next cover"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 1 ? 0 : 1) }
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
  /function renderFlag/ { in_fn = 1 }
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && /listings.length > 0/ { saw_occupied = 1 }
  in_fn && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_fn && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_fn && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_fn && saw_two && /data-read-after-claim-three="true"/ { saw_three = 1 }
  in_fn && saw_three && /data-claim-cover="true"/ { saw_claim = 1 }
  in_fn && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_fn && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_fn && saw_after_read && /data-claim-after-read-two="true"/ { saw_after_two = 1 }
  in_fn && saw_after_two && /data-claim-after-read-three="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-claim-after-read-three must concentrate the existing occupied-open Claim the next cover hop after the sold-cover read"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 1 ? 0 : 1) }
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
  /function renderFlag/ { in_fn = 1 }
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && /listings.length > 0/ { saw_occupied = 1 }
  in_fn && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_fn && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_fn && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_fn && saw_two && /data-read-after-claim-three="true"/ { saw_three = 1 }
  in_fn && saw_three && /data-read-after-claim-four="true"/ { saw_four = 1 }
  in_fn && saw_four && /data-claim-cover="true"/ { saw_claim = 1 }
  in_fn && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_fn && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_fn && saw_after_read && /data-claim-after-read-two="true"/ { saw_after_two = 1 }
  in_fn && saw_after_two && /data-claim-after-read-three="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-read-after-claim-four must concentrate the existing occupied-open sold-cover line before Claim the next cover"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 1 ? 0 : 1) }
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
  /function renderFlag/ { in_fn = 1 }
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && /listings.length > 0/ { saw_occupied = 1 }
  in_fn && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_fn && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_fn && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_fn && saw_two && /data-read-after-claim-three="true"/ { saw_three = 1 }
  in_fn && saw_three && /data-read-after-claim-four="true"/ { saw_four = 1 }
  in_fn && saw_four && /data-claim-cover="true"/ { saw_claim = 1 }
  in_fn && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_fn && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_fn && saw_after_read && /data-claim-after-read-two="true"/ { saw_after_two = 1 }
  in_fn && saw_after_two && /data-claim-after-read-three="true"/ { saw_after_three = 1 }
  in_fn && saw_after_three && /data-claim-after-read-four="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-claim-after-read-four must concentrate the existing occupied-open Claim the next cover hop after the sold-cover read"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 1 ? 0 : 1) }
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
  /function renderFlag/ { in_fn = 1 }
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && /listings.length > 0/ { saw_occupied = 1 }
  in_fn && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_fn && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_fn && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_fn && saw_two && /data-read-after-claim-three="true"/ { saw_three = 1 }
  in_fn && saw_three && /data-read-after-claim-four="true"/ { saw_four = 1 }
  in_fn && saw_four && /data-read-after-claim-five="true"/ { saw_five = 1 }
  in_fn && saw_five && /data-claim-cover="true"/ { saw_claim = 1 }
  in_fn && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_fn && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_fn && saw_after_read && /data-claim-after-read-two="true"/ { saw_after_two = 1 }
  in_fn && saw_after_two && /data-claim-after-read-three="true"/ { saw_after_three = 1 }
  in_fn && saw_after_three && /data-claim-after-read-four="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-read-after-claim-five must concentrate the existing occupied-open sold-cover line before Claim the next cover"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 1 ? 0 : 1) }
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
  /function renderFlag/ { in_fn = 1 }
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && /listings.length > 0/ { saw_occupied = 1 }
  in_fn && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_fn && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_fn && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_fn && saw_two && /data-read-after-claim-three="true"/ { saw_three = 1 }
  in_fn && saw_three && /data-read-after-claim-four="true"/ { saw_four = 1 }
  in_fn && saw_four && /data-read-after-claim-five="true"/ { saw_five = 1 }
  in_fn && saw_five && /data-claim-cover="true"/ { saw_claim = 1 }
  in_fn && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_fn && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_fn && saw_after_read && /data-claim-after-read-two="true"/ { saw_after_two = 1 }
  in_fn && saw_after_two && /data-claim-after-read-three="true"/ { saw_after_three = 1 }
  in_fn && saw_after_three && /data-claim-after-read-four="true"/ { saw_after_four = 1 }
  in_fn && saw_after_four && /data-claim-after-read-five="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-claim-after-read-five must concentrate the existing occupied-open Claim the next cover hop after the sold-cover read"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 1 ? 0 : 1) }
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
  /function renderFlag/ { in_fn = 1 }
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && /listings.length > 0/ { saw_occupied = 1 }
  in_fn && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_fn && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_fn && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_fn && saw_two && /data-read-after-claim-three="true"/ { saw_three = 1 }
  in_fn && saw_three && /data-read-after-claim-four="true"/ { saw_four = 1 }
  in_fn && saw_four && /data-read-after-claim-five="true"/ { saw_five = 1 }
  in_fn && saw_five && /data-read-after-claim-six="true"/ { saw_six = 1 }
  in_fn && saw_six && /data-claim-cover="true"/ { saw_claim = 1 }
  in_fn && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_fn && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_fn && saw_after_read && /data-claim-after-read-two="true"/ { saw_after_two = 1 }
  in_fn && saw_after_two && /data-claim-after-read-three="true"/ { saw_after_three = 1 }
  in_fn && saw_after_three && /data-claim-after-read-four="true"/ { saw_after_four = 1 }
  in_fn && saw_after_four && /data-claim-after-read-five="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-read-after-claim-six must concentrate the existing occupied-open sold-cover line before Claim the next cover"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 1 ? 0 : 1) }
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
  /function renderFlag/ { in_fn = 1 }
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && /listings.length > 0/ { saw_occupied = 1 }
  in_fn && saw_occupied && /data-sold-cover="true"/ { saw_sold = 1 }
  in_fn && saw_sold && /data-read-after-claim-sold="true"/ { saw_read = 1 }
  in_fn && saw_read && /data-read-after-claim-two="true"/ { saw_two = 1 }
  in_fn && saw_two && /data-read-after-claim-three="true"/ { saw_three = 1 }
  in_fn && saw_three && /data-read-after-claim-four="true"/ { saw_four = 1 }
  in_fn && saw_four && /data-read-after-claim-five="true"/ { saw_five = 1 }
  in_fn && saw_five && /data-read-after-claim-six="true"/ { saw_six = 1 }
  in_fn && saw_six && /data-claim-cover="true"/ { saw_claim = 1 }
  in_fn && saw_claim && /data-claim-after-sold="true"/ { saw_after_sold = 1 }
  in_fn && saw_after_sold && /data-claim-after-read-sold="true"/ { saw_after_read = 1 }
  in_fn && saw_after_read && /data-claim-after-read-two="true"/ { saw_after_two = 1 }
  in_fn && saw_after_two && /data-claim-after-read-three="true"/ { saw_after_three = 1 }
  in_fn && saw_after_three && /data-claim-after-read-four="true"/ { saw_after_four = 1 }
  in_fn && saw_after_four && /data-claim-after-read-five="true"/ { saw_after_five = 1 }
  in_fn && saw_after_five && /data-claim-after-read-six="true"/ { found = 1 }
  END { exit(found && saw_closed ? 0 : 1) }
' src/views/skin.ts; then
  fail "data-claim-after-read-six must concentrate the existing occupied-open Claim the next cover hop after the sold-cover read"
fi
if ! awk '
  /function renderFlag/ { in_fn = 1 }
  in_fn && /^function / && !/renderFlag/ { in_fn = 0 }
  in_fn && /href="#claim"/ { hops++ }
  END { exit(hops == 1 ? 0 : 1) }
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
  END { exit(hops == 1 ? 0 : 1) }
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
grep -q '\.cover-line\[data-later-rank\] \.hed' src/views/skin.ts \
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
  END { exit(hops == 1 ? 0 : 1) }
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
  in_fn && /board.status === "closed"/ { saw_closed = 1 }
  in_fn && saw_closed && /data-open-cover="true"/ { found = 1 }
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
  END { exit(hops == 1 && open_hops == 1 ? 0 : 1) }
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
grep -q 'doesNotMatch(closedOccupied, /data-sold-cover/)' tests/product-ui.test.ts \
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
fi

echo "OK: buildable and testable"
