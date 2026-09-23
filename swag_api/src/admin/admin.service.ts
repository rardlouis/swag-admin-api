import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';
import { assertCleanText } from '../common/profanity';
import { DatabaseService } from '../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { hashPassword } from '../common/passwords';

type ChatMessageRow = {
  id: string;
  convoId: string;
  from: string;
  text: string;
  time: Date;
  isRead: boolean;
  readAt: Date | null;
};

type NotificationRow = {
  id: string;
  title: string;
  text: string;
  createdAt: Date;
  type: string;
};

type UpdateProfileBody = {
  fullName?: string;
  email?: string;
  phone?: string;
  idType?: string;
  idNumber?: string;
  isActive?: boolean;
  password?: string;
  confirmPassword?: string;
};

type CreateAdminBody = {
  fullName?: string;
  email?: string;
  phone?: string;
  idType?: string;
  idNumber?: string;
  password?: string;
  confirmPassword?: string;
};

type UploadedProfileFile = {
  filename: string;
};

type SupplierBody = {
  supplierName?: string;
  shopName?: string;
  email?: string;
  contactNumber?: string;
  status?: string;
  address?: string;
};

type VoucherBody = {
  code?: string;
  discountType?: string;
  discountAmount?: number | string;
  minimumOrderAmount?: number | string;
  usageLimit?: number | string | null;
  startAt?: string;
  endAt?: string | null;
  isActive?: boolean;
};

@Injectable()
export class AdminService {
  private readonly geminiBotUserId = '11111111-1111-4111-8111-111111111111';

  constructor(private readonly databaseService: DatabaseService, private readonly notificationsService: NotificationsService) {}

  async dashboard() {
    const [summary, salesByMonth, popularStyles, customerLocations] = await Promise.all([
      this.databaseService.query(`
        SELECT
          CAST((SELECT ISNULL(SUM(total_amount), 0) FROM ORDERS) AS float) AS totalRevenue,
          (SELECT COUNT(*) FROM USERS WHERE is_admin = 0) AS totalCustomers,
          (SELECT COUNT(*) FROM ORDERS) AS totalTransactions,
          (SELECT COUNT(*) FROM PRODUCTS) AS totalProducts,
          (SELECT COUNT(*) FROM TRYON_SESSIONS) AS tryonRequests
      `),
      this.databaseService.query(`
        SELECT
          LEFT(DATENAME(month, placed_at), 3) AS month,
          MONTH(placed_at) AS monthNumber,
          CAST(SUM(total_amount) AS float) AS avgSale,
          CAST(AVG(total_amount) AS float) AS avgItem
        FROM ORDERS
        WHERE YEAR(placed_at) = YEAR(GETDATE())
        GROUP BY MONTH(placed_at), DATENAME(month, placed_at)
        ORDER BY MONTH(placed_at)
      `),
      this.databaseService.query(`
        SELECT TOP 5
          CONVERT(varchar(20), fs.style_id) AS id,
          fs.label AS name,
          COUNT(sp.pick_id) AS sales,
          'Success' AS status
        FROM FASHION_STYLES fs
        LEFT JOIN STYLE_PICKS sp ON sp.style_id = fs.style_id
        GROUP BY fs.style_id, fs.label
        ORDER BY COUNT(sp.pick_id) DESC, fs.label
      `),
      this.databaseService.query(`
        SELECT TOP 4
          COALESCE(NULLIF(LTRIM(RTRIM(a.province)), ''), NULLIF(LTRIM(RTRIM(a.city)), '')) AS location,
          COUNT(*) AS customers
        FROM USERS u
        OUTER APPLY (
          SELECT TOP 1 city, province FROM USER_ADDRESSES
          WHERE user_id = u.user_id ORDER BY is_default DESC, created_at DESC
        ) a
        WHERE u.is_admin = 0
          AND COALESCE(NULLIF(LTRIM(RTRIM(a.province)), ''), NULLIF(LTRIM(RTRIM(a.city)), '')) IS NOT NULL
        GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(a.province)), ''), NULLIF(LTRIM(RTRIM(a.city)), ''))
        ORDER BY COUNT(*) DESC, location
      `),
    ]);

    return {
      summary: summary[0] ?? {},
      salesByMonth,
      popularStyles,
      customerLocations,
    };
  }

  async salesReport() {
    const [summary, monthlySales, monthlyTransactions, recentTransactions, topProducts] = await Promise.all([
      this.databaseService.query(`
        SELECT
          CAST(ISNULL(SUM(total_amount), 0) AS float) AS totalSales,
          (SELECT COUNT(*) FROM USERS WHERE is_admin = 0) AS totalCustomers,
          COUNT(*) AS totalTransactions,
          (SELECT COUNT(*) FROM PRODUCTS) AS totalProducts
        FROM ORDERS
      `),
      this.databaseService.query(`
        WITH months AS (
          SELECT * FROM (VALUES
            (1, 'Jan'), (2, 'Feb'), (3, 'Mar'), (4, 'Apr'), (5, 'May'), (6, 'Jun'),
            (7, 'Jul'), (8, 'Aug'), (9, 'Sep'), (10, 'Oct'), (11, 'Nov'), (12, 'Dec')
          ) AS m(monthNumber, month)
        )
        SELECT
          m.month,
          m.monthNumber,
          CAST(ISNULL(SUM(CASE WHEN YEAR(o.placed_at) = YEAR(GETDATE()) THEN o.total_amount ELSE 0 END), 0) AS float) AS sales,
          CAST(ISNULL(SUM(CASE WHEN YEAR(o.placed_at) = YEAR(GETDATE()) - 1 THEN o.total_amount ELSE 0 END), 0) AS float) AS previous
        FROM months m
        LEFT JOIN ORDERS o ON MONTH(o.placed_at) = m.monthNumber
          AND YEAR(o.placed_at) IN (YEAR(GETDATE()), YEAR(GETDATE()) - 1)
        GROUP BY m.month, m.monthNumber
        ORDER BY m.monthNumber
      `),
      this.databaseService.query(`
        WITH months AS (
          SELECT * FROM (VALUES
            (1, 'Jan'), (2, 'Feb'), (3, 'Mar'), (4, 'Apr'), (5, 'May'), (6, 'Jun'),
            (7, 'Jul'), (8, 'Aug'), (9, 'Sep'), (10, 'Oct'), (11, 'Nov'), (12, 'Dec')
          ) AS m(monthNumber, month)
        )
        SELECT m.month, m.monthNumber, COUNT(o.order_id) AS transactions
        FROM months m
        LEFT JOIN ORDERS o ON MONTH(o.placed_at) = m.monthNumber AND YEAR(o.placed_at) = YEAR(GETDATE())
        GROUP BY m.month, m.monthNumber
        ORDER BY m.monthNumber
      `),
      this.databaseService.query(`
        SELECT TOP 7
          CONVERT(varchar(36), o.order_id) AS id,
          COALESCE(u.full_name, 'Customer') AS client,
          COALESCE(firstItem.name, 'Order') AS product,
          CAST(o.total_amount AS float) AS amount,
          LOWER(REPLACE(os.label, ' ', '-')) AS status,
          o.placed_at AS placedAt
        FROM ORDERS o
        INNER JOIN USERS u ON u.user_id = o.user_id
        INNER JOIN ORDER_STATUSES os ON os.status_id = o.status_id
        OUTER APPLY (
          SELECT TOP 1 p.name
          FROM ORDER_ITEMS oi
          INNER JOIN PRODUCTS p ON p.product_id = oi.product_id
          WHERE oi.order_id = o.order_id
          ORDER BY oi.order_item_id
        ) firstItem
        ORDER BY o.placed_at DESC
      `),
      this.databaseService.query(`
        SELECT TOP 5
          p.name,
          CAST(SUM(oi.quantity) AS int) AS sold,
          CAST(SUM(oi.quantity * oi.unit_price) AS float) AS revenue
        FROM ORDER_ITEMS oi
        INNER JOIN PRODUCTS p ON p.product_id = oi.product_id
        GROUP BY p.product_id, p.name
        ORDER BY SUM(oi.quantity) DESC, SUM(oi.quantity * oi.unit_price) DESC
      `),
    ]);

    return {
      summary: summary[0] ?? { totalSales: 0, totalCustomers: 0, totalTransactions: 0, totalProducts: 0 },
      monthlySales,
      monthlyTransactions,
      recentTransactions,
      topProducts,
    };
  }

  async customers() {
    const [hasEmailOtps, hasSmsOtps] = await Promise.all([
      this.databaseService.tableExists('EMAIL_OTPS'),
      this.databaseService.tableExists('SMS_OTP_VERIFICATIONS'),
    ]);
    const verificationStatus = hasEmailOtps && hasSmsOtps
      ? `CASE WHEN EXISTS (
          SELECT 1 FROM EMAIL_OTPS e
          WHERE e.email = u.email AND e.verified_at IS NOT NULL AND e.invalidated_at IS NULL
        ) AND EXISTS (
          SELECT 1 FROM SMS_OTP_VERIFICATIONS s
          WHERE (s.phone_number = u.phone OR s.phone_number = CONCAT('0', u.phone))
            AND s.verified_at IS NOT NULL AND s.invalidated_at IS NULL
        ) THEN 'Verified' ELSE 'Unverified' END`
      : "'Unverified'";
    return this.databaseService.query(`
      SELECT
        CONVERT(varchar(36), u.user_id) AS id,
        u.full_name AS name,
        u.email,
        u.phone,
        ${verificationStatus} AS status,
        COUNT(DISTINCT o.order_id) AS orders,
        COALESCE(
          CONCAT(a.street, ', ', a.city, COALESCE(', ' + a.province, ''), COALESCE(' ' + a.postal_code, '')),
          ''
        ) AS address,
        u.created_at AS createdAt
      FROM USERS u
      LEFT JOIN ORDERS o ON o.user_id = u.user_id
      OUTER APPLY (
        SELECT TOP 1 *
        FROM USER_ADDRESSES ua
        WHERE ua.user_id = u.user_id
        ORDER BY ua.is_default DESC, ua.created_at DESC
      ) a
      WHERE u.is_admin = 0 AND u.is_active = 1
      GROUP BY u.user_id, u.full_name, u.email, u.phone, a.street, a.city, a.province, a.postal_code, u.created_at
      ORDER BY u.created_at DESC
    `);
  }

  async orders() {
    const [hasReceipt, hasReference, hasTracking, hasTrackingUrl] = await Promise.all([
      this.databaseService.columnExists('ORDERS', 'payment_receipt_url'),
      this.databaseService.columnExists('ORDERS', 'payment_reference_number'),
      this.databaseService.columnExists('ORDERS', 'tracking_number'),
      this.databaseService.columnExists('ORDERS', 'tracking_url'),
    ]);
    const hasColorId = await this.databaseService.columnExists('PRODUCTS', 'color_id');
    const productColorJoin = hasColorId
      ? 'LEFT JOIN PRESET_COLORS pc ON pc.color_id = p.color_id LEFT JOIN COLOR_FAMILIES cf ON cf.family_id = pc.family_id'
      : '';
    const productColorSelect = hasColorId ? 'cf.label AS color' : 'p.color_name AS color';

    const rows = await this.databaseService.query<{
      id: string;
      name: string;
      color: string;
      price: number;
      date: Date;
      customer: string;
      payment: string;
      status: string;
      imageUrl: string | null;
      itemCount: number;
      itemsJson: string | null;
      receiptUrl: string | null;
      paymentReference: string | null;
      trackingNumber: string | null;
      trackingUrl: string | null;
    }>(`
      SELECT
        CONVERT(varchar(36), o.order_id) AS id,
        COALESCE(firstItem.name, 'Order') AS name,
        COALESCE(firstItem.color, '') AS color,
        CAST(o.total_amount AS float) AS price,
        o.placed_at AS date,
        u.full_name AS customer,
        CASE WHEN LOWER(os.label) = 'payment confirmed' THEN 'Confirmed' ELSE 'Pending verification' END AS payment,
        os.label AS status,
        ${hasReceipt ? 'o.payment_receipt_url' : 'NULL'} AS receiptUrl,
        ${hasReference ? 'o.payment_reference_number' : 'NULL'} AS paymentReference,
        ${hasTracking ? 'o.tracking_number' : 'NULL'} AS trackingNumber,
        ${hasTrackingUrl ? 'o.tracking_url' : 'NULL'} AS trackingUrl,
        firstItem.imageUrl,
        ISNULL(orderSummary.itemCount, 0) AS itemCount,
        orderItems.itemsJson
      FROM ORDERS o
      INNER JOIN USERS u ON u.user_id = o.user_id
      INNER JOIN ORDER_STATUSES os ON os.status_id = o.status_id
      OUTER APPLY (
        SELECT COUNT(*) AS itemCount
        FROM ORDER_ITEMS oi
        WHERE oi.order_id = o.order_id
      ) orderSummary
      OUTER APPLY (
        SELECT TOP 1
          CONVERT(varchar(36), oi.order_item_id) AS orderItemId,
          CONVERT(varchar(36), p.product_id) AS productId,
          p.name,
          ${productColorSelect},
          pi.image_url AS imageUrl,
          oi.quantity,
          CAST(oi.unit_price AS float) AS unitPrice,
          ss.label AS size
        FROM ORDER_ITEMS oi
        INNER JOIN PRODUCTS p ON p.product_id = oi.product_id
        INNER JOIN SIZE_STANDARDS ss ON ss.size_id = oi.size_id
        ${productColorJoin}
        OUTER APPLY (
          SELECT TOP 1 image_url
          FROM PRODUCT_IMAGES
          WHERE product_id = p.product_id
          ORDER BY is_primary DESC, display_order ASC
        ) pi
        WHERE oi.order_id = o.order_id
        ORDER BY oi.order_item_id
      ) firstItem
      OUTER APPLY (
        SELECT (
          SELECT
            CONVERT(varchar(36), oi.order_item_id) AS orderItemId,
            CONVERT(varchar(36), p.product_id) AS productId,
            p.name,
            ${productColorSelect},
            pi.image_url AS imageUrl,
            oi.quantity,
            CAST(oi.unit_price AS float) AS unitPrice,
            CAST(oi.quantity * oi.unit_price AS float) AS lineTotal,
            ss.label AS size
          FROM ORDER_ITEMS oi
          INNER JOIN PRODUCTS p ON p.product_id = oi.product_id
          INNER JOIN SIZE_STANDARDS ss ON ss.size_id = oi.size_id
          ${productColorJoin}
          OUTER APPLY (
            SELECT TOP 1 image_url
            FROM PRODUCT_IMAGES
            WHERE product_id = p.product_id
            ORDER BY is_primary DESC, display_order ASC
          ) pi
          WHERE oi.order_id = o.order_id
          ORDER BY oi.order_item_id
          FOR JSON PATH
        ) AS itemsJson
      ) orderItems
      ORDER BY o.placed_at DESC
    `);

    return rows.map(({ itemsJson, ...order }) => {
      const items = itemsJson ? JSON.parse(itemsJson) : [];
      const firstItem = items[0];

      return {
        ...order,
        itemCount: Number(order.itemCount ?? items.length),
        items,
        selectedItemId: firstItem?.orderItemId ?? null,
      };
    });
  }

  async updateOrderStatus(orderId: string, status: string, trackingNumber?: string, trackingUrl?: string, cancellationReason?: string) {
    const nextStatus = status?.trim();

    if (!nextStatus) {
      throw new BadRequestException('Order status is required');
    }

    await this.ensureOrderTrackingColumns();
    if (trackingUrl && !/^https?:\/\//i.test(trackingUrl.trim())) {
      throw new BadRequestException('Tracking link must start with http:// or https://');
    }
    const current = await this.databaseService.request<{ status: string; userId: string }>((request) =>
      request.input('orderId', sql.UniqueIdentifier, orderId).query(`
        SELECT TOP 1 os.label AS status, CONVERT(varchar(36), o.user_id) AS userId
        FROM ORDERS o
        INNER JOIN ORDER_STATUSES os ON os.status_id = o.status_id
        WHERE o.order_id = @orderId
      `),
    );

    if (!current[0]) {
      throw new NotFoundException('Order not found');
    }

    const wasCancelled = current[0].status.toLowerCase().includes('cancel');
    const willCancel = nextStatus.toLowerCase().includes('cancel');
    if (willCancel && !cancellationReason?.trim()) throw new BadRequestException('A cancellation reason is required.');

    await this.databaseService.request((request) =>
      request.input('status', sql.NVarChar(30), nextStatus).query(`
        IF NOT EXISTS (SELECT 1 FROM ORDER_STATUSES WHERE label = @status)
        BEGIN
          INSERT INTO ORDER_STATUSES (label) VALUES (@status);
        END
      `),
    );

    const updated = await this.databaseService.request<{ id: string }>((request) =>
      request
        .input('orderId', sql.UniqueIdentifier, orderId)
        .input('status', sql.NVarChar(30), nextStatus)
        .input('wasCancelled', sql.Bit, wasCancelled ? 1 : 0)
        .input('willCancel', sql.Bit, willCancel ? 1 : 0)
        .input('trackingNumber', sql.NVarChar(50), trackingNumber?.trim() || null)
        .input('trackingUrl', sql.NVarChar(500), trackingUrl?.trim() || null)
        .input('cancellationReason', sql.NVarChar(500), cancellationReason?.trim() || null).query(`
          SET XACT_ABORT ON;
          BEGIN TRANSACTION;

          IF @wasCancelled = 0 AND @willCancel = 1
          BEGIN
            ;WITH returned AS (
              SELECT product_id, size_id, SUM(quantity) AS quantity
              FROM ORDER_ITEMS
              WHERE order_id = @orderId
              GROUP BY product_id, size_id
            )
            MERGE PRODUCT_SIZE_STOCK AS target
            USING returned AS source
            ON target.product_id = source.product_id AND target.size_id = source.size_id
            WHEN MATCHED THEN
              UPDATE SET stock_qty = target.stock_qty + source.quantity
            WHEN NOT MATCHED THEN
              INSERT (product_id, size_id, stock_qty)
              VALUES (source.product_id, source.size_id, source.quantity);

            ;WITH returned AS (
              SELECT product_id, SUM(quantity) AS quantity
              FROM ORDER_ITEMS
              WHERE order_id = @orderId
              GROUP BY product_id
            )
            UPDATE p
            SET stock_qty = p.stock_qty + returned.quantity
            FROM PRODUCTS p
            INNER JOIN returned ON returned.product_id = p.product_id;
          END
          ELSE IF @wasCancelled = 1 AND @willCancel = 0
          BEGIN
            IF EXISTS (
              SELECT 1
              FROM ORDER_ITEMS oi
              LEFT JOIN PRODUCT_SIZE_STOCK pss ON pss.product_id = oi.product_id AND pss.size_id = oi.size_id
              WHERE oi.order_id = @orderId AND ISNULL(pss.stock_qty, 0) < oi.quantity
            )
            BEGIN
              THROW 51020, 'Cannot reactivate order because stock is no longer available', 1;
            END

            UPDATE pss
            SET stock_qty = pss.stock_qty - ordered.quantity
            FROM PRODUCT_SIZE_STOCK pss
            INNER JOIN (
              SELECT product_id, size_id, SUM(quantity) AS quantity
              FROM ORDER_ITEMS
              WHERE order_id = @orderId
              GROUP BY product_id, size_id
            ) ordered ON ordered.product_id = pss.product_id AND ordered.size_id = pss.size_id;

            UPDATE p
            SET stock_qty =
              CASE
                WHEN p.stock_qty >= ordered.quantity THEN p.stock_qty - ordered.quantity
                ELSE 0
              END
            FROM PRODUCTS p
            INNER JOIN (
              SELECT product_id, SUM(quantity) AS quantity
              FROM ORDER_ITEMS
              WHERE order_id = @orderId
              GROUP BY product_id
            ) ordered ON ordered.product_id = p.product_id;
          END

          UPDATE ORDERS
          SET
            status_id = (SELECT TOP 1 status_id FROM ORDER_STATUSES WHERE label = @status),
            tracking_number = CASE WHEN @trackingNumber IS NULL THEN tracking_number ELSE @trackingNumber END,
            tracking_url = CASE WHEN @trackingUrl IS NULL THEN tracking_url ELSE @trackingUrl END,
            cancellation_reason = CASE WHEN @willCancel = 1 THEN @cancellationReason ELSE cancellation_reason END,
            updated_at = GETDATE()
          OUTPUT CONVERT(varchar(36), inserted.order_id) AS id
          WHERE order_id = @orderId;

          COMMIT TRANSACTION;
        `),
    );

    if (!updated[0]) {
      throw new NotFoundException('Order not found');
    }

    const notification = this.orderNotification(nextStatus);
    if (notification) void this.notificationsService.notifyOrder(current[0].userId, { ...notification, orderId, eventKey: `order.status.${nextStatus.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, data: { type: 'order', orderId } }).catch(() => undefined);
    if (current[0].status.trim().toLowerCase() !== 'payment confirmed' && nextStatus.toLowerCase() === 'payment confirmed') {
      // This admin-only state transition is the sole trusted payment success
      // point in the current receipt-based GCash flow.
      void this.notificationsService.notifyOrderConfirmation(current[0].userId, orderId).catch(() => undefined);
    }
    if (willCancel) void this.notificationsService.notifyOrder(current[0].userId, { orderId, eventKey: 'order.status.cancelled', title: 'Order Cancelled', body: `Reason: ${cancellationReason?.trim()}`, data: { type: 'order', orderId } }).catch(() => undefined);
    return { id: orderId, status: nextStatus };
  }

  private orderNotification(status: string) {
    const normalized = status.toLowerCase();
    if (normalized.includes('transit') || normalized.includes('ship')) return { title: 'Order Shipped', body: 'Your order is on its way. Tap to view tracking.' };
    if (normalized.includes('delivery')) return { title: 'Out for Delivery', body: 'Your order is out for delivery today.' };
    if (normalized.includes('deliver')) return { title: 'Order Delivered', body: 'Your order has been delivered.' };
    if (normalized.includes('process')) return { title: 'Order Processing', body: 'Your order is now being prepared.' };
    if (normalized.includes('confirm')) return { title: 'Payment Confirmed', body: 'Your payment has been confirmed.' };
    return null;
  }

  private async ensureOrderTrackingColumns() {
    for (const [column, definition] of [['tracking_number', 'NVARCHAR(50) NULL'], ['tracking_url', 'NVARCHAR(500) NULL'], ['cancellation_reason', 'NVARCHAR(500) NULL']]) {
      if (!(await this.databaseService.columnExists('ORDERS', column))) {
        await this.databaseService.query(`ALTER TABLE ORDERS ADD ${column} ${definition}`);
      }
    }
  }

  async reviews() {
    return this.databaseService.query(`
      SELECT
        CONVERT(varchar(36), r.review_id) AS id,
        u.full_name AS customer,
        p.name AS product,
        CONVERT(varchar(36), p.product_id) AS orderNumber,
        r.rating,
        r.comment,
        r.created_at AS date
      FROM REVIEWS r
      INNER JOIN USERS u ON u.user_id = r.user_id
      INNER JOIN PRODUCTS p ON p.product_id = r.product_id
      ORDER BY r.created_at DESC
    `);
  }

  async suppliers() {
    await this.ensureSuppliersTable();

    return this.databaseService.query(`
      SELECT
        CONVERT(varchar(36), supplier_id) AS id,
        supplier_name AS name,
        email,
        contact_number AS phone,
        CASE WHEN is_active = 1 THEN 'Active' ELSE 'Inactive' END AS status,
        shop_name AS store,
        address,
        created_at AS createdAt
      FROM SUPPLIERS
      ORDER BY created_at DESC
    `);
  }

  async supplier(id: string) {
    await this.ensureSuppliersTable();

    const suppliers = await this.databaseService.request((request) =>
      request.input('supplierId', sql.UniqueIdentifier, id).query(`
        SELECT TOP 1
          CONVERT(varchar(36), supplier_id) AS id,
          supplier_name AS supplierName,
          shop_name AS shopName,
          email,
          contact_number AS contactNumber,
          CASE WHEN is_active = 1 THEN 'Active' ELSE 'Inactive' END AS status,
          address
        FROM SUPPLIERS
        WHERE supplier_id = @supplierId
      `),
    );

    if (!suppliers[0]) {
      throw new NotFoundException('Supplier not found');
    }

    return suppliers[0];
  }

  async createSupplier(body: unknown) {
    await this.ensureSuppliersTable();

    const supplier = this.validateSupplier(body);
    const inserted = await this.databaseService.request((request) =>
      request
        .input('supplierName', sql.NVarChar(150), supplier.supplierName)
        .input('shopName', sql.NVarChar(150), supplier.shopName)
        .input('email', sql.NVarChar(255), supplier.email)
        .input('contactNumber', sql.NVarChar(30), supplier.contactNumber)
        .input('isActive', sql.Bit, supplier.status === 'Active')
        .input('address', sql.NVarChar(500), supplier.address)
        .query(`
          INSERT INTO SUPPLIERS (supplier_name, shop_name, email, contact_number, is_active, address)
          OUTPUT CONVERT(varchar(36), inserted.supplier_id) AS id
          VALUES (@supplierName, @shopName, @email, @contactNumber, @isActive, @address)
        `),
    );

    return this.supplier((inserted[0] as { id: string }).id);
  }

  async updateSupplier(id: string, body: unknown) {
    await this.ensureSuppliersTable();

    const supplier = this.validateSupplier(body);
    const updated = await this.databaseService.request((request) =>
      request
        .input('supplierId', sql.UniqueIdentifier, id)
        .input('supplierName', sql.NVarChar(150), supplier.supplierName)
        .input('shopName', sql.NVarChar(150), supplier.shopName)
        .input('email', sql.NVarChar(255), supplier.email)
        .input('contactNumber', sql.NVarChar(30), supplier.contactNumber)
        .input('isActive', sql.Bit, supplier.status === 'Active')
        .input('address', sql.NVarChar(500), supplier.address)
        .query(`
          UPDATE SUPPLIERS
          SET
            supplier_name = @supplierName,
            shop_name = @shopName,
            email = @email,
            contact_number = @contactNumber,
            is_active = @isActive,
            address = @address,
            updated_at = GETDATE()
          OUTPUT CONVERT(varchar(36), inserted.supplier_id) AS id
          WHERE supplier_id = @supplierId
        `),
    );

    if (!updated[0]) {
      throw new NotFoundException('Supplier not found');
    }

    return this.supplier((updated[0] as { id: string }).id);
  }

  async deleteSupplier(id: string) {
    await this.ensureSuppliersTable();

    const deleted = await this.databaseService.request((request) =>
      request.input('supplierId', sql.UniqueIdentifier, id).query(`
        DELETE FROM SUPPLIERS
        OUTPUT CONVERT(varchar(36), deleted.supplier_id) AS id
        WHERE supplier_id = @supplierId
      `),
    );

    if (!deleted[0]) {
      throw new NotFoundException('Supplier not found');
    }

    return { deleted: true, id };
  }

  async chats() {
    const conversations = await this.databaseService.query<{
      id: string;
      buyerId: string;
      sellerId: string;
      name: string;
      sellerName: string;
      lastMsg: string | null;
      time: Date | null;
      unread: number;
      mode: string;
      isAi: boolean | number;
      productName: string | null;
      productPrice: number | null;
      imageUrl: string | null;
    }>(`
      SELECT
        CONVERT(varchar(36), c.convo_id) AS id,
        CONVERT(varchar(36), c.buyer_id) AS buyerId,
        CONVERT(varchar(36), c.seller_id) AS sellerId,
        buyer.full_name AS name,
        seller.full_name AS sellerName,
        latest.body AS lastMsg,
        COALESCE(latest.sent_at, c.last_message_at) AS time,
        COUNT(CASE WHEN m.is_read = 0 AND m.sender_id = c.buyer_id THEN 1 END) AS unread,
        CASE WHEN seller.is_bot = 1 THEN 'ai' ELSE 'human' END AS mode,
        seller.is_bot AS isAi,
        p.name AS productName,
        CAST(p.price AS float) AS productPrice,
        pi.image_url AS imageUrl
      FROM CONVERSATIONS c
      INNER JOIN USERS buyer ON buyer.user_id = c.buyer_id
      INNER JOIN USERS seller ON seller.user_id = c.seller_id
      LEFT JOIN PRODUCTS p ON p.product_id = c.product_id
      OUTER APPLY (
        SELECT TOP 1 body, sent_at
        FROM MESSAGES
        WHERE convo_id = c.convo_id
        ORDER BY sent_at DESC
      ) latest
      OUTER APPLY (
        SELECT TOP 1 image_url
        FROM PRODUCT_IMAGES
        WHERE product_id = p.product_id
        ORDER BY is_primary DESC, display_order ASC
      ) pi
      LEFT JOIN MESSAGES m ON m.convo_id = c.convo_id
      WHERE c.is_active = 1 AND c.seller_deleted_at IS NULL
      GROUP BY c.convo_id, c.buyer_id, c.seller_id, buyer.full_name, seller.full_name, seller.is_bot, p.name, p.price, pi.image_url, latest.body, latest.sent_at, c.last_message_at
      ORDER BY COALESCE(latest.sent_at, c.last_message_at) DESC
    `);

    const messages = await this.databaseService.query<ChatMessageRow>(`
      SELECT
        CONVERT(varchar(36), m.message_id) AS id,
        CONVERT(varchar(36), m.convo_id) AS convoId,
        CASE
          WHEN sender.is_bot = 1 THEN 'ai'
          WHEN sender.is_admin = 1 AND sender.user_id = c.seller_id THEN 'admin'
          WHEN sender.user_id = c.seller_id THEN 'ai'
          ELSE 'customer'
        END AS [from],
        m.body AS text,
        m.sent_at AS time,
        m.is_read AS isRead,
        m.read_at AS readAt
      FROM MESSAGES m
      INNER JOIN CONVERSATIONS c ON c.convo_id = m.convo_id
      INNER JOIN USERS sender ON sender.user_id = m.sender_id
      WHERE c.is_active = 1 AND c.seller_deleted_at IS NULL
      ORDER BY m.sent_at ASC
    `);

    const messagesByConversation = messages.reduce<Record<string, ChatMessageRow[]>>((acc, message) => {
      acc[message.convoId] ??= [];
      acc[message.convoId].push(message);
      return acc;
    }, {});

    return conversations.map((conversation) => {
      const convoMessages = messagesByConversation[conversation.id] ?? [];
      const lastMessage = convoMessages.at(-1);

      return {
        id: conversation.id,
        buyerId: conversation.buyerId,
        sellerId: conversation.sellerId,
        name: conversation.name,
        sellerName: conversation.sellerName,
        lastMsg: lastMessage ? `${this.senderLabel(lastMessage.from)}: ${lastMessage.text}` : 'No messages yet',
        time: this.relativeTime(conversation.time),
        unread: Number(conversation.unread ?? 0),
        mode: conversation.mode,
        type: conversation.isAi ? 'ai' : 'human',
        isAi: Boolean(conversation.isAi),
        messages: convoMessages.map((message) => ({
          id: message.id,
          from: message.from,
          text: message.text,
          time: this.clockTime(message.time),
          isRead: Boolean(message.isRead),
          readAt: this.clockTime(message.readAt),
        })),
        product: conversation.productName
          ? {
              name: conversation.productName,
              price: this.formatPeso(conversation.productPrice),
              orderId: conversation.productName,
              imageUrl: conversation.imageUrl,
              emoji: 'Item',
            }
          : null,
      };
    });
  }

  async sendChatMessage(conversationId: string, text: string) {
    const trimmedText = text?.trim();

    if (!trimmedText) {
      throw new BadRequestException('Message text is required');
    }

    assertCleanText(trimmedText, 'Message');

    const conversation = await this.databaseService.request<{ sellerId: string; isBot: boolean | number }>((request) =>
      request.input('conversationId', sql.UniqueIdentifier, conversationId).query(`
        SELECT
          CONVERT(varchar(36), c.seller_id) AS sellerId,
          seller.is_bot AS isBot
        FROM CONVERSATIONS c
        INNER JOIN USERS seller ON seller.user_id = c.seller_id
        WHERE c.convo_id = @conversationId AND c.is_active = 1
      `),
    );

    if (!conversation[0]) {
      throw new NotFoundException('Conversation not found');
    }

    const senderId = await this.adminUserId();
    const shouldTakeOver = Boolean(conversation[0].isBot);

    await this.databaseService.request((request) =>
      request
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .input('senderId', sql.UniqueIdentifier, senderId)
        .input('body', sql.NVarChar(sql.MAX), trimmedText)
        .query(`
          INSERT INTO MESSAGES (convo_id, sender_id, body, is_read)
          VALUES (@conversationId, @senderId, @body, 0)

          UPDATE CONVERSATIONS
          SET last_message_at = GETDATE(),
              ${shouldTakeOver ? 'seller_id = @senderId,' : ''}
              buyer_deleted_at = NULL,
              seller_deleted_at = NULL
          WHERE convo_id = @conversationId
        `),
    );

    return this.chats();
  }

  async markChatRead(conversationId: string) {
    const conversation = await this.databaseService.request<{ buyerId: string }>((request) =>
      request.input('conversationId', conversationId).query(`
        SELECT CONVERT(varchar(36), buyer_id) AS buyerId
        FROM CONVERSATIONS
        WHERE convo_id = @conversationId AND is_active = 1
      `),
    );

    if (!conversation[0]) {
      throw new NotFoundException('Conversation not found');
    }

    await this.databaseService.request((request) =>
      request
        .input('conversationId', conversationId)
        .input('buyerId', conversation[0].buyerId)
        .query(`
          UPDATE MESSAGES
          SET is_read = 1,
              read_at = COALESCE(read_at, GETDATE())
          WHERE convo_id = @conversationId AND sender_id = @buyerId
        `),
    );

    return this.chats();
  }

  async updateChatMode(conversationId: string, mode: string) {
    const nextMode = mode === 'ai' ? 'ai' : 'human';
    const sellerId = nextMode === 'ai' ? this.geminiBotUserId : await this.adminUserId();

    const updated = await this.databaseService.request<{ id: string }>((request) =>
      request
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .input('sellerId', sql.UniqueIdentifier, sellerId)
        .query(`
          UPDATE CONVERSATIONS
          SET seller_id = @sellerId,
              seller_deleted_at = NULL,
              last_message_at = COALESCE(last_message_at, GETDATE())
          OUTPUT CONVERT(varchar(36), inserted.convo_id) AS id
          WHERE convo_id = @conversationId AND is_active = 1
        `),
    );

    if (!updated[0]) {
      throw new NotFoundException('Conversation not found');
    }

    return this.chats();
  }

  async deleteChat(conversationId: string) {
    const deleted = await this.databaseService.request<{ id: string }>((request) =>
      request.input('conversationId', sql.UniqueIdentifier, conversationId).query(`
        UPDATE CONVERSATIONS
        SET seller_deleted_at = GETDATE()
        OUTPUT CONVERT(varchar(36), inserted.convo_id) AS id
        WHERE convo_id = @conversationId AND is_active = 1
      `),
    );

    if (!deleted[0]) {
      throw new NotFoundException('Conversation not found');
    }

    return { deleted: true, id: conversationId };
  }

  async notifications() {
    const items = await this.notificationsService.adminNotifications();
    return items.map((item: any) => ({ ...item, time: this.relativeTime(item.createdAt) }));
  }

  async markNotificationRead(notificationId: string) {
    return this.notificationsService.markAdminNotificationRead(notificationId);
  }

  async legacyNotifications() {
    const items = await this.databaseService.query<NotificationRow>(`
      SELECT TOP 10 *
      FROM (
        SELECT
          CONVERT(varchar(36), o.order_id) AS id,
          'New order received' AS title,
          CONCAT('Order ', LEFT(CONVERT(varchar(36), o.order_id), 8), ' is ', os.label, '.') AS text,
          o.placed_at AS createdAt,
          'order' AS type
        FROM ORDERS o
        INNER JOIN ORDER_STATUSES os ON os.status_id = o.status_id

        UNION ALL

        SELECT
          CONVERT(varchar(36), r.review_id) AS id,
          'New review' AS title,
          CONCAT(u.full_name, ' left a ', r.rating, '-star review.') AS text,
          r.created_at AS createdAt,
          'review' AS type
        FROM REVIEWS r
        INNER JOIN USERS u ON u.user_id = r.user_id

        UNION ALL

        SELECT
          CONVERT(varchar(36), m.message_id) AS id,
          'New chat message' AS title,
          CONCAT(u.full_name, ': ', LEFT(m.body, 80)) AS text,
          m.sent_at AS createdAt,
          'chat' AS type
        FROM MESSAGES m
        INNER JOIN CONVERSATIONS c ON c.convo_id = m.convo_id
        INNER JOIN USERS u ON u.user_id = m.sender_id
        WHERE m.is_read = 0 AND m.sender_id = c.buyer_id
      ) n
      ORDER BY createdAt DESC
    `);

    return items.map((item) => ({
      ...item,
      time: this.relativeTime(item.createdAt),
    }));
  }

  async idTypes() {
    return this.databaseService.query<{ id: number; label: string }>(`
      SELECT id_type_id AS id, label
      FROM ID_TYPES
      ORDER BY label
    `);
  }

  /**
   * Immediately finalizes a customer account deleted by an administrator.
   * Orders retain their user_id for reporting, while login data is anonymized
   * so the same email and mobile number can be used for a new test account.
   */
  async deleteCustomer(id: string) {
    const users = await this.databaseService.request<{ email: string; phone: string | null }>((request) => request
      .input('userId', sql.UniqueIdentifier, id)
      .query(`
        SELECT email, phone
        FROM USERS
        WHERE user_id = @userId AND is_admin = 0 AND is_active = 1
      `));
    const user = users[0];
    if (!user) throw new NotFoundException('Active customer was not found.');

    await this.databaseService.request((request) => request
      .input('userId', sql.UniqueIdentifier, id)
      .input('email', sql.NVarChar(255), user.email)
      .input('phone', sql.NVarChar(20), user.phone).query(`
        IF COL_LENGTH('USERS', 'deactivated_at') IS NULL ALTER TABLE USERS ADD deactivated_at DATETIME2 NULL;
        IF COL_LENGTH('USERS', 'deletion_due_at') IS NULL ALTER TABLE USERS ADD deletion_due_at DATETIME2 NULL;
        IF COL_LENGTH('USERS', 'deletion_finalized_at') IS NULL ALTER TABLE USERS ADD deletion_finalized_at DATETIME2 NULL;

        IF OBJECT_ID('dbo.EMAIL_OTPS', 'U') IS NOT NULL DELETE FROM EMAIL_OTPS WHERE email = @email;
        IF OBJECT_ID('dbo.SMS_OTP_VERIFICATIONS', 'U') IS NOT NULL
          DELETE FROM SMS_OTP_VERIFICATIONS WHERE phone_number = @phone OR phone_number = CONCAT('0', @phone);
        DELETE FROM CART_ITEMS WHERE user_id = @userId;
        IF OBJECT_ID('dbo.SAVED_PRODUCTS', 'U') IS NOT NULL DELETE FROM SAVED_PRODUCTS WHERE user_id = @userId;
        UPDATE CONVERSATIONS SET is_active = 0 WHERE buyer_id = @userId;
        UPDATE USERS
        SET email = CONCAT('deleted-', CONVERT(varchar(36), user_id), '@deleted.local'),
            phone = NULL,
            full_name = 'Deleted customer',
            id_number = NULL,
            password_hash = CONVERT(varchar(36), NEWID()),
            is_active = 0,
            deactivated_at = GETDATE(),
            deletion_due_at = GETDATE(),
            deletion_finalized_at = GETDATE()
        WHERE user_id = @userId AND is_admin = 0;
      `));

    return { id, deleted: true };
  }

  async createAdmin(body: unknown) {
    const payload = body as CreateAdminBody;
    const fullName = payload.fullName?.trim() ?? '';
    const email = payload.email?.trim().toLowerCase() ?? '';
    const phone = payload.phone?.trim() || null;
    const password = payload.password ?? '';

    if (fullName.length < 2 || fullName.length > 150) throw new BadRequestException('Enter an administrator name from 2 to 150 characters.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) throw new BadRequestException('Enter a valid administrator email.');
    if (password.length < 8 || password.length > 64 || !/[A-Z]/.test(password) || !/\d/.test(password)) throw new BadRequestException('Password must be 8 to 64 characters and include an uppercase letter and number.');
    if (password !== (payload.confirmPassword ?? '')) throw new BadRequestException('Password confirmation does not match.');

    const idType = payload.idType?.trim() || null;
    const idTypeRows = idType ? await this.databaseService.request<{ idTypeId: number }>((request) =>
      request.input('idType', sql.NVarChar(100), idType).query('SELECT TOP 1 id_type_id AS idTypeId FROM ID_TYPES WHERE label = @idType'),
    ) : [];
    if (idType && !idTypeRows[0]) throw new BadRequestException('Selected ID type does not exist.');

    const duplicate = await this.databaseService.request<{ count: number }>((request) =>
      request.input('email', sql.NVarChar(255), email).input('phone', sql.NVarChar(30), phone).query(`
        SELECT COUNT(*) AS count
        FROM USERS
        WHERE LOWER(email) = LOWER(@email)
          OR (@phone IS NOT NULL AND phone = @phone)
      `),
    );
    if (Number(duplicate[0]?.count ?? 0)) throw new BadRequestException('An account with this email or phone already exists.');

    const passwordHash = await hashPassword(password);
    const created = await this.databaseService.request<{ id: string; email: string; fullName: string; phone: string | null }>((request) =>
      request
        .input('email', sql.NVarChar(255), email)
        .input('passwordHash', sql.NVarChar(255), passwordHash)
        .input('fullName', sql.NVarChar(150), fullName)
        .input('phone', sql.NVarChar(30), phone)
        .input('idTypeId', sql.TinyInt, idTypeRows[0]?.idTypeId ?? null)
        .input('idNumber', sql.NVarChar(100), payload.idNumber?.trim() || null).query(`
          INSERT INTO USERS (email, password_hash, full_name, phone, id_type_id, id_number, is_admin, is_active)
          OUTPUT CONVERT(varchar(36), inserted.user_id) AS id, inserted.email, inserted.full_name AS fullName, inserted.phone
          VALUES (@email, @passwordHash, @fullName, @phone, @idTypeId, @idNumber, 1, 1)
        `),
    );
    return created[0];
  }

  async updateProfile(userId: string, body: unknown) {
    const payload = body as UpdateProfileBody;
    const fullName = payload.fullName?.trim();
    const email = payload.email?.trim();
    const phone = payload.phone?.trim() || null;
    const idType = payload.idType?.trim() || null;
    const idNumber = payload.idNumber?.trim() || null;
    const password = payload.password?.trim() || '';
    const confirmPassword = payload.confirmPassword?.trim() || '';

    if (!fullName || !email) {
      throw new BadRequestException('Full name and email are required');
    }

    if (password && password !== confirmPassword) {
      throw new BadRequestException('Password confirmation does not match');
    }

    const existing = await this.databaseService.request<{ id: string }>((request) =>
      request.input('userId', sql.UniqueIdentifier, userId).query(`
        SELECT CONVERT(varchar(36), user_id) AS id
        FROM USERS
        WHERE user_id = @userId AND is_admin = 1
      `),
    );

    if (!existing[0]) {
      throw new NotFoundException('Admin user not found');
    }

    const idTypeRows = idType
      ? await this.databaseService.request<{ idTypeId: number }>((request) =>
          request.input('idType', sql.NVarChar(100), idType).query(`
            SELECT TOP 1 id_type_id AS idTypeId
            FROM ID_TYPES
            WHERE label = @idType
          `),
        )
      : [];

    if (idType && !idTypeRows[0]) {
      throw new BadRequestException('Selected ID type does not exist');
    }

    const passwordHash = password ? await hashPassword(password) : null;
    await this.databaseService.request((request) => {
      request
        .input('userId', sql.UniqueIdentifier, userId)
        .input('fullName', sql.NVarChar(255), fullName)
        .input('email', sql.NVarChar(255), email)
        .input('phone', sql.NVarChar(30), phone)
        .input('idTypeId', sql.TinyInt, idTypeRows[0]?.idTypeId ?? null)
        .input('idNumber', sql.NVarChar(100), idNumber)
        .input('isActive', sql.Bit, payload.isActive === false ? 0 : 1);

      if (passwordHash) {
        request.input('passwordHash', sql.NVarChar(255), passwordHash);
      }

      return request.query(`
        UPDATE USERS
        SET
          full_name = @fullName,
          email = @email,
          phone = @phone,
          id_type_id = @idTypeId,
          id_number = @idNumber,
          is_active = @isActive
          ${passwordHash ? ', password_hash = @passwordHash' : ''}
        WHERE user_id = @userId AND is_admin = 1
      `);
    });

    const updated = await this.databaseService.request((request) =>
      request.input('userId', sql.UniqueIdentifier, userId).query(`
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
        WHERE u.user_id = @userId
      `),
    );

    return updated[0];
  }

  async updateProfilePhoto(userId: string, file: UploadedProfileFile | undefined) {
    if (!file) {
      throw new BadRequestException('Profile photo is required');
    }

    const profilePhotoUrl = `http://localhost:5000/uploads/profiles/${file.filename}`;

    const updated = await this.databaseService.request((request) =>
      request
        .input('userId', sql.UniqueIdentifier, userId)
        .input('profilePhotoUrl', sql.NVarChar(500), profilePhotoUrl)
        .query(`
          UPDATE USERS
          SET profile_photo_url = @profilePhotoUrl
          WHERE user_id = @userId AND is_admin = 1

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
          WHERE u.user_id = @userId
        `),
    );

    if (!updated[0]) {
      throw new NotFoundException('Admin user not found');
    }

    return updated[0];
  }

  async vouchers() {
    await this.databaseService.ensureVoucherSchema();
    return this.databaseService.query(`
      SELECT
        CONVERT(varchar(36), v.voucher_id) AS id, v.code,
        LOWER(v.discount_type) AS discountType, CAST(v.discount_value AS float) AS discountAmount,
        CAST(v.minimum_order_amount AS float) AS minimumOrderAmount,
        v.usage_limit AS usageLimit, v.usage_count AS usageCount,
        v.start_date AS startAt, NULLIF(v.end_date, CONVERT(datetime2, '9999-12-31')) AS endAt, v.is_active AS isActive,
        CASE
          WHEN v.is_active = 0 THEN 'Inactive'
          WHEN v.start_date > GETDATE() THEN 'Scheduled'
          WHEN v.end_date < GETDATE() THEN 'Expired'
          WHEN v.usage_limit IS NOT NULL AND v.usage_count >= v.usage_limit THEN 'Exhausted'
          ELSE 'Active'
        END AS status
      FROM VOUCHERS v
      ORDER BY v.created_at DESC
    `);
  }

  async createVoucher(body: unknown) {
    await this.databaseService.ensureVoucherSchema();
    const voucher = this.validateVoucher(body);
    let rows: { id: string }[];
    try {
      rows = await this.databaseService.request((request) => request
        .input('code', sql.NVarChar(50), voucher.code)
        .input('discountType', sql.NVarChar(10), voucher.discountType)
        .input('discountAmount', sql.Decimal(10, 2), voucher.discountAmount)
        .input('minimumOrderAmount', sql.Decimal(10, 2), voucher.minimumOrderAmount)
        .input('usageLimit', sql.Int, voucher.usageLimit)
        .input('startAt', sql.DateTime2, voucher.startAt)
        .input('endAt', sql.DateTime2, voucher.endAt)
        .input('isActive', sql.Bit, voucher.isActive).query(`
        INSERT INTO VOUCHERS (code, discount_type, discount_value, minimum_order_amount, usage_limit, start_date, end_date, is_active)
          OUTPUT CONVERT(varchar(36), inserted.voucher_id) AS id
          VALUES (@code, UPPER(@discountType), @discountAmount, @minimumOrderAmount, @usageLimit, @startAt, COALESCE(@endAt, CONVERT(datetime2, '9999-12-31')), @isActive)
        `));
    } catch (error) {
      this.rethrowVoucherWriteError(error);
    }
    return { id: rows[0]?.id };
  }

  async updateVoucher(id: string, body: unknown) {
    await this.databaseService.ensureVoucherSchema();
    const voucher = this.validateVoucher(body);
    let rows: { id: string }[];
    try {
      rows = await this.databaseService.request((request) => request
      .input('id', sql.UniqueIdentifier, id)
      .input('code', sql.NVarChar(50), voucher.code)
      .input('discountType', sql.NVarChar(10), voucher.discountType)
      .input('discountAmount', sql.Decimal(10, 2), voucher.discountAmount)
      .input('minimumOrderAmount', sql.Decimal(10, 2), voucher.minimumOrderAmount)
      .input('usageLimit', sql.Int, voucher.usageLimit)
      .input('startAt', sql.DateTime2, voucher.startAt)
      .input('endAt', sql.DateTime2, voucher.endAt)
      .input('isActive', sql.Bit, voucher.isActive).query(`
        UPDATE VOUCHERS SET code = @code, discount_type = UPPER(@discountType), discount_value = @discountAmount,
          minimum_order_amount = @minimumOrderAmount, usage_limit = @usageLimit, start_date = @startAt,
          end_date = COALESCE(@endAt, CONVERT(datetime2, '9999-12-31')), is_active = @isActive, updated_at = GETDATE()
        OUTPUT CONVERT(varchar(36), inserted.voucher_id) AS id
        WHERE voucher_id = @id
      `));
    } catch (error) {
      this.rethrowVoucherWriteError(error);
    }
    if (!rows[0]) throw new NotFoundException('Voucher not found');
    return { id };
  }

  async deleteVoucher(id: string) {
    await this.databaseService.ensureVoucherSchema();
    const rows = await this.databaseService.request((request) => request.input('id', sql.UniqueIdentifier, id).query(`
      DELETE FROM VOUCHERS OUTPUT CONVERT(varchar(36), deleted.voucher_id) AS id
      WHERE voucher_id = @id AND NOT EXISTS (SELECT 1 FROM ORDERS WHERE voucher_id = @id)
    `));
    if (!rows[0]) throw new BadRequestException('Voucher cannot be deleted because it was used or was not found. Deactivate it instead.');
    return { deleted: true, id };
  }

  private validateVoucher(body: unknown) {
    const payload = body as VoucherBody;
    const code = payload.code?.trim().toUpperCase() ?? '';
    const discountType = payload.discountType === 'fixed' ? 'fixed' : payload.discountType === 'percentage' ? 'percentage' : '';
    const discountAmount = Number(payload.discountAmount);
    const minimumOrderAmount = Number(payload.minimumOrderAmount ?? 0);
    const usageLimit = payload.usageLimit === null || payload.usageLimit === '' || payload.usageLimit === undefined ? null : Number(payload.usageLimit);
    const startAt = payload.startAt ? new Date(payload.startAt) : new Date();
    const endAt = payload.endAt ? new Date(payload.endAt) : null;

    if (!/^[A-Z0-9_-]{3,50}$/.test(code)) throw new BadRequestException('Voucher code must be 3–50 letters, numbers, hyphens, or underscores.');
    if (!discountType || !Number.isFinite(discountAmount) || discountAmount <= 0) throw new BadRequestException('A positive percentage or fixed discount is required.');
    if (discountType === 'percentage' && discountAmount > 100) throw new BadRequestException('Percentage discounts cannot exceed 100%.');
    if (!Number.isFinite(minimumOrderAmount) || minimumOrderAmount < 0) throw new BadRequestException('Minimum order amount cannot be negative.');
    if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) throw new BadRequestException('Usage limit must be at least 1 or blank.');
    if (Number.isNaN(startAt.getTime()) || (endAt && Number.isNaN(endAt.getTime())) || (endAt && endAt <= startAt)) throw new BadRequestException('End date must be after the start date.');

    return { code, discountType, discountAmount, minimumOrderAmount, usageLimit, startAt, endAt, isActive: payload.isActive !== false };
  }

  private rethrowVoucherWriteError(error: unknown): never {
    const message = error instanceof Error ? error.message : String(error);
    if (/UQ_VOUCHERS_CODE|duplicate key|unique constraint/i.test(message)) {
      throw new BadRequestException('That voucher code already exists. Choose a different code.');
    }
    throw error;
  }

  private senderLabel(sender: string) {
    if (sender === 'customer') return 'Customer';
    if (sender === 'ai') return 'AI';
    return 'You';
  }

  private clockTime(value: Date | string | null) {
    if (!value) return '';
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  private relativeTime(value: Date | string | null) {
    if (!value) return '';

    const diffMs = Date.now() - new Date(value).getTime();
    const minutes = Math.max(0, Math.floor(diffMs / 60000));

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;

    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  private formatPeso(value: number | null) {
    return `₱${Number(value ?? 0).toLocaleString('en-PH', {
      maximumFractionDigits: 0,
    })}`;
  }

  private async adminUserId() {
    const admins = await this.databaseService.query<{ id: string }>(`
      SELECT TOP 1 CONVERT(varchar(36), user_id) AS id
      FROM USERS
      WHERE is_admin = 1 AND is_active = 1
      ORDER BY created_at ASC
    `);

    if (!admins[0]) {
      throw new NotFoundException('Admin support user not found');
    }

    return admins[0].id;
  }

  private async ensureSuppliersTable() {
    await this.databaseService.query(`
      IF OBJECT_ID('dbo.SUPPLIERS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.SUPPLIERS (
          supplier_id     UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
          supplier_name   NVARCHAR(150)    NOT NULL,
          shop_name       NVARCHAR(150)    NOT NULL,
          email           NVARCHAR(255)    NOT NULL,
          contact_number  NVARCHAR(30)     NULL,
          is_active       BIT              NOT NULL DEFAULT 1,
          address         NVARCHAR(500)    NULL,
          created_at      DATETIME2        NOT NULL DEFAULT GETDATE(),
          updated_at      DATETIME2        NULL,

          CONSTRAINT PK_SUPPLIERS PRIMARY KEY (supplier_id),
          CONSTRAINT UQ_SUPPLIERS_EMAIL UNIQUE (email)
        );
      END
    `);
  }

  private validateSupplier(body: unknown) {
    const payload = body as SupplierBody;
    const supplier = {
      supplierName: payload.supplierName?.trim() ?? '',
      shopName: payload.shopName?.trim() ?? '',
      email: payload.email?.trim() ?? '',
      contactNumber: payload.contactNumber?.trim() ?? null,
      status: payload.status === 'Inactive' ? 'Inactive' : 'Active',
      address: payload.address?.trim() ?? null,
    };

    if (!supplier.supplierName || !supplier.shopName || !supplier.email) {
      throw new BadRequestException('Supplier name, shop name, and email are required');
    }

    return supplier;
  }
}
