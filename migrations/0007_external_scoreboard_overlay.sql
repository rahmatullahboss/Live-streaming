ALTER TABLE overlays ADD COLUMN external_scoreboard_url TEXT;

UPDATE overlays
SET external_scoreboard_url = COALESCE(external_scoreboard_url, ''),
    scoreboard_active = 0;
