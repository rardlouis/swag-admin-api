import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';
import { DatabaseService } from '../database/database.service';

type ChatMessageRow = {
  id: string;
  convoId: string;
  from: string;
  text: string;
  time: Date;
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

@Injectable()
export class AdminService {
  constructor(private readonly databaseService: DatabaseService) {}

  async dashboard() {
    const [summary, salesByMonth, popularStyles] = await Promise.all([
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
    ]);

    return {
      summary: summary[0] ?? {},
      salesByMonth,
      popularStyles,
    };
  }

  async customers() {
    return this.databaseService.query(`
      SELECT
        CONVERT(varchar(36), u.user_id) AS id,
        u.full_name AS name,
        u.email,
        u.phone,
        CASE WHEN u.id_number IS NULL OR LTRIM(RTRIM(u.id_number)) = '' THEN 'Unverified' ELSE 'Verified' END AS status,
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
      WHERE u.is_admin = 0
      GROUP BY u.user_id, u.full_name, u.email, u.phone, u.id_number, a.street, a.city, a.province, a.postal_code, u.created_at
      ORDER BY u.created_at DESC
    `);
  }

  async orders() {
    return this.databaseService.query(`
      SELECT
        CONVERT(varchar(36), o.order_id) AS id,
        COALESCE(firstItem.name, 'Order') AS name,
        COALESCE(firstItem.color, '') AS color,
        CAST(o.total_amount AS float) AS price,
        o.placed_at AS date,
        u.full_name AS customer,
        'Paid' AS payment,
        os.label AS status,
        firstItem.imageUrl
      FROM ORDERS o
      INNER JOIN USERS u ON u.user_id = o.user_id
      INNER JOIN ORDER_STATUSES os ON os.status_id = o.status_id
      OUTER APPLY (
        SELECT TOP 1
          p.name,
          p.color_name AS color,
          pi.image_url AS imageUrl
        FROM ORDER_ITEMS oi
        INNER JOIN PRODUCTS p ON p.product_id = oi.product_id
        OUTER APPLY (
          SELECT TOP 1 image_url
          FROM PRODUCT_IMAGES
          WHERE product_id = p.product_id
          ORDER BY is_primary DESC, display_order ASC
        ) pi
        WHERE oi.order_id = o.order_id
      ) firstItem
      ORDER BY o.placed_at DESC
    `);
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
      name: string;
      lastMsg: string | null;
      time: Date | null;
      unread: number;
      mode: string;
      productName: string | null;
      productPrice: number | null;
      imageUrl: string | null;
    }>(`
      SELECT
        CONVERT(varchar(36), c.convo_id) AS id,
        buyer.full_name AS name,
        latest.body AS lastMsg,
        COALESCE(latest.sent_at, c.last_message_at) AS time,
        COUNT(CASE WHEN m.is_read = 0 AND m.sender_id = c.buyer_id THEN 1 END) AS unread,
        CASE WHEN seller.is_admin = 1 THEN 'ai' ELSE 'human' END AS mode,
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
      WHERE c.is_active = 1
      GROUP BY c.convo_id, buyer.full_name, seller.is_admin, p.name, p.price, pi.image_url, latest.body, latest.sent_at, c.last_message_at
      ORDER BY COALESCE(latest.sent_at, c.last_message_at) DESC
    `);

    const messages = await this.databaseService.query<ChatMessageRow>(`
      SELECT
        CONVERT(varchar(36), m.message_id) AS id,
        CONVERT(varchar(36), m.convo_id) AS convoId,
        CASE
          WHEN sender.is_admin = 1 AND sender.user_id = c.seller_id THEN 'admin'
          WHEN sender.user_id = c.seller_id THEN 'ai'
          ELSE 'customer'
        END AS [from],
        m.body AS text,
        m.sent_at AS time
      FROM MESSAGES m
      INNER JOIN CONVERSATIONS c ON c.convo_id = m.convo_id
      INNER JOIN USERS sender ON sender.user_id = m.sender_id
      WHERE c.is_active = 1
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
        name: conversation.name,
        lastMsg: lastMessage ? `${this.senderLabel(lastMessage.from)}: ${lastMessage.text}` : 'No messages yet',
        time: this.relativeTime(conversation.time),
        unread: Number(conversation.unread ?? 0),
        mode: conversation.mode,
        messages: convoMessages.map((message) => ({
          id: message.id,
          from: message.from,
          text: message.text,
          time: this.clockTime(message.time),
        })),
        product: conversation.productName
          ? {
              name: conversation.productName,
              price: this.formatPeso(conversation.productPrice),
              orderId: `Conversation ${conversation.id.slice(0, 8).toUpperCase()}`,
              imageUrl: conversation.imageUrl,
              emoji: 'Product',
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

    const conversation = await this.databaseService.request<{ sellerId: string }>((request) =>
      request.input('conversationId', conversationId).query(`
        SELECT CONVERT(varchar(36), seller_id) AS sellerId
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
        .input('senderId', conversation[0].sellerId)
        .input('body', trimmedText)
        .query(`
          INSERT INTO MESSAGES (convo_id, sender_id, body, is_read)
          VALUES (@conversationId, @senderId, @body, 0)

          UPDATE CONVERSATIONS
          SET last_message_at = GETDATE()
          WHERE convo_id = @conversationId
        `),
    );

    return this.chats();
  }

  async notifications() {
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

    await this.databaseService.request((request) => {
      request
        .input('userId', sql.UniqueIdentifier, userId)
        .input('fullName', sql.NVarChar(255), fullName)
        .input('email', sql.NVarChar(255), email)
        .input('phone', sql.NVarChar(30), phone)
        .input('idTypeId', sql.TinyInt, idTypeRows[0]?.idTypeId ?? null)
        .input('idNumber', sql.NVarChar(100), idNumber)
        .input('isActive', sql.Bit, payload.isActive === false ? 0 : 1);

      if (password) {
        request.input('password', sql.NVarChar(255), password);
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
          ${password ? ', password_hash = @password' : ''}
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

  private senderLabel(sender: string) {
    if (sender === 'customer') return 'Customer';
    if (sender === 'ai') return 'AI';
    return 'You';
  }

  private clockTime(value: Date | string | null) {
    if (!value) return '';
    return new Intl.DateTimeFormat('en-PH', {
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
