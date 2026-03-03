-- PROJ-2: City Tax Konfiguration
-- Creates city_tax_configs and city_tax_age_groups tables with RLS
-- Immutable history: only SELECT and INSERT allowed (no UPDATE/DELETE)

-- ============================================================
-- Table: city_tax_configs
-- ============================================================
CREATE TABLE city_tax_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  tax_label TEXT,
  amount_per_person_night NUMERIC(10,2) NOT NULL DEFAULT 0,
  show_separately BOOLEAN NOT NULL DEFAULT true,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE city_tax_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Authenticated users can SELECT and INSERT only (immutable history)
CREATE POLICY "Authenticated users can select city_tax_configs"
  ON city_tax_configs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert city_tax_configs"
  ON city_tax_configs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Index on (property_id, valid_from DESC) for efficient latest-config lookups
CREATE INDEX idx_city_tax_configs_property_valid
  ON city_tax_configs (property_id, valid_from DESC);

-- ============================================================
-- Table: city_tax_age_groups
-- ============================================================
CREATE TABLE city_tax_age_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  city_tax_config_id UUID NOT NULL REFERENCES city_tax_configs(id) ON DELETE CASCADE,
  age_from INTEGER,
  age_to INTEGER,
  percentage INTEGER NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Enable Row Level Security
ALTER TABLE city_tax_age_groups ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Authenticated users can SELECT and INSERT only (immutable history)
CREATE POLICY "Authenticated users can select city_tax_age_groups"
  ON city_tax_age_groups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert city_tax_age_groups"
  ON city_tax_age_groups FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Index on city_tax_config_id for join performance
CREATE INDEX idx_city_tax_age_groups_config_id
  ON city_tax_age_groups (city_tax_config_id);
