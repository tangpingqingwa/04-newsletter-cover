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
grep -q 'ORDER BY bid_usd DESC, created_at ASC' SPEC.md \
  || fail "SPEC.md missing deterministic equal-bid ordering"
grep -q 'difference' SPEC.md || fail "SPEC.md missing raise-pays-difference"
grep -q 'Waffo' SPEC.md || fail "SPEC.md missing Waffo"
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
if grep -Eqi 'WAFFO_MODE=(waffo-test|waffo-prod)' .github/workflows/ci.yml 2>/dev/null; then
  fail "CI must not select a live Waffo mode"
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
  src/migrations/003_checkouts.sql \
  src/migrations/005_waffo_payment_events.sql \
  src/migrations/006_waffo_identity_uniques.sql \
  src/migrations/007_waffo_atomic_identities.sql \
  src/migrations/008_waffo_rejected_identity_check.sql \
  tests/health.test.ts; do
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
grep -q 'CREATE TABLE waffo_webhook_events' src/migrations/005_waffo_payment_events.sql \
  || fail "Waffo webhook event ledger missing"
grep -q 'delivery_id TEXT PRIMARY KEY' src/migrations/005_waffo_payment_events.sql \
  || fail "Waffo delivery id must be unique"
grep -q 'CREATE TABLE waffo_identity_reservations' src/migrations/007_waffo_atomic_identities.sql \
  || fail "Waffo identity reservations missing"
grep -q 'CREATE TABLE waffo_identity_conflicts' src/migrations/007_waffo_atomic_identities.sql \
  || fail "Waffo conflict audit missing"
grep -q "'rejected'" src/migrations/007_waffo_atomic_identities.sql \
  || fail "Waffo rejected outcomes must reserve identities"
grep -q "'rejected'" src/migrations/008_waffo_rejected_identity_check.sql \
  || fail "forward Waffo identity migration must retain rejected outcomes"

echo "== public board + ranking =="
for f in src/rank.ts src/http/routes/board.ts tests/rank.test.ts; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -q 'bidUsd' src/rank.ts || fail "src/rank.ts missing bidUsd sort"
grep -q 'createdAt' src/rank.ts || fail "src/rank.ts missing creation-time tie order"
grep -q 'registerBoardRoutes' src/server.ts || fail "src/server.ts missing board routes"
grep -q 'equal bids' tests/rank.test.ts || fail "tests/rank.test.ts missing equal-bid ordering"
grep -q 'createdAt' tests/rank.test.ts || fail "tests/rank.test.ts missing creation-time tie assertion"
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

echo "== Waffo checkout and webhook contract =="
for f in src/billing/port.ts src/billing/fixture.ts src/billing/create.ts \
  src/http/routes/waffo-webhook.ts src/http/routes/polar-webhook.ts tests/billing.test.ts; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done
grep -q 'createCheckout' src/billing/port.ts || fail "src/billing/port.ts missing createCheckout"
grep -q 'complete' src/billing/fixture.ts || fail "src/billing/fixture.ts missing complete"
grep -q 'createWaffo' src/billing/create.ts || fail "src/billing/create.ts missing createWaffo"
grep -q 'WAFFO_MODE' src/billing/create.ts || fail "src/billing/create.ts missing explicit WAFFO_MODE"
grep -q 'below_minimum' src/billing/create.ts || fail "src/billing/create.ts missing below_minimum"
grep -q 'registerWaffoWebhookRoutes' src/server.ts || fail "src/server.ts missing Waffo webhook routes"
grep -q 'registerWaffoWebhookRoutes' src/http/routes/waffo-webhook.ts \
  || fail "canonical Waffo webhook route export is missing"
grep -q 'verifyWebhook' src/http/routes/polar-webhook.ts \
  || fail "Waffo webhook must use the official verifyWebhook verifier"
grep -q '"@waffo/pancake-ts"' package.json \
  || fail "Waffo SDK dependency is missing"
grep -q '"@waffo/pancake-ts": "0.19.1"' package.json \
  || fail "Waffo SDK must remain pinned to 0.19.1"
grep -q 'x-waffo-signature' src/http/routes/polar-webhook.ts \
  || fail "Waffo webhook must verify X-Waffo-Signature"
grep -q 'order.completed' src/http/routes/polar-webhook.ts \
  || fail "Waffo webhook must handle order.completed"
grep -q 'applyVerifiedWaffoOrder' src/http/routes/polar-webhook.ts \
  || fail "Waffo webhook must use verified order settlement"
if grep -q 'completeCheckout' src/http/routes/polar-webhook.ts; then
  fail "Waffo webhook must not settle from an arbitrary checkout id"
fi
grep -q 'unpaid' tests/billing.test.ts || fail "tests/billing.test.ts missing unpaid checkout"
grep -q 'below_minimum' src/listings.ts || fail "src/listings.ts missing below_minimum"
grep -q 'WAFFO_MODE' tests/billing.test.ts || fail "tests/billing.test.ts missing explicit-mode coverage"
grep -q 'identity_reuse' tests/billing.test.ts || fail "tests/billing.test.ts missing changed replay coverage"
grep -q 'needs_reconciliation' tests/billing.test.ts || fail "tests/billing.test.ts missing reconciliation coverage"
grep -q 'valid Waffo 4xx error notice remains a definitive rejection' tests/billing.test.ts \
  || fail "tests/billing.test.ts missing valid provider rejection coverage"
grep -q 'malformed Waffo error envelope stays recoverable through the listing route' tests/billing.test.ts \
  || fail "tests/billing.test.ts missing malformed error-envelope recovery coverage"
grep -q 'blank Waffo error notice stays recoverable through the listing route' tests/billing.test.ts \
  || fail "tests/billing.test.ts missing blank error-notice recovery coverage"
grep -q 'wrong-typed Waffo checkout response is an ambiguous checkout' tests/billing.test.ts \
  || fail "tests/billing.test.ts missing malformed checkout-response coverage"
grep -q 'polar_webhook_retired' src/http/routes/polar-webhook.ts \
  || fail "legacy provider webhook must be retired"

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
grep -q '/checkout/complete' src/http/routes/pages.ts || fail "pages route missing checkout completion"
grep -q 'data-checkout-state' src/http/routes/pages.ts || fail "completion page missing durable state marker"
grep -q '\$5' src/http/routes/pages.ts || fail "rules page missing min \$5"
grep -q 'listing placed first keeps the higher rank' src/http/routes/pages.ts \
  || fail "rules page missing equal-bid placement order"
grep -q 'difference' src/http/routes/pages.ts || fail "rules page missing raise difference"
grep -qi 'paid listings appear on the board immediately after confirmation' src/http/routes/pages.ts \
  || fail "rules page missing immediate paid-listing visibility"
grep -qi 'there is no editorial re-ranking' src/http/routes/pages.ts \
  || fail "rules page missing no-editorial-reranking rule"
grep -q '/about' tests/pages.test.ts || fail "tests/pages.test.ts missing /about"
grep -q '/rules' tests/pages.test.ts || fail "tests/pages.test.ts missing /rules"
grep -q '\$5' tests/pages.test.ts || fail "tests/pages.test.ts missing min \$5"
grep -q 'listing placed first keeps the higher rank' tests/pages.test.ts \
  || fail "tests/pages.test.ts missing equal-bid placement assertion"
grep -q 'difference' tests/pages.test.ts || fail "tests/pages.test.ts missing raise difference"
grep -qi 'paid listings appear on the board immediately after confirmation' tests/pages.test.ts \
  || fail "tests/pages.test.ts missing immediate paid-listing assertion"
grep -qi 'there is no editorial re-ranking' tests/pages.test.ts \
  || fail "tests/pages.test.ts missing no-editorial-reranking assertion"
grep -q 'checkout completion' tests/pages.test.ts || fail "tests/pages.test.ts missing checkout completion states"
grep -q 'data-checkout-state' tests/pages.test.ts || fail "tests/pages.test.ts missing behavior-level checkout state assertion"

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
for marker in \
  'class="site-nav"' \
  'class="masthead"' \
  'class="nameplate"' \
  'data-issue-status' \
  'class="empty-stand"' \
  'data-read-stand="true"' \
  'Claim #1 for' \
  'class="amount-field"' \
  '\.amount-field input:focus-visible' \
  'data-bid-step' \
  'class="outbid"' \
  'name="sponsorUrl"' \
  'name="blurb"' \
  'name="bidUsd"' \
  'data-cover-prize-line="true"' \
  'data-prize-before-price="true"' \
  'data-later-rank="true"' \
  'data-read-cover="true"' \
  'data-rolling-week="true"' \
  'data-frozen-cover="true"' \
  'data-closed-empty-issue="true"' \
  'data-open-cover="true"'; do
  grep -q "$marker" src/views/skin.ts || fail "skin missing product marker: $marker"
done
grep -qi 'no cover sold' src/views/skin.ts || fail "empty issue must say no cover sold"
grep -q 'No paid listings on this board' src/views/skin.ts || fail "empty issue must keep honest empty copy"
grep -q '/l/' src/views/skin.ts || fail "cover pitch must redirect through /l/:id"
grep -q 'data-claim-cover="true"' src/views/skin.ts || fail "occupied open needs one next-cover route"
grep -q 'data-claim-after-listing="true"' src/views/skin.ts || fail "next-cover route needs a semantic marker"
for test_name in \
  'masthead navigation keeps the three exact destinations' \
  'open empty cover is a print masthead' \
  'empty archive is a frozen empty folio' \
  'closed occupied archive is frozen' \
  'occupied open cover leads' \
  'later paid ranks stay quiet' \
  'live and frozen mastheads' \
  'form POST /listings' \
  'public sponsor link redirects' \
  'no fake newsletter metrics'; do
  grep -q "$test_name" tests/product-ui.test.ts || fail "missing product UI regression: $test_name"
done
if grep -nE 'Then the cover URL|data-later-write|empty-claim-first|data-first-click="claim"|claim-after-stand|data-claim-after-stand|data-read-after-claim|data-claim-after-read|data-later-listing|later-listing' src/views/skin.ts >/dev/null 2>&1; then
  fail "obsolete staged/generative flow residue remains in skin.ts"
fi
if grep -nE 'data-(read-after-claim|claim-after-read)-' src/views/skin.ts >/dev/null 2>&1; then
  fail "numbered read/claim residue remains in skin.ts"
fi
if grep -Eqi 'subscriber|open rate|article list' src/views/skin.ts src/http/routes/board.ts; then
  fail "product UI must not invent newsletter metrics"
fi
node <<'NODE'
const fs = require("node:fs");
const src = fs.readFileSync("src/views/skin.ts", "utf8");
const claim = src.slice(src.indexOf("function renderClaim"), src.indexOf("function renderPitch"));
const fields = [
  'data-slot="claim-hero"',
  'data-slot="claim-heading"',
  'id="bid-form" class="claim-form"',
  'data-claim-form="true"',
  'name="sponsorUrl"',
  'name="blurb"',
  'name="bidUsd"',
  '>Claim rank</button>',
];
if (fields.some((field) => claim.indexOf(field) < 0)) {
  console.error("canonical claim form fields are incomplete");
  process.exit(1);
}
if (!(claim.indexOf('name="sponsorUrl"') < claim.indexOf('name="blurb"') && claim.indexOf('name="blurb"') < claim.indexOf('>Claim rank</button>'))) {
  console.error("identity fields must precede the single Claim rank submit");
  process.exit(1);
}
const linkStart = src.indexOf("const OCCUPIED_NEXT_COVER_LINK = ");
const linkEnd = src.indexOf(";", linkStart);
const link = linkStart >= 0 && linkEnd > linkStart ? src.slice(linkStart, linkEnd) : "";
if ((link.match(/data-claim-cover/g) || []).length !== 1 || !link.includes('data-claim-after-listing="true"')) {
  console.error("occupied open must expose exactly one quiet next-cover route");
  process.exit(1);
}
if (/data-(read-after-claim|claim-after-(read|sold|stand))-/u.test(link)) {
  console.error("occupied route still contains generated flow attributes");
  process.exit(1);
}
if (src.includes("Claim this issue’s cover")) {
  console.error("redundant empty-cover claim link remains");
  process.exit(1);
}
NODE
echo "== compiled production runtime =="
[[ -f tsconfig.build.json ]] || fail "missing tsconfig.build.json"
[[ -f scripts/build.mjs ]] || fail "missing scripts/build.mjs"
[[ -f scripts/build-runtime-smoke.sh ]] || fail "missing build-runtime-smoke.sh"
[[ -x scripts/build-runtime-smoke.sh ]] || fail "build-runtime-smoke.sh must be executable"
grep -q '"start": "node dist/server.js"' package.json \
  || fail "npm start must use the compiled runtime"
grep -q '"build": "node scripts/build.mjs"' package.json \
  || fail "npm build must emit the compiled runtime"
grep -q 'claim form gives identity fields names and a visible bid focus cue' tests/product-ui.test.ts \
  || fail "product UI must cover accessible claim fields and focus"
grep -q 'focus-visible' src/views/skin.ts \
  || fail "claim controls must retain a visible focus treatment"
echo "== live-smoke stays operator-only =="
[[ -f scripts/live-smoke.sh ]] || fail "missing scripts/live-smoke.sh"
[[ -x scripts/live-smoke.sh ]] || fail "scripts/live-smoke.sh must be executable"
[[ -f docs/live-smoke.md ]] || fail "missing docs/live-smoke.md"
[[ -s docs/live-smoke.md ]] || fail "empty docs/live-smoke.md"
if grep -Eq '^\s*(bash )?(\./)?scripts/live-smoke\.sh' scripts/test.sh; then
  fail "test.sh must not invoke live-smoke.sh"
fi
if grep -E '^[[:space:]]*(export[[:space:]]+)?WAFFO_MODE=(waffo-test|waffo-prod)' scripts/test.sh >/dev/null; then
  fail "test.sh must not select a live Waffo mode"
fi
grep -q 'BLOCKED-CONFIG' scripts/live-smoke.sh \
  || fail "live-smoke.sh must name BLOCKED-CONFIG"
grep -q 'WAFFO_MODE=fixture' scripts/live-smoke.sh \
  || fail "live-smoke.sh must select fixture mode explicitly"
grep -q 'live-smoke refuses CI=true' scripts/live-smoke.sh \
  || fail "live-smoke.sh must refuse CI=true"
grep -q 'PASS-ERROR' docs/live-smoke.md || fail "docs/live-smoke.md missing PASS-ERROR"
grep -q 'BLOCKED-SECRET' docs/live-smoke.md || fail "docs/live-smoke.md missing BLOCKED-SECRET"

if grep -RInE 'https?://api\.waffo\.ai' src/http src/server.ts >/dev/null 2>&1; then
  fail "HTTP / pages must not hard-code the Waffo API host"
fi
if grep -RInE "from ['\\\"].*billing/waffo" src/http src/server.ts \
  | grep -v 'src/http/routes/polar-webhook.ts' >/dev/null 2>&1; then
  fail "HTTP / pages must reach Waffo through the provider port"
fi
grep -q 'WAFFO_API_BASE' src/billing/waffo.ts \
  || fail "src/billing/waffo.ts missing WAFFO_API_BASE override"
grep -q 'export class LiveWaffo' src/billing/waffo.ts \
  || fail "src/billing/waffo.ts must export LiveWaffo"
grep -q 'LiveWaffo' src/billing/create.ts \
  || fail "createWaffo must select LiveWaffo for live modes"
grep -q 'CREATE TABLE waffo_identity_reservations' src/migrations/007_waffo_atomic_identities.sql \
  || fail "Waffo identity reservations must be durable"
grep -q 'CREATE UNIQUE INDEX waffo_identity_conflicts_repeat_uq' src/migrations/007_waffo_atomic_identities.sql \
  || fail "Waffo conflict audit must be repeat-safe"
if grep -q '"@polar-sh/sdk"' package.json package-lock.json; then
  fail "obsolete payment SDK must not be an active dependency"
fi

if [[ -f package.json ]]; then
  echo "== install =="
  if [[ ! -d node_modules ]]; then
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
  fi

  unset WAFFO_MERCHANT_ID WAFFO_PRIVATE_KEY WAFFO_PRIVATE_KEY_FILE \
    WAFFO_STORE_ID WAFFO_PRODUCT_ID WAFFO_WEBHOOK_PUBLIC_KEY \
    WAFFO_WEBHOOK_TEST_PUBLIC_KEY WAFFO_WEBHOOK_PROD_PUBLIC_KEY
  export WAFFO_MODE=fixture
  export NODE_ENV=test

  echo "== tsc --noEmit =="
  npx tsc --noEmit

  echo "== compiled runtime smoke =="
  npm run build
  bash scripts/build-runtime-smoke.sh

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
  for product_test in \
    'masthead navigation keeps the three exact destinations' \
    'open empty cover is a print masthead' \
    'empty archive is a frozen empty folio' \
    'closed occupied archive is frozen' \
    'occupied open cover leads' \
    'later paid ranks stay quiet' \
    'live and frozen mastheads' \
    'form POST /listings' \
    'public sponsor link redirects' \
    'no fake newsletter metrics' \
    'claim form gives identity fields names and a visible bid focus cue'; do
    grep -q "$product_test" "$test_log" || fail "product UI regression did not run: $product_test"
  done
  grep -Fq 'rolling last-7-days window is 7 * 24h' "$test_log" \
    || fail "week tests must cover rolling last-7-days window"
  grep -q 'Monday 00:00 UTC does not drop a bid still inside the rolling week' "$test_log" \
    || fail "Monday midnight rolling-week test did not run"
  grep -q 'occupied close is 7 days from paid placement' "$test_log" \
    || fail "occupied rolling close test did not run"
  grep -q 'valid Waffo 4xx error notice remains a definitive rejection' "$test_log" \
    || fail "valid provider rejection test did not run"
  grep -q 'malformed Waffo error envelope stays recoverable through the listing route' "$test_log" \
    || fail "malformed error-envelope recovery test did not run"
  grep -q 'blank Waffo error notice stays recoverable through the listing route' "$test_log" \
    || fail "blank error-notice recovery test did not run"
  grep -q 'wrong-typed Waffo checkout response is an ambiguous checkout' "$test_log" \
    || fail "malformed checkout-response test did not run"
  grep -q 'pending rebuild migrations roll back with their marker' "$test_log" \
    || fail "migration rollback/restart test did not run"
fi

echo "OK: buildable and testable"
