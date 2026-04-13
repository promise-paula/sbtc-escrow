-- Add token_type column for V4 dual-token support
-- 0 = STX (default, backward-compatible with V3 escrows)
-- 1 = sBTC
ALTER TABLE escrows ADD COLUMN token_type smallint NOT NULL DEFAULT 0;

CREATE INDEX idx_escrows_token_type ON escrows(token_type);
