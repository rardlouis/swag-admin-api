import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private pool: sql.ConnectionPool | null = null;

  private readonly config = {
    driver: 'msnodesqlv8',
    connectionString:
      'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS;Database=SWAG_db;Trusted_Connection=Yes;TrustServerCertificate=Yes;',
  } as unknown as sql.config;

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
      server: 'localhost\\SQLEXPRESS',
      database: 'SWAG_db',
      genders,
    };
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.close();
    }
  }
}
