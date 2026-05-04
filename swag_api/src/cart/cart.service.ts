import { BadRequestException, Injectable } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';
import { DatabaseService } from '../database/database.service';

type AddCartItemBody = {
  userId?: string;
  productId?: string;
  sizeId?: number | string;
  quantity?: number | string;
};

@Injectable()
export class CartService {
  constructor(private readonly databaseService: DatabaseService) {}

  async addItem(body: AddCartItemBody) {
    const quantity = Math.max(1, Number(body.quantity ?? 1));

    if (!body.userId || !body.productId || !body.sizeId || !Number.isFinite(quantity)) {
      throw new BadRequestException('User, product, size, and quantity are required');
    }

    const stockRows = await this.databaseService.request<{ stockQty: number; cartQty: number }>((request) =>
      request
        .input('userId', sql.UniqueIdentifier, body.userId)
        .input('productId', sql.UniqueIdentifier, body.productId)
        .input('sizeId', sql.SmallInt, Number(body.sizeId)).query(`
          SELECT
            pss.stock_qty AS stockQty,
            ISNULL(ci.quantity, 0) AS cartQty
          FROM PRODUCT_SIZE_STOCK pss
          LEFT JOIN CART_ITEMS ci
            ON ci.user_id = @userId
            AND ci.product_id = pss.product_id
            AND ci.size_id = pss.size_id
          WHERE pss.product_id = @productId AND pss.size_id = @sizeId
        `),
    );

    const stockQty = Number(stockRows[0]?.stockQty ?? 0);
    const cartQty = Number(stockRows[0]?.cartQty ?? 0);

    if (!stockRows[0] || stockQty < cartQty + quantity) {
      throw new BadRequestException('Selected size is not available');
    }

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
}
