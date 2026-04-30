ALTER TABLE rooms ADD COLUMN session_started_at TEXT;

CREATE INDEX IF NOT EXISTS idx_rooms_session_started_at ON rooms(session_started_at);
