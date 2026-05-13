-- Migration: Separate purchases from rooms — entitlements model
-- A single purchase = a room_pass that grants time + room slots
-- No room is auto-created on checkout; user creates rooms from their dashboard

-- Tenant entitlements: aggregates all paid room_passes per tenant
-- This is the source of truth for max_rooms and time budget
CREATE TABLE IF NOT EXISTS tenant_entitlements (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE,
    total_minutes INTEGER NOT NULL DEFAULT 0,
    used_seconds INTEGER NOT NULL DEFAULT 0,
    max_rooms INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_entitlements_tenant_id ON tenant_entitlements(tenant_id);

-- Recalculate entitlements from all paid room_passes for a tenant
-- Called whenever a room_pass is activated (paid) or a room is expired
CREATE INDEX IF NOT EXISTS idx_room_passes_tenant_status ON room_passes(tenant_id, status);
