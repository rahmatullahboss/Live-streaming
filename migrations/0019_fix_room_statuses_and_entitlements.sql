-- Migration: 0019_fix_room_statuses_and_entitlements.sql
-- Description: Standardizes room statuses and initializes aggregate entitlements from existing room data.

-- 1. Initialize tenant_entitlements for any tenant that doesn't have one yet
-- We use a random hex for the ID or just lower(hex(randomblob(16))) if supported, 
-- but since D1 might have limited functions, we'll just use the tenant_id as a base for the ID if needed or let it be generated if it was AUTOINCREMENT (it's not).
-- Actually, the code uses createPublicId. For SQL, we can just use the tenant_id or a unique string.
INSERT INTO tenant_entitlements (id, tenant_id, total_minutes, max_rooms, used_seconds)
SELECT 
    'ent_' || t.id, 
    t.id, 
    0, -- Will be updated by recalculateTenantEntitlements in code
    1, -- Default
    0
FROM tenants t
LEFT JOIN tenant_entitlements te ON t.id = te.tenant_id
WHERE te.tenant_id IS NULL;

-- 2. Migrate existing room-level usage to the tenant aggregate
-- This ensures the new optimized tracking logic starts with the correct historical data.
UPDATE tenant_entitlements
SET used_seconds = (
    SELECT COALESCE(SUM(total_seconds_used), 0)
    FROM rooms
    WHERE rooms.tenant_id = tenant_entitlements.tenant_id
);

-- 3. Update status of logically expired rooms to the new 'expired' status
-- This frees up room slots for the new additive calculation.
-- We use CURRENT_TIMESTAMP but need to be careful with formats. 'now' is usually safe in SQLite.
UPDATE rooms
SET status = 'expired'
WHERE status = 'active' 
  AND expires_at IS NOT NULL 
  AND expires_at != ''
  AND expires_at < datetime('now');

-- 4. Mark finished/ready rooms as ready if they were stuck in an odd state
UPDATE rooms
SET status = 'ready'
WHERE status = 'active' 
  AND (expires_at IS NULL OR expires_at = '')
  AND total_seconds_used = 0;
