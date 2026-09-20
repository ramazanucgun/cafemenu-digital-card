-- Adds font selection support (independent of the theme's color palette)
ALTER TABLE digital_profiles
  ADD COLUMN IF NOT EXISTS font_family VARCHAR(30) NOT NULL DEFAULT 'inter';
