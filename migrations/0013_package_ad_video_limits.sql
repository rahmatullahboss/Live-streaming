ALTER TABLE packages ADD COLUMN max_ad_videos INTEGER NOT NULL DEFAULT 1;

UPDATE packages
SET max_ad_videos = 1,
    features_json = '["1 live room","3 camera phones","1 ad video","R2 logo assets","External overlay link"]'
WHERE id = 'starter-live';

UPDATE packages
SET max_ad_videos = 2,
    features_json = '["2 live rooms","5 camera phones","2 ad videos","Sponsor graphics","Ad/promo mode"]'
WHERE id = 'matchday-pro';

UPDATE packages
SET max_ad_videos = 3,
    features_json = '["5 live rooms","8 camera phones","3 ad videos","Priority admin review","Team branding controls"]'
WHERE id = 'season-ops';
