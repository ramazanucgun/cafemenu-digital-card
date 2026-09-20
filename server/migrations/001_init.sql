-- CafeMenu Digital Card - Initial schema
-- Fully independent database. Does NOT touch any existing CafeMenu database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ========== USERS (own auth system) ==========
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(120) NOT NULL,
    last_name VARCHAR(120) NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    plan VARCHAR(20) NOT NULL DEFAULT 'FREE', -- FREE | PRO | BUSINESS | ENTERPRISE
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS password_resets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

-- ========== DIGITAL PROFILES ==========
CREATE TABLE IF NOT EXISTS digital_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug VARCHAR(60) NOT NULL UNIQUE,
    token VARCHAR(40) NOT NULL UNIQUE,
    first_name VARCHAR(120),
    last_name VARCHAR(120),
    title VARCHAR(160),
    company_name VARCHAR(160),
    bio TEXT,
    phone VARCHAR(40),
    whatsapp VARCHAR(40),
    email VARCHAR(255),
    website VARCHAR(255),
    address VARCHAR(255),
    profile_photo_url VARCHAR(500),
    cover_image_url VARCHAR(500),
    logo_url VARCHAR(500),
    google_review_url VARCHAR(500),
    theme VARCHAR(30) NOT NULL DEFAULT 'minimal',
    primary_color VARCHAR(20) NOT NULL DEFAULT '#111827',
    secondary_color VARCHAR(20) NOT NULL DEFAULT '#6b7280',
    lead_form_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_digital_profiles_slug ON digital_profiles(slug);
CREATE INDEX IF NOT EXISTS idx_digital_profiles_token ON digital_profiles(token);
CREATE INDEX IF NOT EXISTS idx_digital_profiles_user_id ON digital_profiles(user_id);

-- slug history so old slugs can 301-redirect and cannot be re-claimed immediately
CREATE TABLE IF NOT EXISTS slug_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES digital_profiles(id) ON DELETE CASCADE,
    slug VARCHAR(60) NOT NULL,
    released_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_slug_history_slug ON slug_history(slug);
CREATE INDEX IF NOT EXISTS idx_slug_history_profile ON slug_history(profile_id);

-- ========== SOCIAL / CUSTOM LINKS ==========
CREATE TABLE IF NOT EXISTS digital_profile_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES digital_profiles(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL, -- instagram | facebook | linkedin | x | tiktok | youtube | telegram | pinterest | custom
    label VARCHAR(120),
    url VARCHAR(500) NOT NULL,
    icon VARCHAR(60),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_links_profile ON digital_profile_links(profile_id);

-- ========== NFC CARDS ==========
CREATE TABLE IF NOT EXISTS nfc_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES digital_profiles(id) ON DELETE CASCADE,
    uid VARCHAR(120), -- physical chip UID label only, NEVER used for auth
    name VARCHAR(120) NOT NULL DEFAULT 'NFC Kart',
    product_type VARCHAR(30) NOT NULL DEFAULT 'PVC', -- PVC|METAL|WOOD|ACRYLIC|STICKER|KEYCHAIN|STAND
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    token VARCHAR(40) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_nfc_profile ON nfc_cards(profile_id);

-- ========== QR CODES ==========
CREATE TABLE IF NOT EXISTS digital_qr_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES digital_profiles(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL DEFAULT 'QR Kod',
    token VARCHAR(40) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qr_profile ON digital_qr_codes(profile_id);

-- ========== LEADS ==========
CREATE TABLE IF NOT EXISTS digital_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES digital_profiles(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    phone VARCHAR(40),
    email VARCHAR(255),
    message TEXT,
    source VARCHAR(20) NOT NULL DEFAULT 'direct',
    ip_hash VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_profile ON digital_leads(profile_id);
CREATE INDEX IF NOT EXISTS idx_leads_created ON digital_leads(created_at);

-- ========== ANALYTICS EVENTS ==========
CREATE TABLE IF NOT EXISTS digital_analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES digital_profiles(id) ON DELETE CASCADE,
    event_type VARCHAR(40) NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'direct', -- nfc | qr | direct | share
    device_type VARCHAR(20),
    user_agent VARCHAR(500),
    referrer VARCHAR(500),
    ip_hash VARCHAR(128),
    country VARCHAR(80),
    city VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_analytics_profile ON digital_analytics_events(profile_id);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON digital_analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON digital_analytics_events(event_type);

-- ========== RESERVED SLUGS ==========
CREATE TABLE IF NOT EXISTS reserved_slugs (
    slug VARCHAR(60) PRIMARY KEY
);
INSERT INTO reserved_slugs (slug) VALUES
 ('admin'),('login'),('register'),('logout'),('dashboard'),('api'),('settings'),
 ('support'),('pricing'),('contact'),('about'),('privacy'),('terms'),('help'),
 ('c'),('assets'),('static'),('uploads'),('card'),('cafemenu'),('root'),('null'),
 ('undefined'),('new'),('edit'),('delete'),('public'),('private'),('test'),('www')
ON CONFLICT DO NOTHING;
