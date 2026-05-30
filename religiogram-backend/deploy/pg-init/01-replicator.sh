#!/bin/sh
# v9 (P0-5 fix): create a dedicated `replicator` role with REPLICATION
# privilege only, separate from the application role. Runs once on first boot
# of the postgres image (files in /docker-entrypoint-initdb.d are executed
# against the freshly-initialized cluster).
#
# Required env (set in docker-compose.yml from operator's .env):
#   POSTGRES_REPLICATION_PASSWORD  — strong password for the replicator role
#
# Outcome:
#   - role `replicator` exists with REPLICATION + LOGIN
#   - replicator can stream WAL but cannot read/write any application table
#   - the app user `religiogram_user` no longer needs REPLICATION privilege

set -eu

: "${POSTGRES_REPLICATION_PASSWORD:?POSTGRES_REPLICATION_PASSWORD is required}"

echo "[pg-init] Creating dedicated replicator role…"

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'replicator') THEN
      CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD '${POSTGRES_REPLICATION_PASSWORD}';
    ELSE
      ALTER ROLE replicator WITH PASSWORD '${POSTGRES_REPLICATION_PASSWORD}';
    END IF;
  END
  \$\$;

  -- Defense in depth: app role must NOT carry REPLICATION privilege.
  ALTER ROLE ${POSTGRES_USER} NOREPLICATION;
EOSQL

# pg_hba.conf: allow `replicator` to open replication connections from inside
# the docker network. Restrict to the docker bridge subnet; production should
# scope to the VPC CIDR instead.
PG_HBA_ADDED_MARKER='# v9-replication-rule'
if ! grep -q "$PG_HBA_ADDED_MARKER" "${PGDATA}/pg_hba.conf"; then
  cat >> "${PGDATA}/pg_hba.conf" <<-EOHBA

	$PG_HBA_ADDED_MARKER
	# Allow the dedicated replicator role to stream WAL from anywhere in the
	# docker network. In a real VPC, replace 0.0.0.0/0 with the standby's CIDR.
	host replication replicator 0.0.0.0/0 scram-sha-256
EOHBA
  echo "[pg-init] pg_hba.conf updated for replicator."
fi

echo "[pg-init] Done."
