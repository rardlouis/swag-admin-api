import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';

@Injectable()
export class DatabaseService implements OnModuleDestroy, OnModuleInit {
  // USERS.user_id is a uniqueidentifier, so the public "gemini-bot" id maps to this fixed GUID.
  private readonly geminiBotUserId = '11111111-1111-4111-8111-111111111111';

  private pool: sql.ConnectionPool | null = null;
  private voucherSchemaPromise: Promise<void> | null = null;

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
    await this.ensureProductSoftDeleteColumn();
    await this.ensureMessageReadAtColumn();
    await this.ensureConversationViewColumns();
    await this.ensureVoucherSchema();
    await this.ensureBotUser();
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
              password_hash = @password,
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
          ('Dresses', 'dresses', 3);
      END

      DELETE c
      FROM CATEGORIES c
      WHERE c.slug IN ('outerwear', 'accessories')
        AND NOT EXISTS (
          SELECT 1
          FROM PRODUCTS p
          WHERE p.category_id = c.category_id
        );
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

    if (!(await this.columnExists('USERS', 'skin_hex'))) {
      await this.query(`
        ALTER TABLE USERS
        ADD skin_hex NVARCHAR(7) NULL
      `);
    }
  }

  private async ensureProductSoftDeleteColumn() {
    if (!(await this.tableExists('PRODUCTS'))) {
      return;
    }

    if (!(await this.columnExists('PRODUCTS', 'is_deleted'))) {
      await this.query(`
        ALTER TABLE PRODUCTS
        ADD is_deleted BIT NOT NULL CONSTRAINT DF_PRODUCTS_IS_DELETED DEFAULT ((0))
      `);
    }
  }

  private async ensureMessageReadAtColumn() {
    if (!(await this.tableExists('MESSAGES'))) {
      return;
    }

    if (!(await this.columnExists('MESSAGES', 'read_at'))) {
      await this.query(`
        ALTER TABLE MESSAGES
        ADD read_at DATETIME2(7) NULL
      `);
    }
  }

  private async ensureConversationViewColumns() {
    if (!(await this.tableExists('CONVERSATIONS'))) {
      return;
    }

    if (!(await this.columnExists('CONVERSATIONS', 'buyer_deleted_at'))) {
      await this.query(`
        ALTER TABLE CONVERSATIONS
        ADD buyer_deleted_at DATETIME2(7) NULL
      `);
    }

    if (!(await this.columnExists('CONVERSATIONS', 'seller_deleted_at'))) {
      await this.query(`
        ALTER TABLE CONVERSATIONS
        ADD seller_deleted_at DATETIME2(7) NULL
      `);
    }
  }

  async ensureVoucherSchema() {
    if (!this.voucherSchemaPromise) {
      this.voucherSchemaPromise = this.applyVoucherSchema().catch((error) => {
        this.voucherSchemaPromise = null;
        throw error;
      });
    }
    return this.voucherSchemaPromise;
  }

  private async applyVoucherSchema() {
    if (!(await this.tableExists('ORDERS'))) return;

    await this.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'VOUCHERS')
      BEGIN
        CREATE TABLE VOUCHERS (
          voucher_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_VOUCHERS PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
          code NVARCHAR(50) NOT NULL,
          discount_type NVARCHAR(10) NOT NULL,
          discount_value DECIMAL(10, 2) NOT NULL,
          minimum_order_amount DECIMAL(10, 2) NOT NULL CONSTRAINT DF_VOUCHERS_MINIMUM_ORDER_AMOUNT DEFAULT ((0)),
          usage_limit INT NULL,
          usage_count INT NOT NULL CONSTRAINT DF_VOUCHERS_USAGE_COUNT DEFAULT ((0)),
          start_date DATETIME2(7) NOT NULL,
          end_date DATETIME2(7) NOT NULL,
          is_active BIT NOT NULL CONSTRAINT DF_VOUCHERS_IS_ACTIVE DEFAULT ((1)),
          created_at DATETIME2(7) NOT NULL CONSTRAINT DF_VOUCHERS_CREATED_AT DEFAULT (GETDATE()),
          updated_at DATETIME2(7) NULL,
          CONSTRAINT UQ_VOUCHERS_CODE UNIQUE (code),
          CONSTRAINT CK_VOUCHERS_DISCOUNT_TYPE CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
          CONSTRAINT CK_VOUCHERS_DISCOUNT_AMOUNT CHECK (discount_value > 0),
          CONSTRAINT CK_VOUCHERS_MINIMUM_ORDER_AMOUNT CHECK (minimum_order_amount >= 0),
          CONSTRAINT CK_VOUCHERS_USAGE_LIMIT CHECK (usage_limit IS NULL OR usage_limit > 0),
          CONSTRAINT CK_VOUCHERS_DATE_RANGE CHECK (end_date > start_date)
        );
      END
    `);

    const orderColumns = [
      ['voucher_id', 'UNIQUEIDENTIFIER NULL'],
      ['voucher_code', 'NVARCHAR(50) NULL'],
      ['voucher_discount', 'DECIMAL(10, 2) NULL'],
      ['voucher_discount_amount', 'DECIMAL(10, 2) NOT NULL CONSTRAINT DF_ORDERS_VOUCHER_DISCOUNT_AMOUNT DEFAULT ((0))'],
    ];
    for (const [columnName, definition] of orderColumns) {
      if (!(await this.columnExists('ORDERS', columnName))) {
        await this.query(`ALTER TABLE ORDERS ADD ${columnName} ${definition}`);
      }
    }

    await this.query(`
      IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ORDERS_VOUCHERS')
        ALTER TABLE ORDERS ADD CONSTRAINT FK_ORDERS_VOUCHERS FOREIGN KEY (voucher_id) REFERENCES VOUCHERS(voucher_id);
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_VOUCHERS_ACTIVE_DATES' AND object_id = OBJECT_ID('VOUCHERS'))
        CREATE INDEX IX_VOUCHERS_ACTIVE_DATES ON VOUCHERS(is_active, start_date, end_date);
    `);
  }

  private async ensureBotUser() {
    if (!(await this.tableExists('USERS'))) {
      return;
    }

    if (!(await this.columnExists('USERS', 'is_bot'))) {
      await this.query(`
        ALTER TABLE USERS
        ADD is_bot BIT NOT NULL CONSTRAINT DF_USERS_IS_BOT DEFAULT ((0))
      `);
    }

    await this.request((request) =>
      request
        .input('botUserId', sql.UniqueIdentifier, this.geminiBotUserId)
        .input('email', sql.NVarChar(255), 'gemini-bot@swag.local')
        .input('password', sql.NVarChar(255), 'not-used')
        .input('fullName', sql.NVarChar(150), 'AI Assistant').query(`
          IF EXISTS (SELECT 1 FROM USERS WHERE user_id = @botUserId)
          BEGIN
            UPDATE USERS
            SET
              email = @email,
              full_name = @fullName,
              is_active = 1,
              is_admin = 0,
              is_bot = 1
            WHERE user_id = @botUserId;
          END
          ELSE
          BEGIN
            INSERT INTO USERS (
              user_id,
              email,
              password_hash,
              full_name,
              skin_tone_detected,
              created_at,
              is_active,
              is_admin,
              is_bot
            )
            VALUES (
              @botUserId,
              @email,
              @password,
              @fullName,
              0,
              GETDATE(),
              1,
              0,
              1
            );
          END
        `),
    );
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.close();
    }
  }
}
