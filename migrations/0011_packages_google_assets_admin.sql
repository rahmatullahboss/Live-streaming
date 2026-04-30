CREATE TABLE IF NOT EXISTS packages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    duration_minutes INTEGER NOT NULL DEFAULT 180,
    max_rooms INTEGER NOT NULL DEFAULT 1,
    max_cameras INTEGER NOT NULL DEFAULT 3,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 100,
    features_json TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME
);

INSERT OR IGNORE INTO packages (
    id,
    name,
    description,
    price_cents,
    currency,
    duration_minutes,
    max_rooms,
    max_cameras,
    active,
    sort_order,
    features_json
) VALUES
(
    'starter-live',
    'Starter Live',
    'Single match access for small clubs and schools.',
    1500,
    'usd',
    180,
    1,
    3,
    1,
    10,
    '["1 live room","3 camera phones","R2 logo assets","External overlay link"]'
),
(
    'matchday-pro',
    'Matchday Pro',
    'Longer match-day coverage with sponsor graphics.',
    3500,
    'usd',
    360,
    2,
    5,
    1,
    20,
    '["2 live rooms","5 camera phones","Sponsor graphics","Ad/promo mode"]'
),
(
    'season-ops',
    'Season Ops',
    'Production package for organizations running multiple events.',
    9900,
    'usd',
    720,
    5,
    8,
    1,
    30,
    '["5 live rooms","8 camera phones","Priority admin review","Team branding controls"]'
);

ALTER TABLE tenants ADD COLUMN google_sub TEXT;
ALTER TABLE tenants ADD COLUMN auth_provider TEXT DEFAULT 'email';
ALTER TABLE tenants ADD COLUMN avatar_url TEXT;
ALTER TABLE tenants ADD COLUMN last_login_at DATETIME;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_google_sub ON tenants(google_sub);
CREATE INDEX IF NOT EXISTS idx_tenants_auth_provider ON tenants(auth_provider);

ALTER TABLE room_passes ADD COLUMN package_id TEXT;
CREATE INDEX IF NOT EXISTS idx_room_passes_package_id ON room_passes(package_id);

UPDATE room_passes
SET package_id = COALESCE(package_id, 'starter-live');

CREATE TABLE IF NOT EXISTS room_assets (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    room_id TEXT NOT NULL,
    overlay_field TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    public_url TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_room_assets_room_field
ON room_assets(room_id, overlay_field, deleted_at);

CREATE INDEX IF NOT EXISTS idx_room_assets_tenant_id
ON room_assets(tenant_id);
