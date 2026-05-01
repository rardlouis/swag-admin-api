import { UnauthorizedException, Injectable } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';
import { DatabaseService } from '../database/database.service';

type LoginBody = {
  login?: string;
  email?: string;
  password?: string;
};

@Injectable()
export class AuthService {
  constructor(private readonly databaseService: DatabaseService) {}

  async login(body: LoginBody) {
    const login = (body.login ?? body.email ?? '').trim();
    const password = body.password ?? '';

    if (!login || !password) {
      throw new UnauthorizedException('Username/email and password are required');
    }

    const users = await this.databaseService.request((request) =>
      request
        .input('login', sql.NVarChar(255), login)
        .input('password', sql.NVarChar(255), password)
        .query(`
          SELECT TOP 1
            CONVERT(varchar(36), u.user_id) AS id,
            u.email,
            u.full_name AS fullName,
            u.phone,
            u.profile_photo_url AS profilePhotoUrl,
            idt.label AS idType,
            u.id_number AS idNumber,
            u.is_admin AS isAdmin,
            u.is_active AS isActive
          FROM USERS u
          LEFT JOIN ID_TYPES idt ON idt.id_type_id = u.id_type_id
          WHERE
            u.is_active = 1
            AND u.is_admin = 1
            AND u.password_hash = @password
            AND (
              u.email = @login
              OR u.full_name = @login
              OR LEFT(u.email, CHARINDEX('@', u.email + '@') - 1) = @login
            )
        `),
    );

    const user = users[0];

    if (!user) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    return {
      user,
      token: Buffer.from(`${user.id}:${Date.now()}`).toString('base64'),
    };
  }
}
