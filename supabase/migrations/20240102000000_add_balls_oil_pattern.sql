-- Migration: Add balls_used and oil_pattern columns to games table

-- Add balls_used column (array of text to allow multiple balls)
ALTER TABLE games ADD COLUMN IF NOT EXISTS balls_used TEXT[];

-- Add oil_pattern column
ALTER TABLE games ADD COLUMN IF NOT EXISTS oil_pattern TEXT;

-- Create index for balls_used to help with queries (using GIN index for array)
CREATE INDEX IF NOT EXISTS idx_games_balls_used ON games USING GIN (balls_used);

-- Create index for oil_pattern
CREATE INDEX IF NOT EXISTS idx_games_oil_pattern ON games(oil_pattern);

