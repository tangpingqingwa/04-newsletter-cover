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
