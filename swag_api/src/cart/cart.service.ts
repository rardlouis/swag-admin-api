import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';
import { DatabaseService } from '../database/database.service';

type AddCartItemBody = {
  userId?: string;
  productId?: string;
  sizeId?: number | string;
  quantity?: number | string;
};

type CheckoutBody = {
  userId?: string;
  selectedCartItemIds?: string;
  shippingFee?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  recipientName?: string;
  phone?: string;
  street?: string;
  barangay?: string;
  city?: string;
  province?: string;
  region?: string;
  postalCode?: string;
  shippingAddress?: string;
};

type UploadedReceiptFile = {
  filename: string;
};

@Injectable()
export class CartService {
  constructor(private readonly databaseService: DatabaseService) {}

  async items(userId?: string) {
    if (!userId) {
      throw new BadRequestException('User id is required');
    }

    const hasColorId = await this.databaseService.columnExists('PRODUCTS', 'color_id');
    const productColorJoin = hasColorId
      ? 'LEFT JOIN PRESET_COLORS pc ON pc.color_id = p.color_id LEFT JOIN COLOR_FAMILIES cf ON cf.family_id = pc.family_id'
      : '';
    const productColorSelect = hasColorId ? 'cf.label AS color' : 'p.color_name AS color';

    return this.databaseService.request((request) =>
      request.input('userId', sql.UniqueIdentifier, userId).query(`
        SELECT
          CONVERT(varchar(36), ci.cart_item_id) AS cartItemId,
          CONVERT(varchar(36), ci.product_id) AS productId,
          ci.size_id AS sizeId,
          ss.label AS size,
          ci.quantity,
          p.name AS productName,
          p.description,
          CAST(p.price AS float) AS unitPrice,
          ${productColorSelect},
          pi.image_url AS imageUrl,
          pss.stock_qty AS stockQty,
          ci.added_at AS addedAt
        FROM CART_ITEMS ci
        INNER JOIN PRODUCTS p ON p.product_id = ci.product_id
        INNER JOIN SIZE_STANDARDS ss ON ss.size_id = ci.size_id
        INNER JOIN PRODUCT_SIZE_STOCK pss ON pss.product_id = ci.product_id AND pss.size_id = ci.size_id
        ${productColorJoin}
        OUTER APPLY (
          SELECT TOP 1 image_url
          FROM PRODUCT_IMAGES
          WHERE product_id = p.product_id
          ORDER BY is_primary DESC, display_order ASC
        ) pi
        WHERE ci.user_id = @userId
        ORDER BY ci.added_at DESC
      `),
    );
  }

  async addItem(body: AddCartItemBody) {
    const quantity = Math.max(1, Number(body.quantity ?? 1));

    if (!body.userId || !body.productId || !body.sizeId || !Number.isFinite(quantity)) {
      throw new BadRequestException('User, product, size, and quantity are required');
    }

    const stockRows = await this.databaseService.request<{ productStockQty: number; stockQty: number | null; cartQty: number }>((request) =>
      request
        .input('userId', sql.UniqueIdentifier, body.userId)
        .input('productId', sql.UniqueIdentifier, body.productId)
        .input('sizeId', sql.SmallInt, Number(body.sizeId)).query(`
          SELECT
            p.stock_qty AS productStockQty,
            pss.stock_qty AS stockQty,
            ISNULL(ci.quantity, 0) AS cartQty
          FROM PRODUCTS p
          LEFT JOIN PRODUCT_SIZE_STOCK pss
            ON pss.product_id = p.product_id
            AND pss.size_id = @sizeId
          LEFT JOIN CART_ITEMS ci
            ON ci.user_id = @userId
            AND ci.product_id = p.product_id
            AND ci.size_id = @sizeId
          WHERE p.product_id = @productId
            AND p.is_active = 1
        `),
    );

    const productStockQty = Number(stockRows[0]?.productStockQty ?? 0);
    const stockQty = Number(stockRows[0]?.stockQty ?? productStockQty);
    const cartQty = Number(stockRows[0]?.cartQty ?? 0);

    if (cartQty > 0) {
      throw new BadRequestException('Item is already in cart');
    }

    if (!stockRows[0] || stockQty < cartQty + quantity) {
      throw new BadRequestException('Selected size is not available');
    }

    await this.databaseService.request((request) =>
      request
        .input('productId', sql.UniqueIdentifier, body.productId)
        .input('sizeId', sql.SmallInt, Number(body.sizeId))
        .input('stockQty', sql.Int, stockQty).query(`
          MERGE PRODUCT_SIZE_STOCK AS target
          USING (
            SELECT
              @productId AS product_id,
              @sizeId AS size_id,
              @stockQty AS stock_qty
          ) AS source
          ON target.product_id = source.product_id
            AND target.size_id = source.size_id
          WHEN MATCHED AND target.stock_qty < source.stock_qty THEN
            UPDATE SET stock_qty = source.stock_qty
          WHEN NOT MATCHED THEN
            INSERT (product_id, size_id, stock_qty)
            VALUES (source.product_id, source.size_id, source.stock_qty);
        `),
    );

    const rows = await this.databaseService.request((request) =>
      request
        .input('userId', sql.UniqueIdentifier, body.userId)
        .input('productId', sql.UniqueIdentifier, body.productId)
        .input('sizeId', sql.SmallInt, Number(body.sizeId))
        .input('quantity', sql.Int, quantity).query(`
          MERGE CART_ITEMS AS target
          USING (
            SELECT
              @userId AS user_id,
              @productId AS product_id,
              @sizeId AS size_id,
              @quantity AS quantity
          ) AS source
          ON target.user_id = source.user_id
            AND target.product_id = source.product_id
            AND target.size_id = source.size_id
          WHEN MATCHED THEN
            UPDATE SET quantity = target.quantity + source.quantity
          WHEN NOT MATCHED THEN
            INSERT (user_id, product_id, size_id, quantity)
            VALUES (source.user_id, source.product_id, source.size_id, source.quantity)
          OUTPUT
            CONVERT(varchar(36), inserted.cart_item_id) AS id,
            CONVERT(varchar(36), inserted.user_id) AS userId,
            CONVERT(varchar(36), inserted.product_id) AS productId,
            inserted.size_id AS sizeId,
            inserted.quantity AS quantity,
            inserted.added_at AS addedAt;
        `),
    );

    return rows[0];
  }

  async removeItem(cartItemId?: string, userId?: string) {
    if (!cartItemId) {
      throw new BadRequestException('Cart item id is required');
    }

    const deleted = await this.databaseService.request((request) => {
      request.input('cartItemId', sql.UniqueIdentifier, cartItemId);

      if (userId) {
        request.input('userId', sql.UniqueIdentifier, userId);
      }

      return request.query(`
        DELETE FROM CART_ITEMS
        OUTPUT CONVERT(varchar(36), deleted.cart_item_id) AS id
        WHERE cart_item_id = @cartItemId
          ${userId ? 'AND user_id = @userId' : ''}
      `);
    });

    if (!deleted[0]) {
      throw new NotFoundException('Cart item not found');
    }

    return { deleted: true, id: cartItemId };
  }

  async checkout(body: CheckoutBody, file?: UploadedReceiptFile) {
    const userId = body.userId;
    const selectedCartItemIds = this.parseSelectedCartItemIds(body.selectedCartItemIds);
    const shippingFee = Number(body.shippingFee ?? 20);
    const paymentMethod = body.paymentMethod?.trim() || 'GCash';
    const referenceNumber = body.referenceNumber?.trim() ?? '';

    if (!userId) {
      throw new BadRequestException('User id is required');
    }

    if (!selectedCartItemIds.length) {
      throw new BadRequestException('Choose at least one cart item');
    }

    if (paymentMethod.toLowerCase() !== 'gcash') {
      throw new BadRequestException('GCash is the only supported payment method');
    }

    if (!referenceNumber) {
      throw new BadRequestException('GCash reference number is required');
    }

    if (!file) {
      throw new BadRequestException('Payment receipt screenshot is required');
    }

    await this.ensureCheckoutColumns();
    const receiptUrl = `http://localhost:5000/uploads/receipts/${file.filename}`;
    const selectedCartItemIdsJson = JSON.stringify(selectedCartItemIds);
    const address = this.normalizeAddress(body);

    const rows = await this.databaseService.request<{ orderId: string }>((request) =>
      request
        .input('userId', sql.UniqueIdentifier, userId)
        .input('selectedCartItemIdsJson', sql.NVarChar(sql.MAX), selectedCartItemIdsJson)
        .input('shippingFee', sql.Decimal(10, 2), Number.isFinite(shippingFee) ? shippingFee : 20)
        .input('paymentMethod', sql.NVarChar(30), 'GCash')
        .input('referenceNumber', sql.NVarChar(100), referenceNumber)
        .input('receiptUrl', sql.NVarChar(500), receiptUrl)
        .input('recipientName', sql.NVarChar(150), address.recipientName)
        .input('phone', sql.NVarChar(20), address.phone)
        .input('street', sql.NVarChar(255), address.street)
        .input('barangay', sql.NVarChar(100), address.barangay)
        .input('city', sql.NVarChar(100), address.city)
        .input('province', sql.NVarChar(100), address.province)
        .input('region', sql.NVarChar(100), address.region)
        .input('postalCode', sql.NVarChar(10), address.postalCode).query(`
          SET XACT_ABORT ON;

          DECLARE @selected TABLE (cart_item_id uniqueidentifier PRIMARY KEY);
          INSERT INTO @selected (cart_item_id)
          SELECT TRY_CONVERT(uniqueidentifier, [value])
          FROM OPENJSON(@selectedCartItemIdsJson)
          WHERE TRY_CONVERT(uniqueidentifier, [value]) IS NOT NULL;

          IF NOT EXISTS (SELECT 1 FROM @selected)
            THROW 51000, 'Choose at least one cart item', 1;

          IF EXISTS (
            SELECT 1
            FROM @selected s
            LEFT JOIN CART_ITEMS ci ON ci.cart_item_id = s.cart_item_id AND ci.user_id = @userId
            WHERE ci.cart_item_id IS NULL
          )
            THROW 51001, 'One or more cart items were not found', 1;

          IF EXISTS (
            SELECT 1
            FROM CART_ITEMS ci
            INNER JOIN @selected s ON s.cart_item_id = ci.cart_item_id
            INNER JOIN PRODUCT_SIZE_STOCK pss ON pss.product_id = ci.product_id AND pss.size_id = ci.size_id
            WHERE ci.quantity > pss.stock_qty
          )
            THROW 51002, 'One or more cart items are no longer available', 1;

          BEGIN TRANSACTION;

          IF NOT EXISTS (SELECT 1 FROM ORDER_STATUSES WHERE label = 'Order Placed')
          BEGIN
            INSERT INTO ORDER_STATUSES (label) VALUES ('Order Placed');
          END

          DECLARE @statusId tinyint = (
            SELECT TOP 1 status_id
            FROM ORDER_STATUSES
            WHERE label IN ('Order Placed', 'Pending')
            ORDER BY CASE WHEN label = 'Order Placed' THEN 0 ELSE 1 END
          );

          DECLARE @addressId uniqueidentifier = (
            SELECT TOP 1 address_id
            FROM USER_ADDRESSES
            WHERE user_id = @userId
            ORDER BY is_default DESC, created_at DESC
          );

          IF @addressId IS NULL
          BEGIN
            SET @addressId = NEWID();

            INSERT INTO USER_ADDRESSES (
              address_id,
              user_id,
              label,
              recipient_name,
              phone,
              street,
              barangay,
              city,
              province,
              region,
              postal_code,
              is_default,
              created_at
            )
            VALUES (
              @addressId,
              @userId,
              'Home',
              @recipientName,
              @phone,
              @street,
              @barangay,
              @city,
              @province,
              @region,
              @postalCode,
              1,
              GETDATE()
            );
          END

          DECLARE @orderId uniqueidentifier = NEWID();
          DECLARE @subtotal decimal(10, 2) = (
            SELECT SUM(CAST(ci.quantity AS decimal(10, 2)) * p.price)
            FROM CART_ITEMS ci
            INNER JOIN @selected s ON s.cart_item_id = ci.cart_item_id
            INNER JOIN PRODUCTS p ON p.product_id = ci.product_id
          );

          INSERT INTO ORDERS (
            order_id,
            user_id,
            address_id,
            status_id,
            total_amount,
            placed_at,
            updated_at,
            shipping_fee,
            payment_method,
            payment_reference_number,
            payment_receipt_url,
            tracking_number,
            expected_delivery_at
          )
          VALUES (
            @orderId,
            @userId,
            @addressId,
            @statusId,
            @subtotal + @shippingFee,
            GETDATE(),
            GETDATE(),
            @shippingFee,
            @paymentMethod,
            @referenceNumber,
            @receiptUrl,
            CONCAT('AFD', FORMAT(GETDATE(), 'yyyyMMdd'), RIGHT(REPLACE(CONVERT(varchar(36), @orderId), '-', ''), 8)),
            DATEADD(day, 7, GETDATE())
          );

          INSERT INTO ORDER_ITEMS (order_id, product_id, size_id, quantity, unit_price)
          SELECT @orderId, ci.product_id, ci.size_id, ci.quantity, p.price
          FROM CART_ITEMS ci
          INNER JOIN @selected s ON s.cart_item_id = ci.cart_item_id
          INNER JOIN PRODUCTS p ON p.product_id = ci.product_id;

          UPDATE pss
          SET stock_qty = stock_qty - ci.quantity
          FROM PRODUCT_SIZE_STOCK pss
          INNER JOIN CART_ITEMS ci ON ci.product_id = pss.product_id AND ci.size_id = pss.size_id
          INNER JOIN @selected s ON s.cart_item_id = ci.cart_item_id;

          UPDATE p
          SET stock_qty =
            CASE
              WHEN p.stock_qty >= ordered.quantity THEN p.stock_qty - ordered.quantity
              ELSE 0
            END
          FROM PRODUCTS p
          INNER JOIN (
            SELECT ci.product_id, SUM(ci.quantity) AS quantity
            FROM CART_ITEMS ci
            INNER JOIN @selected s ON s.cart_item_id = ci.cart_item_id
            GROUP BY ci.product_id
          ) ordered ON ordered.product_id = p.product_id;

          DELETE ci
          FROM CART_ITEMS ci
          INNER JOIN @selected s ON s.cart_item_id = ci.cart_item_id;

          COMMIT TRANSACTION;

          SELECT CONVERT(varchar(36), @orderId) AS orderId;
        `),
    );

    return {
      orderId: rows[0]?.orderId,
      status: 'Order Placed',
      paymentMethod,
      referenceNumber,
      receiptUrl,
    };
  }

  private parseSelectedCartItemIds(value?: string) {
    if (!value) return [];

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  private normalizeAddress(body: CheckoutBody) {
    const shippingAddress = body.shippingAddress?.trim() ?? '';

    return {
      recipientName: body.recipientName?.trim() || 'A FRO Customer',
      phone: body.phone?.trim() || null,
      street: body.street?.trim() || shippingAddress || 'Address pending confirmation',
      barangay: body.barangay?.trim() || null,
      city: body.city?.trim() || 'Metro Manila',
      province: body.province?.trim() || 'Metro Manila',
      region: body.region?.trim() || 'NCR',
      postalCode: body.postalCode?.trim() || null,
    };
  }

  private async ensureCheckoutColumns() {
    if (!(await this.databaseService.columnExists('ORDERS', 'shipping_fee'))) {
      await this.databaseService.query(`
        ALTER TABLE ORDERS
        ADD shipping_fee DECIMAL(10, 2) NOT NULL CONSTRAINT DF_ORDERS_SHIPPING_FEE DEFAULT ((0))
      `);
    }

    const nullableColumns = [
      ['payment_method', 'NVARCHAR(30) NULL'],
      ['payment_reference_number', 'NVARCHAR(100) NULL'],
      ['payment_receipt_url', 'NVARCHAR(500) NULL'],
      ['tracking_number', 'NVARCHAR(50) NULL'],
      ['expected_delivery_at', 'DATETIME2(7) NULL'],
    ];

    for (const [columnName, definition] of nullableColumns) {
      if (!(await this.databaseService.columnExists('ORDERS', columnName))) {
        await this.databaseService.query(`ALTER TABLE ORDERS ADD ${columnName} ${definition}`);
      }
    }
  }
}
