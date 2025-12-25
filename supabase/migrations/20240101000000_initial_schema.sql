-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Subscription Tiers Table (Admin-manageable)
CREATE TABLE subscription_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  price_monthly DECIMAL(10,2) DEFAULT 0,
  price_yearly DECIMAL(10,2),
  features JSONB NOT NULL DEFAULT '[]',
  game_limit INTEGER,
  photo_storage_limit_mb INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User Profiles Table (extends Supabase auth.users)
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  subscription_tier_id UUID REFERENCES subscription_tiers(id),
  subscription_status TEXT,
  subscription_expires_at TIMESTAMP,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Subscriptions Table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_id UUID REFERENCES subscription_tiers(id),
  status TEXT NOT NULL,
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Custom Field Definitions Table (Admin-manageable)
CREATE TABLE custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  field_key TEXT NOT NULL UNIQUE,
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'select', 'date', 'file')),
  field_options JSONB,
  required BOOLEAN DEFAULT FALSE,
  tier_restriction UUID REFERENCES subscription_tiers(id),
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Games Table
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  date TIMESTAMP NOT NULL,
  location_name TEXT,
  location_address TEXT,
  notes TEXT,
  score_photo_url TEXT,
  score_source TEXT CHECK (score_source IN ('manual', 'ocr')) DEFAULT 'manual',
  ocr_confidence DECIMAL,
  frame_scores JSONB,
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- OCR Configuration Table (Admin-manageable)
CREATE TABLE ocr_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL CHECK (provider IN ('tesseract', 'google_vision', 'aws_textract')),
  is_active BOOLEAN DEFAULT TRUE,
  api_key_encrypted TEXT,
  config JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create unique index for active OCR provider (only one active at a time)
CREATE UNIQUE INDEX ocr_config_active ON ocr_config(provider) WHERE is_active = TRUE;

-- Create indexes for better query performance
CREATE INDEX idx_games_user_id ON games(user_id);
CREATE INDEX idx_games_date ON games(date);
CREATE INDEX idx_games_user_date ON games(user_id, date);
CREATE INDEX idx_user_profiles_tier ON user_profiles(subscription_tier_id);
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_custom_fields_active ON custom_field_definitions(is_active) WHERE is_active = TRUE;

-- Enable Row Level Security (RLS)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for games
CREATE POLICY "Users can view their own games"
  ON games FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own games"
  ON games FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own games"
  ON games FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own games"
  ON games FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for subscriptions
CREATE POLICY "Users can view their own subscriptions"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policies for subscription_tiers (public read)
CREATE POLICY "Anyone can view active subscription tiers"
  ON subscription_tiers FOR SELECT
  USING (is_active = TRUE);

-- RLS Policies for custom_field_definitions (public read for active fields)
CREATE POLICY "Anyone can view active custom field definitions"
  ON custom_field_definitions FOR SELECT
  USING (is_active = TRUE);

-- RLS Policies for ocr_config (admin only)
CREATE POLICY "Only admins can view OCR config"
  ON ocr_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = TRUE
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_tiers_updated_at
  BEFORE UPDATE ON subscription_tiers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_games_updated_at
  BEFORE UPDATE ON games
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_custom_field_definitions_updated_at
  BEFORE UPDATE ON custom_field_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ocr_config_updated_at
  BEFORE UPDATE ON ocr_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default subscription tiers
INSERT INTO subscription_tiers (name, display_name, price_monthly, price_yearly, features, game_limit, photo_storage_limit_mb, sort_order) VALUES
('free', 'Free', 0, 0, '["manual_entry", "basic_average"]', 10, 0, 1),
('basic', 'Basic', 4.99, 49.99, '["ocr", "unlimited_games", "photo_storage", "basic_analytics"]', NULL, 100, 2),
('pro', 'Pro', 9.99, 99.99, '["ocr", "unlimited_games", "photo_storage", "basic_analytics", "advanced_analytics", "export", "priority_ocr"]', NULL, 500, 3),
('premium', 'Premium', 19.99, 199.99, '["ocr", "unlimited_games", "unlimited_storage", "basic_analytics", "advanced_analytics", "export", "priority_ocr", "team_features", "social_sharing", "api_access"]', NULL, NULL, 4);

-- Insert default OCR config (Tesseract.js - client-side, no API key needed)
INSERT INTO ocr_config (provider, is_active, config) VALUES
('tesseract', TRUE, '{"clientSide": true, "workerPath": "/tesseract-worker"}');

