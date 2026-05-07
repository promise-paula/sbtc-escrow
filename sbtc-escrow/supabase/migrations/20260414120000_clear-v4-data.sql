-- ============================================================================
-- Originally cleared stale escrow-v4 data after migration to escrow-v5.
-- NEUTRALIZED: The TRUNCATE has been removed to prevent accidental data loss
-- if this migration is ever replayed (e.g. db reset). Both testnet and mainnet
-- already have this migration recorded as applied in supabase_migrations.
-- ============================================================================

-- (intentional no-op)
