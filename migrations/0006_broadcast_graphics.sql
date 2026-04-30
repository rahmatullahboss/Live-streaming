ALTER TABLE overlays ADD COLUMN sport TEXT DEFAULT 'football';
ALTER TABLE overlays ADD COLUMN ticker_text TEXT;
ALTER TABLE overlays ADD COLUMN ticker_active INTEGER DEFAULT 0;
ALTER TABLE overlays ADD COLUMN left_logo_url TEXT;
ALTER TABLE overlays ADD COLUMN right_logo_url TEXT;
ALTER TABLE overlays ADD COLUMN sponsor_text TEXT;
ALTER TABLE overlays ADD COLUMN match_status TEXT;
ALTER TABLE overlays ADD COLUMN clock_text TEXT;
ALTER TABLE overlays ADD COLUMN theme_variant TEXT DEFAULT 'broadcast';
ALTER TABLE overlays ADD COLUMN program_source TEXT DEFAULT 'live';
ALTER TABLE overlays ADD COLUMN ad_video_url TEXT;
ALTER TABLE overlays ADD COLUMN ad_title TEXT;
ALTER TABLE overlays ADD COLUMN scoring_data TEXT;

ALTER TABLE rooms ADD COLUMN scoring_token TEXT;

UPDATE overlays
SET left_logo_url = COALESCE(left_logo_url, logo_url),
    right_logo_url = COALESCE(right_logo_url, logo_url),
    ticker_text = COALESCE(ticker_text, ''),
    match_status = COALESCE(match_status, 'LIVE'),
    clock_text = COALESCE(clock_text, '00:00'),
    sponsor_text = COALESCE(sponsor_text, ''),
    program_source = COALESCE(program_source, 'live'),
    theme_variant = COALESCE(theme_variant, 'broadcast'),
    sport = COALESCE(sport, 'football'),
    scoring_data = COALESCE(scoring_data, '{}');

UPDATE rooms
SET scoring_token = COALESCE(scoring_token, lower(hex(randomblob(16))));
