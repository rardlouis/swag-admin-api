import { BadRequestException, Injectable } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';
import { DatabaseService } from '../database/database.service';
import { SavedService } from '../saved/saved.service';

@Injectable()
export class ProfileService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly savedService: SavedService,
  ) {}

  async summary(userId?: string) {
    if (!userId) {
      throw new BadRequestException('User id is required');
    }

    const [orderRows, reviewRows, savedCount] = await Promise.all([
      this.databaseService.request<{ count: number }>((request) =>
        request.input('userId', sql.UniqueIdentifier, userId).query(`
          SELECT COUNT(*) AS count
          FROM ORDERS
          WHERE user_id = @userId
        `),
      ),
      this.databaseService.request<{ count: number }>((request) =>
        request.input('userId', sql.UniqueIdentifier, userId).query(`
          SELECT COUNT(*) AS count
          FROM REVIEWS
          WHERE user_id = @userId
        `),
      ),
      this.savedService.countForUser(userId),
    ]);

    return {
      orders: Number(orderRows[0]?.count ?? 0),
      saved: savedCount,
      reviews: Number(reviewRows[0]?.count ?? 0),
    };
  }

  async orders(userId?: string) {
    if (!userId) {
      throw new BadRequestException('User id is required');
    }

    const hasShippingFee = await this.databaseService.columnExists('ORDERS', 'shipping_fee');
    const hasPaymentMethod = await this.databaseService.columnExists('ORDERS', 'payment_method');
    const hasPaymentReference = await this.databaseService.columnExists('ORDERS', 'payment_reference_number');
    const hasReceiptUrl = await this.databaseService.columnExists('ORDERS', 'payment_receipt_url');
    const hasTrackingNumber = await this.databaseService.columnExists('ORDERS', 'tracking_number');
    const hasExpectedDelivery = await this.databaseService.columnExists('ORDERS', 'expected_delivery_at');

    return this.databaseService.request((request) =>
      request.input('userId', sql.UniqueIdentifier, userId).query(`
        SELECT
          CONVERT(varchar(36), o.order_id) AS orderId,
          o.placed_at AS placedAt,
          o.updated_at AS updatedAt,
          CAST(o.total_amount AS float) AS totalAmount,
          ${hasShippingFee ? 'CAST(o.shipping_fee AS float)' : 'CAST(0 AS float)'} AS shippingFee,
          ${hasPaymentMethod ? 'o.payment_method' : "'GCash'"} AS paymentMethod,
          ${hasPaymentReference ? 'o.payment_reference_number' : 'NULL'} AS paymentReferenceNumber,
          ${hasReceiptUrl ? 'o.payment_receipt_url' : 'NULL'} AS paymentReceiptUrl,
          ${hasTrackingNumber ? 'o.tracking_number' : "CONCAT('AFD', FORMAT(o.placed_at, 'yyyyMMdd'), LEFT(CONVERT(varchar(36), o.order_id), 8))"} AS trackingNumber,
          ${hasExpectedDelivery ? 'o.expected_delivery_at' : 'DATEADD(day, 7, o.placed_at)'} AS expectedDeliveryAt,
          os.label AS status,
          CONVERT(varchar(36), oi.order_item_id) AS orderItemId,
          CONVERT(varchar(36), p.product_id) AS productId,
          p.name AS productName,
          CAST(oi.unit_price AS float) AS unitPrice,
          oi.quantity,
          ss.label AS size,
          img.image_url AS imageUrl,
          CASE WHEN r.review_id IS NULL THEN 0 ELSE 1 END AS reviewed,
          COALESCE(
            CONCAT(a.street, COALESCE(', ' + a.barangay, ''), ', ', a.city, COALESCE(', ' + a.province, ''), COALESCE(' ' + a.postal_code, '')),
            ''
          ) AS shippingAddress
        FROM ORDERS o
        INNER JOIN ORDER_STATUSES os ON os.status_id = o.status_id
        INNER JOIN ORDER_ITEMS oi ON oi.order_id = o.order_id
        INNER JOIN PRODUCTS p ON p.product_id = oi.product_id
        INNER JOIN SIZE_STANDARDS ss ON ss.size_id = oi.size_id
        LEFT JOIN USER_ADDRESSES a ON a.address_id = o.address_id
        LEFT JOIN REVIEWS r ON r.user_id = o.user_id AND r.product_id = p.product_id
        OUTER APPLY (
          SELECT TOP 1 image_url
          FROM PRODUCT_IMAGES pi
          WHERE pi.product_id = p.product_id
          ORDER BY pi.is_primary DESC, pi.display_order ASC
        ) img
        WHERE o.user_id = @userId
        ORDER BY o.placed_at DESC
      `),
    );
  }
}
