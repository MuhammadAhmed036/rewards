#!/usr/bin/env bash
# Proves a backup can really be restored, and that the restored copy is correct (not just "the command ran").
#   bash scripts/backup-restore-test.sh
# It backs up the local Docker database, restores it into a scratch database next to it, compares the data,
# checks the ledger rules survived, then deletes the scratch database. The original is only read, never changed.
# For Neon/production the same steps apply with `pg_dump`/`pg_restore` and a branch; see docs/RUNBOOK.md.
set -euo pipefail
export MSYS_NO_PATHCONV=1   # keep Git Bash from rewriting /tmp paths passed to docker

CONTAINER="${PG_CONTAINER:-loyalty-postgres}"
DB_USER="${PG_USER:-loyalty_app}"
SRC_DB="${PG_DB:-loyalty_db}"
SCRATCH="restore_test_$(date +%s)"
DUMP="/tmp/${SCRATCH}.dump"

psql_src() { docker exec -e PGPASSWORD="${PG_PASSWORD:-loyalty_password}" "$CONTAINER" psql -U "$DB_USER" -d "$1" -tAc "$2"; }
now() { date +%s; }

echo "== 1. Back up ${SRC_DB}"
T0=$(now)
docker exec -e PGPASSWORD="${PG_PASSWORD:-loyalty_password}" "$CONTAINER" pg_dump -U "$DB_USER" -Fc -d "$SRC_DB" -f "$DUMP"
T1=$(now)
SIZE=$(docker exec "$CONTAINER" sh -c "du -h $DUMP | cut -f1")
echo "   backup size ${SIZE}, took $((T1 - T0))s"

echo "== 2. Restore into a scratch database (${SCRATCH})"
psql_src postgres "CREATE DATABASE ${SCRATCH}" >/dev/null
trap 'psql_src postgres "DROP DATABASE IF EXISTS ${SCRATCH}" >/dev/null 2>&1 || true; docker exec "$CONTAINER" rm -f "$DUMP" >/dev/null 2>&1 || true' EXIT
T2=$(now)
docker exec -e PGPASSWORD="${PG_PASSWORD:-loyalty_password}" "$CONTAINER" pg_restore -U "$DB_USER" -d "$SCRATCH" --no-owner "$DUMP" 2>&1 | grep -v "^$" | head -5 || true
T3=$(now)
echo "   restore took $((T3 - T2))s"

echo "== 3. Compare every table's row count, original vs restored"
BAD=0
for t in $(psql_src "$SRC_DB" "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"); do
  a=$(psql_src "$SRC_DB" "SELECT count(*) FROM \"$t\"")
  b=$(psql_src "$SCRATCH" "SELECT count(*) FROM \"$t\"")
  if [ "$a" != "$b" ]; then echo "   MISMATCH $t: original $a, restored $b"; BAD=1; fi
done
[ $BAD -eq 0 ] && echo "   every table matches"

echo "== 4. The money-like data is intact in the restored copy"
SUM_A=$(psql_src "$SRC_DB" "SELECT coalesce(sum(points_delta),0) FROM ledger_entries")
SUM_B=$(psql_src "$SCRATCH" "SELECT coalesce(sum(points_delta),0) FROM ledger_entries")
echo "   ledger total: original ${SUM_A}, restored ${SUM_B}"
[ "$SUM_A" = "$SUM_B" ] || BAD=1
DRIFT_SQL="SELECT count(*) FROM membership_balances b WHERE b.balance <> coalesce((SELECT sum(points_delta) FROM ledger_entries l WHERE l.membership_id = b.membership_id),0)"
DRIFT_A=$(psql_src "$SRC_DB" "$DRIFT_SQL")
DRIFT_B=$(psql_src "$SCRATCH" "$DRIFT_SQL")
echo "   customers whose balance differs from their ledger: original ${DRIFT_A}, restored ${DRIFT_B} (the restore must not change this; production should be 0)"
[ "$DRIFT_A" = "$DRIFT_B" ] || BAD=1

echo "== 5. The safety rules came back too"
TRIGGER=$(psql_src "$SCRATCH" "SELECT count(*) FROM pg_trigger WHERE tgname='ledger_no_update_delete'")
RLS=$(psql_src "$SCRATCH" "SELECT count(*) FROM pg_tables WHERE tablename IN ('ledger_entries','membership_balances') AND rowsecurity")
echo "   append-only ledger trigger present: ${TRIGGER} (want 1); row-level security on ledger tables: ${RLS} (want 2)"
[ "$TRIGGER" = "1" ] || BAD=1
[ "$RLS" = "2" ] || BAD=1

echo
if [ $BAD -eq 0 ]; then
  echo "RESTORE TEST PASSED. Backup $((T1 - T0))s + restore $((T3 - T2))s = about $((T1 - T0 + T3 - T2))s for this much data."
else
  echo "RESTORE TEST FAILED"; exit 1
fi
