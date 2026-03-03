-- PROJ-1: Plattform-Integration & Grundeinstellungen
-- Creates integration_settings and properties tables with RLS

-- Create custom type for platform
CREATE TYPE platform_type AS ENUM ('smoobu', 'lexware');

-- Create custom type for test status
CREATE TYPE test_status_type AS ENUM ('success', 'error', 'untested');

-- ============================================================
-- Table: integration_settings
-- ============================================================
CREATE TABLE integration_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform platform_type NOT NULL UNIQUE,
  api_key_encrypted TEXT NOT NULL,
  last_tested_at TIMESTAMPTZ,
  last_test_status test_status_type NOT NULL DEFAULT 'untested',
  last_error_msg TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only authenticated users can access
CREATE POLICY "Authenticated users can select integration_settings"
  ON integration_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert integration_settings"
  ON integration_settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update integration_settings"
  ON integration_settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete integration_settings"
  ON integration_settings FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- Table: properties
-- ============================================================
CREATE TABLE properties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  smoobu_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'Unbekannt',
  display_name TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only authenticated users can access
CREATE POLICY "Authenticated users can select properties"
  ON properties FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert properties"
  ON properties FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update properties"
  ON properties FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete properties"
  ON properties FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_properties_smoobu_id ON properties (smoobu_id);
CREATE INDEX idx_properties_is_active ON properties (is_active);
CREATE INDEX idx_properties_is_archived ON properties (is_archived);
CREATE INDEX idx_integration_settings_platform ON integration_settings (platform);
