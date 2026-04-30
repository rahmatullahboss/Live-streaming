ALTER TABLE cameras ADD COLUMN audio_track_id TEXT;

UPDATE cameras
SET audio_track_id = COALESCE(audio_track_id, NULL);
