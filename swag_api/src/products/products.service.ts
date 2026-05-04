import { BadRequestException, Injectable } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';
import { DatabaseService } from '../database/database.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

type UploadedProductFile = {
  filename: string;
};

type ProductColorSchema = {
  hasColorId: boolean;
  hasLegacyColorName: boolean;
  hasLegacyColorHex: boolean;
};

@Injectable()
export class ProductsService {
  constructor(private readonly databaseService: DatabaseService) {}

  uploadedImages(files: UploadedProductFile[]) {
    return files.map((file) => ({
      filename: file.filename,
      imageUrl: `http://localhost:5000/uploads/products/${file.filename}`,
    }));
  }

  async create(createProductDto: CreateProductDto) {
    this.validateProduct(createProductDto);

    const quantity = Number(createProductDto.quantity ?? 0);
    const colorSchema = await this.productColorSchema();
    const colorInputs = await this.resolveColorInputs(createProductDto, colorSchema);
    const colorColumns = [
      colorSchema.hasColorId ? 'color_id' : null,
      colorSchema.hasLegacyColorHex ? 'color_hex' : null,
      colorSchema.hasLegacyColorName ? 'color_name' : null,
    ].filter(Boolean);
    const colorValues = [
      colorSchema.hasColorId ? '@colorId' : null,
      colorSchema.hasLegacyColorHex ? '@colorHex' : null,
      colorSchema.hasLegacyColorName ? '@colorName' : null,
    ].filter(Boolean);

    const inserted = await this.databaseService.request((request) => {
      request
        .input('categoryId', sql.SmallInt, createProductDto.categoryId)
        .input('genderId', sql.TinyInt, createProductDto.genderId ?? null)
        .input('name', sql.NVarChar(255), createProductDto.name)
        .input('description', sql.NVarChar(sql.MAX), createProductDto.description ?? null)
        .input('price', sql.Decimal(10, 2), Number(createProductDto.price))
        .input('stockQty', sql.Int, quantity)
        .input('brand', sql.NVarChar(100), createProductDto.brand ?? null);

      if (colorSchema.hasColorId) request.input('colorId', sql.SmallInt, colorInputs.colorId);
      if (colorSchema.hasLegacyColorHex) request.input('colorHex', sql.NVarChar(7), colorInputs.colorHex);
      if (colorSchema.hasLegacyColorName) request.input('colorName', sql.NVarChar(100), colorInputs.colorName);

      return request.input('isActive', sql.Bit, createProductDto.isActive ?? quantity > 0).query(`
          INSERT INTO PRODUCTS (
            category_id, gender_id, name, description, price, stock_qty,
            brand${colorColumns.length ? `, ${colorColumns.join(', ')}` : ''}, is_active
          )
          OUTPUT CONVERT(varchar(36), inserted.product_id) AS id
          VALUES (
            @categoryId, @genderId, @name, @description, @price, @stockQty,
            @brand${colorValues.length ? `, ${colorValues.join(', ')}` : ''}, @isActive
          )
        `);
    });

    const id = (inserted[0] as { id: string }).id;

    if (createProductDto.sizeId) {
      await this.databaseService.request((request) =>
        request
          .input('productId', sql.UniqueIdentifier, id)
          .input('sizeId', sql.SmallInt, createProductDto.sizeId)
          .input('stockQty', sql.Int, quantity)
          .query(`
            INSERT INTO PRODUCT_SIZE_STOCK (product_id, size_id, stock_qty)
            VALUES (@productId, @sizeId, @stockQty)
          `),
      );
    }

    await this.saveProductImages(id, this.getImageUrls(createProductDto));

    await this.saveProductMeasurements(id, createProductDto);

    return this.findOne(id);
  }

  private getImageUrls(productDto: CreateProductDto | UpdateProductDto) {
    return [
      ...(productDto.imageUrls ?? []),
      ...(productDto.imageUrl ? [productDto.imageUrl] : []),
    ].filter(Boolean);
  }

  private async saveProductImages(productId: string, imageUrls: string[]) {
    if (!imageUrls.length) {
      return;
    }

    await this.databaseService.request((request) =>
      request.input('productId', sql.UniqueIdentifier, productId).query(`
        DELETE FROM PRODUCT_IMAGES
        WHERE product_id = @productId
      `),
    );

    for (const [index, imageUrl] of imageUrls.entries()) {
      await this.databaseService.request((request) =>
        request
          .input('productId', sql.UniqueIdentifier, productId)
          .input('imageUrl', sql.NVarChar(500), imageUrl)
          .input('isPrimary', sql.Bit, index === 0)
          .input('displayOrder', sql.Int, index)
          .query(`
            INSERT INTO PRODUCT_IMAGES (product_id, image_url, is_primary, display_order)
            VALUES (@productId, @imageUrl, @isPrimary, @displayOrder)
          `),
      );
    }
  }

  async lookups() {
    await this.ensureColorLookups();

    const [hasGarmentTypes, hasPalettes, hasSizeRanges, hasPresetColors, hasColorFamilies] = await Promise.all([
      this.databaseService.tableExists('SIZE_GARMENT_TYPES'),
      this.databaseService.tableExists('SKIN_TONE_PALETTES'),
      this.databaseService.columnExists('SIZE_STANDARDS', 'chest_cm_min'),
      this.databaseService.tableExists('PRESET_COLORS'),
      this.databaseService.tableExists('COLOR_FAMILIES'),
    ]);

    const sizeQuery = hasSizeRanges
      ? `
        SELECT
          size_id AS id,
          label,
          label_local AS labelLocal,
          CAST(chest_cm_min AS float) AS chestCmMin,
          CAST(chest_cm_max AS float) AS chestCmMax,
          CAST(waist_cm_min AS float) AS waistCmMin,
          CAST(waist_cm_max AS float) AS waistCmMax,
          CAST(hip_cm_min AS float) AS hipCmMin,
          CAST(hip_cm_max AS float) AS hipCmMax,
          CAST(height_cm_min AS float) AS heightCmMin,
          CAST(height_cm_max AS float) AS heightCmMax,
          CAST(weight_kg_min AS float) AS weightKgMin,
          CAST(weight_kg_max AS float) AS weightKgMax,
          sort_order AS sortOrder
        FROM SIZE_STANDARDS
        ORDER BY sort_order ASC
      `
      : `
        SELECT
          size_id AS id,
          label,
          NULL AS labelLocal,
          CAST(chest_cm AS float) AS chestCmMin,
          CAST(chest_cm AS float) AS chestCmMax,
          CAST(waist_cm AS float) AS waistCmMin,
          CAST(waist_cm AS float) AS waistCmMax,
          CAST(hip_cm AS float) AS hipCmMin,
          CAST(hip_cm AS float) AS hipCmMax,
          NULL AS heightCmMin,
          NULL AS heightCmMax,
          NULL AS weightKgMin,
          NULL AS weightKgMax,
          sort_order AS sortOrder
        FROM SIZE_STANDARDS
        ORDER BY sort_order ASC
      `;

    const [categories, sizes, dbGarmentTypes, genders, palettes, colors, colorFamilies] = await Promise.all([
      this.databaseService.query(`
        SELECT
          category_id AS id,
          name,
          slug,
          display_order AS displayOrder
        FROM CATEGORIES
        ORDER BY display_order ASC, name ASC
      `),
      this.databaseService.query(sizeQuery),
      hasGarmentTypes ? this.databaseService.query(`
        SELECT garment_type_id AS id, label
        FROM SIZE_GARMENT_TYPES
        ORDER BY garment_type_id ASC
      `) : Promise.resolve([]),
      this.databaseService.query(`
        SELECT gender_id AS id, label
        FROM GENDERS
        ORDER BY gender_id ASC
      `),
      hasPalettes ? this.databaseService.query(`
        SELECT palette_id AS id, label, depth, undertone
        FROM SKIN_TONE_PALETTES
        ORDER BY palette_id ASC
      `) : Promise.resolve([]),
      hasPresetColors ? this.databaseService.query(`
        SELECT
          pc.color_id AS id,
          pc.color_name AS name,
          pc.color_hex AS hex,
          cf.family_id AS familyId,
          cf.label AS family
        FROM PRESET_COLORS pc
        INNER JOIN COLOR_FAMILIES cf ON cf.family_id = pc.family_id
        ORDER BY cf.label ASC, pc.color_name ASC
      `) : Promise.resolve([]),
      hasColorFamilies ? this.databaseService.query(`
        SELECT family_id AS id, label
        FROM COLOR_FAMILIES
        ORDER BY label ASC
      `) : Promise.resolve([]),
    ]);

    const garmentTypes = hasGarmentTypes
      ? dbGarmentTypes
      : categories.map((category: { id: number | string; name: string }) => ({
          id: category.id,
          label: category.name,
        }));

    return { categories, sizes, garmentTypes, genders, palettes, colors, colorFamilies };
  }

  async measurementDefaults(sizeId: number, garmentTypeId: number) {
    if (
      !sizeId ||
      !garmentTypeId ||
      !(await this.databaseService.tableExists('SIZE_GARMENT_MEASUREMENTS'))
    ) {
      return [];
    }

    return this.databaseService.request((request) =>
      request
        .input('sizeId', sql.SmallInt, sizeId)
        .input('garmentTypeId', sql.TinyInt, garmentTypeId)
        .query(`
          SELECT
            measurement_name AS measurementName,
            CAST(value_cm AS float) AS valueCm
          FROM SIZE_GARMENT_MEASUREMENTS
          WHERE size_id = @sizeId AND garment_type_id = @garmentTypeId
          ORDER BY measurement_name ASC
        `),
    );
  }

  async findAll() {
    const color = await this.productColorSelect();

    return this.databaseService.query(`
      SELECT
        CONVERT(varchar(36), p.product_id) AS id,
        p.name,
        p.description,
        CAST(p.price AS float) AS price,
        p.stock_qty AS qty,
        p.brand,
        ${color.select},
        p.avg_rating AS avgRating,
        p.is_active AS isActive,
        p.created_at AS createdAt,
        c.name AS category,
        c.slug AS categorySlug,
        c.category_id AS categoryId,
        g.gender_id AS genderId,
        g.label AS gender,
        img.image_url AS imageUrl,
        images.imageCount,
        sizes.sizes AS size
      FROM PRODUCTS p
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
        SELECT COUNT(*) AS imageCount
        FROM PRODUCT_IMAGES pi
        WHERE pi.product_id = p.product_id
      ) images
      OUTER APPLY (
        SELECT STRING_AGG(ss.label, ', ') WITHIN GROUP (ORDER BY ss.sort_order) AS sizes
        FROM PRODUCT_SIZE_STOCK pss
        INNER JOIN SIZE_STANDARDS ss ON ss.size_id = pss.size_id
        WHERE pss.product_id = p.product_id AND pss.stock_qty > 0
      ) sizes
      ORDER BY p.created_at DESC
    `);
  }

  async findOne(id: string) {
    const color = await this.productColorSelect();

    const rows = await this.databaseService.request((request) =>
      request.input('id', sql.UniqueIdentifier, id).query(`
        SELECT
          CONVERT(varchar(36), p.product_id) AS id,
          p.name,
          p.description,
          CAST(p.price AS float) AS price,
          p.stock_qty AS qty,
          p.brand,
          ${color.select},
          p.avg_rating AS avgRating,
          p.is_active AS isActive,
          p.created_at AS createdAt,
          c.name AS category,
          c.slug AS categorySlug,
          c.category_id AS categoryId,
          g.gender_id AS genderId,
          g.label AS gender,
          stock.size_id AS sizeId,
          stock.label AS size,
          stock.stock_qty AS sizeQty,
          img.image_url AS imageUrl,
          sizes.sizes AS sizes
        FROM PRODUCTS p
        INNER JOIN CATEGORIES c ON c.category_id = p.category_id
        LEFT JOIN GENDERS g ON g.gender_id = p.gender_id
        ${color.join}
        OUTER APPLY (
          SELECT TOP 1 pss.size_id, ss.label, pss.stock_qty
          FROM PRODUCT_SIZE_STOCK pss
          INNER JOIN SIZE_STANDARDS ss ON ss.size_id = pss.size_id
          WHERE pss.product_id = p.product_id
          ORDER BY stock_qty DESC
        ) stock
        OUTER APPLY (
          SELECT STRING_AGG(ss.label, ', ') WITHIN GROUP (ORDER BY ss.sort_order) AS sizes
          FROM PRODUCT_SIZE_STOCK pss
          INNER JOIN SIZE_STANDARDS ss ON ss.size_id = pss.size_id
          WHERE pss.product_id = p.product_id AND pss.stock_qty > 0
        ) sizes
        OUTER APPLY (
          SELECT TOP 1 image_url
          FROM PRODUCT_IMAGES pi
          WHERE pi.product_id = p.product_id
          ORDER BY pi.is_primary DESC, pi.display_order ASC
        ) img
        WHERE p.product_id = @id
      `),
    );

    const product = rows[0];

    if (!product) {
      return null;
    }

    const hasMeasurements = await this.databaseService.tableExists('PRODUCT_MEASUREMENTS');
    const hasGarmentTypes = await this.databaseService.tableExists('SIZE_GARMENT_TYPES');
    const measurements =
      hasMeasurements && hasGarmentTypes
        ? await this.databaseService.request((request) =>
            request.input('productId', sql.UniqueIdentifier, id).query(`
              SELECT
                pm.size_id AS sizeId,
                ss.label AS sizeLabel,
                pm.garment_type_id AS garmentTypeId,
                sgt.label AS garmentType,
                pm.measurement_name AS measurementName,
                CAST(pm.value_cm AS float) AS valueCm
              FROM PRODUCT_MEASUREMENTS pm
              INNER JOIN SIZE_STANDARDS ss ON ss.size_id = pm.size_id
              INNER JOIN SIZE_GARMENT_TYPES sgt ON sgt.garment_type_id = pm.garment_type_id
              WHERE pm.product_id = @productId
              ORDER BY ss.sort_order, sgt.garment_type_id, pm.measurement_name
            `),
          )
        : [];

    const images = await this.databaseService.request((request) =>
      request.input('productId', sql.UniqueIdentifier, id).query(`
        SELECT
          CONVERT(varchar(36), image_id) AS id,
          image_url AS imageUrl,
          is_primary AS isPrimary,
          display_order AS displayOrder
        FROM PRODUCT_IMAGES
        WHERE product_id = @productId
        ORDER BY is_primary DESC, display_order ASC
      `),
    );

    const sizeStock = await this.databaseService.request((request) =>
      request.input('productId', sql.UniqueIdentifier, id).query(`
        SELECT
          pss.size_id AS sizeId,
          ss.label AS label,
          pss.stock_qty AS stockQty
        FROM PRODUCT_SIZE_STOCK pss
        INNER JOIN SIZE_STANDARDS ss ON ss.size_id = pss.size_id
        WHERE pss.product_id = @productId
        ORDER BY ss.sort_order ASC
      `),
    );

    return {
      ...product,
      garmentTypeId: measurements[0]?.garmentTypeId ?? null,
      images,
      sizeStock,
      measurements,
    };
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    this.validateProduct(updateProductDto);
    const quantity = Number(updateProductDto.quantity ?? 0);
    const colorSchema = await this.productColorSchema();
    const colorInputs = await this.resolveColorInputs(updateProductDto, colorSchema);
    const colorAssignments = [
      colorSchema.hasColorId ? 'color_id = @colorId' : null,
      colorSchema.hasLegacyColorHex ? 'color_hex = @colorHex' : null,
      colorSchema.hasLegacyColorName ? 'color_name = @colorName' : null,
    ].filter(Boolean);

    await this.databaseService.request((request) => {
      request
        .input('id', sql.UniqueIdentifier, id)
        .input('categoryId', sql.SmallInt, updateProductDto.categoryId)
        .input('genderId', sql.TinyInt, updateProductDto.genderId ?? null)
        .input('name', sql.NVarChar(255), updateProductDto.name)
        .input('description', sql.NVarChar(sql.MAX), updateProductDto.description ?? null)
        .input('price', sql.Decimal(10, 2), Number(updateProductDto.price))
        .input('stockQty', sql.Int, quantity)
        .input('brand', sql.NVarChar(100), updateProductDto.brand ?? null);

      if (colorSchema.hasColorId) request.input('colorId', sql.SmallInt, colorInputs.colorId);
      if (colorSchema.hasLegacyColorHex) request.input('colorHex', sql.NVarChar(7), colorInputs.colorHex);
      if (colorSchema.hasLegacyColorName) request.input('colorName', sql.NVarChar(100), colorInputs.colorName);

      return request.input('isActive', sql.Bit, updateProductDto.isActive ?? quantity > 0).query(`
          UPDATE PRODUCTS
          SET
            category_id = @categoryId,
            gender_id = @genderId,
            name = @name,
            description = @description,
            price = @price,
            stock_qty = @stockQty,
            brand = @brand,
            ${colorAssignments.length ? `${colorAssignments.join(',\n            ')},` : ''}
            is_active = @isActive
          WHERE product_id = @id
        `);
    });

    if (updateProductDto.sizeId) {
      await this.databaseService.request((request) =>
        request
          .input('productId', sql.UniqueIdentifier, id)
          .input('sizeId', sql.SmallInt, updateProductDto.sizeId)
          .input('stockQty', sql.Int, quantity)
          .query(`
            MERGE PRODUCT_SIZE_STOCK AS target
            USING (SELECT @productId AS product_id, @sizeId AS size_id, @stockQty AS stock_qty) AS source
            ON target.product_id = source.product_id AND target.size_id = source.size_id
            WHEN MATCHED THEN
              UPDATE SET stock_qty = source.stock_qty
            WHEN NOT MATCHED THEN
              INSERT (product_id, size_id, stock_qty)
              VALUES (source.product_id, source.size_id, source.stock_qty);
          `),
      );
    }

    await this.saveProductImages(id, this.getImageUrls(updateProductDto));

    await this.saveProductMeasurements(id, updateProductDto);

    return this.findOne(id);
  }

  async remove(id: string) {
    await this.databaseService.request((request) =>
      request.input('id', sql.UniqueIdentifier, id).query(`
        UPDATE PRODUCTS
        SET is_active = 0
        WHERE product_id = @id
      `),
    );

    return { id, isActive: false };
  }

  private validateProduct(productDto: CreateProductDto | UpdateProductDto) {
    if (!productDto.name?.trim()) {
      throw new BadRequestException('Product name is required');
    }

    if (!productDto.categoryId) {
      throw new BadRequestException('Product category is required');
    }

    if (productDto.price === undefined || Number(productDto.price) < 0) {
      throw new BadRequestException('A valid price is required');
    }

    if (productDto.quantity === undefined || Number(productDto.quantity) < 0) {
      throw new BadRequestException('A valid quantity is required');
    }
  }

  private async productColorSchema(): Promise<ProductColorSchema> {
    const [hasColorId, hasLegacyColorName, hasLegacyColorHex] = await Promise.all([
      this.databaseService.columnExists('PRODUCTS', 'color_id'),
      this.databaseService.columnExists('PRODUCTS', 'color_name'),
      this.databaseService.columnExists('PRODUCTS', 'color_hex'),
    ]);

    return { hasColorId, hasLegacyColorName, hasLegacyColorHex };
  }

  private async productColorSelect() {
    const schema = await this.productColorSchema();

    if (schema.hasColorId) {
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

  private async resolveColorInputs(
    productDto: CreateProductDto | UpdateProductDto,
    schema: ProductColorSchema,
  ) {
    const colorId = productDto.colorId ? Number(productDto.colorId) : null;

    if (schema.hasColorId && colorId) {
      const rows = await this.databaseService.request<{
        colorName: string;
        colorHex: string;
      }>((request) =>
        request.input('colorId', sql.SmallInt, colorId).query(`
          SELECT TOP 1 color_name AS colorName, color_hex AS colorHex
          FROM PRESET_COLORS
          WHERE color_id = @colorId
        `),
      );

      if (!rows[0]) {
        throw new BadRequestException('Selected color does not exist');
      }

      return {
        colorId,
        colorName: rows[0].colorName,
        colorHex: rows[0].colorHex,
      };
    }

    return {
      colorId,
      colorName: productDto.colorName ?? null,
      colorHex: productDto.colorHex ?? null,
    };
  }

  private async ensureColorLookups() {
    const [hasColorFamilies, hasPresetColors, hasColorTones] = await Promise.all([
      this.databaseService.tableExists('COLOR_FAMILIES'),
      this.databaseService.tableExists('PRESET_COLORS'),
      this.databaseService.tableExists('COLOR_TONES'),
    ]);

    if (!hasColorFamilies || !hasPresetColors || !hasColorTones) {
      return;
    }

    await this.databaseService.query(`
      IF NOT EXISTS (SELECT 1 FROM COLOR_FAMILIES)
      BEGIN
        INSERT INTO COLOR_FAMILIES (label)
        VALUES
          ('Red'), ('Orange'), ('Yellow'), ('Green'), ('Blue'),
          ('Purple'), ('Pink'), ('Brown'), ('Black'), ('White'),
          ('Gray'), ('Beige'), ('Gold'), ('Silver');
      END
    `);

    await this.databaseService.query(`
      IF NOT EXISTS (SELECT 1 FROM COLOR_TONES)
      BEGIN
        INSERT INTO COLOR_TONES (label)
        VALUES ('Classic'), ('Light'), ('Dark');
      END
    `);

    await this.databaseService.query(`
      IF NOT EXISTS (SELECT 1 FROM PRESET_COLORS)
      BEGIN
        INSERT INTO PRESET_COLORS (color_name, color_hex, tone_id, family_id)
        SELECT colorName, colorHex, ct.tone_id, cf.family_id
        FROM (VALUES
          ('Red', '#DC2626', 'Red', 'Classic'),
          ('Burgundy', '#800020', 'Red', 'Dark'),
          ('Maroon', '#7F1D1D', 'Red', 'Dark'),
          ('Coral', '#F97366', 'Orange', 'Light'),
          ('Orange', '#F97316', 'Orange', 'Classic'),
          ('Mustard', '#D97706', 'Yellow', 'Dark'),
          ('Yellow', '#FACC15', 'Yellow', 'Classic'),
          ('Olive', '#6B8E23', 'Green', 'Dark'),
          ('Emerald', '#059669', 'Green', 'Light'),
          ('Navy', '#1E3A8A', 'Blue', 'Dark'),
          ('Blue', '#2563EB', 'Blue', 'Classic'),
          ('Lavender', '#A78BFA', 'Purple', 'Light'),
          ('Purple', '#7C3AED', 'Purple', 'Classic'),
          ('Pink', '#EC4899', 'Pink', 'Classic'),
          ('Blush', '#F9A8D4', 'Pink', 'Light'),
          ('Tan', '#D2B48C', 'Brown', 'Light'),
          ('Brown', '#7C2D12', 'Brown', 'Classic'),
          ('Black', '#111111', 'Black', 'Classic'),
          ('White', '#FFFFFF', 'White', 'Classic'),
          ('Gray', '#6B7280', 'Gray', 'Classic'),
          ('Cream', '#F5F5DC', 'Beige', 'Light'),
          ('Beige', '#D6C7A1', 'Beige', 'Classic'),
          ('Gold', '#D4AF37', 'Gold', 'Classic'),
          ('Silver', '#C0C0C0', 'Silver', 'Classic')
        ) AS seed(colorName, colorHex, familyLabel, toneLabel)
        INNER JOIN COLOR_FAMILIES cf ON cf.label = seed.familyLabel
        INNER JOIN COLOR_TONES ct ON ct.label = seed.toneLabel;
      END
    `);
  }

  private async saveProductMeasurements(
    productId: string,
    productDto: CreateProductDto | UpdateProductDto,
  ) {
    if (!productDto.sizeId || !productDto.garmentTypeId || !productDto.measurements?.length) {
      return;
    }

    const [hasMeasurements, hasGarmentTypes] = await Promise.all([
      this.databaseService.tableExists('PRODUCT_MEASUREMENTS'),
      this.databaseService.tableExists('SIZE_GARMENT_TYPES'),
    ]);

    if (!hasMeasurements || !hasGarmentTypes) {
      return;
    }

    const sizeId = Number(productDto.sizeId);
    const garmentTypeId = Number(productDto.garmentTypeId);

    await this.databaseService.request((request) =>
      request
        .input('productId', sql.UniqueIdentifier, productId)
        .input('sizeId', sql.SmallInt, sizeId)
        .input('garmentTypeId', sql.TinyInt, garmentTypeId)
        .query(`
          DELETE FROM PRODUCT_MEASUREMENTS
          WHERE product_id = @productId
            AND size_id = @sizeId
            AND garment_type_id = @garmentTypeId
        `),
    );

    for (const measurement of productDto.measurements) {
      if (!measurement.measurementName || measurement.valueCm === '' || measurement.valueCm === undefined) {
        continue;
      }

      await this.databaseService.request((request) =>
        request
          .input('productId', sql.UniqueIdentifier, productId)
          .input('sizeId', sql.SmallInt, sizeId)
          .input('garmentTypeId', sql.TinyInt, garmentTypeId)
          .input('measurementName', sql.NVarChar(50), measurement.measurementName)
          .input('valueCm', sql.Decimal(5, 2), Number(measurement.valueCm))
          .query(`
            INSERT INTO PRODUCT_MEASUREMENTS (
              product_id, size_id, garment_type_id, measurement_name, value_cm
            )
            VALUES (
              @productId, @sizeId, @garmentTypeId, @measurementName, @valueCm
            )
          `),
      );
    }
  }
}
