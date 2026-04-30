ALTER TABLE tenants ADD COLUMN phone TEXT;
ALTER TABLE tenants ADD COLUMN access_token TEXT;

ALTER TABLE room_passes ADD COLUMN payment_provider TEXT;
ALTER TABLE room_passes ADD COLUMN bkash_sender_number TEXT;
ALTER TABLE room_passes ADD COLUMN bkash_transaction_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_access_token ON tenants(access_token);
CREATE INDEX IF NOT EXISTS idx_room_passes_payment_provider ON room_passes(payment_provider);
CREATE INDEX IF NOT EXISTS idx_room_passes_bkash_transaction ON room_passes(bkash_transaction_id);
