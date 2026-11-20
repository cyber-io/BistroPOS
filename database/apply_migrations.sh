#!/usr/bin/env bash
# ============================================================================
# Apply Database Migrations & Seeds to Local Supabase Instance
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Applying migrations to Supabase PostgreSQL database..."

docker exec -i supabase-db psql -U postgres -d postgres < "$SCRIPT_DIR/migrations/001_initial_schema.sql"
docker exec -i supabase-db psql -U postgres -d postgres < "$SCRIPT_DIR/migrations/002_indexes_and_constraints.sql"
docker exec -i supabase-db psql -U postgres -d postgres < "$SCRIPT_DIR/functions/001_reservation_functions.sql"
docker exec -i supabase-db psql -U postgres -d postgres < "$SCRIPT_DIR/functions/002_order_functions.sql"
docker exec -i supabase-db psql -U postgres -d postgres < "$SCRIPT_DIR/policies/001_row_level_security.sql"
docker exec -i supabase-db psql -U postgres -d postgres < "$SCRIPT_DIR/policies/002_fix_rls_policies.sql"
docker exec -i supabase-db psql -U postgres -d postgres < "$SCRIPT_DIR/seeds/001_seed_data.sql"

echo "✅ All database migrations and seed data applied successfully to Supabase!"
