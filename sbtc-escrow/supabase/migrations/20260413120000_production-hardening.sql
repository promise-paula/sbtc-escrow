-- ============================================================================
-- Production Hardening Migration
-- Fixes: RLS write policies, idempotency, indexes, FK cascade
-- ============================================================================

-- -------------------------------------------------------
-- P0: RLS — Block all anon/authenticated writes
-- Only the service_role (used by Edge Functions) bypasses RLS
-- -------------------------------------------------------

-- Escrows: deny INSERT/UPDATE/DELETE for all non-service roles
CREATE POLICY "Deny public insert escrows" ON escrows
  FOR INSERT TO anon, authenticated WITH CHECK (false);

CREATE POLICY "Deny public update escrows" ON escrows
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "Deny public delete escrows" ON escrows
  FOR DELETE TO anon, authenticated USING (false);

-- Escrow events: deny INSERT/UPDATE/DELETE for all non-service roles
CREATE POLICY "Deny public insert events" ON escrow_events
  FOR INSERT TO anon, authenticated WITH CHECK (false);

CREATE POLICY "Deny public update events" ON escrow_events
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "Deny public delete events" ON escrow_events
  FOR DELETE TO anon, authenticated USING (false);

-- Platform config: deny INSERT/UPDATE/DELETE for all non-service roles
CREATE POLICY "Deny public insert config" ON platform_config
  FOR INSERT TO anon, authenticated WITH CHECK (false);

CREATE POLICY "Deny public update config" ON platform_config
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "Deny public delete config" ON platform_config
  FOR DELETE TO anon, authenticated USING (false);

-- -------------------------------------------------------
-- P0: Idempotency — Prevent duplicate event processing
-- -------------------------------------------------------

CREATE UNIQUE INDEX idx_events_idempotent
  ON escrow_events(tx_id, event_type, block_height);

-- -------------------------------------------------------
-- P2: Additional indexes for production performance
-- -------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_events_tx_id ON escrow_events(tx_id);
CREATE INDEX IF NOT EXISTS idx_escrows_tx_id ON escrows(tx_id);

-- -------------------------------------------------------
-- P2: FK cascade — Clean up orphaned events on rollback
-- -------------------------------------------------------

ALTER TABLE escrow_events
  DROP CONSTRAINT IF EXISTS escrow_events_escrow_id_fkey,
  ADD CONSTRAINT escrow_events_escrow_id_fkey
    FOREIGN KEY (escrow_id) REFERENCES escrows(id) ON DELETE CASCADE;
