#!/bin/sh
# Create test database so TEST_DATABASE_URL can point to it.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE expense_manager_test;
EOSQL
