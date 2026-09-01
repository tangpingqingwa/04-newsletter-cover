#!/usr/bin/env bash
# Disposable smoke for the compiled application with production dependencies
# only. It never selects a live Waffo mode or calls a provider.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

command -v curl >/dev/null || fail "curl is required"
command -v node >/dev/null || fail "node is required"
[[ -f dist/server.js ]] || fail "dist/server.js is missing; run npm run build first"
[[ -d dist/migrations ]] || fail "compiled migrations are missing"

workdir="$(mktemp -d "${TMPDIR:-/tmp}/newsletter-cover-built-runtime.XXXXXX")"
runtime="$workdir/runtime"
mkdir -p "$runtime"
cp package.json package-lock.json "$runtime/"
cp -R dist "$runtime/"

cleanup() {
  local child

  # Stop every child before removing the disposable runtime. The trap also
  # runs on failures between either launch and the explicit waits below.
  for child in "${pid:-}" "${invalid_pid:-}"; do
    [[ -n "$child" ]] || continue
    if kill -0 "$child" 2>/dev/null; then
      kill "$child" 2>/dev/null || true
    fi
  done
  for child in "${pid:-}" "${invalid_pid:-}"; do
    [[ -n "$child" ]] || continue
    wait "$child" 2>/dev/null || true
  done

  if [[ -n "${workdir:-}" && -d "$workdir" ]]; then
    rm -rf -- "$workdir"
  fi
}
trap cleanup EXIT

(
  cd "$runtime"
  npm ci --omit=dev >/dev/null
)
[[ ! -e "$runtime/node_modules/tsx" ]] || fail "tsx must not be required by the runtime install"

port="$(node --input-type=module -e '
  import net from "node:net";
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (address === null || typeof address === "string") process.exit(1);
    process.stdout.write(String(address.port));
    server.close();
  });
')"
base="http://127.0.0.1:${port}"
db_path="$workdir/fixture.sqlite"
log_path="$workdir/fixture.log"

(
  cd "$runtime"
  unset WAFFO_MODE WAFFO_LIVE POLAR_LIVE WAFFO_MERCHANT_ID WAFFO_PRIVATE_KEY \
    WAFFO_PRIVATE_KEY_FILE WAFFO_STORE_ID WAFFO_PRODUCT_ID \
    WAFFO_WEBHOOK_PUBLIC_KEY WAFFO_WEBHOOK_TEST_PUBLIC_KEY \
    WAFFO_WEBHOOK_PROD_PUBLIC_KEY WAFFO_API_BASE
  export WAFFO_MODE=fixture
  export NODE_ENV=test
  export PORT="$port"
  export DATABASE_PATH="$db_path"
  export PUBLIC_BASE_URL="$base"
  npm start
) >"$log_path" 2>&1 &
pid=$!

healthy=0
for _ in $(seq 1 80); do
  if curl -fsS --connect-timeout 2 --max-time 5 "$base/healthz" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    break
  fi
  sleep 0.1
done
if [[ "$healthy" != 1 ]]; then
  sed -n '1,120p' "$log_path" >&2 || true
  fail "compiled fixture runtime did not become healthy"
fi

health="$(curl -fsS "$base/healthz")"
[[ "$health" == *'"ok":true'* ]] || fail "compiled health response is not ok"
home="$(curl -fsS "$base/")"
[[ "$home" == *"No paid listings on this board"* ]] || fail "compiled home is not the honest empty folio"
echo "PASS compiled-runtime-fixture health-and-home"

kill "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true
pid=""

invalid_log="$workdir/invalid.log"
invalid_db="$workdir/invalid.sqlite"
(
  cd "$runtime"
  unset WAFFO_LIVE POLAR_LIVE WAFFO_MERCHANT_ID WAFFO_PRIVATE_KEY \
    WAFFO_PRIVATE_KEY_FILE WAFFO_STORE_ID WAFFO_PRODUCT_ID \
    WAFFO_WEBHOOK_PUBLIC_KEY WAFFO_WEBHOOK_TEST_PUBLIC_KEY \
    WAFFO_WEBHOOK_PROD_PUBLIC_KEY WAFFO_API_BASE
  export NODE_ENV=production
  export WAFFO_MODE=fixture
  export PORT="$port"
  export DATABASE_PATH="$invalid_db"
  npm start
) >"$invalid_log" 2>&1 &
invalid_pid=$!
invalid_status=""
for _ in $(seq 1 80); do
  if ! kill -0 "$invalid_pid" 2>/dev/null; then
    set +e
    wait "$invalid_pid"
    invalid_status=$?
    set -e
    break
  fi
  sleep 0.1
done
if [[ -z "$invalid_status" ]]; then
  kill "$invalid_pid" 2>/dev/null || true
  wait "$invalid_pid" 2>/dev/null || true
  fail "invalid production config kept the compiled runtime listening"
fi
[[ "$invalid_status" -ne 0 ]] || fail "invalid production config unexpectedly listened"
grep -q 'BLOCKED-CONFIG' "$invalid_log" || fail "invalid production failure was not explicit"
[[ ! -e "$invalid_db" ]] || fail "invalid production config opened a database"
echo "PASS compiled-runtime-production-fails-closed"
