-- Migration: Add team logo URLs to overlays (idempotent)
-- Only adds columns if they don't already exist

ALTER TABLE overlays ADD COLUMN team1_logo_url TEXT;
ALTER TABLE overlays ADD COLUMN team2_logo_url TEXT;