#!/usr/bin/env bash
# End-to-end smoke test for the BOMBA BET API.
#
# Usage:
#   ADMIN_PASSWORD='<seeded admin password>' bash scripts/e2e.sh
# Requires a running server (npm run dev) and a seeded database (npm run seed -- --demo).
set -u

BASE="${BASE:-http://localhost:4000/api}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0
FAIL=0

# Extract a value from JSON on stdin by dotted path (see scripts/jget.py).
j() { python3 "$SCRIPT_DIR/jget.py" "$1"; }

check() { # name expected actual
  if [ "$2" = "$3" ]; then
    echo "  ok   $1"; PASS=$((PASS + 1))
  else
    echo "  FAIL $1 (expected '$2', got '$3')"; FAIL=$((FAIL + 1))
  fi
}

code() { # method url [curl args...]
  local method="$1"; local url="$2"; shift 2
  curl -sS -o /dev/null -w '%{http_code}' -X "$method" "$url" "$@"
}

json() { # method url token-or-empty body
  local method="$1"; local url="$2"; local tok="$3"; local body="$4"
  if [ -n "$tok" ]; then
    curl -sS -X "$method" "$url" -H "Authorization: Bearer $tok" -H 'content-type: application/json' -d "$body"
  else
    curl -sS -X "$method" "$url" -H 'content-type: application/json' -d "$body"
  fi
}

echo "== public config =="
check "appName" "БОМБА БЕТ" "$(curl -sS "$BASE/config" | j appName)"

# The prediction flow below needs at least one upcoming event with two markets.
# On a clean production database there are none, so create one via the admin API.
ADMIN_PASS="${ADMIN_PASSWORD:-}"
ATOKEN=""
if [ -n "$ADMIN_PASS" ]; then
  ATOKEN=$(json POST "$BASE/auth/login" "" "{\"username\":\"owner\",\"password\":\"$ADMIN_PASS\"}" | j accessToken)
fi
if [ -z "$(curl -sS "$BASE/events?status=upcoming" | j events.0.id)" ]; then
  if [ -z "$ATOKEN" ]; then
    echo "  FAIL no upcoming event and ADMIN_PASSWORD unset — cannot bootstrap one" >&2
    exit 1
  fi
  json POST "$BASE/admin/events" "$ATOKEN" '{"sport":"football","league":"Тест-лига","teamHome":"Тест А","teamAway":"Тест Б","startsAt":"2027-01-01T18:00:00.000Z","markets":[{"title":"Исход","kind":"outcome","outcomes":[{"label":"П1","odds":1.9},{"label":"П2","odds":2.1}]},{"title":"Тотал","kind":"total","outcomes":[{"label":"Больше 2.5","odds":1.85},{"label":"Меньше 2.5","odds":1.95}]}]}' > /dev/null
fi

echo "== register =="
U="tester_$RANDOM$RANDOM"
REG=$(json POST "$BASE/auth/register" "" "{\"username\":\"$U\",\"password\":\"SuperSecret123\",\"telegramUsername\":\"tester_tg\"}")
TOKEN=$(echo "$REG" | j accessToken)
AUTH="Authorization: Bearer $TOKEN"
check "register returns token" "yes" "$([ -n "$TOKEN" ] && echo yes || echo no)"
check "signup bonus credited" "500" "$(echo "$REG" | j user.balance)"
check "id present" "yes" "$(echo "$REG" | j user.id | grep -qE '^[0-9a-f-]{36}$' && echo yes || echo no)"

echo "== duplicate username rejected =="
check "duplicate -> 409" "409" "$(code POST "$BASE/auth/register" -H 'content-type: application/json' -d "{\"username\":\"$U\",\"password\":\"SuperSecret123\"}")"

echo "== login =="
LOGIN=$(json POST "$BASE/auth/login" "" "{\"username\":\"$U\",\"password\":\"SuperSecret123\"}")
check "login ok" "yes" "$(echo "$LOGIN" | j accessToken | grep -q . && echo yes || echo no)"

echo "== wrong password rejected =="
check "bad password -> 401" "401" "$(code POST "$BASE/auth/login" -H 'content-type: application/json' -d "{\"username\":\"$U\",\"password\":\"WrongPassword123\"}")"

echo "== me =="
check "me username" "$U" "$(curl -sS "$BASE/me" -H "$AUTH" | j user.username)"

echo "== events =="
EVENTS=$(curl -sS "$BASE/events?status=upcoming")
EID=$(echo "$EVENTS" | j events.0.id)
MID=$(echo "$EVENTS" | j events.0.markets.0.id)
OID=$(echo "$EVENTS" | j events.0.markets.0.outcomes.0.id)
ODDS=$(echo "$EVENTS" | j events.0.markets.0.outcomes.0.odds)
OID2=$(echo "$EVENTS" | j events.0.markets.0.outcomes.1.id)
MID3=$(echo "$EVENTS" | j events.0.markets.1.id)
OID3=$(echo "$EVENTS" | j events.0.markets.1.outcomes.0.id)
check "event id present" "yes" "$([ -n "$EID" ] && echo yes || echo no)"

echo "== place prediction =="
KEY="idem-$RANDOM$RANDOM"
BET=$(json POST "$BASE/predictions" "$TOKEN" "{\"eventId\":\"$EID\",\"marketId\":\"$MID\",\"outcomeId\":\"$OID\",\"stake\":100,\"idempotencyKey\":\"$KEY\"}")
check "prediction created" "pending" "$(echo "$BET" | j prediction.status)"
check "balance after stake" "400" "$(echo "$BET" | j balance)"

echo "== idempotent retry =="
BET2=$(json POST "$BASE/predictions" "$TOKEN" "{\"eventId\":\"$EID\",\"marketId\":\"$MID\",\"outcomeId\":\"$OID\",\"stake\":100,\"idempotencyKey\":\"$KEY\"}")
check "idempotent replay" "true" "$(echo "$BET2" | j idempotentReplay)"
check "balance unchanged on replay" "400" "$(echo "$BET2" | j balance)"

echo "== second pick on same market rejected =="
check "conflicting pick -> 409" "409" "$(code POST "$BASE/predictions" -H "$AUTH" -H 'content-type: application/json' -d "{\"eventId\":\"$EID\",\"marketId\":\"$MID\",\"outcomeId\":\"$OID2\",\"stake\":50}")"

echo "== stake above balance rejected =="
check "overdraw -> 400" "400" "$(code POST "$BASE/predictions" -H "$AUTH" -H 'content-type: application/json' -d "{\"eventId\":\"$EID\",\"marketId\":\"$MID3\",\"outcomeId\":\"$OID3\",\"stake\":999999}")"

echo "== my predictions =="
check "one prediction listed" "1" "$(curl -sS "$BASE/predictions/my" -H "$AUTH" | j stats.pending)"

echo "== leaderboard =="
check "leaderboard non-empty" "yes" "$(curl -sS "$BASE/leaderboard?limit=5" | j leaderboard.0.username | grep -q . && echo yes || echo no)"

echo "== admin login =="
ADMIN_PASS="${ADMIN_PASSWORD:-}"
if [ -z "$ADMIN_PASS" ]; then
  echo "  skip admin tests (ADMIN_PASSWORD not set)"
else
  ALOGIN=$(json POST "$BASE/auth/login" "" "{\"username\":\"owner\",\"password\":\"$ADMIN_PASS\"}")
  ATOKEN=$(echo "$ALOGIN" | j accessToken)
  AAUTH="Authorization: Bearer $ATOKEN"
  check "admin token" "yes" "$([ -n "$ATOKEN" ] && echo yes || echo no)"

  STATS=$(curl -sS "$BASE/admin/stats" -H "$AAUTH")
  check "stats users >=1" "yes" "$(echo "$STATS" | j users | grep -qE '^[0-9]+$' && echo yes || echo no)"
  check "stats prizes pending >=1" "yes" "$(echo "$STATS" | j prizesPending | grep -qE '^[0-9]+$' && echo yes || echo no)"

  echo "== non-admin blocked from admin API =="
  check "user -> 403" "403" "$(code GET "$BASE/admin/stats" -H "$AUTH")"

  echo "== admin settles the event (winner = our pick) =="
  SET=$(json POST "$BASE/admin/events/$EID/settle" "$ATOKEN" "{\"homeScore\":3,\"awayScore\":0,\"winningOutcomeIds\":[\"$OID\"]}")
  check "winners paid" "yes" "$(echo "$SET" | j result.wonCount | grep -qE '^[0-9]+$' && echo yes || echo no)"

  echo "== double settlement blocked =="
  check "second settle -> 409" "409" "$(code POST "$BASE/admin/events/$EID/settle" -H "$AAUTH" -H 'content-type: application/json' -d "{\"homeScore\":3,\"awayScore\":0,\"winningOutcomeIds\":[\"$OID\"]}")"

  echo "== payout credited once =="
  ME2=$(curl -sS "$BASE/me" -H "$AUTH")
  EXPECTED=$(python3 -c "import sys;print(400 + round(100*float(sys.argv[1])))" "$ODDS")
  check "balance after win" "$EXPECTED" "$(echo "$ME2" | j user.balance)"
  check "won count" "1" "$(echo "$ME2" | j user.stats.won)"

  echo "== only winnings are withdrawable =="
  # The stake was paid with bonus points, so only the profit becomes cashable.
  WITHDRAWABLE=$(python3 -c "import sys;print(int(sys.argv[1]) - 500)" "$EXPECTED")
  check "withdrawable = profit" "$WITHDRAWABLE" "$(echo "$ME2" | j user.withdrawableBalance)"

  echo "== bonus-only points cannot be withdrawn =="
  # A fresh account has a signup bonus but no winnings: a prize request must fail.
  U2="bonusonly_$RANDOM$RANDOM"
  REG2=$(json POST "$BASE/auth/register" "" "{\"username\":\"$U2\",\"password\":\"SuperSecret123\"}")
  TOKEN2=$(echo "$REG2" | j accessToken)
  check "bonus-only balance" "500" "$(echo "$REG2" | j user.balance)"
  check "bonus-only withdrawable" "0" "$(echo "$REG2" | j user.withdrawableBalance)"
  check "bonus-only prize -> 400" "400" "$(code POST "$BASE/prizes" -H "Authorization: Bearer $TOKEN2" -H 'content-type: application/json' -d '{"stars":1,"telegramUsername":"tester_tg"}')"

  echo "== request a prize in Stars =="
  json PUT "$BASE/admin/settings" "$ATOKEN" '{"prizes.pointsPerStar":1,"prizes.minStars":1}' > /dev/null
  PRIZE=$(json POST "$BASE/prizes" "$TOKEN" "{\"stars\":10,\"telegramUsername\":\"@tester_tg\",\"idempotencyKey\":\"prize-$RANDOM$RANDOM\"}")
  PZID=$(echo "$PRIZE" | j prize.id)
  check "prize pending" "pending" "$(echo "$PRIZE" | j prize.status)"
  check "prize stars stored" "10" "$(echo "$PRIZE" | j prize.stars)"
  AFTER_RESERVE=$(python3 -c "import sys;print(int(sys.argv[1])-10)" "$EXPECTED")
  check "prize reserves points" "$AFTER_RESERVE" "$(echo "$PRIZE" | j balance)"
  check "prize below minimum -> 400" "400" "$(code POST "$BASE/prizes" -H "$AUTH" -H 'content-type: application/json' -d '{"stars":0,"telegramUsername":"tester_tg"}')"

  echo "== admin approves and issues prize =="
  AP=$(json POST "$BASE/admin/prizes/$PZID/approve" "$ATOKEN" '{}')
  check "approved" "approved" "$(echo "$AP" | j prize.status)"
  IS=$(json POST "$BASE/admin/prizes/$PZID/issue" "$ATOKEN" '{}')
  check "issued" "issued" "$(echo "$IS" | j prize.status)"

  echo "== reject without reason is refused =="
  PRIZE2=$(json POST "$BASE/prizes" "$TOKEN" "{\"stars\":10,\"telegramUsername\":\"@tester_tg\",\"idempotencyKey\":\"prize2-$RANDOM$RANDOM\"}")
  PZ2=$(echo "$PRIZE2" | j prize.id)
  check "reject w/o reason -> 400" "400" "$(code POST "$BASE/admin/prizes/$PZ2/reject" -H "$AAUTH" -H 'content-type: application/json' -d '{}')"
  RJ=$(json POST "$BASE/admin/prizes/$PZ2/reject" "$ATOKEN" '{"rejectReason":"Недостаточно подтверждений"}')
  check "rejected with reason" "rejected" "$(echo "$RJ" | j prize.status)"
  check "rejection refunds points" "$AFTER_RESERVE" "$(curl -sS "$BASE/me" -H "$AUTH" | j user.balance)"

  echo "== admin balance adjustment requires reason =="
  UID2=$(echo "$ME2" | j user.id)
  check "missing reason -> 400" "400" "$(code POST "$BASE/admin/users/$UID2/balance" -H "$AAUTH" -H 'content-type: application/json' -d '{"delta":100}')"
  ADJ=$(json POST "$BASE/admin/users/$UID2/balance" "$ATOKEN" '{"delta":250,"reason":"Бонус за активность (тест)"}')
  check "balance adjusted" "yes" "$(echo "$ADJ" | j balanceAfter | grep -qE '^[0-9]+$' && echo yes || echo no)"

  echo "== audit log written =="
  AUD=$(curl -sS "$BASE/admin/audit?limit=200" -H "$AAUTH")
  check "audit has settle entry" "yes" "$(echo "$AUD" | grep -q 'admin.event.settle' && echo yes || echo no)"
  check "audit has balance entry" "yes" "$(echo "$AUD" | grep -q 'admin.user.balance_adjust' && echo yes || echo no)"
  check "audit has prize entry" "yes" "$(echo "$AUD" | grep -q 'admin.prize.issue' && echo yes || echo no)"

  echo "== user block/unblock =="
  BLK=$(json POST "$BASE/admin/users/$UID2/status" "$ATOKEN" '{"status":"blocked","reason":"тест"}')
  check "blocked" "blocked" "$(echo "$BLK" | j user.status)"
  check "blocked user -> 403" "403" "$(code GET "$BASE/me" -H "$AUTH")"
  UNB=$(json POST "$BASE/admin/users/$UID2/status" "$ATOKEN" '{"status":"active"}')
  check "unblocked" "active" "$(echo "$UNB" | j user.status)"

  echo "== create event via admin =="
  NEV=$(json POST "$BASE/admin/events" "$ATOKEN" '{"sport":"football","league":"Тест-лига","teamHome":"Тест А","teamAway":"Тест Б","startsAt":"2027-01-01T18:00:00.000Z","markets":[{"title":"Исход","kind":"outcome","outcomes":[{"label":"П1","odds":1.9},{"label":"П2","odds":2.1}]}]}')
  check "event created" "Тест А" "$(echo "$NEV" | j event.teamHome)"

  echo "== settings update =="
  SETT=$(json PUT "$BASE/admin/settings" "$ATOKEN" '{"predictions.maxStake":42000}')
  check "setting applied" "42000" "$(echo "$SETT" | python3 -c "import sys,json;print(json.load(sys.stdin)['settings']['predictions.maxStake'])")"
  check "unknown setting -> 400" "400" "$(code PUT "$BASE/admin/settings" -H "$AAUTH" -H 'content-type: application/json' -d '{"hacker.key":1}')"
  json PUT "$BASE/admin/settings" "$ATOKEN" '{"predictions.maxStake":50000}' > /dev/null

  echo "== maintenance mode blocks predictions =="
  json PUT "$BASE/admin/settings" "$ATOKEN" '{"maintenance.enabled":true}' > /dev/null
  UP=$(curl -sS "$BASE/events?status=upcoming")
  EID_NEW=$(echo "$UP" | j events.0.id)
  MID_NEW=$(echo "$UP" | j events.0.markets.0.id)
  OID_NEW=$(echo "$UP" | j events.0.markets.0.outcomes.0.id)
  check "maintenance -> 409" "409" "$(code POST "$BASE/predictions" -H "$AUTH" -H 'content-type: application/json' -d "{\"eventId\":\"$EID_NEW\",\"marketId\":\"$MID_NEW\",\"outcomeId\":\"$OID_NEW\",\"stake\":10}")"
  json PUT "$BASE/admin/settings" "$ATOKEN" '{"maintenance.enabled":false}' > /dev/null
fi

echo "== daily bonus (transparent rules; run last: it may credit points) =="
BONUS=$(curl -sS -X POST "$BASE/me/daily-bonus" -H "$AUTH")
check "bonus rules exposed" "0.25" "$(echo "$BONUS" | j rules.chance)"
check "bonus outcome is boolean" "yes" "$(echo "$BONUS" | j granted | grep -qE '^(true|false)$' && echo yes || echo no)"

echo
echo "===== PASS: $PASS   FAIL: $FAIL ====="
[ "$FAIL" -eq 0 ]
