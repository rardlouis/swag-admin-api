import { BadRequestException, Injectable } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SavedService {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureTable() {
    if (await this.databaseService.tableExists('SAVED_PRODUCTS')) {
      return;
    }

    await this.databaseService.query(`
      CREATE TABLE SAVED_PRODUCTS (
        saved_id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        user_id UNIQUEIDENTIFIER NOT NULL,
        product_id UNIQUEIDENTIFIER NOT NULL,
        saved_at DATETIME2 NOT NULL DEFAULT GETDATE(),

        CONSTRAINT PK_SAVED_PRODUCTS PRIMARY KEY (saved_id),
        CONSTRAINT FK_SAVED_USER FOREIGN KEY (user_id)
          REFERENCES USERS (user_id) ON DELETE CASCADE,
        CONSTRAINT FK_SAVED_PRODUCT FOREIGN KEY (product_id)
          REFERENCES PRODUCTS (product_id) ON DELETE CASCADE,
        CONSTRAINT UQ_SAVED_USER_PRODUCT UNIQUE (user_id, product_id)
      )
    `);
  }

  async idsForUser(userId?: string) {
    if (!userId) {
      throw new BadRequestException('User id is required');
    }

    await this.ensureTable();

    const rows = await this.databaseService.request<{ productId: string }>((request) =>
      request.input('userId', sql.UniqueIdentifier, userId).query(`
        SELECT CONVERT(varchar(36), product_id) AS productId
        FROM SAVED_PRODUCTS
        WHERE user_id = @userId
        ORDER BY saved_at DESC
      `),
    );

    return rows.map((row) => row.productId);
  }

  async findForUser(userId?: string) {
    if (!userId) {
      throw new BadRequestException('User id is required');
    }

    await this.ensureTable();
    const color = await this.productColorSelect();

    return this.databaseService.request((request) =>
      request.input('userId', sql.UniqueIdentifier, userId).query(`
        SELECT
          CONVERT(varchar(36), sp.saved_id) AS savedId,
          sp.saved_at AS savedAt,
          CONVERT(varchar(36), p.product_id) AS id,
          p.name,
          p.description,
          CAST(p.price AS float) AS price,
          p.stock_qty AS qty,
          p.brand,
          ${color.select},
          p.avg_rating AS avgRating,
          p.is_active AS isActive,
          c.name AS category,
          c.slug AS categorySlug,
          c.category_id AS categoryId,
          g.gender_id AS genderId,
          g.label AS gender,
          img.image_url AS imageUrl,
          sizes.sizes AS size
        FROM SAVED_PRODUCTS sp
        INNER JOIN PRODUCTS p ON p.product_id = sp.product_id
        INNER JOIN CATEGORIES c ON c.category_id = p.category_id
        LEFT JOIN GENDERS g ON g.gender_id = p.gender_id
        ${color.join}
        OUTER APPLY (
          SELECT TOP 1 image_url
          FROM PRODUCT_IMAGES pi
          WHERE pi.product_id = p.product_id
          ORDER BY pi.is_primary DESC, pi.display_order ASC
        ) img
        OUTER APPLY (
          SELECT STRING_AGG(ss.label, ', ') WITHIN GROUP (ORDER BY ss.sort_order) AS sizes
          FROM PRODUCT_SIZE_STOCK pss
          INNER JOIN SIZE_STANDARDS ss ON ss.size_id = pss.size_id
          WHERE pss.product_id = p.product_id AND pss.stock_qty > 0
        ) sizes
        WHERE sp.user_id = @userId
        ORDER BY sp.saved_at DESC
      `),
    );
  }

  async toggle(userId?: string, productId?: string) {
    if (!userId || !productId) {
      throw new BadRequestException('User and product are required');
    }

    await this.ensureTable();

    const existing = await this.databaseService.request<{ count: number }>((request) =>
      request
        .input('userId', sql.UniqueIdentifier, userId)
        .input('productId', sql.UniqueIdentifier, productId).query(`
          SELECT COUNT(*) AS count
          FROM SAVED_PRODUCTS
          WHERE user_id = @userId AND product_id = @productId
        `),
    );

    if (Number(existing[0]?.count ?? 0) > 0) {
      await this.remove(userId, productId);
      return { productId, isSaved: false };
    }

    await this.databaseService.request((request) =>
      request
        .input('userId', sql.UniqueIdentifier, userId)
        .input('productId', sql.UniqueIdentifier, productId).query(`
          INSERT INTO SAVED_PRODUCTS (user_id, product_id)
          VALUES (@userId, @productId)
        `),
    );

    return { productId, isSaved: true };
  }

  async remove(userId?: string, productId?: string) {
    if (!userId || !productId) {
      throw new BadRequestException('User and product are required');
    }

    await this.ensureTable();

    await this.databaseService.request((request) =>
      request
        .input('userId', sql.UniqueIdentifier, userId)
        .input('productId', sql.UniqueIdentifier, productId).query(`
          DELETE FROM SAVED_PRODUCTS
          WHERE user_id = @userId AND product_id = @productId
        `),
    );

    return { productId, isSaved: false };
  }

  async countForUser(userId: string) {
    await this.ensureTable();

    const rows = await this.databaseService.request<{ count: number }>((request) =>
      request.input('userId', sql.UniqueIdentifier, userId).query(`
        SELECT COUNT(*) AS count
        FROM SAVED_PRODUCTS
        WHERE user_id = @userId
      `),
    );

    return Number(rows[0]?.count ?? 0);
  }

  private async productColorSelect() {
    const hasColorId = await this.databaseService.columnExists('PRODUCTS', 'color_id');

    if (hasColorId) {
      return {
        join: `
        LEFT JOIN PRESET_COLORS pc ON pc.color_id = p.color_id
        LEFT JOIN COLOR_FAMILIES cf ON cf.family_id = pc.family_id`,
        select: `
          p.color_id AS colorId,
          pc.color_name AS colorName,
          pc.color_hex AS colorHex,
          cf.family_id AS colorFamilyId,
          cf.label AS colorFamily,
          cf.label AS color`,
      };
    }

    return {
      join: '',
      select: `
          NULL AS colorId,
          p.color_name AS colorName,
          p.color_hex AS colorHex,
          NULL AS colorFamilyId,
          NULL AS colorFamily,
          p.color_name AS color`,
    };
  }
}
