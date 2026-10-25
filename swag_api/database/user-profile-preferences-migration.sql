-- Additive and backward-compatible: no existing USER row is updated.
IF COL_LENGTH('dbo.USERS', 'gender_id') IS NULL
BEGIN
  ALTER TABLE dbo.USERS ADD gender_id TINYINT NULL;
END;

IF COL_LENGTH('dbo.USERS', 'fashion_style') IS NULL
BEGIN
  ALTER TABLE dbo.USERS ADD fashion_style NVARCHAR(500) NULL;
END;
