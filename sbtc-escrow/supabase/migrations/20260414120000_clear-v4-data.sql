-- ============================================================================
-- Clear stale escrow-v4 data after migration to escrow-v5
-- The v4 chainhook has been deleted; this removes orphaned indexed data.
-- ============================================================================

-- Events first (FK references escrows)
TRUNCATE escrow_events RESTART IDENTITY CASCADE;

-- Escrows
TRUNCATE escrows RESTART IDENTITY CASCADE;

-- Reset platform_config to v5 defaults
UPDATE platform_config
SET fee_bps         = 50,
    fee_recipient   = '',
    contract_paused = false,
    dispute_timeout = 28800,
    contract_owner  = '',
    updated_at      = now()
WHERE id = 1;
