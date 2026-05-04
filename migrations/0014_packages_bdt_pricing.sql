-- Migration: Update all active packages to BDT pricing (150 BDT flat)
UPDATE packages
SET currency = 'bdt', price_cents = 15000
WHERE deleted_at IS NULL AND active = 1;