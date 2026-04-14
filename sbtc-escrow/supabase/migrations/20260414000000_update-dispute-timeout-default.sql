-- Update dispute_timeout default from 4320 (pre-Nakamoto) to 28800 (~30 days at 960 blocks/day)
ALTER TABLE platform_config
  ALTER COLUMN dispute_timeout SET DEFAULT 28800;

-- Update existing row if still at old default
UPDATE platform_config
  SET dispute_timeout = 28800
  WHERE id = 1 AND dispute_timeout = 4320;
