-- Live Streaming Studio MVP Database Schema

-- Rooms Configuration (Manages studio rooms and camera join pins)
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pin TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Overlays Configuration (1-to-1 relationship with Room)
CREATE TABLE IF NOT EXISTS overlays (
    room_id TEXT PRIMARY KEY,
    logo_url TEXT,
    team1_name TEXT,
    team2_name TEXT,
    team1_score INTEGER DEFAULT 0,
    team2_score INTEGER DEFAULT 0,
    scoreboard_active INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Table to hold active camera track IDs for a room
CREATE TABLE IF NOT EXISTS cameras (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    track_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_rooms_pin ON rooms(pin);
CREATE INDEX IF NOT EXISTS idx_cameras_room_id ON cameras(room_id);
CREATE INDEX IF NOT EXISTS idx_cameras_active ON cameras(room_id, is_active);
CREATE INDEX IF NOT EXISTS idx_cameras_last_seen ON cameras(room_id, is_active, last_seen_at);

-- Insert a default demo room
INSERT OR IGNORE INTO rooms (id, name, pin) VALUES ('demo-room-01', 'Demo Studio', '123456');
INSERT OR IGNORE INTO overlays (room_id, team1_name, team2_name) VALUES ('demo-room-01', 'Team A', 'Team B');
