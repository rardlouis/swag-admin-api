-- Bind administrator password-change OTPs to the exact USERS record that
-- requested them. The application also applies this guarded upgrade at
-- startup/request time for backwards-compatible deployments.
IF COL_LENGTH('dbo.EMAIL_OTPS', 'account_user_id') IS NULL
BEGIN
  ALTER TABLE dbo.EMAIL_OTPS ADD account_user_id UNIQUEIDENTIFIER NULL;
END

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'IX_EMAIL_OTPS_ACCOUNT_PURPOSE_CREATED'
    AND object_id = OBJECT_ID('dbo.EMAIL_OTPS')
)
BEGIN
  CREATE INDEX IX_EMAIL_OTPS_ACCOUNT_PURPOSE_CREATED
    ON dbo.EMAIL_OTPS (account_user_id, purpose, created_at DESC)
    WHERE account_user_id IS NOT NULL;
END
