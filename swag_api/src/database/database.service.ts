import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';

@Injectable()
export class DatabaseService implements OnModuleDestroy, OnModuleInit {
  private pool: sql.ConnectionPool | null = null;

  private readonly driver = process.env.DB_DRIVER ?? 'ODBC Driver 17 for SQL Server';
  private readonly server = process.env.DB_SERVER ?? 'localhost\\SQLEXPRESS';
  private readonly database = process.env.DB_NAME ?? 'SWAG_db';
  private readonly connectionString =
    process.env.DB_CONNECTION_STRING ??
    `Driver={${this.driver}};Server=${this.server};Database=${this.database};Trusted_Connection=Yes;TrustServerCertificate=Yes;`;

  private readonly config = {
    driver: 'msnodesqlv8',
    connectionString: this.connectionString,
  } as unknown as sql.config;

  async onModuleInit() {
    await this.ensureBaseLookups();
    await this.ensureUserProfileColumns();
    await this.ensureAdminUser();
  }

  async getPool() {
    if (this.pool?.connected) {
      return this.pool;
    }

    this.pool = await new sql.ConnectionPool(this.config).connect();
    return this.pool;
  }

  async query<T = unknown>(queryText: string) {
    const pool = await this.getPool();
    const result = await pool.request().query<T>(queryText);
    return result.recordset;
  }

  async request<T = unknown>(
    handler: (request: sql.Request) => Promise<sql.IResult<T>>,
  ) {
    const pool = await this.getPool();
    const result = await handler(pool.request());
    return result.recordset;
  }

  async testConnection() {
    const genders = await this.query('SELECT TOP 5 * FROM GENDERS ORDER BY gender_id');
    return {
      connected: true,
      driver: this.driver,
      server: this.server,
      database: this.database,
      genders,
    };
  }

  async tableExists(tableName: string) {
    const rows = await this.request<{ count: number }>((request) =>
      request.input('tableName', sql.NVarChar(128), tableName).query(`
        SELECT COUNT(*) AS count
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @tableName
      `),
    );

    return Number(rows[0]?.count ?? 0) > 0;
  }

  async columnExists(tableName: string, columnName: string) {
    const rows = await this.request<{ count: number }>((request) =>
      request
        .input('tableName', sql.NVarChar(128), tableName)
        .input('columnName', sql.NVarChar(128), columnName).query(`
          SELECT COUNT(*) AS count
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = 'dbo'
            AND TABLE_NAME = @tableName
            AND COLUMN_NAME = @columnName
        `),
    );

    return Number(rows[0]?.count ?? 0) > 0;
  }

  private async ensureAdminUser() {
    if (!(await this.tableExists('USERS'))) {
      return;
    }

    await this.request((request) =>
      request
        .input('email', sql.NVarChar(255), 'admin@swag.com')
        .input('password', sql.NVarChar(255), process.env.ADMIN_PASSWORD ?? 'admin123')
        .input('fullName', sql.NVarChar(150), 'Admin User').query(`
          IF EXISTS (SELECT 1 FROM USERS WHERE email = @email)
          BEGIN
            UPDATE USERS
            SET
              password_hash = CASE
                WHEN password_hash IS NULL
                  OR password_hash = ''
                  OR password_hash = '$2b$10$examplehashhere1234567890'
                THEN @password
                ELSE password_hash
              END,
              is_admin = 1,
              is_active = 1
            WHERE email = @email;
          END
          ELSE
          BEGIN
            INSERT INTO USERS (email, password_hash, full_name, is_admin, is_active)
            VALUES (@email, @password, @fullName, 1, 1);
          END
        `),
    );
  }

  private async ensureBaseLookups() {
    if (!(await this.tableExists('CATEGORIES'))) {
      return;
    }

    await this.query(`
      IF NOT EXISTS (SELECT 1 FROM CATEGORIES)
      BEGIN
        INSERT INTO CATEGORIES (name, slug, display_order)
        VALUES
          ('Tops', 'tops', 1),
          ('Bottoms', 'bottoms', 2),
          ('Dresses', 'dresses', 3),
          ('Outerwear', 'outerwear', 4),
          ('Accessories', 'accessories', 5);
      END
    `);
  }

  private async ensureUserProfileColumns() {
    if (!(await this.tableExists('USERS'))) {
      return;
    }

    if (!(await this.columnExists('USERS', 'preferred_size_id'))) {
      await this.query(`
        ALTER TABLE USERS
        ADD preferred_size_id SMALLINT NULL
      `);
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.close();
    }
  }
}
