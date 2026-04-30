CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE rooms ADD COLUMN tenant_id TEXT;
ALTER TABLE rooms ADD COLUMN customer_email TEXT;
ALTER TABLE rooms ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE rooms ADD COLUMN expires_at TEXT;
ALTER TABLE rooms ADD COLUMN checkout_session_id TEXT;
ALTER TABLE rooms ADD COLUMN updated_at DATETIME;

CREATE TABLE IF NOT EXISTS room_passes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    checkout_session_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending_payment',
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    duration_minutes INTEGER NOT NULL DEFAULT 180,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE INDEX IF NOT EXISTS idx_rooms_tenant_id ON rooms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status_expires ON rooms(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_rooms_checkout_session ON rooms(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_room_passes_tenant_id ON room_passes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_room_passes_room_id ON room_passes(room_id);
CREATE INDEX IF NOT EXISTS idx_room_passes_checkout_session ON room_passes(checkout_session_id);

UPDATE rooms
SET status = COALESCE(status, 'active'),
    updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP);
