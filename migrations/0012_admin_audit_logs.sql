CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id TEXT PRIMARY KEY,
    actor_email TEXT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
ON admin_audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target
ON admin_audit_logs(target_type, target_id, created_at);
