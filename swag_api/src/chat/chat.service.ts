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
  isBot: boolean | number | null;
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

type ChatbotAction = {
  id: string;
  label: string;
  prompt: string;
  action?: 'OPEN_TRY_ON' | 'OPEN_TRACKING' | 'OPEN_ORDER_DETAILS' | 'ADD_TO_CART' | 'TRANSFER_TO_AGENT';
};

type ChatbotReply = {
  text: string;
  quickActions: ChatbotAction[];
  action?: ChatbotAction['action'];
  orderId?: string;
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
          seller.is_bot AS isBot,
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
        isAi: Boolean(conversation.isBot),
        type: Boolean(conversation.isBot) ? 'ai' : 'support',
        chatbot: Boolean(conversation.isBot)
          ? { quickActions: conversation.productId ? this.productActions(conversation.productId) : this.generalActions() }
          : undefined,
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
    // Product inquiries start in the product-aware AI flow. It can still be
    // reassigned to an admin by switchConversationToHuman when needed.
    const adminId = this.geminiBotUserId;

    const existing = await this.databaseService.request<{ id: string }>(
      (request) =>
        request
          .input('userId', sql.UniqueIdentifier, userId)
          .input('productId', sql.UniqueIdentifier, productId).query(`
          SELECT TOP 1 CONVERT(varchar(36), convo_id) AS id
          FROM CONVERSATIONS
          WHERE buyer_id = @userId AND product_id = @productId AND is_active = 1
          ORDER BY COALESCE(last_message_at, SYSUTCDATETIME()) DESC
        `),
    );

    if (existing[0]) {
      await this.databaseService.request((request) =>
        request.input('conversationId', sql.UniqueIdentifier, existing[0].id)
          .query(`
            UPDATE CONVERSATIONS
            SET buyer_deleted_at = NULL,
                seller_deleted_at = NULL,
                last_message_at = COALESCE(last_message_at, SYSUTCDATETIME())
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
          VALUES (@userId, @adminId, @productId, SYSUTCDATETIME())
        `),
    );

    const conversationId = created[0]?.id;
    await this.databaseService.request((request) =>
      request
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .input('adminId', sql.UniqueIdentifier, adminId).query(`
          INSERT INTO MESSAGES (convo_id, sender_id, body, is_read, sent_at)
          VALUES (@conversationId, @adminId, 'Hi! I can help with this item’s measurements, availability, shipping, condition, or AI Try-On. What would you like to check?', 0, SYSUTCDATETIME())
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
        INSERT INTO MESSAGES (convo_id, sender_id, body, is_read, sent_at)
        VALUES (@conversationId, @userId, @body, 0, SYSUTCDATETIME());

        UPDATE CONVERSATIONS
        SET last_message_at = SYSUTCDATETIME(),
            buyer_deleted_at = NULL,
            seller_deleted_at = NULL
        WHERE convo_id = @conversationId;
      `),
    );

    let chatbot: ChatbotReply | undefined;
    if (this.isBotConversation(conversation[0])) {
      const reply = await this.createBotReply(conversationId, userId);
      await this.saveBotMessage(conversationId, reply.text);
      chatbot = reply;
    }

    return { ...(await this.conversation(userId, conversationId)), chatbot };
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
              read_at = COALESCE(read_at, SYSUTCDATETIME())
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
          SET buyer_deleted_at = SYSUTCDATETIME()
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
    // Keep the AI route consistent with normal chat creation: validate the
    // customer before using their id in a conversation insert.
    await this.ensureUser(userId);

    // The Messages-page AI Chat action intentionally starts a fresh session.
    // Older sessions remain in the customer's history and are never reopened.
    const created = await this.databaseService.request<{ id: string }>(
      (request) =>
        request
          .input('userId', sql.UniqueIdentifier, userId)
          .input('botUserId', sql.UniqueIdentifier, this.geminiBotUserId)
          .query(`
          INSERT INTO CONVERSATIONS (buyer_id, seller_id, product_id, last_message_at)
          OUTPUT CONVERT(varchar(36), inserted.convo_id) AS id
          VALUES (@userId, @botUserId, NULL, SYSUTCDATETIME())
        `),
    );

    const conversationId = created[0]?.id;
    await this.saveBotMessage(
      conversationId,
      'Hi! I am AI Assistant. Ask me about orders, sizing, products, or anything you need help with.',
    );

    return this.conversation(userId, conversationId);
  }

  private async createBotReply(conversationId: string, userId: string): Promise<ChatbotReply> {
    try {
      if (await this.isBotRateLimited(userId)) {
        return this.reply('I can answer up to 20 messages per hour. Please try me again a little later.');
      }

      const latestMessage = await this.latestCustomerMessage(conversationId);
      if (this.isHumanSupportRequest(latestMessage)) {
        await this.switchConversationToHuman(conversationId);
        return this.transferReply();
      }

      const verified = await this.verifiedBotReply(conversationId, latestMessage);
      if (verified) return verified;

      return this.reply(await this.fetchGeminiReply(conversationId), this.generalActions());
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'GEMINI_API_KEY is not configured'
      ) {
        return (await this.verifiedBotReply(conversationId, await this.latestCustomerMessage(conversationId)))
          ?? this.reply('I can help with orders, payments, shipping, sizing, item condition, and AI Try-On. Please choose an option below.', this.generalActions());
      }

      console.error('[Gemini] Failed to create bot reply', {
        message: error instanceof Error ? error.message : String(error),
      });

      return this.reply('Sorry, I am having trouble answering right now. Please try again in a moment.', this.generalActions());
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
            AND m.sent_at >= DATEADD(hour, -1, SYSUTCDATETIME())
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
                  "You are AI Assistant for A'FRO Dry Goods. Be concise, friendly, and helpful.",
                  'Do not state or infer business facts such as prices, stock, measurements, condition, order/payment status, shipping fees, delivery dates, couriers, or tracking details. Those are supplied by the application separately. For those topics, ask the customer to select a relevant option or offer human support.',
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

  /**
   * Business answers are intentionally resolved here, before Gemini is called.
   * This keeps database/API data authoritative and lets Gemini remain a purely
   * conversational fallback for non-transactional requests.
   */
  private async verifiedBotReply(conversationId: string, message: string): Promise<ChatbotReply | null> {
    const text = message.toLowerCase();
    const normalizedMessage = message.trim().toLowerCase();
    const product = await this.conversationProduct(conversationId);
    const selectedOrder = text.match(/\border ([a-f0-9]{8})\b/i)?.[1];
    if (/^(talk to (an )?agent|contact support)$/i.test(message.trim())) {
      await this.switchConversationToHuman(conversationId);
      return this.transferReply();
    }
    if (normalizedMessage === 'delivery & shipping') {
      return product
        ? this.reply(`What would you like to check about shipping for ${product.name}?`, this.productShippingActions(product.id))
        : this.reply('What would you like to check about delivery and shipping?', this.deliveryShippingActions());
    }
    if (normalizedMessage === 'shipping fee') {
      return product
        ? this.chooseProductOrderReply(conversationId, product.id, 'shipping')
        : this.generalShippingRateReply(conversationId);
    }
    if (normalizedMessage === 'estimated delivery / tracking') {
      return product
        ? this.latestProductDeliveryReply(conversationId, product.id)
        : this.generalDeliveryReply(conversationId);
    }
    // Keep this explicit so the product quick action can never fall through to
    // the generic assistant menu.
    if (product && normalizedMessage === 'view measurements') {
      return this.productMeasurementsReply(product, text, conversationId);
    }

    const isProductQuestion = Boolean(product) && (
      /^action:(measurements|sizes|sizing|condition|defects|availability|shipping|couriers|delivery|try-on|agent)$/i.test(message.trim()) ||
      /\b(measurement|size|fit|condition|defect|flaw|stain|damage|stock|available|availability|shipping|courier|delivery|try.?on)\b/.test(text)
    );

    if (product && isProductQuestion) {
      if (selectedOrder && /shipping fee/.test(text)) {
        return this.shippingReply(conversationId, this.productShippingActions(product.id), selectedOrder);
      }
      if (selectedOrder && /estimated delivery|tracking/.test(text)) {
        return this.deliveryReply(conversationId, this.productShippingActions(product.id), selectedOrder);
      }
      if (/^(shipping & delivery|check shipping|shipping)$/.test(normalizedMessage)) {
        return this.reply(`What would you like to check about shipping for ${product.name}?`, this.productShippingActions(product.id));
      }
      if (normalizedMessage === 'available couriers') {
        return this.reply('J&T Express is currently the available courier. More courier options are under development.', this.productShippingActions(product.id));
      }
      if (normalizedMessage === 'estimated delivery') {
        return this.latestProductDeliveryReply(conversationId, product.id);
      }
      if (/defect|flaw|stain|damage/.test(text)) {
        await this.switchConversationToHuman(conversationId);
        return this.transferReply('I do not have verified detail about that physical condition. I’ll connect you with support so they can check the item.');
      }
      if (/condition/.test(text)) {
        return this.reply('Detailed condition information for this item is being updated. A support agent can verify it for you.', this.productActions(product.id));
      }
      if (/stock|available|availability/.test(text)) {
        return this.productAvailabilityReply(product, conversationId);
      }
      if (/measurements|size|fit/.test(text)) {
        return this.productMeasurementsReply(product, text, conversationId);
      }
      if (/courier/.test(text)) {
        return this.reply('J&T Express is currently the available courier. More courier options are under development.', this.productShippingActions(product.id));
      }
      if (/shipping|delivery/.test(text)) {
        return this.reply(`What would you like to check about shipping for ${product.name}?`, this.productShippingActions(product.id));
      }
      if (/try.?on/.test(text)) {
        return this.reply('I can open AI Try-On for this item. Upload a clear, good-quality photo and follow the instructions on the Try-On screen.', this.productActions(product.id), 'OPEN_TRY_ON');
      }
    }

    if (/^my order$/i.test(message.trim())) return this.reply('What would you like to check?', [
      { id: 'order-status', label: 'View Order Status', prompt: 'View Order Status' },
      { id: 'order-details', label: 'Order Details', prompt: 'Order Details' },
    ]);
    if (/^payment$/i.test(message.trim())) return this.reply('What would you like to know about payment?', [
      { id: 'payment-methods', label: 'Payment Methods', prompt: 'Payment Methods' },
      { id: 'payment-status', label: 'Payment Status', prompt: 'Payment Status' },
    ]);
    if (/^ai try-on$/i.test(message.trim())) return this.reply('How can I help with AI Try-On?', [
      { id: 'try-on-how', label: 'How to Use Try-On', prompt: 'How to Use Try-On' },
      { id: 'try-on-upload', label: 'Upload Photo Help', prompt: 'Upload Photo Help' },
      { id: 'try-on-problem', label: 'Try-On Not Working', prompt: 'Try-On Not Working' },
    ]);
    if (/^view order status$/i.test(message.trim())) return this.chooseOrderReply(conversationId, 'status');
    if (/^order details$/i.test(message.trim())) return this.chooseOrderReply(conversationId, 'details');
    if (/^payment status$/i.test(message.trim())) return this.chooseOrderReply(conversationId, 'payment');
    if (/^payment methods$/i.test(message.trim())) return this.reply('GCash is currently supported. Additional payment methods may be added in a future update.', this.generalActions());
    if (/^how to use try-on$/i.test(message.trim())) return this.reply('Open AI Try-On, choose an item, upload a clear good-quality photo, then follow the instructions on the Try-On screen.', this.generalActions());
    if (/^upload photo help$/i.test(message.trim())) return this.reply('Use a clear, well-lit photo that follows the guidance shown on the Try-On screen. Avoid blurry or heavily cropped images.', this.generalActions());
    if (/^try-on not working$/i.test(message.trim())) return this.reply('Restart the app, check your internet/Wi-Fi, make sure the image is good quality, then try again. If it continues, I can connect you with support.', [{ id: 'agent', label: 'Talk to an Agent', prompt: 'Talk to an Agent' }]);
    if (selectedOrder) {
      if (/status/.test(text)) return this.orderReply(conversationId, false, selectedOrder);
      if (/detail/.test(text)) return this.orderReply(conversationId, false, selectedOrder, true);
      if (/payment/.test(text)) return this.paymentReply(conversationId, selectedOrder);
      if (/shipping fee/.test(text)) return this.shippingReply(conversationId, product ? this.productShippingActions(product.id) : this.deliveryShippingActions(), selectedOrder);
      if (/estimated delivery|tracking/.test(text)) return this.deliveryReply(conversationId, product ? this.productShippingActions(product.id) : this.deliveryShippingActions(), selectedOrder);
    }
    if (/\b(order status|order details|payment status|shipping fee|shipping|delivery|tracking|track order|try.?on not working|upload photo)\b/.test(text)) {
      if (/payment/.test(text)) return this.paymentReply(conversationId);
      if (/shipping|delivery/.test(text)) return this.reply('What would you like to check about delivery and shipping?', this.deliveryShippingActions());
      if (/tracking|track/.test(text)) return this.orderReply(conversationId, true);
      if (/order/.test(text)) return this.orderReply(conversationId, false);
      if (/try.?on.*(not working|problem)/.test(text)) {
        return this.reply('Try restarting the app, checking your internet/Wi-Fi, and using a good-quality uploaded image. Then try again. If it still does not work, I can connect you with support.', this.generalActions());
      }
      if (/upload/.test(text)) return this.reply('For the best result, use the photo requirements and instructions shown on the Try-On screen. A clear, good-quality image works best.', this.generalActions());
      if (/try.?on/.test(text)) return this.reply('Open AI Try-On, choose an item, upload your photo, then follow the instructions shown on that screen.', this.generalActions(), /start|open|action:try-on$/i.test(message) ? 'OPEN_TRY_ON' : undefined);
    }
    if (/\b(gc?ash|payment method)\b/.test(text)) return this.reply('GCash is currently supported. Additional payment methods may be added in a future update.', this.generalActions());
    return null;
  }

  private reply(text: string, quickActions: ChatbotAction[] = [], action?: ChatbotAction['action']): ChatbotReply {
    return { text, quickActions, action };
  }

  private generalActions(): ChatbotAction[] {
    return [
      { id: 'order', label: '📦 My Order', prompt: 'My Order' },
      { id: 'payment', label: '💳 Payment', prompt: 'Payment' },
      { id: 'shipping-delivery', label: '🚚 Shipping & Delivery', prompt: 'Shipping & Delivery' },
      { id: 'try-on', label: '👕 AI Try-On', prompt: 'AI Try-On' },
      { id: 'agent', label: '👨‍💼 Talk to an Agent', prompt: 'Talk to an Agent' },
    ];
  }

  private deliveryShippingActions(): ChatbotAction[] {
    return [
      { id: 'shipping-fee', label: 'Shipping Fee', prompt: 'Shipping Fee' },
      { id: 'delivery-tracking', label: 'Estimated Delivery / Tracking', prompt: 'Estimated Delivery / Tracking' },
      { id: 'agent', label: '👨‍💼 Talk to an Agent', prompt: 'Talk to an Agent' },
    ];
  }

  private productActions(productId: string): ChatbotAction[] {
    return [
      { id: 'measurements', label: '📏 View Measurements', prompt: 'View Measurements' },
      { id: 'availability', label: '📦 Check Stock', prompt: 'Check Stock' },
      { id: 'try-on', label: '👕 Try It On', prompt: 'Start AI Try-On' },
      { id: 'shipping', label: '🚚 Shipping & Delivery', prompt: 'Shipping & Delivery' },
      { id: 'agent', label: '👨‍💼 Talk to an Agent', prompt: 'Talk to an Agent' },
    ];
  }

  private productShippingActions(productId: string): ChatbotAction[] {
    return [
      { id: 'shipping-fee', label: 'Shipping Fee', prompt: 'Shipping Fee' },
      { id: 'couriers', label: 'Available Couriers', prompt: 'Available Couriers' },
      { id: 'estimated-delivery', label: 'Estimated Delivery', prompt: 'Estimated Delivery' },
      { id: 'agent', label: '👨‍💼 Talk to an Agent', prompt: 'Talk to an Agent' },
    ];
  }

  private shippingRateLocations(province: string) {
    const locations = [province].map((value) => value.trim()).filter(Boolean);
    const normalized = new Set(locations.map((value) => value.toLowerCase()));
    if (normalized.has('metro manila') || normalized.has('ncr') || normalized.has('national capital region')) {
      locations.push('Metro Manila', 'NCR', 'National Capital Region');
    }
    return [...new Set(locations)];
  }

  private transferReply(text = "Sure. I will connect this chat to A'FRO support so a staff member can help you directly."): ChatbotReply {
    return this.reply(text, [], 'TRANSFER_TO_AGENT');
  }

  private async conversationProduct(conversationId: string) {
    const [hasAvailabilityStatus, hasReservedFlag] = await Promise.all([
      this.databaseService.columnExists('PRODUCTS', 'availability_status'),
      this.databaseService.columnExists('PRODUCTS', 'is_reserved'),
    ]);
    const rows = await this.databaseService.request<{ id: string; name: string; size: string | null; stock: number; availabilityStatus: string | null; isReserved: boolean | number | null }>((request) => request
      .input('conversationId', sql.UniqueIdentifier, conversationId).query(`
        SELECT TOP 1 CONVERT(varchar(36), p.product_id) AS id, p.name,
          (SELECT TOP 1 ss.label FROM PRODUCT_SIZE_STOCK pss INNER JOIN SIZE_STANDARDS ss ON ss.size_id = pss.size_id WHERE pss.product_id = p.product_id ORDER BY pss.stock_qty DESC) AS size,
          CAST(COALESCE((SELECT SUM(CASE WHEN stock_qty > 0 THEN stock_qty ELSE 0 END) FROM PRODUCT_SIZE_STOCK WHERE product_id = p.product_id), p.stock_qty, 0) AS int) AS stock,
          ${hasAvailabilityStatus ? 'p.availability_status' : 'NULL'} AS availabilityStatus,
          ${hasReservedFlag ? 'p.is_reserved' : 'CAST(0 AS bit)'} AS isReserved
        FROM CONVERSATIONS c INNER JOIN PRODUCTS p ON p.product_id = c.product_id
        WHERE c.convo_id = @conversationId
      `));
    return rows[0] ?? null;
  }

  private async productAvailabilityReply(product: { id: string; name: string }, conversationId: string): Promise<ChatbotReply> {
    const current = await this.conversationProduct(conversationId);
    if (!current) return this.reply('That product is no longer available. A support agent can help you find an alternative.', this.generalActions());
    const state = String(current.availabilityStatus ?? '').toUpperCase() === 'RESERVED' || Boolean(current.isReserved)
      ? 'RESERVED'
      : Number(current.stock) > 0 ? 'AVAILABLE' : 'SOLD';
    const copy = state === 'AVAILABLE'
      ? `${current.name} is currently available.`
      : state === 'RESERVED'
        ? `${current.name} is currently reserved.`
        : `${current.name} is currently sold out.`;
    return this.reply(copy, this.productActions(product.id));
  }

  private async productMeasurementsReply(product: { id: string; name: string; size: string | null }, text: string, conversationId: string): Promise<ChatbotReply> {
    const [rows, profileRows] = await Promise.all([
      this.databaseService.request<{ size: string; name: string; value: number }>((request) => request
        .input('productId', sql.UniqueIdentifier, product.id).query(`
        SELECT ss.label AS size, pm.measurement_name AS name, CAST(pm.value_cm AS float) AS value
        FROM PRODUCT_MEASUREMENTS pm INNER JOIN SIZE_STANDARDS ss ON ss.size_id = pm.size_id
        WHERE pm.product_id = @productId ORDER BY ss.sort_order, pm.measurement_name
      `)),
      this.databaseService.request<{ chest: number | null; waist: number | null; hip: number | null }>((request) => request
        .input('conversationId', sql.UniqueIdentifier, conversationId).query(`
          SELECT TOP 1
            CAST(u.body_chest_cm AS float) AS chest,
            CAST(u.body_waist_cm AS float) AS waist,
            CAST(u.body_hip_cm AS float) AS hip
          FROM CONVERSATIONS c
          INNER JOIN USERS u ON u.user_id = c.buyer_id
          WHERE c.convo_id = @conversationId
        `)),
    ]);
    if (!rows.length) return this.reply(`Measurements for ${product.name} are not available yet. I can connect you with support for help.`, this.productActions(product.id));
    const details = rows.map((row) => `${row.size} ${row.name}: ${row.value} cm`).join(', ');
    const profile = profileRows[0];
    const savedMeasurements: Array<[string, number]> = [
      ['chest', Number(profile?.chest)],
      ['waist', Number(profile?.waist)],
      ['hip', Number(profile?.hip)],
    ];
    const userMeasurements = new Map<string, number>(
      savedMeasurements.filter(([, value]) => Number.isFinite(value) && value > 0),
    );
    const comparisons = rows.flatMap((row) => {
      const key = ['chest', 'waist', 'hip'].find((name) => row.name.toLowerCase().includes(name));
      const bodyValue = key ? userMeasurements.get(key) : undefined;
      if (!key || bodyValue === undefined) return [];
      const difference = Number(row.value) - bodyValue;
      return [`${key[0].toUpperCase()}${key.slice(1)}: garment ${row.value} cm vs your saved ${bodyValue} cm (${difference >= 0 ? '+' : ''}${difference.toFixed(1)} cm)`];
    });
    const comparisonText = comparisons.length ? ` Comparison with your saved measurements: ${comparisons.join('; ')}.` : ' Your saved chest, waist, or hip measurements are not available for a direct comparison.';
    return this.reply(`${product.name}${product.size ? ` (${product.size})` : ''}: ${details}.${comparisonText} Measurements are a guide only and do not guarantee fit.`, this.productActions(product.id));
  }

  private async chooseOrderReply(conversationId: string, purpose: 'status' | 'details' | 'payment'): Promise<ChatbotReply> {
    const rows = await this.databaseService.request<{ id: string; status: string }>((request) => request.input('conversationId', sql.UniqueIdentifier, conversationId).query(`
      SELECT TOP 10 CONVERT(varchar(36), o.order_id) AS id, os.label AS status
      FROM CONVERSATIONS c INNER JOIN ORDERS o ON o.user_id = c.buyer_id INNER JOIN ORDER_STATUSES os ON os.status_id = o.status_id
      WHERE c.convo_id = @conversationId ORDER BY o.placed_at DESC
    `));
    if (!rows.length) return this.reply('I could not find any orders on your account. Please contact support if you need help.', this.generalActions());
    const verb = purpose === 'status' ? 'View status for' : purpose === 'details' ? 'View details for' : 'Check payment for';
    return this.reply('Select an order to continue.', rows.map((order) => ({ id: `${purpose}-${order.id}`, label: `Order #${order.id.slice(0, 8).toUpperCase()} · ${order.status}`, prompt: `${verb} order ${order.id.slice(0, 8).toUpperCase()}` })));
  }

  private async chooseProductOrderReply(conversationId: string, productId: string, purpose: 'shipping' | 'delivery'): Promise<ChatbotReply> {
    const rows = await this.databaseService.request<{ id: string; status: string }>((request) => request
      .input('conversationId', sql.UniqueIdentifier, conversationId)
      .input('productId', sql.UniqueIdentifier, productId).query(`
        SELECT TOP 10 CONVERT(varchar(36), o.order_id) AS id, os.label AS status
        FROM CONVERSATIONS c
        INNER JOIN ORDERS o ON o.user_id = c.buyer_id
        INNER JOIN ORDER_ITEMS oi ON oi.order_id = o.order_id AND oi.product_id = @productId
        INNER JOIN ORDER_STATUSES os ON os.status_id = o.status_id
        WHERE c.convo_id = @conversationId
          AND LOWER(os.label) NOT LIKE '%cancel%'
          AND LOWER(os.label) NOT LIKE '%deliver%'
        ORDER BY o.updated_at DESC, o.placed_at DESC
      `));
    if (!rows.length) return this.reply('I could not find an active order for this item. Shipping and tracking details will be available after an order is placed and processed.', this.productShippingActions(productId));
    const prompt = purpose === 'shipping' ? 'Shipping Fee for order' : 'Estimated Delivery for order';
    return this.reply('Select an active order to continue.', rows.map((order) => ({
      id: `${purpose}-${order.id}`,
      label: `Order #${order.id.slice(0, 8).toUpperCase()} · ${order.status}`,
      prompt: `${prompt} ${order.id.slice(0, 8).toUpperCase()}`,
    })));
  }

  private async latestProductDeliveryReply(conversationId: string, productId: string): Promise<ChatbotReply> {
    const rows = await this.databaseService.request<{ id: string }>((request) => request
      .input('conversationId', sql.UniqueIdentifier, conversationId)
      .input('productId', sql.UniqueIdentifier, productId).query(`
        SELECT TOP 1 CONVERT(varchar(36), o.order_id) AS id
        FROM CONVERSATIONS c
        INNER JOIN ORDERS o ON o.user_id = c.buyer_id
        INNER JOIN ORDER_ITEMS oi ON oi.order_id = o.order_id AND oi.product_id = @productId
        INNER JOIN ORDER_STATUSES os ON os.status_id = o.status_id
        WHERE c.convo_id = @conversationId
          AND LOWER(os.label) NOT LIKE '%cancel%'
          AND LOWER(os.label) NOT LIKE '%deliver%'
        ORDER BY o.updated_at DESC, o.placed_at DESC
      `));
    if (!rows[0]) return this.reply('I could not find an active order for this item. Estimated delivery becomes available after the order is processed.', this.productShippingActions(productId));
    return this.deliveryReply(conversationId, this.productShippingActions(productId), rows[0].id);
  }

  private async orderReply(conversationId: string, tracking: boolean, orderShort?: string, details = false): Promise<ChatbotReply> {
    const hasTrackingNumber = await this.databaseService.columnExists('ORDERS', 'tracking_number');
    const rows = await this.databaseService.request<{ id: string; status: string; tracking: string | null; total: number }>((request) => request
      .input('conversationId', sql.UniqueIdentifier, conversationId)
      .input('orderShort', sql.NVarChar(8), orderShort?.toLowerCase() ?? null).query(`
        SELECT TOP 1 CONVERT(varchar(36), o.order_id) AS id, os.label AS status,
          ${hasTrackingNumber ? 'o.tracking_number' : 'NULL'} AS tracking, CAST(o.total_amount AS float) AS total
        FROM CONVERSATIONS c INNER JOIN ORDERS o ON o.user_id = c.buyer_id INNER JOIN ORDER_STATUSES os ON os.status_id = o.status_id
        WHERE c.convo_id = @conversationId
          AND (@orderShort IS NULL OR LEFT(CONVERT(varchar(36), o.order_id), 8) = LOWER(@orderShort))
        ORDER BY o.placed_at DESC
      `));
    const order = rows[0];
    if (!order) return this.reply('I could not find an order on your account. Please contact support if you need help.', this.generalActions());
    if (tracking && !order.tracking) return this.reply(`Your order ${order.id.slice(0, 8).toUpperCase()} is ${order.status}. Tracking is not available yet.`, this.generalActions());
    const orderSummary = details ? `Order ${order.id.slice(0, 8).toUpperCase()} is ${order.status}. Total: ${this.formatPeso(order.total)}.${order.tracking ? ` Tracking number: ${order.tracking}.` : ''}` : `Your order ${order.id.slice(0, 8).toUpperCase()} is ${order.status}.${order.tracking ? ` Tracking number: ${order.tracking}.` : ''}`;
    return { ...this.reply(orderSummary, this.generalActions(), tracking ? 'OPEN_TRACKING' : undefined), orderId: order.id };
  }

  private async paymentReply(conversationId: string, orderShort?: string): Promise<ChatbotReply> {
    // PAYMENT records are not part of the current schema; do not infer a status from an order.
    await this.latestCustomerMessage(conversationId);
    return this.reply(orderShort ? `Payment verification for order ${orderShort.toUpperCase()} is not available yet. Please contact support so they can verify your GCash payment.` : 'Choose Payment Status to select an order. Payment verification is handled by support.', this.generalActions());
  }

  private async generalShippingRateReply(conversationId: string): Promise<ChatbotReply> {
    const addressRows = await this.databaseService.request<{ province: string | null }>((request) => request
      .input('conversationId', sql.UniqueIdentifier, conversationId).query(`
        SELECT TOP 1 address.province
        FROM CONVERSATIONS c
        OUTER APPLY (
          SELECT TOP 1 province FROM USER_ADDRESSES
          WHERE user_id = c.buyer_id
          ORDER BY is_default DESC, created_at DESC
        ) address
        WHERE c.convo_id = @conversationId
      `));
    const province = addressRows[0]?.province?.trim() ?? '';
    if (!province) return this.reply('Add a registered delivery address first so I can show the shipping rate for your area.', this.deliveryShippingActions());

    const locations = this.shippingRateLocations(province);
    const rateRows = await this.databaseService.request<{ shippingFee: number }>((request) => request
      .input('locations', sql.NVarChar(sql.MAX), JSON.stringify(locations)).query(`
        SELECT TOP 1 CAST(base_fee AS float) AS shippingFee
        FROM SHIPPING_RATES
        WHERE is_active = 1
          AND LOWER(LTRIM(RTRIM(destination_province))) IN (
            SELECT LOWER(LTRIM(RTRIM([value]))) FROM OPENJSON(@locations)
          )
        ORDER BY CASE
          WHEN LOWER(LTRIM(RTRIM(destination_province))) = LOWER(LTRIM(RTRIM(JSON_VALUE(@locations, '$[0]')))) THEN 0
          ELSE 1
        END
      `));
    const fee = rateRows[0]?.shippingFee;
    if (fee === undefined) return this.reply(`No active shipping rate is currently available for your registered area, ${province}. Please contact support for help.`, this.deliveryShippingActions());
    return this.reply(`Your registered delivery area is ${province}. The current base shipping rate for your area is ${this.formatPeso(fee)}. Your final fee is confirmed at checkout for the selected cart.`, this.deliveryShippingActions());
  }

  private async generalDeliveryReply(conversationId: string): Promise<ChatbotReply> {
    const rows = await this.databaseService.request<{ id: string; status: string }>((request) => request
      .input('conversationId', sql.UniqueIdentifier, conversationId).query(`
        SELECT TOP 10 CONVERT(varchar(36), o.order_id) AS id, os.label AS status
        FROM CONVERSATIONS c
        INNER JOIN ORDERS o ON o.user_id = c.buyer_id
        INNER JOIN ORDER_STATUSES os ON os.status_id = o.status_id
        WHERE c.convo_id = @conversationId
          AND LOWER(os.label) NOT LIKE '%cancel%'
          AND LOWER(os.label) NOT LIKE '%deliver%'
        ORDER BY o.updated_at DESC, o.placed_at DESC
      `));
    const defaultReply = 'Delivery usually takes up to two weeks from order processing. If your delivery goes beyond this timeline, please talk to an agent so we can look into the concern.';
    if (!rows.length) return this.reply(defaultReply, this.deliveryShippingActions());
    return this.reply(`${defaultReply} Do you have an order you want to check for an estimated delivery?`, rows.map((order) => ({
      id: `delivery-${order.id}`,
      label: `Order #${order.id.slice(0, 8).toUpperCase()} · ${order.status}`,
      prompt: `Estimated Delivery / Tracking for order ${order.id.slice(0, 8).toUpperCase()}`,
    })));
  }

  private async shippingReply(conversationId: string, followUpActions = this.generalActions(), orderShort?: string): Promise<ChatbotReply> {
    const [hasShippingFee, hasExpectedDelivery] = await Promise.all([
      this.databaseService.columnExists('ORDERS', 'shipping_fee'),
      this.databaseService.columnExists('ORDERS', 'expected_delivery_at'),
    ]);
    const rows = await this.databaseService.request<{ id: string; shippingFee: number | null; status: string; expectedDeliveryAt: Date | null }>((request) => request
      .input('conversationId', sql.UniqueIdentifier, conversationId)
      .input('orderShort', sql.NVarChar(8), orderShort?.toLowerCase() ?? null).query(`
        SELECT TOP 1 CONVERT(varchar(36), o.order_id) AS id, ${hasShippingFee ? 'CAST(o.shipping_fee AS float)' : 'NULL'} AS shippingFee,
          os.label AS status, ${hasExpectedDelivery ? 'o.expected_delivery_at' : 'NULL'} AS expectedDeliveryAt
        FROM CONVERSATIONS c INNER JOIN ORDERS o ON o.user_id = c.buyer_id
        INNER JOIN ORDER_STATUSES os ON os.status_id = o.status_id
        WHERE c.convo_id = @conversationId
          AND (@orderShort IS NULL OR LEFT(CONVERT(varchar(36), o.order_id), 8) = LOWER(@orderShort))
        ORDER BY o.placed_at DESC
      `));
    const order = rows[0];
    if (!order) return this.reply('Your shipping fee is calculated securely at checkout from your selected province and the complete cart. It is not a flat fee.', followUpActions);
    return this.reply(`For order ${order.id.slice(0, 8).toUpperCase()}, the shipping fee is ${this.formatPeso(order.shippingFee ?? 0)}.`, followUpActions);
  }

  private async deliveryReply(conversationId: string, followUpActions = this.generalActions(), orderShort?: string): Promise<ChatbotReply> {
    const [hasExpectedDelivery, hasTrackingNumber, hasTrackingUrl] = await Promise.all([
      this.databaseService.columnExists('ORDERS', 'expected_delivery_at'),
      this.databaseService.columnExists('ORDERS', 'tracking_number'),
      this.databaseService.columnExists('ORDERS', 'tracking_url'),
    ]);
    const rows = await this.databaseService.request<{ id: string; status: string; expectedDeliveryAt: Date | null; trackingNumber: string | null; trackingUrl: string | null }>((request) => request
      .input('conversationId', sql.UniqueIdentifier, conversationId)
      .input('orderShort', sql.NVarChar(8), orderShort?.toLowerCase() ?? null).query(`
        SELECT TOP 1 CONVERT(varchar(36), o.order_id) AS id, os.label AS status,
          ${hasExpectedDelivery ? 'o.expected_delivery_at' : 'NULL'} AS expectedDeliveryAt,
          ${hasTrackingNumber ? 'o.tracking_number' : 'NULL'} AS trackingNumber,
          ${hasTrackingUrl ? 'o.tracking_url' : 'NULL'} AS trackingUrl
        FROM CONVERSATIONS c INNER JOIN ORDERS o ON o.user_id = c.buyer_id
        INNER JOIN ORDER_STATUSES os ON os.status_id = o.status_id
        WHERE c.convo_id = @conversationId
          AND (@orderShort IS NULL OR LEFT(CONVERT(varchar(36), o.order_id), 8) = LOWER(@orderShort))
        ORDER BY o.placed_at DESC
      `));
    const order = rows[0];
    if (!order) return this.reply('Estimated delivery and tracking become available after an order is placed and processed. You can check your order page once you have an order.', followUpActions);

    const normalizedStatus = order.status.trim().toLowerCase();
    const isReadyToShip = normalizedStatus.includes('ready to ship');
    const isInTransit = normalizedStatus.includes('in transit');
    const expected = (isReadyToShip || isInTransit) && order.expectedDeliveryAt
      ? ` Estimated delivery: ${new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(order.expectedDeliveryAt))}.`
      : isReadyToShip || isInTransit
        ? ' An estimated delivery date is not available yet.'
        : ' The estimated delivery date will be available once this order is Ready To Ship.';
    const tracking = isInTransit
      ? order.trackingNumber ? ` Tracking number: ${order.trackingNumber}.` : ' Tracking is not available yet.'
      : '';
    const validTrackingUrl = isInTransit && order.trackingUrl && /^https?:\/\//i.test(order.trackingUrl) ? order.trackingUrl : null;
    const link = validTrackingUrl ? ` Tracking link: ${validTrackingUrl}` : '';
    return {
      ...this.reply(`Order ${order.id.slice(0, 8).toUpperCase()} is ${order.status}.${expected}${tracking}${link}`, followUpActions),
      orderId: order.id,
    };
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
            last_message_at = SYSUTCDATETIME()
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
          INSERT INTO MESSAGES (convo_id, sender_id, body, is_read, sent_at)
          VALUES (@conversationId, @botUserId, @body, 0, SYSUTCDATETIME());

          UPDATE CONVERSATIONS
        SET last_message_at = SYSUTCDATETIME(),
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
      timeZone: 'Asia/Manila',
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
