import { BadRequestException, ConflictException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';
import { createHash, randomInt, randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { createSessionToken } from '../common/session-auth';
import { NotificationsService } from '../notifications/notifications.service';
import { assertPasswordRequirements, hashPassword, passwordMatches } from '../common/passwords';

type LoginBody = {
  login?: string;
  email?: string;
  password?: string;
};

type AppRegisterBody = {
  email?: string;
  password?: string;
  full_name?: string;
  phone?: string;
  id_type?: string;
  id_number?: string;
  shipping_address?: string;
  address_house_no?: string | null;
  address_street?: string | null;
  address_barangay?: string | null;
  address_city?: string | null;
  address_province?: string | null;
  address_region?: string | null;
  address_zip?: string | null;
  fashion_style?: string;
  preferred_size?: string;
  skin_hex?: string | null;
  body_chest_cm?: number | string | null;
  body_waist_cm?: number | string | null;
  body_hip_cm?: number | string | null;
  body_height_cm?: number | string | null;
  email_verification_id?: string;
  phone_verification_id?: string;
};

type EmailOtpPurpose = 'registration' | 'password_reset' | 'admin_password_reset' | 'password_change';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(private readonly databaseService: DatabaseService, private readonly notificationsService: NotificationsService) {}

  async sendEmailOtp(rawEmail: string) {
    const email = this.normalizedEmail(rawEmail);
    // A completed app registration is only possible after a successful email
    // verification. Do this check before creating an OTP so an existing user
    // cannot receive a fresh registration code.
    const existingUser = await this.databaseService.request<{ userId: string }>((request) =>
      request.input('email', sql.NVarChar(255), email).query(`
        SELECT TOP 1 CONVERT(varchar(36), user_id) AS userId
        FROM USERS
        WHERE LOWER(email) = LOWER(@email)
          AND is_admin = 0
      `),
    );
    if (existingUser[0]) {
      throw new ConflictException('This email is already registered. Log in or use another email.');
    }
    return this.sendEmailOtpForPurpose(email, 'registration', 'Your A\'FRO verification code');
  }

  async sendPasswordResetOtp(rawEmail: string) {
    return this.sendPasswordResetOtpForAccount(rawEmail, false, 'password_reset');
  }

  async sendAdminPasswordResetOtp(rawEmail: string) {
    return this.sendPasswordResetOtpForAccount(rawEmail, true, 'admin_password_reset');
  }

  private async sendPasswordResetOtpForAccount(rawEmail: string, isAdmin: boolean, purpose: EmailOtpPurpose) {
    const email = this.normalizedEmail(rawEmail);
    const user = await this.databaseService.request<{ userId: string }>((request) =>
      request.input('email', sql.NVarChar(255), email).query(`
        SELECT TOP 1 CONVERT(varchar(36), user_id) AS userId
        FROM USERS
        WHERE LOWER(email) = LOWER(@email) AND is_admin = ${isAdmin ? 1 : 0} AND is_active = 1
      `),
    );
    // Do not reveal whether a customer account exists. The UI can show the
    // same neutral success message for every syntactically valid email.
    // Administrator recovery deliberately remains distinct because it is an
    // internal account-management flow with a separate route and purpose.
    if (!user[0] && !isAdmin) return { expiresAt: null, resendAfterSeconds: 60 };
    if (!user[0]) throw new BadRequestException('No active administrator was found for that email address.');
    return this.sendEmailOtpForPurpose(email, purpose, `Your A'FRO ${isAdmin ? 'administrator ' : ''}password reset code`);
  }

  private async sendEmailOtpForPurpose(email: string, purpose: EmailOtpPurpose, subject: string) {
    let verificationId: string;
    let code: string;
    let expiresAt: Date;
    try {
      await this.ensureEmailOtpsTable();
      const latest = await this.databaseService.request<{ secondsSinceCreation: number }>((request) => request.input('email', sql.NVarChar(255), email).input('purpose', sql.NVarChar(32), purpose).query(`SELECT TOP 1 DATEDIFF(SECOND, created_at, GETDATE()) AS secondsSinceCreation FROM EMAIL_OTPS WHERE email = @email AND purpose = @purpose ORDER BY created_at DESC`));
      // Keep both values on SQL Server's clock. Parsing DATETIME values in Node
      // can shift them by the local time-zone and turn a 60-second cooldown into hours.
      const secondsUntilResend = latest[0]
        ? Math.max(0, 60 - Math.max(0, Number(latest[0].secondsSinceCreation ?? 0)))
        : 0;
      if (latest[0] && secondsUntilResend > 0) throw new BadRequestException(`Please wait ${secondsUntilResend} seconds before requesting another code.`);
      verificationId = randomUUID();
      code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      expiresAt = new Date(Date.now() + 5 * 60_000);
      const invalidatePriorOtp = purpose === 'registration'
        ? 'verified_at IS NULL'
        : '1 = 1';
      await this.databaseService.request((request) => request.input('email', sql.NVarChar(255), email).input('purpose', sql.NVarChar(32), purpose).input('id', sql.UniqueIdentifier, verificationId).input('hash', sql.NVarChar(128), this.otpHash(email, purpose, code)).query(`
        UPDATE EMAIL_OTPS
        SET invalidated_at = GETDATE(), reset_session_id = NULL, reset_session_expires_at = NULL
        WHERE email = @email AND purpose = @purpose AND ${invalidatePriorOtp} AND invalidated_at IS NULL;

        INSERT INTO EMAIL_OTPS (verification_id, email, purpose, code_hash, expires_at, attempts)
        VALUES (@id, @email, @purpose, @hash, DATEADD(MINUTE, 5, GETDATE()), 0);
      `));
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      // Keep database/schema details out of the API response and never leave
      // the app with Nest's generic 500 response.
      this.logger.error('Email OTP storage is unavailable', error instanceof Error ? error.stack : undefined);
      throw new ServiceUnavailableException('Email verification is temporarily unavailable. Please try again shortly.');
    }
    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) throw new BadRequestException('Email verification is not configured.');
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', signal: AbortSignal.timeout(10_000), headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || "A'FRO" }, to: [{ email }], subject, htmlContent: `<p>Your A'FRO code is:</p><h2>${code}</h2><p>This code expires in 5 minutes. Do not share it with anyone.</p>` }) });
      if (!response.ok) throw new Error('Brevo request failed');
    } catch {
      await this.databaseService.request((request) => request.input('id', sql.UniqueIdentifier, verificationId).query('UPDATE EMAIL_OTPS SET invalidated_at = GETDATE() WHERE verification_id = @id'));
      throw new BadRequestException('We could not send a verification email right now. Please try again.');
    }
    return { expiresAt: expiresAt.toISOString(), resendAfterSeconds: 60 };
  }

  async verifyEmailOtp(rawEmail: string | undefined, rawCode: string | undefined) {
    return this.verifyEmailOtpForPurpose(rawEmail, rawCode, 'registration');
  }

  async verifyPasswordResetOtp(rawEmail: string | undefined, rawCode: string | undefined) {
    return this.verifyEmailOtpForPurpose(rawEmail, rawCode, 'password_reset');
  }

  async verifyAdminPasswordResetOtp(rawEmail: string | undefined, rawCode: string | undefined) {
    return this.verifyEmailOtpForPurpose(rawEmail, rawCode, 'admin_password_reset');
  }

  private async verifyEmailOtpForPurpose(rawEmail: string | undefined, rawCode: string | undefined, purpose: EmailOtpPurpose) {
    const email = this.normalizedEmail(rawEmail ?? ''); const code = rawCode?.trim() ?? '';
    if (!/^\d{6}$/.test(code)) throw new BadRequestException('Enter the complete 6-digit code.');
    await this.ensureEmailOtpsTable();
    const rows = await this.databaseService.request<{ id: string; codeHash: string; secondsRemaining: number; attempts: number }>((request) => request.input('email', sql.NVarChar(255), email).input('purpose', sql.NVarChar(32), purpose).query(`
      SELECT TOP 1 CONVERT(varchar(36), verification_id) AS id,
        code_hash AS codeHash,
        DATEDIFF(SECOND, GETDATE(), expires_at) AS secondsRemaining,
        attempts
      FROM EMAIL_OTPS
      WHERE email = @email AND purpose = @purpose AND verified_at IS NULL AND invalidated_at IS NULL
      ORDER BY created_at DESC
    `));
    const otp = rows[0];
    if (!otp || Number(otp.secondsRemaining) <= 0) throw new BadRequestException('This code has expired. Request a new one.');
    if (Number(otp.attempts) >= 5) throw new BadRequestException('Too many incorrect attempts. Request a new code.');
    if (this.otpHash(email, purpose, code) !== otp.codeHash) { await this.databaseService.request((request) => request.input('id', sql.UniqueIdentifier, otp.id).query('UPDATE EMAIL_OTPS SET attempts = attempts + 1, invalidated_at = CASE WHEN attempts + 1 >= 5 THEN GETDATE() ELSE invalidated_at END WHERE verification_id = @id')); throw new BadRequestException('That code is not correct. Please try again.'); }
    if (purpose === 'registration') {
      await this.databaseService.request((request) => request.input('id', sql.UniqueIdentifier, otp.id).query('UPDATE EMAIL_OTPS SET verified_at = GETDATE() WHERE verification_id = @id'));
      return { verificationId: otp.id, email };
    }

    const resetSessionId = randomUUID();
    await this.databaseService.request((request) => request
      .input('id', sql.UniqueIdentifier, otp.id)
      .input('resetSessionId', sql.UniqueIdentifier, resetSessionId).query(`
        UPDATE EMAIL_OTPS
        SET verified_at = GETDATE(),
            reset_session_id = @resetSessionId,
            reset_session_expires_at = DATEADD(MINUTE, 10, GETDATE())
        WHERE verification_id = @id AND verified_at IS NULL AND invalidated_at IS NULL
      `));
    // `verificationId` remains for the existing mobile client contract. It
    // now carries the reset-session ID, never the consumed OTP row ID.
    return { verificationId: resetSessionId, resetSessionId, email, resetSessionExpiresInSeconds: 10 * 60 };
  }

  async sendSmsOtp(rawPhone: string) {
    const phone = this.normalizedPhilippinePhone(rawPhone);
    await this.ensureSmsOtpVerificationsTable();

    if (!process.env.IPROG_API_KEY) {
      throw new BadRequestException('SMS verification is not configured.');
    }

    const latest = await this.databaseService.request<{ secondsSinceSent: number }>((request) =>
      request.input('phone', sql.NVarChar(20), phone.iprog).query(`
        SELECT TOP 1 DATEDIFF(SECOND, sent_at, GETDATE()) AS secondsSinceSent
        FROM SMS_OTP_VERIFICATIONS
        WHERE phone_number = @phone AND sent_at IS NOT NULL
        ORDER BY sent_at DESC
      `),
    );
    const secondsUntilResend = latest[0]
      ? Math.max(0, 60 - Math.max(0, Number(latest[0].secondsSinceSent ?? 0)))
      : 0;

    if (latest[0] && secondsUntilResend > 0) {
      throw new BadRequestException(`Please wait ${secondsUntilResend} seconds before requesting another code.`);
    }

    const verificationId = randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    await this.databaseService.request((request) =>
      request
        .input('phone', sql.NVarChar(20), phone.iprog)
        .input('id', sql.UniqueIdentifier, verificationId).query(`
          UPDATE SMS_OTP_VERIFICATIONS
          SET invalidated_at = GETDATE()
          WHERE phone_number = @phone
            AND verified_at IS NULL
            AND invalidated_at IS NULL;

          INSERT INTO SMS_OTP_VERIFICATIONS (
            verification_id, phone_number, expires_at, attempts
          ) VALUES (@id, @phone, DATEADD(MINUTE, 5, GETDATE()), 0);
        `),
    );

    try {
      const response = await fetch('https://www.iprogsms.com/api/v1/otp/send_otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_token: process.env.IPROG_API_KEY,
          phone_number: phone.iprog,
          expires_in_minutes: 5,
        }),
      });
      const payload = await response.json().catch(() => null) as { status?: string } | null;
      if (!response.ok || payload?.status !== 'success') {
        throw new Error('IPROG send request failed');
      }
    } catch {
      await this.databaseService.request((request) =>
        request.input('id', sql.UniqueIdentifier, verificationId).query(`
          UPDATE SMS_OTP_VERIFICATIONS
          SET invalidated_at = GETDATE()
          WHERE verification_id = @id
        `),
      );
      throw new BadRequestException('We could not send a verification SMS right now. Please try again.');
    }

    await this.databaseService.request((request) =>
      request.input('id', sql.UniqueIdentifier, verificationId).query(`
        UPDATE SMS_OTP_VERIFICATIONS SET sent_at = GETDATE() WHERE verification_id = @id
      `),
    );
    return {
      verificationId,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: 5 * 60,
      resendAfterSeconds: 60,
    };
  }

  async verifySmsOtp(rawVerificationId: string | undefined, rawPhone: string | undefined, rawCode: string | undefined) {
    const verificationId = rawVerificationId?.trim() ?? '';
    const phone = this.normalizedPhilippinePhone(rawPhone ?? '');
    const code = rawCode?.trim() ?? '';
    if (!this.isUuid(verificationId)) throw new BadRequestException('Request a new verification code.');
    if (!/^\d{6}$/.test(code)) throw new BadRequestException('Enter the complete 6-digit code.');
    if (!process.env.IPROG_API_KEY) throw new BadRequestException('SMS verification is not configured.');

    await this.ensureSmsOtpVerificationsTable();
    const rows = await this.databaseService.request<{
      attempts: number;
      secondsRemaining: number;
      invalidatedAt: Date | null;
      verifiedAt: Date | null;
    }>((request) =>
      request
        .input('id', sql.UniqueIdentifier, verificationId)
        .input('phone', sql.NVarChar(20), phone.iprog).query(`
          SELECT attempts,
                 DATEDIFF(SECOND, GETDATE(), expires_at) AS secondsRemaining,
                 invalidated_at AS invalidatedAt,
                 verified_at AS verifiedAt
          FROM SMS_OTP_VERIFICATIONS
          WHERE verification_id = @id AND phone_number = @phone
        `),
    );
    const session = rows[0];
    if (!session || session.invalidatedAt || session.verifiedAt || Number(session.secondsRemaining) <= 0) {
      throw new BadRequestException('This code has expired. Request a new one.');
    }
    if (Number(session.attempts) >= 5) {
      throw new BadRequestException('Too many incorrect attempts. Request a new code.');
    }

    let providerAccepted = false;
    try {
      const response = await fetch('https://www.iprogsms.com/api/v1/otp/verify_otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_token: process.env.IPROG_API_KEY,
          phone_number: phone.iprog,
          otp: code,
        }),
      });
      const payload = await response.json().catch(() => null) as { status?: string } | null;
      // IPROG may use any successful 2xx status for the documented
      // { status: "success" } response. Do not require HTTP 200 specifically.
      providerAccepted = response.ok && String(payload?.status ?? '').trim().toLowerCase() === 'success';

      // A provider 4xx response means the submitted OTP was rejected. Only a
      // transport failure or a 5xx response is an availability problem.
      if (!providerAccepted && response.status >= 500) {
        throw new Error('IPROG verification request failed');
      }
    } catch {
      throw new BadRequestException('SMS verification is unavailable right now. Please try again.');
    }

    if (!providerAccepted) {
      await this.databaseService.request((request) =>
        request.input('id', sql.UniqueIdentifier, verificationId).query(`
          UPDATE SMS_OTP_VERIFICATIONS
          SET attempts = attempts + 1,
              invalidated_at = CASE WHEN attempts + 1 >= 5 THEN GETDATE() ELSE invalidated_at END
          WHERE verification_id = @id AND verified_at IS NULL AND invalidated_at IS NULL
        `),
      );
      if (Number(session.attempts) + 1 >= 5) {
        throw new BadRequestException('Too many incorrect attempts. Request a new code.');
      }
      throw new BadRequestException('That code is not correct. Please try again.');
    }

    await this.databaseService.request((request) =>
      request.input('id', sql.UniqueIdentifier, verificationId).query(`
        UPDATE SMS_OTP_VERIFICATIONS
        SET verified_at = GETDATE()
        WHERE verification_id = @id AND verified_at IS NULL AND invalidated_at IS NULL
      `),
    );
    return { verificationId, phone: phone.stored };
  }

  async addressAutocomplete(text: string) {
    const query = text?.trim() ?? ''; if (query.length < 3) return { suggestions: [] };
    if (!process.env.GEOAPIFY_API_KEY) throw new BadRequestException('Address search is not configured.');
    try {
      const response = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&filter=countrycode:ph&bias=proximity:121.0,14.6&limit=5&format=json&apiKey=${encodeURIComponent(process.env.GEOAPIFY_API_KEY)}`);
      if (!response.ok) throw new Error('Geoapify request failed');
      const payload = await response.json() as { results?: Array<Record<string, unknown>> };
      return { suggestions: (payload.results ?? []).map((item) => this.geoapifyAddress(item)) };
    } catch { throw new BadRequestException('Address suggestions are unavailable right now.'); }
  }

  async login(body: LoginBody) {
    const login = (body.login ?? body.email ?? '').trim();
    const password = body.password ?? '';

    if (!login || !password) {
      throw new UnauthorizedException('Username/email and password are required');
    }

    const users = await this.databaseService.request((request) =>
      request
        .input('login', sql.NVarChar(255), login)
        .query(`
          SELECT TOP 1
            CONVERT(varchar(36), u.user_id) AS id,
            u.email,
            u.full_name AS fullName,
            u.phone,
            u.profile_photo_url AS profilePhotoUrl,
            idt.label AS idType,
            u.id_number AS idNumber,
            u.password_hash AS passwordHash,
            u.is_admin AS isAdmin,
            u.is_active AS isActive
          FROM USERS u
          LEFT JOIN ID_TYPES idt ON idt.id_type_id = u.id_type_id
          WHERE
            u.is_active = 1
            AND u.is_admin = 1
            AND (
              u.email = @login
              OR u.full_name = @login
              OR LEFT(u.email, CHARINDEX('@', u.email + '@') - 1) = @login
            )
        `),
    );

    const user = users[0];

    if (!user || !(await passwordMatches(password, String(user.passwordHash ?? '')))) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    delete (user as { passwordHash?: string }).passwordHash;

    return {
      user,
      token: createSessionToken(user.id, true),
    };
  }

  async appLogin(body: LoginBody) {
    await this.finalizeExpiredDeletions();
    const email = (body.email ?? body.login ?? '').trim();
    const password = body.password ?? '';

    if (!email || !password) {
      throw new UnauthorizedException('Email and password are required');
    }

    const users = await this.databaseService.request((request) =>
      request.input('email', sql.NVarChar(255), email).query(`
        SELECT TOP 1
          CONVERT(varchar(36), u.user_id) AS user_id,
          u.email,
          u.password_hash AS passwordHash,
          u.full_name,
          u.phone,
          NULLIF(CONCAT(
            COALESCE(NULLIF(a.street, ''), ''),
            CASE WHEN NULLIF(a.barangay, '') IS NOT NULL THEN CONCAT(', ', a.barangay) ELSE '' END,
            CASE WHEN NULLIF(a.city, '') IS NOT NULL AND a.city <> 'Not specified' THEN CONCAT(', ', a.city) ELSE '' END,
            CASE WHEN NULLIF(a.province, '') IS NOT NULL THEN CONCAT(', ', a.province) ELSE '' END,
            CASE WHEN NULLIF(a.postal_code, '') IS NOT NULL THEN CONCAT(' ', a.postal_code) ELSE '' END
          ), '') AS shipping_address,
          a.house_no AS address_house_no,
          a.street_name AS address_street,
          a.barangay AS address_barangay,
          a.city AS address_city,
          a.province AS address_province,
          a.postal_code AS address_zip,
          u.id_number,
          u.profile_photo_url,
          u.skin_tone_detected,
          u.skin_hex,
          CAST(u.body_chest_cm AS float) AS body_chest_cm,
          CAST(u.body_waist_cm AS float) AS body_waist_cm,
          CAST(u.body_hip_cm AS float) AS body_hip_cm,
          CAST(u.body_height_cm AS float) AS body_height_cm,
          u.is_admin,
          u.is_active,
          fs.label AS fashion_style,
          ps.label AS preferred_size
        FROM USERS u
        LEFT JOIN FASHION_STYLES fs ON fs.style_id = u.style_id
        LEFT JOIN SIZE_STANDARDS ps ON ps.size_id = u.preferred_size_id
        OUTER APPLY (
          SELECT TOP 1
            street,
            CASE
              WHEN CHARINDEX(', ', street) > 0 THEN LEFT(street, CHARINDEX(', ', street) - 1)
              ELSE street
            END AS house_no,
            CASE
              WHEN CHARINDEX(', ', street) > 0 THEN SUBSTRING(street, CHARINDEX(', ', street) + 2, LEN(street))
              ELSE ''
            END AS street_name,
            barangay,
            city,
            province,
            postal_code
          FROM USER_ADDRESSES
          WHERE user_id = u.user_id
          ORDER BY is_default DESC, created_at DESC
        ) a
        WHERE u.email = @email AND u.is_admin = 0 AND u.deletion_finalized_at IS NULL
      `),
    );

    const user = users[0];

    if (!user || !(await passwordMatches(password, String(user.passwordHash ?? '')))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.is_active) {
      await this.databaseService.request((request) => request.input('userId', sql.UniqueIdentifier, user.user_id).query(`
        UPDATE USERS SET is_active = 1, deactivated_at = NULL, deletion_due_at = NULL WHERE user_id = @userId;
        UPDATE CONVERSATIONS SET is_active = 1 WHERE buyer_id = @userId;
      `));
      user.is_active = true;
    }

    delete (user as { passwordHash?: string }).passwordHash;

    return {
      user,
      token: createSessionToken(user.user_id, false),
    };
  }

  async reverseGeocodeAddress(latitude: string, longitude: string) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new BadRequestException('A valid location is required.');
    }
    if (!process.env.GEOAPIFY_API_KEY) throw new BadRequestException('Address search is not configured.');

    try {
      const response = await fetch(`https://api.geoapify.com/v1/geocode/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&filter=countrycode:ph&limit=1&format=json&apiKey=${encodeURIComponent(process.env.GEOAPIFY_API_KEY)}`);
      if (!response.ok) throw new Error('Geoapify request failed');
      const payload = await response.json() as { results?: Array<Record<string, unknown>> };
      const item = payload.results?.[0];
      if (!item) throw new Error('No address result');
      return { address: this.geoapifyAddress(item) };
    } catch {
      throw new BadRequestException('Your location could not be converted to an address right now.');
    }
  }

  private geoapifyAddress(item: Record<string, unknown>) {
    const rawProvince = String(item.state ?? '').trim();
    const rawRegion = String(item.state_district ?? item.region ?? '').trim();
    const ncr = /national capital|metro manila|\bncr\b/i.test(`${rawProvince} ${rawRegion}`);
    return {
      label: String(item.formatted ?? ''),
      houseNo: String(item.housenumber ?? ''),
      street: String(item.street ?? item.address_line1 ?? ''),
      barangay: String(item.suburb ?? item.district ?? ''),
      city: String(item.city ?? item.county ?? ''),
      // GeoApify represents NCR as a state in some results. Keep it in Region;
      // shipping uses the city/Metro Manila alias when a province is unavailable.
      province: ncr ? '' : rawProvince,
      region: ncr ? 'National Capital Region (NCR)' : rawRegion,
      zip: String(item.postcode ?? ''),
      country: String(item.country ?? 'Philippines'),
      latitude: item.lat ?? null,
      longitude: item.lon ?? null,
    };
  }

  private isNcr(value?: string | null) {
    return /national capital|metro manila|\bncr\b/i.test(value ?? '');
  }

  async deleteAppAccount(userId: string, body: { email?: string; password?: string; confirmation?: string }) {
    await this.ensureAccountDeletionColumns();
    await this.finalizeExpiredDeletions();
    const email = this.normalizedEmail(body.email ?? '');
    if (body.confirmation?.trim() !== 'DELETE') throw new BadRequestException('Type DELETE to confirm account deletion.');
    const rows = await this.databaseService.request<{ email: string; passwordHash: string }>((request) => request
      .input('userId', sql.UniqueIdentifier, userId).query(`
        SELECT email, password_hash AS passwordHash FROM USERS WHERE user_id = @userId AND is_active = 1
      `));
    const user = rows[0];
    if (!user || user.email.toLowerCase() !== email || !(await passwordMatches(body.password ?? '', user.passwordHash))) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }
    await this.databaseService.request((request) => request.input('userId', sql.UniqueIdentifier, userId).query(`
      UPDATE USERS
      SET is_active = 0, deactivated_at = GETDATE(), deletion_due_at = DATEADD(day, 30, GETDATE()), deletion_finalized_at = NULL
      WHERE user_id = @userId;
      UPDATE CONVERSATIONS SET is_active = 0 WHERE buyer_id = @userId;
      DELETE FROM CART_ITEMS WHERE user_id = @userId;
      IF OBJECT_ID('dbo.SAVED_PRODUCTS', 'U') IS NOT NULL DELETE FROM SAVED_PRODUCTS WHERE user_id = @userId;
    `));
    return { deactivated: true, deletionDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() };
  }

  async reactivateAppAccount(body: { email?: string; password?: string }) {
    await this.ensureAccountDeletionColumns();
    await this.finalizeExpiredDeletions();
    const email = this.normalizedEmail(body.email ?? '');
    const rows = await this.databaseService.request<{ userId: string; passwordHash: string; finalizedAt: Date | null }>((request) => request
      .input('email', sql.NVarChar(255), email)
      .query(`SELECT CONVERT(varchar(36), user_id) AS userId, password_hash AS passwordHash, deletion_finalized_at AS finalizedAt FROM USERS WHERE email = @email AND is_active = 0`));
    const user = rows[0];
    if (!user || user.finalizedAt || !(await passwordMatches(body.password ?? '', user.passwordHash))) throw new UnauthorizedException('This account cannot be reactivated with those credentials.');
    await this.databaseService.request((request) => request.input('email', sql.NVarChar(255), email).query(`
      UPDATE USERS SET is_active = 1, deactivated_at = NULL, deletion_due_at = NULL WHERE email = @email;
      UPDATE CONVERSATIONS SET is_active = 1 WHERE buyer_id = (SELECT user_id FROM USERS WHERE email = @email);
    `));
    return this.appLogin({ email, password: body.password ?? '' });
  }

  async completePasswordReset(body: { email?: string; verificationId?: string; password?: string; confirmPassword?: string }) {
    return this.completePasswordResetForAccount(body, false, 'password_reset');
  }

  async completeAdminPasswordReset(body: { email?: string; verificationId?: string; password?: string; confirmPassword?: string }) {
    return this.completePasswordResetForAccount(body, true, 'admin_password_reset');
  }

  private async completePasswordResetForAccount(body: { email?: string; verificationId?: string; resetSessionId?: string; password?: string; confirmPassword?: string }, isAdmin: boolean, purpose: EmailOtpPurpose) {
    const email = this.normalizedEmail(body.email ?? '');
    const resetSessionId = body.resetSessionId?.trim() ?? body.verificationId?.trim() ?? '';
    const password = body.password ?? '';
    if (!this.isUuid(resetSessionId)) throw new BadRequestException('Verify your reset code before setting a new password.');
    if (password !== (body.confirmPassword ?? '')) throw new BadRequestException('Password confirmation does not match.');
    assertPasswordRequirements(password);
    await this.ensureEmailOtpsTable();
    const verified = await this.databaseService.request<{ count: number }>((request) => request.input('resetSessionId', sql.UniqueIdentifier, resetSessionId).input('email', sql.NVarChar(255), email).input('purpose', sql.NVarChar(32), purpose).query(`
      SELECT COUNT(*) AS count FROM EMAIL_OTPS
      WHERE reset_session_id = @resetSessionId AND email = @email AND purpose = @purpose
        AND verified_at IS NOT NULL AND invalidated_at IS NULL
        AND reset_session_expires_at > GETDATE()
    `));
    if (!Number(verified[0]?.count)) throw new BadRequestException('This password-reset session has expired. Request a new code.');
    const users = await this.databaseService.request<{ userId: string; passwordHash: string }>((request) => request.input('email', sql.NVarChar(255), email).query(`SELECT TOP 1 CONVERT(varchar(36), user_id) AS userId, password_hash AS passwordHash FROM USERS WHERE LOWER(email) = LOWER(@email) AND is_admin = ${isAdmin ? 1 : 0} AND is_active = 1`));
    const user = users[0];
    if (!user) throw new BadRequestException(`No active ${isAdmin ? 'administrator' : 'account'} was found for that email address.`);
    if (await passwordMatches(password, user.passwordHash)) throw new BadRequestException('Your new password must be different from your current password.');
    const passwordHash = await hashPassword(password);
    await this.databaseService.request((request) => request.input('userId', sql.UniqueIdentifier, user.userId).input('passwordHash', sql.NVarChar(255), passwordHash).input('resetSessionId', sql.UniqueIdentifier, resetSessionId).query(`
      UPDATE USERS SET password_hash = @passwordHash WHERE user_id = @userId;
      UPDATE EMAIL_OTPS
      SET invalidated_at = GETDATE(), reset_session_id = NULL, reset_session_expires_at = NULL
      WHERE reset_session_id = @resetSessionId AND invalidated_at IS NULL;
    `));
    return { passwordReset: true, message: 'Password reset successfully. Please sign in with your new password.' };
  }

  async sendChangePasswordOtp(userId: string) {
    const users = await this.databaseService.request<{ email: string }>((request) => request.input('userId', sql.UniqueIdentifier, userId).query(`SELECT TOP 1 email FROM USERS WHERE user_id = @userId AND is_admin = 0 AND is_active = 1`));
    const user = users[0];
    if (!user) throw new BadRequestException('User not found.');
    return this.sendEmailOtpForPurpose(user.email, 'password_change', `Your A'FRO password change code`);
  }

  async verifyChangePasswordOtp(userId: string, rawCode: string | undefined) {
    const users = await this.databaseService.request<{ email: string }>((request) => request.input('userId', sql.UniqueIdentifier, userId).query(`SELECT TOP 1 email FROM USERS WHERE user_id = @userId AND is_admin = 0 AND is_active = 1`));
    const user = users[0];
    if (!user) throw new BadRequestException('User not found.');
    return this.verifyEmailOtpForPurpose(user.email, rawCode, 'password_change');
  }

  async changeAppPassword(userId: string, body: { resetSessionId?: string; password?: string; confirmPassword?: string }) {
    const resetSessionId = body.resetSessionId?.trim() ?? '';
    const password = body.password ?? '';
    if (!this.isUuid(resetSessionId)) throw new BadRequestException('Verify your change password code before setting a new password.');
    if (password !== (body.confirmPassword ?? '')) throw new BadRequestException('Password confirmation does not match.');
    assertPasswordRequirements(password);

    const users = await this.databaseService.request<{ email: string, passwordHash: string }>((request) => request.input('userId', sql.UniqueIdentifier, userId).query(`SELECT TOP 1 email, password_hash AS passwordHash FROM USERS WHERE user_id = @userId AND is_admin = 0 AND is_active = 1`));
    const user = users[0];
    if (!user) throw new UnauthorizedException('User not found.');

    await this.ensureEmailOtpsTable();
    const verified = await this.databaseService.request<{ count: number }>((request) => request.input('resetSessionId', sql.UniqueIdentifier, resetSessionId).input('email', sql.NVarChar(255), user.email).input('purpose', sql.NVarChar(32), 'password_change').query(`
      SELECT COUNT(*) AS count FROM EMAIL_OTPS
      WHERE reset_session_id = @resetSessionId AND email = @email AND purpose = @purpose
        AND verified_at IS NOT NULL AND invalidated_at IS NULL
        AND reset_session_expires_at > GETDATE()
    `));
    if (!Number(verified[0]?.count)) throw new BadRequestException('This password-change session has expired. Request a new code.');

    if (await passwordMatches(password, user.passwordHash)) throw new BadRequestException('Your new password must be different from your current password.');
    const passwordHash = await hashPassword(password);
    
    await this.databaseService.request((request) => request.input('userId', sql.UniqueIdentifier, userId).input('passwordHash', sql.NVarChar(255), passwordHash).input('resetSessionId', sql.UniqueIdentifier, resetSessionId).query(`
      UPDATE USERS SET password_hash = @passwordHash WHERE user_id = @userId;
      UPDATE EMAIL_OTPS
      SET invalidated_at = GETDATE(), reset_session_id = NULL, reset_session_expires_at = NULL
      WHERE reset_session_id = @resetSessionId AND invalidated_at IS NULL;
    `));
    return { passwordChanged: true, signOutRequired: true, message: 'Password changed successfully. Please sign in again.' };
  }

  private async ensureAccountDeletionColumns() {
    await this.databaseService.query(`
      IF COL_LENGTH('USERS', 'deactivated_at') IS NULL ALTER TABLE USERS ADD deactivated_at DATETIME2 NULL;
      IF COL_LENGTH('USERS', 'deletion_due_at') IS NULL ALTER TABLE USERS ADD deletion_due_at DATETIME2 NULL;
      IF COL_LENGTH('USERS', 'deletion_finalized_at') IS NULL ALTER TABLE USERS ADD deletion_finalized_at DATETIME2 NULL;
    `);
  }

  private async finalizeExpiredDeletions() {
    await this.ensureAccountDeletionColumns();
    await this.databaseService.query(`
      UPDATE USERS
      SET email = CONCAT('deleted-', CONVERT(varchar(36), user_id), '@deleted.local'), phone = NULL,
          password_hash = CONVERT(varchar(36), NEWID()), deletion_finalized_at = GETDATE()
      WHERE is_active = 0 AND deletion_due_at IS NOT NULL AND deletion_due_at <= GETDATE() AND deletion_finalized_at IS NULL;
    `);
  }

  async appRegister(body: unknown) {
    const payload = body as AppRegisterBody;
    const email = payload.email?.trim().toLowerCase() ?? '';
    const password = payload.password ?? '';
    const fullName = payload.full_name?.trim() ?? '';
    const idNumber = payload.id_number?.trim() || null;
    const addressHouseNo = payload.address_house_no?.trim() || null;
    const addressStreet = payload.address_street?.trim() || null;
    const addressBarangay = payload.address_barangay?.trim() || null;
    const addressCity = payload.address_city?.trim() || null;
    const addressRegion = payload.address_region?.trim() || null;
    const addressProvince = payload.address_province?.trim() || (this.isNcr(addressRegion) ? 'Metro Manila' : null);
    const addressZip = payload.address_zip?.trim() || null;
    const shippingAddress = payload.shipping_address?.trim() || [addressHouseNo, addressStreet, addressBarangay, addressCity, addressProvince, addressZip]
      .filter(Boolean)
      .join(', ') || null;
    const streetLine = [addressHouseNo, addressStreet].filter(Boolean).join(', ') || shippingAddress;
    const styleLabel = payload.fashion_style?.split(',')[0]?.trim() || null;
    const preferredSizeLabel = payload.preferred_size?.trim() || null;
    const idTypeLabel = this.normalizeIdType(payload.id_type);
    const skinHex = this.normalizeSkinHex(payload.skin_hex);
    const bodyChestCm = this.toNullableNumber(payload.body_chest_cm);
    const bodyWaistCm = this.toNullableNumber(payload.body_waist_cm);
    const bodyHipCm = this.toNullableNumber(payload.body_hip_cm);
    const bodyHeightCm = this.toNullableNumber(payload.body_height_cm);

    if (!email || !password || !fullName) {
      throw new BadRequestException('Email, password, and full name are required');
    }
    const phone = this.normalizedPhilippinePhone(payload.phone ?? '').stored;
    await this.requireVerifiedEmail(email, payload.email_verification_id);
    await this.requireVerifiedSms(phone, payload.phone_verification_id);
    this.validateAppAccountFields({ email, password, fullName, phone, shippingAddress });

    if (!bodyChestCm || !bodyWaistCm || !bodyHipCm) {
      throw new BadRequestException('Chest, waist, and hip measurements are required');
    }

    const existing = await this.databaseService.request<{ count: number }>((request) =>
      request.input('email', sql.NVarChar(255), email).query(`
        SELECT COUNT(*) AS count
        FROM USERS
        WHERE email = @email
      `),
    );

    if (Number(existing[0]?.count ?? 0) > 0) {
      throw new ConflictException('Email is already registered');
    }

    const idTypes = idTypeLabel
      ? await this.databaseService.request<{ idTypeId: number }>((request) =>
          request.input('label', sql.NVarChar(100), idTypeLabel).query(`
            SELECT TOP 1 id_type_id AS idTypeId
            FROM ID_TYPES
            WHERE label = @label
          `),
        )
      : [];

    const styleId = await this.findStyleId(styleLabel);
    const preferredSizeId = await this.findSizeId(preferredSizeLabel);

    const passwordHash = await hashPassword(password);
    const inserted = await this.databaseService.request<{ userId: string }>((request) =>
      request
        .input('email', sql.NVarChar(255), email)
        .input('passwordHash', sql.NVarChar(255), passwordHash)
        .input('fullName', sql.NVarChar(150), fullName)
        .input('phone', sql.NVarChar(20), phone)
        .input('idTypeId', sql.TinyInt, idTypes[0]?.idTypeId ?? null)
        .input('idNumber', sql.NVarChar(100), idNumber)
        .input('styleId', sql.SmallInt, styleId)
        .input('preferredSizeId', sql.SmallInt, preferredSizeId)
        .input('skinToneDetected', sql.Bit, skinHex ? 1 : 0)
        .input('skinHex', sql.NVarChar(7), skinHex)
        .input('bodyChestCm', sql.Decimal(5, 2), bodyChestCm)
        .input('bodyWaistCm', sql.Decimal(5, 2), bodyWaistCm)
        .input('bodyHipCm', sql.Decimal(5, 2), bodyHipCm)
        .input('bodyHeightCm', sql.Decimal(5, 2), bodyHeightCm).query(`
          INSERT INTO USERS (
            email,
            password_hash,
            full_name,
            phone,
            id_type_id,
            id_number,
            style_id,
            preferred_size_id,
            skin_tone_detected,
            skin_hex,
            body_chest_cm,
            body_waist_cm,
            body_hip_cm,
            body_height_cm,
            is_admin,
            is_active
          )
          OUTPUT CONVERT(varchar(36), inserted.user_id) AS userId
          VALUES (
            @email,
            @passwordHash,
            @fullName,
            @phone,
            @idTypeId,
            @idNumber,
            @styleId,
            @preferredSizeId,
            @skinToneDetected,
            @skinHex,
            @bodyChestCm,
            @bodyWaistCm,
            @bodyHipCm,
            @bodyHeightCm,
            0,
            1
          )
        `),
    );

    const userId = inserted[0].userId;

    if (shippingAddress) {
      await this.databaseService.request((request) =>
        request
          .input('userId', sql.UniqueIdentifier, userId)
          .input('recipientName', sql.NVarChar(150), fullName)
          .input('phone', sql.NVarChar(20), phone)
          .input('street', sql.NVarChar(255), streetLine)
          .input('barangay', sql.NVarChar(100), addressBarangay)
          .input('city', sql.NVarChar(100), addressCity)
          .input('province', sql.NVarChar(100), addressProvince)
          .input('postalCode', sql.NVarChar(10), addressZip)
          .input('isDefault', sql.Bit, 1).query(`
            INSERT INTO USER_ADDRESSES (
              user_id, label, recipient_name, phone, street,
              barangay, city, province, postal_code, is_default
            )
            VALUES (
              @userId, 'Home', @recipientName, @phone, @street,
              @barangay, @city, @province, @postalCode, @isDefault
            )
          `),
      );
    }

    // Registration is already complete at this point. Delivery failure is
    // best-effort and must not turn a successful registration into a failure.
    void this.notificationsService.sendWelcomeEmail(userId).catch(() => undefined);

    return this.appLogin({ email, password });
  }

  async updateAppProfile(userId: string, body: unknown) {
    const payload = body as AppRegisterBody;
    const styleLabel = payload.fashion_style?.split(',')[0]?.trim() || null;
    const preferredSizeLabel = payload.preferred_size?.trim() || null;
    const skinHex = this.normalizeSkinHex(payload.skin_hex);
    const bodyChestCm = this.toNullableNumber(payload.body_chest_cm);
    const bodyWaistCm = this.toNullableNumber(payload.body_waist_cm);
    const bodyHipCm = this.toNullableNumber(payload.body_hip_cm);
    const bodyHeightCm = this.toNullableNumber(payload.body_height_cm);

    if (!userId?.trim()) {
      throw new BadRequestException('User id is required');
    }

    if (!styleLabel) {
      throw new BadRequestException('Fashion style is required');
    }

    if (!bodyChestCm || !bodyWaistCm || !bodyHipCm) {
      throw new BadRequestException('Chest, waist, and hip measurements are required');
    }

    const styleId = await this.findStyleId(styleLabel);
    const preferredSizeId = await this.findSizeId(preferredSizeLabel);

    await this.databaseService.request((request) =>
      request
        .input('userId', sql.UniqueIdentifier, userId)
        .input('styleId', sql.SmallInt, styleId)
        .input('preferredSizeId', sql.SmallInt, preferredSizeId)
        .input('skinToneDetected', sql.Bit, skinHex ? 1 : 0)
        .input('skinHex', sql.NVarChar(7), skinHex)
        .input('bodyChestCm', sql.Decimal(5, 2), bodyChestCm)
        .input('bodyWaistCm', sql.Decimal(5, 2), bodyWaistCm)
        .input('bodyHipCm', sql.Decimal(5, 2), bodyHipCm)
        .input('bodyHeightCm', sql.Decimal(5, 2), bodyHeightCm).query(`
          UPDATE USERS
          SET
            style_id = @styleId,
            preferred_size_id = @preferredSizeId,
            skin_tone_detected = @skinToneDetected,
            skin_hex = @skinHex,
            body_chest_cm = @bodyChestCm,
            body_waist_cm = @bodyWaistCm,
            body_hip_cm = @bodyHipCm,
            body_height_cm = @bodyHeightCm
          WHERE user_id = @userId AND is_active = 1 AND is_admin = 0
        `),
    );

    const user = await this.findAppUserById(userId);

    if (!user) {
      throw new BadRequestException('User was not found');
    }

    return { user };
  }

  async updateAppAccount(userId: string, body: unknown) {
    const payload = body as AppRegisterBody;
    const email = payload.email?.trim().toLowerCase() ?? '';
    const fullName = payload.full_name?.trim() ?? '';
    const phone = payload.phone?.trim() || null;
    const addressHouseNo = payload.address_house_no?.trim() || null;
    const addressStreet = payload.address_street?.trim() || null;
    const addressBarangay = payload.address_barangay?.trim() || null;
    const addressCity = payload.address_city?.trim() || null;
    const addressRegion = payload.address_region?.trim() || null;
    const addressProvince = payload.address_province?.trim() || (this.isNcr(addressRegion) ? 'Metro Manila' : null);
    const addressZip = payload.address_zip?.trim() || null;
    const shippingAddress = payload.shipping_address?.trim() || [addressHouseNo, addressStreet, addressBarangay, addressCity, addressProvince, addressZip]
      .filter(Boolean)
      .join(', ') || null;
    const streetLine = [addressHouseNo, addressStreet].filter(Boolean).join(', ') || shippingAddress;

    if (!userId?.trim()) {
      throw new BadRequestException('User id is required');
    }

    if (!email || !fullName) {
      throw new BadRequestException('Full name and email are required');
    }
    this.validateAppAccountFields({
      email,
      fullName,
      phone,
      shippingAddress,
      addressZip,
    });

    const existing = await this.databaseService.request<{ count: number }>((request) =>
      request
        .input('userId', sql.UniqueIdentifier, userId)
        .input('email', sql.NVarChar(255), email).query(`
          SELECT COUNT(*) AS count
          FROM USERS
          WHERE email = @email AND user_id <> @userId
        `),
    );

    if (Number(existing[0]?.count ?? 0) > 0) {
      throw new ConflictException('Email is already registered');
    }

    await this.databaseService.request((request) =>
      request
        .input('userId', sql.UniqueIdentifier, userId)
        .input('email', sql.NVarChar(255), email)
        .input('fullName', sql.NVarChar(150), fullName)
        .input('phone', sql.NVarChar(20), phone)
        .input('street', sql.NVarChar(255), streetLine)
        .input('barangay', sql.NVarChar(100), addressBarangay)
        .input('city', sql.NVarChar(100), addressCity)
        .input('province', sql.NVarChar(100), addressProvince)
        .input('postalCode', sql.NVarChar(10), addressZip).query(`
          UPDATE USERS
          SET
            email = @email,
            full_name = @fullName,
            phone = @phone
          WHERE user_id = @userId AND is_active = 1 AND is_admin = 0

          DECLARE @addressId uniqueidentifier = (
            SELECT TOP 1 address_id
            FROM USER_ADDRESSES
            WHERE user_id = @userId
            ORDER BY is_default DESC, created_at DESC
          );

          IF @addressId IS NOT NULL
          BEGIN
            UPDATE USER_ADDRESSES
            SET
              recipient_name = @fullName,
              phone = @phone,
              street = COALESCE(@street, ''),
              barangay = @barangay,
              city = @city,
              province = @province,
              postal_code = @postalCode,
              is_default = 1
            WHERE address_id = @addressId;
          END
          ELSE IF NULLIF(@street, '') IS NOT NULL
          BEGIN
            INSERT INTO USER_ADDRESSES (
              user_id, label, recipient_name, phone, street, barangay, city, province, postal_code, is_default
            )
            VALUES (
              @userId, 'Home', @fullName, @phone, @street, @barangay, @city, @province, @postalCode, 1
            );
          END
        `),
    );

    const user = await this.findAppUserById(userId);

    if (!user) {
      throw new BadRequestException('User was not found');
    }

    return { user };
  }

  async verifyAppId(userId: string, body: unknown) {
    const payload = body as AppRegisterBody;
    const idTypeLabel = this.normalizeIdType(payload.id_type);
    const idNumber = payload.id_number?.trim() || null;

    if (!userId?.trim()) {
      throw new BadRequestException('User id is required');
    }

    if (!idTypeLabel || !idNumber) {
      throw new BadRequestException('ID type and ID number are required');
    }

    const idTypeId = await this.findIdTypeId(idTypeLabel);

    await this.databaseService.request((request) =>
      request
        .input('userId', sql.UniqueIdentifier, userId)
        .input('idTypeId', sql.TinyInt, idTypeId)
        .input('idNumber', sql.NVarChar(100), idNumber).query(`
          UPDATE USERS
          SET
            id_type_id = @idTypeId,
            id_number = @idNumber
          WHERE user_id = @userId AND is_active = 1 AND is_admin = 0
        `),
    );

    const user = await this.findAppUserById(userId);

    if (!user) {
      throw new BadRequestException('User was not found');
    }

    return { user };
  }

  private validateAppAccountFields({
    email,
    password,
    fullName,
    phone,
    shippingAddress,
    addressZip,
  }: {
    email: string;
    password?: string;
    fullName: string;
    phone?: string | null;
    shippingAddress?: string | null;
    addressZip?: string | null;
  }) {
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('A valid email is required');
    }

    if (password !== undefined) {
      assertPasswordRequirements(password);
    }

    const nameParts = fullName.trim().split(/\s+/);
    if (fullName.length > 100 || nameParts.length < 2) {
      throw new BadRequestException('First name and last name are required');
    }

    for (const [index, part] of nameParts.entries()) {
      if (part.length < 2 || part.length > 40 || !/^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/.test(part)) {
        throw new BadRequestException(`${index === 0 ? 'First' : 'Last'} name can only contain letters and must be 2 to 40 characters`);
      }
    }

    if (phone && !/^9\d{9}$/.test(phone)) {
      throw new BadRequestException('Phone must be a valid 10-digit PH mobile number');
    }

    if (shippingAddress && shippingAddress.length > 255) {
      throw new BadRequestException('Shipping address must be 255 characters or less');
    }

    if (addressZip && !/^\d{4}$/.test(addressZip)) {
      throw new BadRequestException('Zip code must be 4 digits');
    }
  }

  private normalizeIdType(idType?: string) {
    const key = idType?.trim().toLowerCase();

    if (!key) {
      return null;
    }

    const labels: Record<string, string> = {
      national_id: 'PhilSys',
      philsys: 'PhilSys',
      drivers_license: "Driver's License",
      passport: 'Passport',
      sss: 'SSS',
      gsis: 'GSIS',
      philhealth: 'PhilHealth',
      voters_id: "Voter's ID",
      tin: 'TIN',
      umid: 'GSIS',
    };

    return labels[key] ?? idType;
  }

  private normalizeSkinHex(skinHex?: string | null) {
    const trimmed = skinHex?.trim();

    if (!trimmed) {
      return null;
    }

    if (!/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
      throw new BadRequestException('Skin hex must be a valid #RRGGBB value');
    }

    return trimmed.toUpperCase();
  }

  private toNullableNumber(value?: number | string | null) {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private normalizedEmail(value: string) {
    const email = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new BadRequestException('Enter a valid email address.');
    }
    return email;
  }

  private normalizedPhilippinePhone(value: string) {
    const digits = value.replace(/\D/g, '');
    let stored: string;

    if (/^9\d{9}$/.test(digits)) {
      stored = digits;
    } else if (/^09\d{9}$/.test(digits)) {
      stored = digits.slice(1);
    } else if (/^639\d{9}$/.test(digits)) {
      stored = digits.slice(2);
    } else {
      throw new BadRequestException('Phone must be a valid Philippine mobile number.');
    }

    return { stored, iprog: `0${stored}` };
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private otpHash(email: string, purpose: string, code: string) {
    return createHash('sha256').update(`${email}:${purpose}:${code}`).digest('hex');
  }

  private async ensureEmailOtpsTable() {
    // Keep creation and upgrades as separate statements. The project has
    // deployed older EMAIL_OTPS tables without `purpose`; a single mixed DDL
    // batch can fail before the column upgrade is applied on SQL Server.
    await this.databaseService.query(`
      IF OBJECT_ID('dbo.EMAIL_OTPS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.EMAIL_OTPS (
          verification_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
          email NVARCHAR(255) NOT NULL,
          purpose NVARCHAR(32) NOT NULL,
          code_hash NVARCHAR(128) NOT NULL,
          expires_at DATETIME2 NOT NULL,
          attempts INT NOT NULL DEFAULT 0,
          created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
          verified_at DATETIME2 NULL,
          invalidated_at DATETIME2 NULL,
          reset_session_id UNIQUEIDENTIFIER NULL,
          reset_session_expires_at DATETIME2 NULL
        );
      END
    `);

    if (!(await this.databaseService.columnExists('EMAIL_OTPS', 'purpose'))) {
      await this.databaseService.query(`ALTER TABLE dbo.EMAIL_OTPS ADD purpose NVARCHAR(32) NULL`);
      await this.databaseService.query(`UPDATE dbo.EMAIL_OTPS SET purpose = 'registration' WHERE purpose IS NULL`);
      await this.databaseService.query(`ALTER TABLE dbo.EMAIL_OTPS ALTER COLUMN purpose NVARCHAR(32) NOT NULL`);
    }

    if (!(await this.databaseService.columnExists('EMAIL_OTPS', 'reset_session_id'))) {
      await this.databaseService.query(`ALTER TABLE dbo.EMAIL_OTPS ADD reset_session_id UNIQUEIDENTIFIER NULL`);
    }
    if (!(await this.databaseService.columnExists('EMAIL_OTPS', 'reset_session_expires_at'))) {
      await this.databaseService.query(`ALTER TABLE dbo.EMAIL_OTPS ADD reset_session_expires_at DATETIME2 NULL`);
    }

    await this.databaseService.query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = 'IX_EMAIL_OTPS_EMAIL_PURPOSE_CREATED'
          AND object_id = OBJECT_ID('dbo.EMAIL_OTPS')
      )
        CREATE INDEX IX_EMAIL_OTPS_EMAIL_PURPOSE_CREATED
          ON dbo.EMAIL_OTPS (email, purpose, created_at DESC)
    `);
  }

  private async ensureSmsOtpVerificationsTable() {
    await this.databaseService.query(`
      IF OBJECT_ID('dbo.SMS_OTP_VERIFICATIONS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.SMS_OTP_VERIFICATIONS (
          verification_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
          phone_number NVARCHAR(20) NOT NULL,
          expires_at DATETIME2 NOT NULL,
          attempts INT NOT NULL DEFAULT 0,
          created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
          sent_at DATETIME2 NULL,
          verified_at DATETIME2 NULL,
          invalidated_at DATETIME2 NULL
        );
        CREATE INDEX IX_SMS_OTP_VERIFICATIONS_PHONE_CREATED
          ON dbo.SMS_OTP_VERIFICATIONS (phone_number, created_at DESC);
      END
    `);
  }

  private async requireVerifiedEmail(email: string, verificationId?: string) {
    if (!verificationId) throw new BadRequestException('Verify your email before creating an account.');
    await this.ensureEmailOtpsTable();
    const verified = await this.databaseService.request<{ count: number }>((request) =>
      request.input('email', sql.NVarChar(255), email).input('id', sql.UniqueIdentifier, verificationId).query(`
        SELECT COUNT(*) AS count FROM EMAIL_OTPS
        WHERE verification_id = @id AND email = @email AND purpose = 'registration' AND verified_at IS NOT NULL AND invalidated_at IS NULL
      `),
    );
    if (!Number(verified[0]?.count)) throw new BadRequestException('Verify your email before creating an account.');
  }

  private async requireVerifiedSms(storedPhone: string, verificationId?: string) {
    if (!verificationId || !this.isUuid(verificationId)) {
      throw new BadRequestException('Verify your phone number before creating an account.');
    }
    await this.ensureSmsOtpVerificationsTable();
    const verified = await this.databaseService.request<{ count: number }>((request) =>
      request
        .input('id', sql.UniqueIdentifier, verificationId)
        .input('phone', sql.NVarChar(20), `0${storedPhone}`).query(`
          SELECT COUNT(*) AS count
          FROM SMS_OTP_VERIFICATIONS
          WHERE verification_id = @id
            AND phone_number = @phone
            AND verified_at IS NOT NULL
            AND invalidated_at IS NULL
        `),
    );
    if (!Number(verified[0]?.count)) {
      throw new BadRequestException('Verify your phone number before creating an account.');
    }
  }

  private async findStyleId(styleLabel: string | null) {
    if (!styleLabel) {
      return null;
    }

    const styles = await this.databaseService.request<{ styleId: number }>((request) =>
      request.input('label', sql.NVarChar(100), styleLabel).query(`
        SELECT TOP 1 style_id AS styleId
        FROM FASHION_STYLES
        WHERE label = @label
      `),
    );

    if (!styles[0]?.styleId) {
      throw new BadRequestException('Selected fashion style is not available');
    }

    return styles[0].styleId;
  }

  private async findSizeId(sizeLabel: string | null) {
    if (!sizeLabel) {
      return null;
    }

    const sizes = await this.databaseService.request<{ sizeId: number }>((request) =>
      request.input('label', sql.NVarChar(10), sizeLabel).query(`
        SELECT TOP 1 size_id AS sizeId
        FROM SIZE_STANDARDS
        WHERE label = @label
      `),
    );

    if (!sizes[0]?.sizeId) {
      throw new BadRequestException('Selected preferred size is not available');
    }

    return sizes[0].sizeId;
  }

  private async findIdTypeId(idTypeLabel: string) {
    const idTypes = await this.databaseService.request<{ idTypeId: number }>((request) =>
      request.input('label', sql.NVarChar(100), idTypeLabel).query(`
        SELECT TOP 1 id_type_id AS idTypeId
        FROM ID_TYPES
        WHERE label = @label
      `),
    );

    if (!idTypes[0]?.idTypeId) {
      throw new BadRequestException('Selected ID type is not available');
    }

    return idTypes[0].idTypeId;
  }

  private async findAppUserById(userId: string) {
    const users = await this.databaseService.request((request) =>
      request.input('userId', sql.UniqueIdentifier, userId).query(`
        SELECT TOP 1
          CONVERT(varchar(36), u.user_id) AS user_id,
          u.email,
          u.full_name,
          u.phone,
          NULLIF(CONCAT(
            COALESCE(NULLIF(a.street, ''), ''),
            CASE WHEN NULLIF(a.barangay, '') IS NOT NULL THEN CONCAT(', ', a.barangay) ELSE '' END,
            CASE WHEN NULLIF(a.city, '') IS NOT NULL AND a.city <> 'Not specified' THEN CONCAT(', ', a.city) ELSE '' END,
            CASE WHEN NULLIF(a.province, '') IS NOT NULL THEN CONCAT(', ', a.province) ELSE '' END,
            CASE WHEN NULLIF(a.postal_code, '') IS NOT NULL THEN CONCAT(' ', a.postal_code) ELSE '' END
          ), '') AS shipping_address,
          a.house_no AS address_house_no,
          a.street_name AS address_street,
          a.barangay AS address_barangay,
          a.city AS address_city,
          a.province AS address_province,
          a.postal_code AS address_zip,
          u.id_number,
          u.profile_photo_url,
          u.skin_tone_detected,
          u.skin_hex,
          CAST(u.body_chest_cm AS float) AS body_chest_cm,
          CAST(u.body_waist_cm AS float) AS body_waist_cm,
          CAST(u.body_hip_cm AS float) AS body_hip_cm,
          CAST(u.body_height_cm AS float) AS body_height_cm,
          u.is_admin,
          u.is_active,
          fs.label AS fashion_style,
          ps.label AS preferred_size
        FROM USERS u
        LEFT JOIN FASHION_STYLES fs ON fs.style_id = u.style_id
        LEFT JOIN SIZE_STANDARDS ps ON ps.size_id = u.preferred_size_id
        OUTER APPLY (
          SELECT TOP 1
            street,
            CASE
              WHEN CHARINDEX(', ', street) > 0 THEN LEFT(street, CHARINDEX(', ', street) - 1)
              ELSE street
            END AS house_no,
            CASE
              WHEN CHARINDEX(', ', street) > 0 THEN SUBSTRING(street, CHARINDEX(', ', street) + 2, LEN(street))
              ELSE ''
            END AS street_name,
            barangay,
            city,
            province,
            postal_code
          FROM USER_ADDRESSES
          WHERE user_id = u.user_id
          ORDER BY is_default DESC, created_at DESC
        ) a
        WHERE u.user_id = @userId AND u.is_active = 1 AND u.is_admin = 0
      `),
    );

    return users[0] ?? null;
  }
}
