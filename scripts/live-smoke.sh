#!/usr/bin/env bash
# Operator-only offline smoke. This starts an explicit Waffo fixture process;
# it never calls a payment provider or a sponsor destination. Production-like
# missing configuration must fail closed with BLOCKED-CONFIG.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  fail "live-smoke must not run in GitHub Actions"
fi
if [[ "${CI:-}" == "true" ]]; then
  fail "live-smoke refuses CI=true"
fi
command -v curl >/dev/null || fail "curl is required"
command -v node >/dev/null || fail "node is required"

if [[ ! -d node_modules ]]; then
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
fi

workdir="$(mktemp -d "${TMPDIR:-/tmp}/newsletter-cover-waffo-smoke.XXXXXX")"
port="${LIVE_SMOKE_PORT:-$(node --input-type=module -e '
  import net from "node:net";
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (address === null || typeof address === "string") process.exit(1);
    process.stdout.write(String(address.port));
    server.close();
  });
')}"
base="http://127.0.0.1:${port}"
db_path="${workdir}/cover.sqlite"
log_path="${workdir}/server.log"
pid=""

cleanup() {
  if [[ -n "$pid" ]]; then
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
    wait "$pid" 2>/dev/null || true
  fi
  if [[ -n "${workdir:-}" && -d "$workdir" ]]; then
    rm -rf -- "$workdir"
  fi
}
trap cleanup EXIT

(
  cd "$root"
  unset WAFFO_MODE WAFFO_LIVE WAFFO_MERCHANT_ID WAFFO_PRIVATE_KEY WAFFO_PRIVATE_KEY_FILE \
    WAFFO_STORE_ID WAFFO_PRODUCT_ID WAFFO_WEBHOOK_PUBLIC_KEY \
    WAFFO_WEBHOOK_TEST_PUBLIC_KEY WAFFO_WEBHOOK_PROD_PUBLIC_KEY WAFFO_API_BASE \
    POLAR_LIVE POLAR_FIXTURE_ONLY POLAR_ACCESS_TOKEN POLAR_WEBHOOK_SECRET \
    POLAR_API_BASE POLAR_PRODUCT_ID
  export WAFFO_MODE=fixture
  export NODE_ENV=test
  export PORT="$port"
  export DATABASE_PATH="$db_path"
  export PUBLIC_BASE_URL="$base"
  exec node --import tsx src/server.ts
) >"$log_path" 2>&1 &
pid=$!

wait_health() {
  local i
  for i in $(seq 1 80); do
    if curl -fsS --connect-timeout 2 --max-time 5 "$base/healthz" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

wait_health || {
  sed -n '1,120p' "$log_path" >&2 || true
  fail "fixture process did not become healthy"
}

echo "== Waffo fixture smoke (operator only; no provider calls) =="
echo "base=$base"
echo "database=$db_path"

health="$(curl -fsS "$base/healthz")"
[[ "$health" == *'"ok":true'* ]] || fail "healthz did not return ok"
[[ -f "$db_path" ]] || fail "fixture process did not open the durable SQLite path"

empty_html="$(curl -fsS "$base/")"
empty_json="$(curl -fsS -H 'accept: application/json' "$base/")"
[[ "$empty_html" == *"No paid listings on this board"* ]] \
  || fail "empty board copy is missing"
grep -qi 'no cover sold' <<<"$empty_html" || fail "empty cover state is missing"
[[ "$empty_json" == *'"listings":[]'* ]] || fail "empty board unexpectedly has ranked rows"
echo "PASS health-and-empty-board"

minimum="$(curl -sS -o "$workdir/minimum.json" -w '%{http_code}' \
  -X POST -H 'content-type: application/json' -H 'accept: application/json' \
  --data '{"sponsorUrl":"https://four.example/slot","blurb":"Under the floor","bidUsd":4}' \
  "$base/listings")"
[[ "$minimum" == "400" ]] || fail "minimum bid returned HTTP $minimum"
grep -q 'below_minimum' "$workdir/minimum.json" \
  || fail "minimum bid did not return below_minimum"
echo "PASS-ERROR below-minimum"

listing_code="$(curl -sS -o "$workdir/listing.json" -w '%{http_code}' \
  -X POST -H 'content-type: application/json' -H 'accept: application/json' \
  --data '{"sponsorUrl":"https://fixture.example/cover","blurb":"Explicit fixture checkout","bidUsd":5}' \
  "$base/listings")"
[[ "$listing_code" == "200" ]] || fail "fixture listing returned HTTP $listing_code"
grep -q 'fix_' "$workdir/listing.json" || fail "fixture checkout id missing"
checkout_url="$(node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const body = JSON.parse(readFileSync(process.argv[1], "utf8"));
  process.stdout.write(String(body.url ?? ""));
' "$workdir/listing.json")"
[[ "$checkout_url" == /checkout/complete\?checkoutId=fix_* ]] \
  || fail "fixture checkout URL is not explicit: $checkout_url"
after_listing="$(curl -fsS -H 'accept: application/json' "$base/")"
[[ "$after_listing" == *'"listings":[]'* ]] || fail "unpaid fixture intent ranked"
echo "PASS unpaid-fixture-stays-off-board"

return_code="$(curl -sS -o "$workdir/return.body" -w '%{http_code}' "$base$checkout_url")"
[[ "$return_code" == "200" ]] || fail "browser return page was unavailable (HTTP $return_code)"
grep -q 'data-checkout-state="pending"' "$workdir/return.body" \
  || fail "browser return did not render durable pending state"
after_return="$(curl -fsS -H 'accept: application/json' "$base/")"
[[ "$after_return" == *'"listings":[]'* ]] \
  || fail "browser return mutated the unpaid board"
echo "PASS return-read-only-pending"

webhook_code="$(curl -sS -o "$workdir/webhook.json" -w '%{http_code}' \
  -X POST -H 'content-type: application/json' --data '{}' "$base/webhooks/waffo")"
[[ "$webhook_code" == "400" ]] || fail "unsigned Waffo webhook returned HTTP $webhook_code"
echo "PASS unsigned-webhook-rejected"

for page in about rules; do
  page_code="$(curl -sS -o "$workdir/${page}.html" -w '%{http_code}' "$base/${page}")"
  [[ "$page_code" == "200" ]] || fail "/${page} returned HTTP $page_code"
done
echo "PASS about-and-rules"

if grep -Eiq 'waffo\.ai' "$log_path"; then
  fail "fixture smoke process attempted or logged a live provider host"
fi

echo "PASS no-live-provider-host"
echo "RESULT Waffo fixture smoke passed"
