import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';
import { assertCleanText } from '../common/profanity';
import { DatabaseService } from '../database/database.service';

type ConversationRow = {
  id: string;
  name: string;
  lastMsg: string | null;
  time: Date | null;
  unread: number;
  productId: string | null;
  productName: string | null;
  productPrice: number | null;
  sizeId: number | null;
  imageUrl: string | null;
  cartItemId: string | null;
  orderId: string | null;
  orderStatus: string | null;
  reviewed: boolean | number | null;
};

type MessageRow = {
  id: string;
  convoId: string;
  from: 'admin' | 'customer';
  text: string;
  time: Date;
  isRead: boolean;
  readAt: Date | null;
};

type GeminiHistoryRow = {
  senderId: string;
  text: string;
  time: Date;
};

type BotContext = {
  user: string;
  products: string;
  orders: string;
  cart: string;
  saved: string;
};

@Injectable()
export class ChatService {
  // Public clients may ask for "gemini-bot", but USERS.user_id is a uniqueidentifier.
  private readonly geminiBotAlias = 'gemini-bot';
  private readonly geminiBotUserId = '11111111-1111-4111-8111-111111111111';
  private readonly geminiModel = 'gemini-3.5-flash';
  private readonly botHourlyLimit = 20;

  constructor(private readonly databaseService: DatabaseService) {}

  async conversations(userId: string) {
    await this.ensureUser(userId);

    const conversations = await this.databaseService.request<ConversationRow>(
      (request) =>
        request.input('userId', sql.UniqueIdentifier, userId).query(`
        SELECT
          CONVERT(varchar(36), c.convo_id) AS id,
          CASE WHEN seller.is_bot = 1 THEN seller.full_name ELSE COALESCE(p.name, 'A''FRO Official Support') END AS name,
          latest.body AS lastMsg,
          COALESCE(latest.sent_at, c.last_message_at) AS time,
          COUNT(CASE WHEN m.is_read = 0 AND m.sender_id = c.seller_id THEN 1 END) AS unread,
          CONVERT(varchar(36), p.product_id) AS productId,
          p.name AS productName,
          CAST(p.price AS float) AS productPrice,
          stock.size_id AS sizeId,
          pi.image_url AS imageUrl,
          CONVERT(varchar(36), cart.cart_item_id) AS cartItemId,
          CONVERT(varchar(36), latestOrder.order_id) AS orderId,
          latestOrder.status AS orderStatus,
          CASE WHEN review.review_id IS NULL THEN 0 ELSE 1 END AS reviewed
        FROM CONVERSATIONS c
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
        OUTER APPLY (
          SELECT TOP 1 size_id
          FROM PRODUCT_SIZE_STOCK
          WHERE product_id = p.product_id AND stock_qty > 0
          ORDER BY stock_qty DESC
        ) stock
        OUTER APPLY (
          SELECT TOP 1 cart_item_id
          FROM CART_ITEMS
          WHERE user_id = c.buyer_id AND product_id = c.product_id
          ORDER BY added_at DESC
        ) cart
        OUTER APPLY (
          SELECT TOP 1 o.order_id, os.label AS status
          FROM ORDERS o
          INNER JOIN ORDER_STATUSES os ON os.status_id = o.status_id
          INNER JOIN ORDER_ITEMS oi ON oi.order_id = o.order_id
          WHERE o.user_id = c.buyer_id AND oi.product_id = c.product_id
          ORDER BY o.updated_at DESC, o.placed_at DESC
        ) latestOrder
        OUTER APPLY (
          SELECT TOP 1 review_id
          FROM REVIEWS
          WHERE user_id = c.buyer_id AND product_id = c.product_id
        ) review
        LEFT JOIN MESSAGES m ON m.convo_id = c.convo_id
        WHERE c.buyer_id = @userId AND c.is_active = 1 AND c.buyer_deleted_at IS NULL
        GROUP BY c.convo_id, seller.is_bot, seller.full_name, p.product_id, p.name, p.price, stock.size_id, pi.image_url, cart.cart_item_id, latestOrder.order_id, latestOrder.status, review.review_id, latest.body, latest.sent_at, c.last_message_at
        ORDER BY COALESCE(latest.sent_at, c.last_message_at) DESC
      `),
    );

    if (!conversations.length) {
      return [];
    }

    const messages = await this.databaseService.request<MessageRow>((request) =>
      request.input('userId', sql.UniqueIdentifier, userId).query(`
        SELECT
          CONVERT(varchar(36), m.message_id) AS id,
          CONVERT(varchar(36), m.convo_id) AS convoId,
          CASE WHEN m.sender_id = c.buyer_id THEN 'customer' ELSE 'admin' END AS [from],
          m.body AS text,
          m.sent_at AS time,
          m.is_read AS isRead,
          m.read_at AS readAt
        FROM MESSAGES m
        INNER JOIN CONVERSATIONS c ON c.convo_id = m.convo_id
        WHERE c.buyer_id = @userId AND c.is_active = 1 AND c.buyer_deleted_at IS NULL
        ORDER BY m.sent_at ASC
      `),
    );

    const messagesByConversation = messages.reduce<
      Record<string, MessageRow[]>
    >((acc, message) => {
      acc[message.convoId] ??= [];
      acc[message.convoId].push(message);
      return acc;
    }, {});

    return conversations.map((conversation) => {
      const convoMessages = messagesByConversation[conversation.id] ?? [];
      const lastMessage = convoMessages.at(-1);
      const normalizedStatus = this.normalizeOrderStatus(
        conversation.orderStatus,
      );
      const action =
        normalizedStatus === 'Active'
          ? 'track'
          : normalizedStatus === 'Delivered' || normalizedStatus === 'Cancelled'
            ? 'review'
            : conversation.cartItemId
              ? 'buy'
              : 'add';

      return {
        id: conversation.id,
        name: conversation.productName
          ? `Inquiry: ${conversation.productName}`
          : conversation.name,
        lastMsg: lastMessage?.text ?? 'No messages yet',
        time: this.relativeTime(conversation.time),
        unread: Number(conversation.unread ?? 0),
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
              id: conversation.productId,
              name: conversation.productName,
              price: this.formatPeso(conversation.productPrice),
              orderId: `Inquiry ${conversation.id.slice(0, 8).toUpperCase()}`,
              sizeId: conversation.sizeId,
              imageUrl: conversation.imageUrl,
              isInCart: Boolean(conversation.cartItemId),
              action,
              placedOrderId: conversation.orderId,
              reviewed: Boolean(conversation.reviewed),
            }
          : null,
      };
    });
  }

  async createConversation(userId: string, productId: string) {
    await this.ensureUser(userId);
    if (this.isGeminiBotProduct(productId)) {
      return this.createBotConversation(userId);
    }

    await this.ensureProduct(productId);
    const adminId = await this.adminUserId();

    const existing = await this.databaseService.request<{ id: string }>(
      (request) =>
        request
          .input('userId', sql.UniqueIdentifier, userId)
          .input('productId', sql.UniqueIdentifier, productId).query(`
          SELECT TOP 1 CONVERT(varchar(36), convo_id) AS id
          FROM CONVERSATIONS
          WHERE buyer_id = @userId AND product_id = @productId AND is_active = 1
          ORDER BY COALESCE(last_message_at, GETDATE()) DESC
        `),
    );

    if (existing[0]) {
      await this.databaseService.request((request) =>
        request.input('conversationId', sql.UniqueIdentifier, existing[0].id)
          .query(`
            UPDATE CONVERSATIONS
            SET buyer_deleted_at = NULL,
                seller_deleted_at = NULL,
                last_message_at = COALESCE(last_message_at, GETDATE())
            WHERE convo_id = @conversationId
          `),
      );
      return this.conversation(userId, existing[0].id);
    }

    const created = await this.databaseService.request<{ id: string }>(
      (request) =>
        request
          .input('userId', sql.UniqueIdentifier, userId)
          .input('adminId', sql.UniqueIdentifier, adminId)
          .input('productId', sql.UniqueIdentifier, productId).query(`
          INSERT INTO CONVERSATIONS (buyer_id, seller_id, product_id, last_message_at)
          OUTPUT CONVERT(varchar(36), inserted.convo_id) AS id
          VALUES (@userId, @adminId, @productId, GETDATE())
        `),
    );

    const conversationId = created[0]?.id;
    await this.databaseService.request((request) =>
      request
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .input('adminId', sql.UniqueIdentifier, adminId).query(`
          INSERT INTO MESSAGES (convo_id, sender_id, body, is_read)
          VALUES (@conversationId, @adminId, 'Hi! This is A''FRO Official Support. How can we help with this product?', 0)
        `),
    );

    return this.conversation(userId, conversationId);
  }

  async sendMessage(conversationId: string, userId: string, text: string) {
    const trimmedText = text?.trim();

    if (!trimmedText) {
      throw new BadRequestException('Message text is required');
    }

    assertCleanText(trimmedText, 'Message');

    const conversation = await this.databaseService.request<{
      id: string;
      sellerId: string;
      sellerName: string;
    }>((request) =>
      request
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .input('userId', sql.UniqueIdentifier, userId).query(`
        SELECT
          CONVERT(varchar(36), c.convo_id) AS id,
          CONVERT(varchar(36), c.seller_id) AS sellerId,
          seller.full_name AS sellerName
        FROM CONVERSATIONS c
        LEFT JOIN USERS seller ON seller.user_id = c.seller_id
        WHERE c.convo_id = @conversationId
          AND c.buyer_id = @userId
          AND c.is_active = 1
      `),
    );

    if (!conversation[0]) {
      throw new NotFoundException('Conversation not found');
    }

    await this.databaseService.request((request) =>
      request
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .input('userId', sql.UniqueIdentifier, userId)
        .input('body', sql.NVarChar(sql.MAX), trimmedText).query(`
        INSERT INTO MESSAGES (convo_id, sender_id, body, is_read)
        VALUES (@conversationId, @userId, @body, 0);

        UPDATE CONVERSATIONS
        SET last_message_at = GETDATE(),
            buyer_deleted_at = NULL,
            seller_deleted_at = NULL
        WHERE convo_id = @conversationId;
      `),
    );

    if (this.isBotConversation(conversation[0])) {
      const reply = await this.createBotReply(conversationId, userId);
      await this.saveBotMessage(conversationId, reply);
    }

    return this.conversation(userId, conversationId);
  }

  async markRead(conversationId: string, userId: string) {
    const conversation = await this.databaseService.request<{
      sellerId: string;
    }>((request) =>
      request
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .input('userId', sql.UniqueIdentifier, userId).query(`
          SELECT CONVERT(varchar(36), seller_id) AS sellerId
          FROM CONVERSATIONS
          WHERE convo_id = @conversationId AND buyer_id = @userId AND is_active = 1
        `),
    );

    if (!conversation[0]) {
      throw new NotFoundException('Conversation not found');
    }

    await this.databaseService.request((request) =>
      request
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .input('sellerId', sql.UniqueIdentifier, conversation[0].sellerId)
        .query(`
          UPDATE MESSAGES
          SET is_read = 1,
              read_at = COALESCE(read_at, GETDATE())
          WHERE convo_id = @conversationId AND sender_id = @sellerId
        `),
    );

    return this.conversation(userId, conversationId);
  }

  async deleteConversation(conversationId: string, userId: string) {
    const updated = await this.databaseService.request<{ id: string }>(
      (request) =>
        request
          .input('conversationId', sql.UniqueIdentifier, conversationId)
          .input('userId', sql.UniqueIdentifier, userId).query(`
          UPDATE CONVERSATIONS
          SET buyer_deleted_at = GETDATE()
          OUTPUT CONVERT(varchar(36), inserted.convo_id) AS id
          WHERE convo_id = @conversationId
            AND buyer_id = @userId
            AND is_active = 1
        `),
    );

    if (!updated[0]) {
      throw new NotFoundException('Conversation not found');
    }

    return { deleted: true, id: conversationId };
  }

  async createBotConversation(userId: string) {
    const existing = await this.databaseService.request<{ id: string }>(
      (request) =>
        request
          .input('userId', sql.UniqueIdentifier, userId)
          .input('botUserId', sql.UniqueIdentifier, this.geminiBotUserId)
          .query(`
          SELECT TOP 1 CONVERT(varchar(36), convo_id) AS id
          FROM CONVERSATIONS
          WHERE buyer_id = @userId
            AND seller_id = @botUserId
            AND product_id IS NULL
            AND is_active = 1
          ORDER BY COALESCE(last_message_at, GETDATE()) DESC
        `),
    );

    if (existing[0]) {
      await this.databaseService.request((request) =>
        request.input('conversationId', sql.UniqueIdentifier, existing[0].id)
          .query(`
          UPDATE CONVERSATIONS
          SET buyer_deleted_at = NULL,
              seller_deleted_at = NULL,
              last_message_at = COALESCE(last_message_at, GETDATE())
          WHERE convo_id = @conversationId
        `),
      );

      return this.conversation(userId, existing[0].id);
    }

    const created = await this.databaseService.request<{ id: string }>(
      (request) =>
        request
          .input('userId', sql.UniqueIdentifier, userId)
          .input('botUserId', sql.UniqueIdentifier, this.geminiBotUserId)
          .query(`
          INSERT INTO CONVERSATIONS (buyer_id, seller_id, product_id, last_message_at)
          OUTPUT CONVERT(varchar(36), inserted.convo_id) AS id
          VALUES (@userId, @botUserId, NULL, GETDATE())
        `),
    );

    const conversationId = created[0]?.id;
    await this.saveBotMessage(
      conversationId,
      'Hi! I am AI Assistant. Ask me about orders, sizing, products, or anything you need help with.',
    );

    return this.conversation(userId, conversationId);
  }

  private async createBotReply(conversationId: string, userId: string) {
    try {
      if (await this.isBotRateLimited(userId)) {
        return 'I can answer up to 20 messages per hour. Please try me again a little later.';
      }

      const latestMessage = await this.latestCustomerMessage(conversationId);
      if (this.isHumanSupportRequest(latestMessage)) {
        await this.switchConversationToHuman(conversationId);
        return "Sure. I will connect this chat to A'FRO support so a staff member can help you directly.";
      }

      return await this.fetchGeminiReply(conversationId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'GEMINI_API_KEY is not configured'
      ) {
        return this.createLocalSupportReply(conversationId);
      }

      console.error('[Gemini] Failed to create bot reply', {
        message: error instanceof Error ? error.message : String(error),
      });

      return 'Sorry, I am having trouble answering right now. Please try again in a moment.';
    }
  }

  private async isBotRateLimited(userId: string) {
    const rows = await this.databaseService.request<{ count: number }>(
      (request) =>
        request
          .input('userId', sql.UniqueIdentifier, userId)
          .input('botUserId', sql.UniqueIdentifier, this.geminiBotUserId)
          .input('limit', sql.Int, this.botHourlyLimit).query(`
          SELECT COUNT(*) AS count
          FROM MESSAGES m
          INNER JOIN CONVERSATIONS c ON c.convo_id = m.convo_id
          WHERE c.buyer_id = @userId
            AND c.seller_id = @botUserId
            AND m.sender_id = @userId
            AND m.sent_at >= DATEADD(hour, -1, GETDATE())
        `),
    );

    return Number(rows[0]?.count ?? 0) > this.botHourlyLimit;
  }

  private async fetchGeminiReply(conversationId: string) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const history = await this.recentGeminiHistory(conversationId);
    const latestCustomerMessage =
      [...history]
        .reverse()
        .find(
          (message) => message.senderId.toLowerCase() !== this.geminiBotUserId,
        )?.text ?? '';
    const appContext = await this.botContextForConversation(
      conversationId,
      latestCustomerMessage,
    );
    const contents = history.map((message) => ({
      role:
        message.senderId.toLowerCase() === this.geminiBotUserId
          ? 'model'
          : 'user',
      parts: [{ text: message.text }],
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [
              {
                text: [
                  "You are AI Assistant for A'FRO Dry Goods. Be concise, friendly, and helpful about shopping, orders, sizing, returns, and product questions.",
                  'Use the customer and store context below. If the customer gives a product ID or product name, answer from the matching product data. Do not ask for product details that are already present in the context.',
                  appContext.user,
                  appContext.products,
                  appContext.orders,
                  appContext.cart,
                  appContext.saved,
                ].join('\n\n'),
              },
            ],
          },
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error('[Gemini] generateContent failed', {
        status: response.status,
        body: errorBody.slice(0, 500),
      });
      throw new Error(`Gemini request failed: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text)
      .filter(Boolean)
      .join('\n')
      .trim();

    if (!text) {
      throw new Error('Gemini returned an empty response');
    }

    return text;
  }

  private async orderContextForConversation(conversationId: string) {
    const hasExpectedDelivery = await this.databaseService.columnExists(
      'ORDERS',
      'expected_delivery_at',
    );
    const hasTrackingNumber = await this.databaseService.columnExists(
      'ORDERS',
      'tracking_number',
    );

    const rows = await this.databaseService.request<{
      orderId: string;
      status: string;
      placedAt: Date;
      totalAmount: number;
      productName: string;
      quantity: number;
      size: string;
      expectedDeliveryAt: Date | null;
      trackingNumber: string | null;
    }>((request) =>
      request.input('conversationId', sql.UniqueIdentifier, conversationId)
        .query(`
        SELECT TOP 10
          CONVERT(varchar(36), o.order_id) AS orderId,
          os.label AS status,
          o.placed_at AS placedAt,
          CAST(o.total_amount AS float) AS totalAmount,
          p.name AS productName,
          oi.quantity,
          ss.label AS size,
          ${hasExpectedDelivery ? 'o.expected_delivery_at' : 'NULL'} AS expectedDeliveryAt,
          ${hasTrackingNumber ? 'o.tracking_number' : 'NULL'} AS trackingNumber
        FROM CONVERSATIONS c
        INNER JOIN ORDERS o ON o.user_id = c.buyer_id
        INNER JOIN ORDER_STATUSES os ON os.status_id = o.status_id
        INNER JOIN ORDER_ITEMS oi ON oi.order_id = o.order_id
        INNER JOIN PRODUCTS p ON p.product_id = oi.product_id
        INNER JOIN SIZE_STANDARDS ss ON ss.size_id = oi.size_id
        WHERE c.convo_id = @conversationId
        ORDER BY o.placed_at DESC
      `),
    );

    if (!rows.length) {
      return 'Customer order context: No orders found for this customer.';
    }

    const lines = rows.map((row) => {
      const orderShortId = row.orderId.slice(0, 8).toUpperCase();
      const expected = row.expectedDeliveryAt
        ? `, expected ${new Date(row.expectedDeliveryAt).toLocaleDateString('en-PH')}`
        : '';
      const tracking = row.trackingNumber
        ? `, tracking ${row.trackingNumber}`
        : '';

      return `Order ${orderShortId}: ${row.status}, ${row.quantity} x ${row.productName} (${row.size}), total ${this.formatPeso(row.totalAmount)}${expected}${tracking}.`;
    });

    return `Customer order context:\n${lines.join('\n')}`;
  }

  private async botContextForConversation(
    conversationId: string,
    latestMessage: string,
  ): Promise<BotContext> {
    const [user, products, orders, cart, saved] = await Promise.all([
      this.userContextForConversation(conversationId),
      this.productContextForMessage(conversationId, latestMessage),
      this.orderContextForConversation(conversationId),
      this.cartContextForConversation(conversationId),
      this.savedContextForConversation(conversationId),
    ]);

    return { user, products, orders, cart, saved };
  }

  private async userContextForConversation(conversationId: string) {
    const rows = await this.databaseService.request<{
      fullName: string;
      email: string;
      phone: string | null;
      preferredSize: string | null;
      style: string | null;
      palette: string | null;
      skinHex: string | null;
      chestCm: number | null;
      waistCm: number | null;
      hipCm: number | null;
      heightCm: number | null;
      weightKg: number | null;
    }>((request) =>
      request.input('conversationId', sql.UniqueIdentifier, conversationId)
        .query(`
        SELECT TOP 1
          u.full_name AS fullName,
          u.email,
          u.phone,
          ss.label AS preferredSize,
          fs.label AS style,
          stp.label AS palette,
          u.skin_hex AS skinHex,
          CAST(u.body_chest_cm AS float) AS chestCm,
          CAST(u.body_waist_cm AS float) AS waistCm,
          CAST(u.body_hip_cm AS float) AS hipCm,
          CAST(u.body_height_cm AS float) AS heightCm,
          CAST(u.body_weight_kg AS float) AS weightKg
        FROM CONVERSATIONS c
        INNER JOIN USERS u ON u.user_id = c.buyer_id
        LEFT JOIN SIZE_STANDARDS ss ON ss.size_id = u.preferred_size_id
        LEFT JOIN FASHION_STYLES fs ON fs.style_id = u.style_id
        LEFT JOIN SKIN_TONE_PALETTES stp ON stp.palette_id = u.palette_id
        WHERE c.convo_id = @conversationId
      `),
    );

    const user = rows[0];
    if (!user) return 'Customer context: Customer not found.';

    const measurements = [
      user.chestCm ? `chest ${user.chestCm} cm` : null,
      user.waistCm ? `waist ${user.waistCm} cm` : null,
      user.hipCm ? `hip ${user.hipCm} cm` : null,
      user.heightCm ? `height ${user.heightCm} cm` : null,
      user.weightKg ? `weight ${user.weightKg} kg` : null,
    ].filter(Boolean);

    return [
      'Customer context:',
      `Name: ${user.fullName}`,
      `Email: ${user.email}`,
      user.phone ? `Phone: ${user.phone}` : null,
      user.preferredSize ? `Preferred size: ${user.preferredSize}` : null,
      user.style ? `Style preference: ${user.style}` : null,
      user.palette || user.skinHex
        ? `Skin tone: ${[user.palette, user.skinHex].filter(Boolean).join(' ')}`
        : null,
      measurements.length
        ? `Body measurements: ${measurements.join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async productContextForMessage(
    conversationId: string,
    latestMessage: string,
  ) {
    const hasColorId = await this.databaseService.columnExists(
      'PRODUCTS',
      'color_id',
    );
    const hasDeletedColumn = await this.databaseService.columnExists(
      'PRODUCTS',
      'is_deleted',
    );
    const hasSavedProducts =
      await this.databaseService.tableExists('SAVED_PRODUCTS');
    const productIds = this.extractGuids(latestMessage);
    const colorJoin = hasColorId
      ? 'LEFT JOIN PRESET_COLORS pc ON pc.color_id = p.color_id LEFT JOIN COLOR_FAMILIES cf ON cf.family_id = pc.family_id'
      : '';
    const colorSelect = hasColorId
      ? 'pc.color_name AS colorName, cf.label AS colorFamily'
      : 'p.color_name AS colorName, p.color_name AS colorFamily';
    const deletedFilter = hasDeletedColumn
      ? 'AND ISNULL(p.is_deleted, 0) = 0'
      : '';
    const savedSelect = hasSavedProducts
      ? 'CASE WHEN saved.product_id IS NULL THEN 0 ELSE 1 END'
      : '0';
    const savedJoin = hasSavedProducts
      ? `OUTER APPLY (
          SELECT TOP 1 product_id
          FROM SAVED_PRODUCTS
          WHERE user_id = convo.buyer_id AND product_id = p.product_id
        ) saved`
      : '';

    const rows = await this.databaseService.request<{
      id: string;
      name: string;
      description: string | null;
      price: number;
      brand: string | null;
      colorName: string | null;
      colorFamily: string | null;
      category: string;
      gender: string | null;
      avgRating: number;
      totalQty: number;
      sizeStock: string | null;
      inCart: boolean | number;
      isSaved: boolean | number;
    }>((request) =>
      request
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .input('message', sql.NVarChar(sql.MAX), latestMessage.toLowerCase())
        .input(
          'productIdsJson',
          sql.NVarChar(sql.MAX),
          JSON.stringify(productIds),
        ).query(`
        SELECT TOP 5
          CONVERT(varchar(36), p.product_id) AS id,
          p.name,
          p.description,
          CAST(p.price AS float) AS price,
          p.brand,
          ${colorSelect},
          c.name AS category,
          g.label AS gender,
          CAST(p.avg_rating AS float) AS avgRating,
          CAST(COALESCE(stock.totalQty, p.stock_qty, 0) AS int) AS totalQty,
          stock.sizeStock,
          CASE WHEN cart.cart_item_id IS NULL THEN 0 ELSE 1 END AS inCart,
          ${savedSelect} AS isSaved
        FROM PRODUCTS p
        INNER JOIN CATEGORIES c ON c.category_id = p.category_id
        LEFT JOIN GENDERS g ON g.gender_id = p.gender_id
        ${colorJoin}
        INNER JOIN CONVERSATIONS convo ON convo.convo_id = @conversationId
        OUTER APPLY (
          SELECT
            SUM(CASE WHEN pss.stock_qty > 0 THEN pss.stock_qty ELSE 0 END) AS totalQty,
            STRING_AGG(CONCAT(ss.label, ': ', pss.stock_qty), ', ') WITHIN GROUP (ORDER BY ss.sort_order) AS sizeStock
          FROM PRODUCT_SIZE_STOCK pss
          INNER JOIN SIZE_STANDARDS ss ON ss.size_id = pss.size_id
          WHERE pss.product_id = p.product_id
        ) stock
        OUTER APPLY (
          SELECT TOP 1 cart_item_id
          FROM CART_ITEMS
          WHERE user_id = convo.buyer_id AND product_id = p.product_id
        ) cart
        ${savedJoin}
        WHERE p.is_active = 1
          ${deletedFilter}
          AND (
            p.product_id = convo.product_id
            OR EXISTS (
              SELECT 1
              FROM OPENJSON(@productIdsJson)
              WHERE TRY_CONVERT(uniqueidentifier, [value]) = p.product_id
            )
            OR (@message <> '' AND @message LIKE '%' + LOWER(p.name) + '%')
            OR (@message <> '' AND LOWER(p.name) LIKE '%' + @message + '%')
            OR (@message <> '' AND p.brand IS NOT NULL AND @message LIKE '%' + LOWER(p.brand) + '%')
            OR (@message <> '' AND ${hasColorId ? 'pc.color_name' : 'p.color_name'} IS NOT NULL AND @message LIKE '%' + LOWER(${hasColorId ? 'pc.color_name' : 'p.color_name'}) + '%')
            OR (@message <> '' AND ${hasColorId ? 'cf.label' : 'p.color_name'} IS NOT NULL AND @message LIKE '%' + LOWER(${hasColorId ? 'cf.label' : 'p.color_name'}) + '%')
          )
        ORDER BY
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM OPENJSON(@productIdsJson)
              WHERE TRY_CONVERT(uniqueidentifier, [value]) = p.product_id
            ) THEN 0
            WHEN p.product_id = convo.product_id THEN 1
            ELSE 2
          END,
          p.created_at DESC
      `),
    );

    if (!rows.length) {
      return 'Matching products: No matching products found from the latest message.';
    }

    const lines = rows.map((product) => {
      const stock =
        Number(product.totalQty ?? 0) > 0
          ? `available, total stock ${product.totalQty}`
          : 'out of stock';
      const details = [
        `${product.name} (${product.id})`,
        this.formatPeso(product.price),
        stock,
        product.sizeStock ? `sizes ${product.sizeStock}` : null,
        product.colorName || product.colorFamily
          ? `color ${[product.colorName, product.colorFamily].filter(Boolean).join('/')}`
          : null,
        product.brand ? `brand ${product.brand}` : null,
        product.category ? `category ${product.category}` : null,
        product.gender ? `gender ${product.gender}` : null,
        `rating ${product.avgRating ?? 0}`,
        product.inCart ? 'already in cart' : null,
        product.isSaved ? 'saved by customer' : null,
        product.description ? `description ${product.description}` : null,
      ].filter(Boolean);

      return `- ${details.join('; ')}`;
    });

    return `Matching products:\n${lines.join('\n')}`;
  }

  private async cartContextForConversation(conversationId: string) {
    const rows = await this.databaseService.request<{
      productName: string;
      quantity: number;
      size: string;
      unitPrice: number;
    }>((request) =>
      request.input('conversationId', sql.UniqueIdentifier, conversationId)
        .query(`
        SELECT TOP 5
          p.name AS productName,
          ci.quantity,
          ss.label AS size,
          CAST(p.price AS float) AS unitPrice
        FROM CONVERSATIONS c
        INNER JOIN CART_ITEMS ci ON ci.user_id = c.buyer_id
        INNER JOIN PRODUCTS p ON p.product_id = ci.product_id
        INNER JOIN SIZE_STANDARDS ss ON ss.size_id = ci.size_id
        WHERE c.convo_id = @conversationId
        ORDER BY ci.added_at DESC
      `),
    );

    if (!rows.length) return 'Cart context: Cart is empty.';

    return `Cart context:\n${rows
      .map(
        (row) =>
          `- ${row.quantity} x ${row.productName} (${row.size}) at ${this.formatPeso(row.unitPrice)}`,
      )
      .join('\n')}`;
  }

  private async savedContextForConversation(conversationId: string) {
    if (!(await this.databaseService.tableExists('SAVED_PRODUCTS'))) {
      return 'Saved products context: Saved products are not available.';
    }

    const rows = await this.databaseService.request<{
      productName: string;
      price: number;
    }>((request) =>
      request.input('conversationId', sql.UniqueIdentifier, conversationId)
        .query(`
        SELECT TOP 5
          p.name AS productName,
          CAST(p.price AS float) AS price
        FROM CONVERSATIONS c
        INNER JOIN SAVED_PRODUCTS sp ON sp.user_id = c.buyer_id
        INNER JOIN PRODUCTS p ON p.product_id = sp.product_id
        WHERE c.convo_id = @conversationId
        ORDER BY sp.saved_at DESC
      `),
    );

    if (!rows.length) return 'Saved products context: No saved products.';

    return `Saved products context:\n${rows
      .map((row) => `- ${row.productName} at ${this.formatPeso(row.price)}`)
      .join('\n')}`;
  }

  private async recentGeminiHistory(conversationId: string) {
    const rows = await this.databaseService.request<GeminiHistoryRow>(
      (request) =>
        request.input('conversationId', sql.UniqueIdentifier, conversationId)
          .query(`
        SELECT *
        FROM (
          SELECT TOP 15
            CONVERT(varchar(36), sender_id) AS senderId,
            body AS text,
            sent_at AS time
          FROM MESSAGES
          WHERE convo_id = @conversationId
          ORDER BY sent_at DESC
        ) recent
        ORDER BY recent.time ASC
      `),
    );

    return rows;
  }

  private async createLocalSupportReply(conversationId: string) {
    const [history, context] = await Promise.all([
      this.recentGeminiHistory(conversationId),
      this.botContextForConversation(
        conversationId,
        await this.latestCustomerMessage(conversationId),
      ),
    ]);
    const latestCustomerMessage = [...history]
      .reverse()
      .find(
        (message) => message.senderId.toLowerCase() !== this.geminiBotUserId,
      )
      ?.text.toLowerCase();
    const question = latestCustomerMessage ?? '';
    const hasOrders = !context.orders.includes('No orders found');
    const hasProducts = !context.products.includes(
      'No matching products found',
    );

    if (this.isHumanSupportRequest(question)) {
      await this.switchConversationToHuman(conversationId);
      return "Sure. I will connect this chat to A'FRO support so a staff member can help you directly.";
    }

    if (hasProducts) {
      if (
        question.includes('available') ||
        question.includes('stock') ||
        question.includes('size') ||
        question.includes('price') ||
        question.includes('product') ||
        question.includes('this')
      ) {
        return `${context.products.replace('Matching products:\n', '')}\n\nYou can add an available size to your cart from the product page.`;
      }
    }

    if (
      question.includes('order') ||
      question.includes('status') ||
      question.includes('track') ||
      question.includes('delivery') ||
      question.includes('deliver') ||
      question.includes('ship')
    ) {
      return hasOrders
        ? `Here is what I found for your recent order:\n\n${context.orders.replace('Customer order context:\n', '')}\n\nIf you need a more specific update, please send the order ID or the item name.`
        : 'I do not see any recent orders on your account yet. Please send your order ID or the item name so our support team can check it for you.';
    }

    if (
      question.includes('size') ||
      question.includes('fit') ||
      question.includes('measurement')
    ) {
      if (hasProducts) {
        return `${context.products.replace('Matching products:\n', '')}\n\n${context.user.replace('Customer context:\n', '')}\n\nUse the product measurements and your saved body details above to choose the closest available size.`;
      }

      if (context.user.includes('Body measurements:')) {
        return `${context.user.replace('Customer context:\n', '')}\n\nI can use your saved body measurements for sizing. Send the product name or product ID you want to check so I can compare it with the available product sizes.`;
      }

      return 'For sizing, please send your height, weight, and usual shirt/pants size. If you are asking about an item you ordered, send the item name too so I can compare it with the available size details.';
    }

    if (
      question.includes('return') ||
      question.includes('refund') ||
      question.includes('exchange')
    ) {
      return 'For returns, refunds, or exchanges, please send your order ID, the item name, and a short reason. A support staff member can review the request and guide you through the next step.';
    }

    if (
      question.includes('price') ||
      question.includes('available') ||
      question.includes('stock') ||
      question.includes('product')
    ) {
      return 'Please send the product name, size, or color you want to check. I can help with availability, pricing, and basic product questions.';
    }

    if (
      question.includes('hello') ||
      question.includes('hi') ||
      question.includes('hey')
    ) {
      return 'Hi! I can help with orders, delivery status, sizing, returns, exchanges, and product availability. What would you like to check?';
    }

    return 'I can help with orders, delivery status, sizing, returns, exchanges, and product availability. Please send the order ID, product name, or a few more details so I can guide you.';
  }

  private async latestCustomerMessage(conversationId: string) {
    const rows = await this.databaseService.request<{ text: string }>(
      (request) =>
        request
          .input('conversationId', sql.UniqueIdentifier, conversationId)
          .input('botUserId', sql.UniqueIdentifier, this.geminiBotUserId)
          .query(`
        SELECT TOP 1 body AS text
        FROM MESSAGES
        WHERE convo_id = @conversationId
          AND sender_id <> @botUserId
        ORDER BY sent_at DESC
      `),
    );

    return rows[0]?.text ?? '';
  }

  private isHumanSupportRequest(message: string | undefined | null) {
    const text = message?.toLowerCase() ?? '';

    return (
      text.includes('talk to a person') ||
      text.includes('speak to a person') ||
      text.includes('human') ||
      text.includes('staff') ||
      text.includes('agent') ||
      text.includes('representative') ||
      text.includes('support person') ||
      text.includes('real person')
    );
  }

  private async switchConversationToHuman(conversationId: string) {
    const adminId = await this.adminUserId();

    await this.databaseService.request((request) =>
      request
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .input('adminId', sql.UniqueIdentifier, adminId).query(`
        UPDATE CONVERSATIONS
        SET seller_id = @adminId,
            seller_deleted_at = NULL,
            last_message_at = GETDATE()
        WHERE convo_id = @conversationId
      `),
    );
  }

  private extractGuids(text: string) {
    return Array.from(
      new Set(
        text.match(
          /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
        ) ?? [],
      ),
    );
  }

  private async saveBotMessage(
    conversationId: string | undefined,
    text: string,
  ) {
    if (!conversationId) {
      throw new NotFoundException('Conversation not found');
    }

    await this.databaseService.request((request) =>
      request
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .input('botUserId', sql.UniqueIdentifier, this.geminiBotUserId)
        .input('body', sql.NVarChar(sql.MAX), text).query(`
          INSERT INTO MESSAGES (convo_id, sender_id, body, is_read)
          VALUES (@conversationId, @botUserId, @body, 0);

          UPDATE CONVERSATIONS
          SET last_message_at = GETDATE(),
              buyer_deleted_at = NULL,
              seller_deleted_at = NULL
          WHERE convo_id = @conversationId;
        `),
    );
  }

  private isGeminiBotProduct(productId?: string | null) {
    return productId?.trim().toLowerCase() === this.geminiBotAlias;
  }

  private isBotConversation(conversation: {
    sellerId: string;
    sellerName?: string;
  }) {
    return (
      conversation.sellerId?.toLowerCase() === this.geminiBotUserId ||
      conversation.sellerName?.toLowerCase() === 'ai assistant'
    );
  }

  private async conversation(userId: string, conversationId: string) {
    const conversations = await this.conversations(userId);
    const conversation = conversations.find(
      (item) => item.id === conversationId,
    );

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  private async ensureUser(userId: string) {
    if (!userId) {
      throw new BadRequestException('User is required');
    }

    const users = await this.databaseService.request<{ id: string }>(
      (request) =>
        request.input('userId', sql.UniqueIdentifier, userId).query(`
        SELECT CONVERT(varchar(36), user_id) AS id
        FROM USERS
        WHERE user_id = @userId AND is_active = 1
      `),
    );

    if (!users[0]) {
      throw new NotFoundException('User not found');
    }
  }

  private async ensureProduct(productId: string) {
    if (!productId) {
      throw new BadRequestException('Product is required');
    }

    const products = await this.databaseService.request<{ id: string }>(
      (request) =>
        request.input('productId', sql.UniqueIdentifier, productId).query(`
        SELECT CONVERT(varchar(36), product_id) AS id
        FROM PRODUCTS
        WHERE product_id = @productId AND is_active = 1
      `),
    );

    if (!products[0]) {
      throw new NotFoundException('Product not found');
    }
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
    return `PHP ${Number(value ?? 0).toLocaleString('en-PH', {
      maximumFractionDigits: 0,
    })}`;
  }

  private normalizeOrderStatus(status?: string | null) {
    const lower = (status ?? '').toLowerCase();
    if (lower.includes('cancel')) return 'Cancelled';
    if (lower.includes('deliver') || lower.includes('complete'))
      return 'Delivered';
    if (!lower) return null;
    return 'Active';
  }
}
