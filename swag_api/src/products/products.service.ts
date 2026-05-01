import { BadRequestException, Injectable } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';
import { DatabaseService } from '../database/database.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

type UploadedProductFile = {
  filename: string;
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
    const inserted = await this.databaseService.request((request) =>
      request
        .input('categoryId', sql.SmallInt, createProductDto.categoryId)
        .input('genderId', sql.TinyInt, createProductDto.genderId ?? null)
        .input('name', sql.NVarChar(255), createProductDto.name)
        .input('description', sql.NVarChar(sql.MAX), createProductDto.description ?? null)
        .input('price', sql.Decimal(10, 2), Number(createProductDto.price))
        .input('stockQty', sql.Int, quantity)
        .input('brand', sql.NVarChar(100), createProductDto.brand ?? null)
        .input('colorHex', sql.NVarChar(7), createProductDto.colorHex ?? null)
        .input('colorName', sql.NVarChar(100), createProductDto.colorName ?? null)
        .input('isActive', sql.Bit, createProductDto.isActive ?? quantity > 0)
        .query(`
          INSERT INTO PRODUCTS (
            category_id, gender_id, name, description, price, stock_qty,
            brand, color_hex, color_name, is_active
          )
          OUTPUT CONVERT(varchar(36), inserted.product_id) AS id
          VALUES (
            @categoryId, @genderId, @name, @description, @price, @stockQty,
            @brand, @colorHex, @colorName, @isActive
          )
        `),
    );

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
    const [categories, sizes, garmentTypes, genders, palettes] = await Promise.all([
      this.databaseService.query(`
        SELECT
          category_id AS id,
          name,
          slug,
          display_order AS displayOrder
        FROM CATEGORIES
        ORDER BY display_order ASC, name ASC
      `),
      this.databaseService.query(`
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
      `),
      this.databaseService.query(`
        SELECT garment_type_id AS id, label
        FROM SIZE_GARMENT_TYPES
        ORDER BY garment_type_id ASC
      `),
      this.databaseService.query(`
        SELECT gender_id AS id, label
        FROM GENDERS
        ORDER BY gender_id ASC
      `),
      this.databaseService.query(`
        SELECT palette_id AS id, label, depth, undertone
        FROM SKIN_TONE_PALETTES
        ORDER BY palette_id ASC
      `),
    ]);

    return { categories, sizes, garmentTypes, genders, palettes };
  }

  async measurementDefaults(sizeId: number, garmentTypeId: number) {
    if (!sizeId || !garmentTypeId) {
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
    return this.databaseService.query(`
      SELECT
        CONVERT(varchar(36), p.product_id) AS id,
        p.name,
        p.description,
        CAST(p.price AS float) AS price,
        p.stock_qty AS qty,
        p.brand,
        p.color_name AS color,
        p.color_hex AS colorHex,
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
    const rows = await this.databaseService.request((request) =>
      request.input('id', sql.UniqueIdentifier, id).query(`
        SELECT
          CONVERT(varchar(36), p.product_id) AS id,
          p.name,
          p.description,
          CAST(p.price AS float) AS price,
          p.stock_qty AS qty,
          p.brand,
          p.color_name AS color,
          p.color_hex AS colorHex,
          p.avg_rating AS avgRating,
          p.is_active AS isActive,
          p.created_at AS createdAt,
          c.name AS category,
          c.slug AS categorySlug,
          c.category_id AS categoryId,
          g.gender_id AS genderId,
          g.label AS gender,
          stock.size_id AS sizeId,
          stock.stock_qty AS sizeQty,
          img.image_url AS imageUrl
        FROM PRODUCTS p
        INNER JOIN CATEGORIES c ON c.category_id = p.category_id
        LEFT JOIN GENDERS g ON g.gender_id = p.gender_id
        OUTER APPLY (
          SELECT TOP 1 size_id, stock_qty
          FROM PRODUCT_SIZE_STOCK pss
          WHERE pss.product_id = p.product_id
          ORDER BY stock_qty DESC
        ) stock
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

    const measurements = await this.databaseService.request((request) =>
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
    );

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

    return {
      ...product,
      garmentTypeId: measurements[0]?.garmentTypeId ?? null,
      images,
      measurements,
    };
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    this.validateProduct(updateProductDto);
    const quantity = Number(updateProductDto.quantity ?? 0);

    await this.databaseService.request((request) =>
      request
        .input('id', sql.UniqueIdentifier, id)
        .input('categoryId', sql.SmallInt, updateProductDto.categoryId)
        .input('genderId', sql.TinyInt, updateProductDto.genderId ?? null)
        .input('name', sql.NVarChar(255), updateProductDto.name)
        .input('description', sql.NVarChar(sql.MAX), updateProductDto.description ?? null)
        .input('price', sql.Decimal(10, 2), Number(updateProductDto.price))
        .input('stockQty', sql.Int, quantity)
        .input('brand', sql.NVarChar(100), updateProductDto.brand ?? null)
        .input('colorHex', sql.NVarChar(7), updateProductDto.colorHex ?? null)
        .input('colorName', sql.NVarChar(100), updateProductDto.colorName ?? null)
        .input('isActive', sql.Bit, updateProductDto.isActive ?? quantity > 0)
        .query(`
          UPDATE PRODUCTS
          SET
            category_id = @categoryId,
            gender_id = @genderId,
            name = @name,
            description = @description,
            price = @price,
            stock_qty = @stockQty,
            brand = @brand,
            color_hex = @colorHex,
            color_name = @colorName,
            is_active = @isActive
          WHERE product_id = @id
        `),
    );

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

  private async saveProductMeasurements(
    productId: string,
    productDto: CreateProductDto | UpdateProductDto,
  ) {
    if (!productDto.sizeId || !productDto.garmentTypeId || !productDto.measurements?.length) {
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
