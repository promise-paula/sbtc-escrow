-- ============================================================================
-- Delivery signals
-- Off-chain seller → buyer notification: "I've completed the work."
-- No financial consequence — buyer still has to call release() on-chain.
-- ============================================================================

CREATE TABLE deliveries (
  id          bigserial PRIMARY KEY,
  escrow_id   bigint NOT NULL REFERENCES escrows(id),
  seller_address text NOT NULL,
  buyer_address  text NOT NULL,
  message        text CHECK (char_length(message) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_deliveries_escrow_id ON deliveries(escrow_id);
CREATE INDEX idx_deliveries_buyer     ON deliveries(buyer_address);

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

-- Anyone can read delivery signals
CREATE POLICY "Public read deliveries" ON deliveries
  FOR SELECT USING (true);

-- Only the actual seller of a pending escrow may insert a delivery signal.
-- Both seller_address and buyer_address are validated against the escrows table
-- so neither can be spoofed from the frontend.
CREATE POLICY "Seller can mark delivered" ON deliveries
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM escrows
      WHERE escrows.id       = deliveries.escrow_id
        AND escrows.seller   = deliveries.seller_address
        AND escrows.buyer    = deliveries.buyer_address
        AND escrows.status   = 0   -- STATUS_PENDING only
    )
  );

CREATE POLICY "Deny public update deliveries" ON deliveries
  FOR UPDATE TO anon, authenticated USING (false);

CREATE POLICY "Deny public delete deliveries" ON deliveries
  FOR DELETE TO anon, authenticated USING (false);

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Enables the buyer's browser to receive a push notification the moment
-- the seller inserts a delivery row.
ALTER PUBLICATION supabase_realtime ADD TABLE deliveries;
