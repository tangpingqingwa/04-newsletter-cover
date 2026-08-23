#!/usr/bin/env bash
# Operator smoke against a local process. Not called from scripts/test.sh or CI.
# Starts (or assumes) the product process and walks empty board, paid
# fixture-or-live Polar bid, rank, raise-by-difference, public click 302,
# about/rules. Missing Polar secret → BLOCKED-SECRET: POLAR_ACCESS_TOKEN.
# Fixture checkout is a received pay when POLAR_FIXTURE_ONLY=1.
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

PASS=0
PASS_ERROR=0
BLOCKED=0
FAIL=0
STARTED_PID=""
LIVE_PID=""
WORKDIR=""
RESULT_LOG=""
BASE="${LIVE_SMOKE_BASE:-}"

# Capture operator Polar flags before the fixture process unsets them.
OP_POLAR_LIVE="${POLAR_LIVE:-}"
OP_POLAR_ACCESS_TOKEN="${POLAR_ACCESS_TOKEN:-}"
OP_POLAR_WEBHOOK_SECRET="${POLAR_WEBHOOK_SECRET:-}"
OP_POLAR_FIXTURE_ONLY="${POLAR_FIXTURE_ONLY:-}"
OP_POLAR_API_BASE="${POLAR_API_BASE:-}"
OP_POLAR_PRODUCT_ID="${POLAR_PRODUCT_ID:-}"

cleanup() {
  if [[ -n "${LIVE_PID}" ]] && kill -0 "${LIVE_PID}" 2>/dev/null; then
    kill "${LIVE_PID}" 2>/dev/null || true
    wait "${LIVE_PID}" 2>/dev/null || true
  fi
  if [[ -n "${STARTED_PID}" ]] && kill -0 "${STARTED_PID}" 2>/dev/null; then
    kill "${STARTED_PID}" 2>/dev/null || true
    wait "${STARTED_PID}" 2>/dev/null || true
  fi
  if [[ -n "${WORKDIR}" && -d "${WORKDIR}" ]]; then
    rm -rf "${WORKDIR}"
  fi
}
trap cleanup EXIT

record() {
  local flow="$1"
  local status="$2"
  local note="${3:-}"
  printf 'RESULT\t%s\t%s\t%s\n' "$flow" "$status" "$note"
  if [[ -n "${RESULT_LOG}" ]]; then
    printf '%s\t%s\t%s\n' "$flow" "$status" "$note" >>"${RESULT_LOG}"
  fi
  case "$status" in
    PASS) PASS=$((PASS + 1)) ;;
    PASS-ERROR) PASS_ERROR=$((PASS_ERROR + 1)) ;;
    BLOCKED-SECRET) BLOCKED=$((BLOCKED + 1)) ;;
    FAIL) FAIL=$((FAIL + 1)) ;;
    *) fail "unknown smoke status ${status}" ;;
  esac
}

pick_port() {
  node --input-type=module -e '
    import net from "node:net";
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") process.exit(1);
      process.stdout.write(String(addr.port));
      server.close();
    });
  '
}

wait_health() {
  local url="$1/healthz"
  local i
  for i in $(seq 1 80); do
    if curl -fsS --connect-timeout 2 --max-time 5 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

start_fixture_server() {
  local port="$1"
  local db_path="$2"
  local log_path="$3"
  (
    cd "$root"
    unset POLAR_LIVE POLAR_ACCESS_TOKEN POLAR_WEBHOOK_SECRET EDITOR_VETO || true
    export POLAR_FIXTURE_ONLY=1
    export PORT="${port}"
    export DATABASE_PATH="${db_path}"
    export PUBLIC_BASE_URL="http://127.0.0.1:${port}"
    exec node --import tsx src/server.ts
  ) >"${log_path}" 2>&1 &
  echo $!
}

http_get() {
  local base="$1"
  local path="$2"
  local out="$3"
  shift 3
  curl -sS -o "$out" -w "%{http_code}" --connect-timeout 5 --max-time 20 \
    "$@" \
    "${base}${path}"
}

http_get_headers() {
  local base="$1"
  local path="$2"
  local body="$3"
  local hdrs="$4"
  curl -sS -D "$hdrs" -o "$body" -w "%{http_code}" --connect-timeout 5 --max-time 20 \
    --max-redirs 0 \
    "${base}${path}"
}

http_post_json() {
  local base="$1"
  local path="$2"
  local payload="$3"
  local body="$4"
  local hdrs="$5"
  curl -sS -D "$hdrs" -o "$body" -w "%{http_code}" --connect-timeout 5 --max-time 20 \
    --max-redirs 0 \
    -X POST \
    -H "content-type: application/json" \
    -H "accept: application/json" \
    --data "$payload" \
    "${base}${path}"
}

header_value() {
  local file="$1"
  local name="$2"
  awk -v name="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')" '
    BEGIN { FS = ": " }
    tolower($1) == name {
      val = $0
      sub(/^[^:]+:[ \t]*/, "", val)
      gsub(/\r/, "", val)
      print val
      exit
    }
  ' "$file"
}

json_field() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const raw = readFileSync(process.argv[1], "utf8");
    let data;
    try { data = JSON.parse(raw); } catch { process.exit(2); }
    const key = process.argv[2];
    const value = data == null ? undefined : data[key];
    if (value === undefined || value === null) process.exit(3);
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      process.stdout.write(String(value));
      process.exit(0);
    }
    process.stdout.write(JSON.stringify(value));
  ' "$1" "$2"
}

checkout_id_from_url() {
  node --input-type=module -e '
    const raw = process.argv[1];
    try {
      const url = new URL(raw, "http://127.0.0.1");
      const id = url.searchParams.get("checkoutId");
      if (!id) process.exit(3);
      process.stdout.write(id);
    } catch {
      process.exit(2);
    }
  ' "$1"
}

board_count() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const data = JSON.parse(readFileSync(process.argv[1], "utf8"));
    const listings = Array.isArray(data.listings) ? data.listings : [];
    process.stdout.write(String(listings.length));
  ' "$1"
}

listing_field() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const data = JSON.parse(readFileSync(process.argv[1], "utf8"));
    const url = process.argv[2];
    const key = process.argv[3];
    const listings = Array.isArray(data.listings) ? data.listings : [];
    const row = listings.find((item) => item && item.sponsorUrl === url);
    if (!row || row[key] === undefined || row[key] === null) process.exit(2);
    const value = row[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      process.stdout.write(String(value));
      process.exit(0);
    }
    process.stdout.write(JSON.stringify(value));
  ' "$1" "$2" "$3"
}

html_has() {
  local file="$1"
  local pattern="$2"
  grep -Eq "$pattern" "$file"
}

fetch_board_json() {
  local base="$1"
  local out="$2"
  http_get "$base" "/" "$out" -H "accept: application/json"
}

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/newsletter-cover-live-smoke.XXXXXX")"
RESULT_LOG="${WORKDIR}/results.tsv"
: >"${RESULT_LOG}"
STAMP="$(date -u +%Y%m%d%H%M%S)"

echo "== live-smoke (operator only; not CI) =="
echo "root=${root}"

if [[ -z "${BASE}" ]]; then
  PORT="${LIVE_SMOKE_PORT:-$(pick_port)}"
  BASE="http://127.0.0.1:${PORT}"
  DB_PATH="${WORKDIR}/board.sqlite"
  LOG_PATH="${WORKDIR}/server.log"
  echo "starting local fixture server on ${BASE}"
  echo "database=${DB_PATH}"
  echo "POLAR_FIXTURE_ONLY=1 (fixture checkout is a received pay)"
  STARTED_PID="$(start_fixture_server "$PORT" "$DB_PATH" "$LOG_PATH")"
  if ! wait_health "$BASE"; then
    echo "server log:" >&2
    cat "${LOG_PATH}" >&2 || true
    fail "local server did not become healthy at ${BASE}/healthz"
  fi
else
  BASE="${BASE%/}"
  echo "assuming existing server at ${BASE}"
  if ! wait_health "$BASE"; then
    fail "existing server at ${BASE} did not answer /healthz"
  fi
fi

echo "base=${BASE}"
echo "operator POLAR_LIVE=${OP_POLAR_LIVE:-<unset>}"
if [[ -n "${OP_POLAR_ACCESS_TOKEN}" ]]; then
  echo "operator POLAR_ACCESS_TOKEN=<set>"
else
  echo "operator POLAR_ACCESS_TOKEN=<unset>"
fi

COVER_RAW="https://Cover.Example/slot-${STAMP}?utm_source=x&fbclid=y"
COVER_URL="https://cover.example/slot-${STAMP}"
TIE_URL="https://tie.example/slot-${STAMP}"
SIX_URL="https://six.example/slot-${STAMP}"
TEN_A_URL="https://ten-a.example/slot-${STAMP}"
TEN_B_URL="https://ten-b.example/slot-${STAMP}"

# --- healthz ---
health_body="${WORKDIR}/healthz.json"
health_code="$(http_get "$BASE" "/healthz" "$health_body" || true)"
if [[ "$health_code" == "200" ]] && grep -q '"ok":true' "$health_body"; then
  echo "healthz 200 { ok: true }"
else
  fail "GET /healthz HTTP ${health_code}"
fi

# --- empty board (do not invent a cover or subscriber count) ---
board0_html="${WORKDIR}/board0.html"
board0_json="${WORKDIR}/board0.json"
board0_html_code="$(http_get "$BASE" "/" "$board0_html" || true)"
board0_json_code="$(fetch_board_json "$BASE" "$board0_json" || true)"
board0_count="$(board_count "$board0_json" || echo "?")"
board0_issue="$(json_field "$board0_json" "issueDate" || true)"
issue_html="${WORKDIR}/issue0.html"
issue_html_code="000"
if [[ -n "$board0_issue" ]]; then
  issue_html_code="$(http_get "$BASE" "/issue/${board0_issue}" "$issue_html" || true)"
fi
if [[ "$board0_html_code" == "200" && "$board0_json_code" == "200" ]] \
  && [[ "$board0_count" == "0" ]] \
  && html_has "$board0_html" 'No paid listings on this board\.' \
  && grep -Eiq 'no cover sold' "$board0_html" \
  && [[ "$issue_html_code" == "200" ]] \
  && html_has "$issue_html" 'No paid listings on this board\.' \
  && grep -Eiq 'no cover sold' "$issue_html" \
  && ! html_has "$board0_html" 'data-rank="' \
  && ! html_has "$board0_html" 'class="cover-line"' \
  && ! html_has "$board0_html" 'subscriber' \
  && ! html_has "$board0_html" 'open rate'; then
  record "empty-board" "PASS" "GET / 200. Zero paid listings. No invented cover."
else
  record "empty-board" "FAIL" "GET / HTML ${board0_html_code} JSON ${board0_json_code} count=${board0_count}"
fi

# --- $4 first bid is a documented product error ---
min_body="${WORKDIR}/min.json"
min_hdrs="${WORKDIR}/min.hdrs"
min_code="$(http_post_json "$BASE" "/listings" \
  "{\"sponsorUrl\":\"https://four.example/slot-${STAMP}\",\"blurb\":\"Four dollars is under the floor\",\"bidUsd\":4}" \
  "$min_body" "$min_hdrs" || true)"
min_err="$(json_field "$min_body" "error" || true)"
min_board="${WORKDIR}/min-board.json"
fetch_board_json "$BASE" "$min_board" >/dev/null || true
min_count="$(board_count "$min_board" || echo "?")"
if [[ "$min_code" == "400" && "$min_err" == "below_minimum" && "$min_count" == "0" ]]; then
  record "below-minimum" "PASS-ERROR" "POST /listings \$4 → 400 below_minimum; board unchanged"
else
  record "below-minimum" "FAIL" "\$4 HTTP ${min_code} error=${min_err} count=${min_count}"
fi

# --- unpaid Polar checkout does not change the board ---
unpaid_body="${WORKDIR}/unpaid.json"
unpaid_hdrs="${WORKDIR}/unpaid.hdrs"
unpaid_code="$(http_post_json "$BASE" "/listings" \
  "{\"sponsorUrl\":\"${COVER_RAW}\",\"blurb\":\"Cover bid waits for Polar\",\"bidUsd\":5}" \
  "$unpaid_body" "$unpaid_hdrs" || true)"
unpaid_url="$(json_field "$unpaid_body" "url" || true)"
unpaid_checkout="$(checkout_id_from_url "${unpaid_url:-}" || true)"
unpaid_board="${WORKDIR}/unpaid-board.json"
unpaid_board_code="$(fetch_board_json "$BASE" "$unpaid_board" || true)"
unpaid_count="$(board_count "$unpaid_board" || echo "?")"
if [[ "$unpaid_code" == "200" && -n "$unpaid_url" && -n "$unpaid_checkout" ]] \
  && [[ "$unpaid_url" == /checkout/complete* ]] \
  && [[ "$unpaid_url" == *checkoutId=fix_* ]] \
  && [[ "$unpaid_url" != *polar.sh* ]] \
  && [[ "$unpaid_board_code" == "200" && "$unpaid_count" == "0" ]]; then
  record "unpaid-checkout" "PASS" "fixture session pending; unpaid row not listed"
else
  record "unpaid-checkout" "FAIL" "POST /listings HTTP ${unpaid_code} url=${unpaid_url} count=${unpaid_count}"
fi

# --- paid fixture Polar bid appears at rank 1 ---
pay_body="${WORKDIR}/pay.json"
pay_hdrs="${WORKDIR}/pay.hdrs"
pay_code="000"
if [[ -n "$unpaid_checkout" ]]; then
  pay_code="$(http_post_json "$BASE" "/webhooks/polar" \
    "{\"checkoutId\":\"${unpaid_checkout}\"}" \
    "$pay_body" "$pay_hdrs" || true)"
fi
pay_status="$(json_field "$pay_body" "status" || true)"
paid_board="${WORKDIR}/paid-board.json"
paid_html="${WORKDIR}/paid-board.html"
paid_board_code="$(fetch_board_json "$BASE" "$paid_board" || true)"
http_get "$BASE" "/" "$paid_html" >/dev/null || true
cover_rank="$(listing_field "$paid_board" "$COVER_URL" "rank" || true)"
cover_bid="$(listing_field "$paid_board" "$COVER_URL" "bidUsd" || true)"
cover_id="$(listing_field "$paid_board" "$COVER_URL" "id" || true)"
cover_created="$(listing_field "$paid_board" "$COVER_URL" "createdAt" || true)"
cover_clicks="$(listing_field "$paid_board" "$COVER_URL" "clicks" || true)"
cover_stored="$(listing_field "$paid_board" "$COVER_URL" "sponsorUrl" || true)"
paid_count="$(board_count "$paid_board" || echo "?")"
if [[ "$pay_code" == "200" && "$pay_status" == "paid" ]] \
  && [[ "$paid_board_code" == "200" && "$paid_count" == "1" ]] \
  && [[ "$cover_rank" == "1" && "$cover_bid" == "5" && -n "$cover_id" ]] \
  && [[ "$cover_stored" == "$COVER_URL" ]] \
  && [[ "$cover_clicks" == "0" ]] \
  && html_has "$paid_html" 'data-rank="1"' \
  && html_has "$paid_html" "data-id=\"${cover_id}\"" \
  && html_has "$paid_html" 'class="bid"' \
  && html_has "$paid_html" '\$5' \
  && html_has "$paid_html" '0 clicks' \
  && ! html_has "$paid_html" 'utm_source' \
  && ! html_has "$paid_html" 'fbclid' \
  && ! grep -Eiq 'polar\.(sh|in)|api\.polar' "$unpaid_body" "$paid_html"; then
  record "paid-bid" "PASS" "fixture pay \$5 → #1. Tracking stripped. EDITOR_VETO unset."
else
  record "paid-bid" "FAIL" "webhook HTTP ${pay_code} status=${pay_status} rank=${cover_rank} bid=${cover_bid}"
fi

# --- rank: later equal bid is #2; \$6 takes #1 ---
tie_body="${WORKDIR}/tie.json"
tie_hdrs="${WORKDIR}/tie.hdrs"
tie_code="$(http_post_json "$BASE" "/listings" \
  "{\"sponsorUrl\":\"${TIE_URL}\",\"blurb\":\"Same five dollars, paid later\",\"bidUsd\":5}" \
  "$tie_body" "$tie_hdrs" || true)"
tie_url="$(json_field "$tie_body" "url" || true)"
tie_checkout="$(checkout_id_from_url "${tie_url:-}" || true)"
tie_pay="${WORKDIR}/tie-pay.json"
tie_pay_hdrs="${WORKDIR}/tie-pay.hdrs"
tie_pay_code="000"
if [[ -n "$tie_checkout" ]]; then
  tie_pay_code="$(http_post_json "$BASE" "/webhooks/polar" \
    "{\"checkoutId\":\"${tie_checkout}\"}" \
    "$tie_pay" "$tie_pay_hdrs" || true)"
fi
six_body="${WORKDIR}/six.json"
six_hdrs="${WORKDIR}/six.hdrs"
six_code="$(http_post_json "$BASE" "/listings" \
  "{\"sponsorUrl\":\"${SIX_URL}\",\"blurb\":\"Six dollars takes the cover\",\"bidUsd\":6}" \
  "$six_body" "$six_hdrs" || true)"
six_url="$(json_field "$six_body" "url" || true)"
six_checkout="$(checkout_id_from_url "${six_url:-}" || true)"
six_pay="${WORKDIR}/six-pay.json"
six_pay_hdrs="${WORKDIR}/six-pay.hdrs"
six_pay_code="000"
if [[ -n "$six_checkout" ]]; then
  six_pay_code="$(http_post_json "$BASE" "/webhooks/polar" \
    "{\"checkoutId\":\"${six_checkout}\"}" \
    "$six_pay" "$six_pay_hdrs" || true)"
fi
rank_board="${WORKDIR}/rank-board.json"
rank_board_code="$(fetch_board_json "$BASE" "$rank_board" || true)"
rank_cover="$(listing_field "$rank_board" "$COVER_URL" "rank" || true)"
rank_tie="$(listing_field "$rank_board" "$TIE_URL" "rank" || true)"
rank_six="$(listing_field "$rank_board" "$SIX_URL" "rank" || true)"
if [[ "$tie_code" == "200" && "$tie_pay_code" == "200" ]] \
  && [[ "$six_code" == "200" && "$six_pay_code" == "200" ]] \
  && [[ "$rank_board_code" == "200" ]] \
  && [[ "$rank_six" == "1" && "$rank_cover" == "2" && "$rank_tie" == "3" ]]; then
  record "rank" "PASS" "\$6 is #1; older \$5 stays above later \$5"
else
  record "rank" "FAIL" "six=${rank_six} cover=${rank_cover} tie=${rank_tie} pay=${tie_pay_code}/${six_pay_code}"
fi

# --- raise same URL \$5 → \$8 charges the difference; createdAt stable ---
raise_unpaid="${WORKDIR}/raise-unpaid.json"
raise_unpaid_hdrs="${WORKDIR}/raise-unpaid.hdrs"
raise_code="$(http_post_json "$BASE" "/listings" \
  "{\"sponsorUrl\":\"${COVER_URL}\",\"blurb\":\"A different blurb must not fork a row\",\"bidUsd\":8}" \
  "$raise_unpaid" "$raise_unpaid_hdrs" || true)"
raise_url="$(json_field "$raise_unpaid" "url" || true)"
raise_checkout="$(checkout_id_from_url "${raise_url:-}" || true)"
raise_pending="${WORKDIR}/raise-pending.json"
fetch_board_json "$BASE" "$raise_pending" >/dev/null || true
pending_bid="$(listing_field "$raise_pending" "$COVER_URL" "bidUsd" || true)"
pending_created="$(listing_field "$raise_pending" "$COVER_URL" "createdAt" || true)"
pending_six="$(listing_field "$raise_pending" "$SIX_URL" "rank" || true)"
raise_pay="${WORKDIR}/raise-pay.json"
raise_pay_code="000"
if [[ -n "$raise_checkout" ]]; then
  raise_pay_code="$(http_post_json "$BASE" "/webhooks/polar" \
    "{\"checkoutId\":\"${raise_checkout}\"}" \
    "$raise_pay" "${WORKDIR}/raise-pay.hdrs" || true)"
fi
raise_board="${WORKDIR}/raise-board.json"
fetch_board_json "$BASE" "$raise_board" >/dev/null || true
raised_bid="$(listing_field "$raise_board" "$COVER_URL" "bidUsd" || true)"
raised_rank="$(listing_field "$raise_board" "$COVER_URL" "rank" || true)"
raised_created="$(listing_field "$raise_board" "$COVER_URL" "createdAt" || true)"
raised_id="$(listing_field "$raise_board" "$COVER_URL" "id" || true)"
raised_six="$(listing_field "$raise_board" "$SIX_URL" "rank" || true)"
if [[ "$raise_code" == "200" && "$raise_pay_code" == "200" ]] \
  && [[ "$pending_bid" == "5" && "$pending_created" == "$cover_created" ]] \
  && [[ "$pending_six" == "1" ]] \
  && [[ "$raised_bid" == "8" && "$raised_rank" == "1" && "$raised_six" == "2" ]] \
  && [[ "$raised_created" == "$cover_created" ]] \
  && [[ "$raised_id" == "$cover_id" ]]; then
  record "raise-difference" "PASS" "same URL \$5 → \$8; unpaid raise hidden; createdAt stable; rank recomputed"
else
  record "raise-difference" "FAIL" "HTTP ${raise_code}/${raise_pay_code} pending=${pending_bid} bid=${raised_bid} rank=${raised_rank}"
fi

# --- two \$10: older createdAt keeps #1 ---
ten_a_body="${WORKDIR}/ten-a.json"
ten_a_hdrs="${WORKDIR}/ten-a.hdrs"
ten_a_code="$(http_post_json "$BASE" "/listings" \
  "{\"sponsorUrl\":\"${TEN_A_URL}\",\"blurb\":\"Older ten dollar bid\",\"bidUsd\":10}" \
  "$ten_a_body" "$ten_a_hdrs" || true)"
ten_a_url="$(json_field "$ten_a_body" "url" || true)"
ten_a_checkout="$(checkout_id_from_url "${ten_a_url:-}" || true)"
ten_a_pay="${WORKDIR}/ten-a-pay.json"
ten_a_pay_code="000"
if [[ -n "$ten_a_checkout" ]]; then
  ten_a_pay_code="$(http_post_json "$BASE" "/webhooks/polar" \
    "{\"checkoutId\":\"${ten_a_checkout}\"}" \
    "$ten_a_pay" "${WORKDIR}/ten-a-pay.hdrs" || true)"
fi
sleep 1
ten_b_body="${WORKDIR}/ten-b.json"
ten_b_hdrs="${WORKDIR}/ten-b.hdrs"
ten_b_code="$(http_post_json "$BASE" "/listings" \
  "{\"sponsorUrl\":\"${TEN_B_URL}\",\"blurb\":\"Newer ten dollar bid\",\"bidUsd\":10}" \
  "$ten_b_body" "$ten_b_hdrs" || true)"
ten_b_url="$(json_field "$ten_b_body" "url" || true)"
ten_b_checkout="$(checkout_id_from_url "${ten_b_url:-}" || true)"
ten_b_pay="${WORKDIR}/ten-b-pay.json"
ten_b_pay_code="000"
if [[ -n "$ten_b_checkout" ]]; then
  ten_b_pay_code="$(http_post_json "$BASE" "/webhooks/polar" \
    "{\"checkoutId\":\"${ten_b_checkout}\"}" \
    "$ten_b_pay" "${WORKDIR}/ten-b-pay.hdrs" || true)"
fi
ten_board="${WORKDIR}/ten-board.json"
fetch_board_json "$BASE" "$ten_board" >/dev/null || true
ten_a_rank="$(listing_field "$ten_board" "$TEN_A_URL" "rank" || true)"
ten_b_rank="$(listing_field "$ten_board" "$TEN_B_URL" "rank" || true)"
ten_a_bid="$(listing_field "$ten_board" "$TEN_A_URL" "bidUsd" || true)"
ten_b_bid="$(listing_field "$ten_board" "$TEN_B_URL" "bidUsd" || true)"
if [[ "$ten_a_code" == "200" && "$ten_b_code" == "200" ]] \
  && [[ "$ten_a_pay_code" == "200" && "$ten_b_pay_code" == "200" ]] \
  && [[ "$ten_a_rank" == "1" && "$ten_b_rank" == "2" ]] \
  && [[ "$ten_a_bid" == "10" && "$ten_b_bid" == "10" ]]; then
  record "rank-tie" "PASS" "both \$10; older paid listing stays #1"
else
  record "rank-tie" "FAIL" "ten-a=${ten_a_rank}/${ten_a_bid} ten-b=${ten_b_rank}/${ten_b_bid}"
fi

# --- chat / NSFW are documented product errors ---
chat_body="${WORKDIR}/chat.json"
chat_code="$(http_post_json "$BASE" "/listings" \
  "{\"sponsorUrl\":\"https://t.me/foo\",\"blurb\":\"Must reject telegram\",\"bidUsd\":5}" \
  "$chat_body" "${WORKDIR}/chat.hdrs" || true)"
chat_err="$(json_field "$chat_body" "error" || true)"
if [[ "$chat_code" == "400" && "$chat_err" == "rejected_content" ]]; then
  record "rejected-chat" "PASS-ERROR" "https://t.me/foo → 400 rejected_content"
else
  record "rejected-chat" "FAIL" "t.me HTTP ${chat_code} error=${chat_err}"
fi

nsfw_body="${WORKDIR}/nsfw.json"
nsfw_code="$(http_post_json "$BASE" "/listings" \
  "{\"sponsorUrl\":\"https://safe.example/cover-${STAMP}\",\"blurb\":\"Adult video camgirls for the cover\",\"bidUsd\":5}" \
  "$nsfw_body" "${WORKDIR}/nsfw.hdrs" || true)"
nsfw_err="$(json_field "$nsfw_body" "error" || true)"
if [[ "$nsfw_code" == "400" && "$nsfw_err" == "rejected_content" ]]; then
  record "rejected-nsfw" "PASS-ERROR" "NSFW blurb → 400 rejected_content"
else
  record "rejected-nsfw" "FAIL" "NSFW HTTP ${nsfw_code} error=${nsfw_err}"
fi

# --- public click 302 to cleaned URL; clicks increment; rank unchanged ---
if [[ -z "$cover_id" ]]; then
  record "public-click" "FAIL" "no paid listing id to click"
else
  before_board="${WORKDIR}/click-before.json"
  fetch_board_json "$BASE" "$before_board" >/dev/null || true
  before_clicks="$(listing_field "$before_board" "$COVER_URL" "clicks" || true)"
  before_rank="$(listing_field "$before_board" "$COVER_URL" "rank" || true)"
  click_body="${WORKDIR}/click.body"
  click_hdrs="${WORKDIR}/click.hdrs"
  click_code="$(http_get_headers "$BASE" "/l/${cover_id}" "$click_body" "$click_hdrs" || true)"
  click_loc="$(header_value "$click_hdrs" "location" || true)"
  after_board="${WORKDIR}/click-after.json"
  after_html="${WORKDIR}/click-after.html"
  fetch_board_json "$BASE" "$after_board" >/dev/null || true
  http_get "$BASE" "/" "$after_html" >/dev/null || true
  after_clicks="$(listing_field "$after_board" "$COVER_URL" "clicks" || true)"
  after_rank="$(listing_field "$after_board" "$COVER_URL" "rank" || true)"
  if [[ "$click_code" == "302" ]] \
    && [[ "$click_loc" == "$COVER_URL" ]] \
    && [[ "$click_loc" != *utm_source* ]] \
    && [[ "$click_loc" != *fbclid* ]] \
    && [[ "$before_clicks" =~ ^[0-9]+$ && "$after_clicks" =~ ^[0-9]+$ ]] \
    && [[ "$after_clicks" -eq $((before_clicks + 1)) ]] \
    && [[ "$after_rank" == "$before_rank" ]] \
    && html_has "$after_html" "${after_clicks} clicks"; then
    record "public-click" "PASS" "GET /l/${cover_id} 302 → cleaned URL; clicks ${before_clicks}→${after_clicks}; rank ${after_rank}"
  else
    record "public-click" "FAIL" "GET /l/${cover_id} HTTP ${click_code} loc=${click_loc} clicks ${before_clicks}→${after_clicks}"
  fi
fi

# --- about / rules ---
about_body="${WORKDIR}/about.html"
about_code="$(http_get "$BASE" "/about" "$about_body" || true)"
if [[ "$about_code" == "200" ]] \
  && html_has "$about_body" 'public auction' \
  && html_has "$about_body" 'Rank is the bid' \
  && html_has "$about_body" '\$5' \
  && html_has "$about_body" 'weekly issue' \
  && html_has "$about_body" 'no ads' \
  && html_has "$about_body" 'veto is off'; then
  record "about" "PASS" "GET /about 200. Public auction, rank is the bid, weekly, veto off."
else
  record "about" "FAIL" "GET /about HTTP ${about_code}"
fi

rules_body="${WORKDIR}/rules.html"
rules_code="$(http_get "$BASE" "/rules" "$rules_body" || true)"
if [[ "$rules_code" == "200" ]] \
  && html_has "$rules_body" '\$5' \
  && html_has "$rules_body" '\$10,000' \
  && html_has "$rules_body" 'Rank is the bid' \
  && html_has "$rules_body" 'older listing wins' \
  && html_has "$rules_body" 'difference' \
  && html_has "$rules_body" 'veto is off'; then
  record "rules" "PASS" "GET /rules 200. Min \$5, rank=bid, older wins, raise=difference, veto off."
else
  record "rules" "FAIL" "GET /rules HTTP ${rules_code}"
fi

# --- live Polar: always try the live path; never invent a paid row ---
# createPolar() is fixture unless POLAR_LIVE=1 and POLAR_FIXTURE_ONLY is not 1.
# Live without token throws BLOCKED-SECRET: POLAR_ACCESS_TOKEN.
# Live checkout must be a real Polar sandbox URL (sandbox.polar.sh), not a fixture listing.
echo "== polar live-checkout =="
live_port="$(pick_port)"
live_db="${WORKDIR}/polar-live.sqlite"
live_log="${WORKDIR}/polar-live.log"
live_base="http://127.0.0.1:${live_port}"
(
  cd "$root"
  unset POLAR_FIXTURE_ONLY || true
  export POLAR_LIVE=1
  if [[ -n "${OP_POLAR_ACCESS_TOKEN}" ]]; then
    export POLAR_ACCESS_TOKEN="${OP_POLAR_ACCESS_TOKEN}"
  else
    unset POLAR_ACCESS_TOKEN || true
  fi
  if [[ -n "${OP_POLAR_WEBHOOK_SECRET}" ]]; then
    export POLAR_WEBHOOK_SECRET="${OP_POLAR_WEBHOOK_SECRET}"
  else
    unset POLAR_WEBHOOK_SECRET || true
  fi
  if [[ -n "${OP_POLAR_PRODUCT_ID}" ]]; then
    export POLAR_PRODUCT_ID="${OP_POLAR_PRODUCT_ID}"
  else
    unset POLAR_PRODUCT_ID || true
  fi
  if [[ -n "${OP_POLAR_API_BASE}" ]]; then
    export POLAR_API_BASE="${OP_POLAR_API_BASE}"
  else
    unset POLAR_API_BASE || true
  fi
  export PORT="${live_port}"
  export DATABASE_PATH="${live_db}"
  export PUBLIC_BASE_URL="${live_base}"
  exec node --import tsx src/server.ts
) >"${live_log}" 2>&1 &
LIVE_PID=$!
if ! wait_health "$live_base"; then
  if grep -q 'BLOCKED-SECRET: POLAR_ACCESS_TOKEN' "${live_log}"; then
    echo "BLOCKED-SECRET: POLAR_ACCESS_TOKEN"
    record "live-checkout" "BLOCKED-SECRET" "POLAR_ACCESS_TOKEN"
  elif grep -q 'BLOCKED-SECRET: POLAR_PRODUCT_ID' "${live_log}"; then
    echo "BLOCKED-SECRET: POLAR_PRODUCT_ID"
    record "live-checkout" "BLOCKED-SECRET" "POLAR_PRODUCT_ID"
  else
    echo "live Polar process log:" >&2
    cat "${live_log}" >&2 || true
    record "live-checkout" "FAIL" "live Polar process did not become healthy"
  fi
else
  live_list="${WORKDIR}/live-list.json"
  live_list_hdrs="${WORKDIR}/live-list.hdrs"
  live_list_code="$(http_post_json "$live_base" "/listings" \
    "{\"sponsorUrl\":\"https://live.example/slot-${STAMP}\",\"blurb\":\"Must not rank until Polar pays\",\"bidUsd\":5}" \
    "$live_list" "$live_list_hdrs" || true)"
  live_url="$(json_field "$live_list" "url" || true)"
  live_err="$(json_field "$live_list" "error" || true)"
  live_board="${WORKDIR}/live-board.json"
  live_html="${WORKDIR}/live-board.html"
  fetch_board_json "$live_base" "$live_board" >/dev/null || true
  http_get "$live_base" "/" "$live_html" >/dev/null || true
  live_count="$(board_count "$live_board" || echo "?")"
  if html_has "$live_html" 'live.example/slot-' || [[ "$live_count" != "0" && "$live_count" != "?" ]]; then
    record "live-checkout" "FAIL" "unpaid live Polar session appeared on the board"
  elif [[ "$live_url" == /checkout/complete* || "$live_url" == *checkoutId=fix_* ]]; then
    record "live-checkout" "FAIL" "live Polar returned a fixture listing URL"
  elif [[ "$live_list_code" == "200" && "$live_url" == https://sandbox.polar.sh/* ]]; then
    record "live-checkout" "PASS" "sandbox.polar.sh checkout URL; unpaid session not listed"
  elif [[ "$live_err" == "BLOCKED-SECRET: POLAR_ACCESS_TOKEN" ]] \
    || grep -q 'BLOCKED-SECRET: POLAR_ACCESS_TOKEN' "$live_list" "${live_log}"; then
    echo "BLOCKED-SECRET: POLAR_ACCESS_TOKEN"
    record "live-checkout" "BLOCKED-SECRET" "POLAR_ACCESS_TOKEN"
  elif [[ "$live_err" == "BLOCKED-SECRET: POLAR_PRODUCT_ID" ]] \
    || grep -q 'BLOCKED-SECRET: POLAR_PRODUCT_ID' "$live_list" "${live_log}"; then
    echo "BLOCKED-SECRET: POLAR_PRODUCT_ID"
    record "live-checkout" "BLOCKED-SECRET" "POLAR_PRODUCT_ID"
  else
    record "live-checkout" "PASS-ERROR" "POLAR_LIVE=1 HTTP ${live_list_code} (no invented listing)"
  fi
fi
if [[ -n "${LIVE_PID}" ]] && kill -0 "${LIVE_PID}" 2>/dev/null; then
  kill "${LIVE_PID}" 2>/dev/null || true
  wait "${LIVE_PID}" 2>/dev/null || true
fi
LIVE_PID=""

echo
echo "== summary =="
echo "PASS=${PASS} PASS-ERROR=${PASS_ERROR} BLOCKED-SECRET=${BLOCKED} FAIL=${FAIL}"
echo "base=${BASE}"
if [[ -f "${RESULT_LOG}" ]]; then
  echo "----"
  while IFS=$'\t' read -r flow status note; do
    printf '%-20s %-16s %s\n' "$flow" "$status" "$note"
  done <"${RESULT_LOG}"
fi

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
