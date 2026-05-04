import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';
import { DatabaseService } from '../database/database.service';

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
  fashion_style?: string;
  preferred_size?: string;
  skin_hex?: string | null;
  body_chest_cm?: number | string | null;
  body_waist_cm?: number | string | null;
  body_hip_cm?: number | string | null;
  body_height_cm?: number | string | null;
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

    if (!user || !this.passwordMatches(password, String(user.passwordHash ?? ''))) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    delete (user as { passwordHash?: string }).passwordHash;

    return {
      user,
      token: Buffer.from(`${user.id}:${Date.now()}`).toString('base64'),
    };
  }

  async appLogin(body: LoginBody) {
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
        WHERE u.email = @email AND u.is_active = 1 AND u.is_admin = 0
      `),
    );

    const user = users[0];

    if (!user || !this.passwordMatches(password, String(user.passwordHash ?? ''))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    delete (user as { passwordHash?: string }).passwordHash;

    return {
      user,
      token: Buffer.from(`${user.user_id}:${Date.now()}`).toString('base64'),
    };
  }

  async appRegister(body: unknown) {
    const payload = body as AppRegisterBody;
    const email = payload.email?.trim().toLowerCase() ?? '';
    const password = payload.password ?? '';
    const fullName = payload.full_name?.trim() ?? '';
    const phone = payload.phone?.trim() || null;
    const idNumber = payload.id_number?.trim() || null;
    const shippingAddress = payload.shipping_address?.trim() || null;
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

    const inserted = await this.databaseService.request<{ userId: string }>((request) =>
      request
        .input('email', sql.NVarChar(255), email)
        .input('password', sql.NVarChar(255), password)
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
            @password,
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
          .input('street', sql.NVarChar(255), shippingAddress)
          .input('city', sql.NVarChar(100), 'Not specified')
          .input('isDefault', sql.Bit, 1).query(`
            INSERT INTO USER_ADDRESSES (
              user_id, label, recipient_name, phone, street, city, is_default
            )
            VALUES (
              @userId, 'Home', @recipientName, @phone, @street, @city, @isDefault
            )
          `),
      );
    }

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

    if (!userId?.trim()) {
      throw new BadRequestException('User id is required');
    }

    if (!email || !fullName) {
      throw new BadRequestException('Full name and email are required');
    }

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
        .input('phone', sql.NVarChar(20), phone).query(`
          UPDATE USERS
          SET
            email = @email,
            full_name = @fullName,
            phone = @phone
          WHERE user_id = @userId AND is_active = 1 AND is_admin = 0
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

  private passwordMatches(password: string, passwordHash: string) {
    if (!passwordHash) {
      return false;
    }

    // Existing local data has used plain text admin passwords. Keep that
    // compatible so the admin account can be repaired without extra packages.
    return password === passwordHash;
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
        WHERE u.user_id = @userId AND u.is_active = 1 AND u.is_admin = 0
      `),
    );

    return users[0] ?? null;
  }
}
