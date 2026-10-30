-- Adds an optional, unique admin username without replacing existing USERS
-- accounts. Existing administrators remain usable through email/login alias.
IF COL_LENGTH('dbo.USERS', 'admin_username') IS NULL
BEGIN
  ALTER TABLE dbo.USERS ADD admin_username NVARCHAR(64) NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'UX_USERS_ADMIN_USERNAME'
    AND object_id = OBJECT_ID('dbo.USERS')
)
BEGIN
  CREATE UNIQUE INDEX UX_USERS_ADMIN_USERNAME
    ON dbo.USERS (admin_username)
    WHERE admin_username IS NOT NULL;
END
