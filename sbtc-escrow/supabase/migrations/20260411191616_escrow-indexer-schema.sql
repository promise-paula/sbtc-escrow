-- ============================================================================
-- sBTC Escrow Indexer Schema
-- Tables mirror on-chain state, populated by Chainhook → Edge Function
-- ============================================================================

-- Escrows: current state of each escrow (upserted on every event)
CREATE TABLE escrows (
  id bigint PRIMARY KEY,
  buyer text NOT NULL,
  seller text NOT NULL,
  amount bigint NOT NULL,
  fee_amount bigint NOT NULL,
  description text NOT NULL,
  status smallint NOT NULL DEFAULT 0,
  created_at_block bigint NOT NULL,
  expires_at_block bigint NOT NULL,
  completed_at_block bigint,
  disputed_at_block bigint,
  tx_id text NOT NULL,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Escrow events: append-only log of every contract print event
-- escrow_id is nullable because platform config events have no escrow
CREATE TABLE escrow_events (
  id bigserial PRIMARY KEY,
  escrow_id bigint REFERENCES escrows(id),
  event_type text NOT NULL,
  block_height bigint NOT NULL,
  tx_id text NOT NULL,
  data jsonb,
  indexed_at timestamptz NOT NULL DEFAULT now()
);

-- Platform config: singleton row tracking current contract configuration
CREATE TABLE platform_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  fee_bps integer NOT NULL DEFAULT 50,
  fee_recipient text NOT NULL DEFAULT '',
  contract_paused boolean NOT NULL DEFAULT false,
  dispute_timeout integer NOT NULL DEFAULT 4320,
  contract_owner text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_config (id) VALUES (1);

-- Indexes
CREATE INDEX idx_escrows_buyer ON escrows(buyer);
CREATE INDEX idx_escrows_seller ON escrows(seller);
CREATE INDEX idx_escrows_status ON escrows(status);
CREATE INDEX idx_escrows_created ON escrows(created_at_block DESC);
CREATE INDEX idx_events_escrow_id ON escrow_events(escrow_id);
CREATE INDEX idx_events_type ON escrow_events(event_type);
CREATE INDEX idx_events_block ON escrow_events(block_height DESC);

-- Row-Level Security
ALTER TABLE escrows ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read escrows" ON escrows FOR SELECT USING (true);
CREATE POLICY "Public read events" ON escrow_events FOR SELECT USING (true);
CREATE POLICY "Public read config" ON platform_config FOR SELECT USING (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';

CREATE TRIGGER escrows_updated_at
  BEFORE UPDATE ON escrows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER platform_config_updated_at
  BEFORE UPDATE ON platform_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
