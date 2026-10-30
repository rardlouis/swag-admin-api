import * as sql from 'mssql/msnodesqlv8';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { assertPasswordRequirements, hashPassword } from '../src/common/passwords';

function loadLocalEnvironment() {
  const envFile = [join(process.cwd(), '.env'), join(process.cwd(), '..', '.env')].find(existsSync);
  if (!envFile) return;
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

async function main() {
  loadLocalEnvironment();
  const inspectSchema = process.argv.includes('--inspect-schema');
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase() ?? '';
  const username = process.env.ADMIN_BOOTSTRAP_USERNAME?.trim().toLowerCase() ?? '';
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? '';
  const fullName = process.env.ADMIN_BOOTSTRAP_FULL_NAME?.trim() ?? '';
  const promoteExisting = process.env.ADMIN_BOOTSTRAP_PROMOTE_EXISTING === 'true';
  if (!inspectSchema) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('ADMIN_BOOTSTRAP_EMAIL must be a valid email address.');
    if (!/^[a-z0-9._-]{3,64}$/.test(username)) throw new Error('ADMIN_BOOTSTRAP_USERNAME must be 3–64 lowercase letters, numbers, periods, underscores, or hyphens.');
    if (!fullName || fullName.length > 150) throw new Error('ADMIN_BOOTSTRAP_FULL_NAME is required and must be 150 characters or fewer.');
    assertPasswordRequirements(password);
  }
  const driver = process.env.DB_DRIVER ?? 'ODBC Driver 17 for SQL Server';
  const server = process.env.DB_SERVER ?? 'localhost\\SQLEXPRESS';
  const database = process.env.DB_NAME ?? 'SWAG_db';
  const connectionString = process.env.DB_CONNECTION_STRING ?? `Driver={${driver}};Server=${server};Database=${database};Trusted_Connection=Yes;TrustServerCertificate=Yes;`;
  const pool = await new sql.ConnectionPool({ driver: 'msnodesqlv8', connectionString } as unknown as sql.config).connect();
  try {
    if (inspectSchema) {
      const columns = await pool.request().query(`SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'USERS' ORDER BY ORDINAL_POSITION`);
      console.log(JSON.stringify(columns.recordset));
      return;
    }
    // Run schema steps separately: SQL Server compiles a batch before a
    // conditional ALTER executes, which caused the prior invalid-column error.
    const column = await pool.request().query(`SELECT COL_LENGTH('dbo.USERS', 'admin_username') AS columnLength`);
    if (column.recordset[0]?.columnLength === null) {
      await pool.request().query(`ALTER TABLE dbo.USERS ADD admin_username NVARCHAR(64) NULL`);
    }
    const index = await pool.request().query(`SELECT COUNT(*) AS count FROM sys.indexes WHERE name = 'UX_USERS_ADMIN_USERNAME' AND object_id = OBJECT_ID('dbo.USERS')`);
    if (!Number(index.recordset[0]?.count)) {
      await pool.request().query(`CREATE UNIQUE INDEX UX_USERS_ADMIN_USERNAME ON dbo.USERS (admin_username) WHERE admin_username IS NOT NULL`);
    }
    const existing = await pool.request()
      .input('email', sql.NVarChar(255), email)
      .input('username', sql.NVarChar(64), username)
      .query(`SELECT TOP 1 user_id AS userId, email, full_name AS fullName, is_admin AS isAdmin
        FROM USERS WHERE LOWER(email) = @email OR LOWER(admin_username) = @username`);
    const passwordHash = await hashPassword(password);
    const account = existing.recordset[0] as { userId: string; email: string; fullName: string; isAdmin: boolean } | undefined;
    if (account) {
      const matchesRequestedEmail = account.email.toLowerCase() === email;
      const matchesRequestedName = account.fullName.trim().toLowerCase() === fullName.toLowerCase();
      if (!promoteExisting || account.isAdmin || !matchesRequestedEmail || !matchesRequestedName) {
        throw new Error('An account with that email address or username already exists; no changes were made. Set ADMIN_BOOTSTRAP_PROMOTE_EXISTING=true only to promote the matching non-admin account intentionally.');
      }
      await pool.request()
        .input('userId', sql.UniqueIdentifier, account.userId)
        .input('username', sql.NVarChar(64), username)
        .input('passwordHash', sql.NVarChar(255), passwordHash)
        .query(`UPDATE USERS SET admin_username = @username, password_hash = @passwordHash,
          is_admin = 1, is_active = 1, updated_at = GETDATE() WHERE user_id = @userId AND is_admin = 0`);
      console.log('Existing matching account promoted to administrator.');
      return;
    }
    await pool.request()
      .input('email', sql.NVarChar(255), email)
      .input('username', sql.NVarChar(64), username)
      .input('passwordHash', sql.NVarChar(255), passwordHash)
      .input('fullName', sql.NVarChar(150), fullName)
      .query(`INSERT INTO USERS (email, admin_username, password_hash, full_name, is_admin, is_active)
        VALUES (@email, @username, @passwordHash, @fullName, 1, 1)`);
    console.log('Administrator account created.');
  } finally {
    await pool.close();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : 'Administrator bootstrap failed.'); process.exitCode = 1; });
