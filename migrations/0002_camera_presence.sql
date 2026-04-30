UPDATE cameras
SET last_seen_at = COALESCE(last_seen_at, created_at);

CREATE INDEX IF NOT EXISTS idx_cameras_last_seen
ON cameras(room_id, is_active, last_seen_at);
