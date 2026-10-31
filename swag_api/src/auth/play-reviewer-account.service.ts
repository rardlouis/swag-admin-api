import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';
import { DatabaseService } from '../database/database.service';
import { assertPasswordRequirements, hashPassword } from '../common/passwords';

@Injectable()
export class PlayReviewerAccountService implements OnModuleInit {
  private readonly logger = new Logger(PlayReviewerAccountService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    if (process.env.PLAY_REVIEWER_ENABLED !== 'true') return;

    const email = process.env.PLAY_REVIEWER_EMAIL?.trim().toLowerCase() ?? '';
    const password = process.env.PLAY_REVIEWER_PASSWORD ?? '';
    if (!this.isValidEmail(email) || !password) {
      throw new Error('Play reviewer account is enabled but its email or password is not configured.');
    }
    assertPasswordRequirements(password);

    const existing = await this.databaseService.request<{ isAdmin: boolean }>((request) => request
      .input('email', sql.NVarChar(255), email)
      .query(`SELECT TOP 1 is_admin AS isAdmin FROM USERS WHERE LOWER(email) = LOWER(@email)`));

    if (existing[0]?.isAdmin) {
      throw new Error('The configured Play reviewer email belongs to an administrator account.');
    }
    if (existing[0]) return;

    const passwordHash = await hashPassword(password);
    await this.databaseService.request((request) => request
      .input('email', sql.NVarChar(255), email)
      .input('passwordHash', sql.NVarChar(255), passwordHash)
      .input('fullName', sql.NVarChar(150), 'Google Play Reviewer')
      .query(`
        INSERT INTO USERS (email, password_hash, full_name, skin_tone_detected, is_admin, is_active)
        VALUES (@email, @passwordHash, @fullName, 0, 0, 1)
      `));
    this.logger.log('Created the configured Google Play reviewer customer account.');
  }

  private isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
}
