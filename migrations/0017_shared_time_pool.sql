-- Migration: Shared time pool, pause/resume, and per-room time tracking
-- All rooms under a tenant share the total purchased minutes

-- Add pause and time tracking fields to rooms
ALTER TABLE rooms ADD COLUMN is_paused INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN paused_at TEXT;
ALTER TABLE rooms ADD COLUMN total_seconds_used INTEGER NOT NULL DEFAULT 0;

-- Tenant time pools (one record per tenant, aggregates all paid passes)
CREATE TABLE IF NOT EXISTS tenant_time_pools (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE,
    total_seconds INTEGER NOT NULL DEFAULT 0,
    used_seconds INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active', -- active, exhausted
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_time_pools_tenant_id ON tenant_time_pools(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_time_pools_status ON tenant_time_pools(status);

-- Room time sessions for detailed audit (each start/pause/resume cycle)
CREATE TABLE IF NOT EXISTS room_time_sessions (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME,
    seconds_elapsed INTEGER NOT NULL DEFAULT 0,
    event_type TEXT NOT NULL DEFAULT 'start', -- start, pause, resume, expire
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_room_time_sessions_room_id ON room_time_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_room_time_sessions_started_at ON room_time_sessions(started_at);
