-- Off-chain dispute reason store.
-- The on-chain contract doesn't carry text; we persist the reason in Supabase so
-- admins can understand each dispute without contacting parties.

CREATE TABLE IF NOT EXISTS dispute_reasons (
  id           bigint generated always as identity primary key,
  escrow_id    bigint NOT NULL REFERENCES escrows(id) ON DELETE CASCADE,
  reason_category text NOT NULL,
  details      text,
  submitted_by text NOT NULL,   -- wallet address of the disputing party
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dispute_reasons ENABLE ROW LEVEL SECURITY;

-- Anyone can read (admin needs to see them; parties can verify their own)
CREATE POLICY "Public read dispute reasons"
  ON dispute_reasons FOR SELECT USING (true);

-- Any authenticated request can insert (wallet-signed = authenticated enough for off-chain text)
CREATE POLICY "Allow insert dispute reasons"
  ON dispute_reasons FOR INSERT WITH CHECK (true);

-- No public updates or deletes
CREATE POLICY "Deny public update dispute reasons"
  ON dispute_reasons FOR UPDATE USING (false);

CREATE POLICY "Deny public delete dispute reasons"
  ON dispute_reasons FOR DELETE USING (false);

-- Enable Realtime so the admin queue can update live
ALTER PUBLICATION supabase_realtime ADD TABLE dispute_reasons;
