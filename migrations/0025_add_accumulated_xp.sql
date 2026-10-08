-- Migration 0025: Add accumulated_xp to campaign_characters
ALTER TABLE campaign_characters ADD COLUMN accumulated_xp INTEGER NOT NULL DEFAULT 0 CHECK (accumulated_xp >= 0 AND accumulated_xp <= 999);

-- Initialize accumulated_xp with current total XP for existing characters
UPDATE campaign_characters SET accumulated_xp = xp_tens + xp_ones WHERE accumulated_xp = 0;
