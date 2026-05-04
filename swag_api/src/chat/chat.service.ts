import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';
import { DatabaseService } from '../database/database.service';

type ConversationRow = {
  id: string;
  name: string;
  lastMsg: string | null;
  time: Date | null;
  unread: number;
  productName: string | null;
  productPrice: number | null;
  imageUrl: string | null;
};

type MessageRow = {
  id: string;
  convoId: string;
  from: 'admin' | 'customer';
  text: string;
  time: Date;
};

@Injectable()
export class ChatService {
  constructor(private readonly databaseService: DatabaseService) {}

  async conversations(userId: string) {
    await this.ensureUser(userId);

    const conversations = await this.databaseService.request<ConversationRow>((request) =>
      request.input('userId', sql.UniqueIdentifier, userId).query(`
        SELECT
          CONVERT(varchar(36), c.convo_id) AS id,
          COALESCE(p.name, 'A''FRO Official Support') AS name,
          latest.body AS lastMsg,
          COALESCE(latest.sent_at, c.last_message_at) AS time,
          COUNT(CASE WHEN m.is_read = 0 AND m.sender_id = c.seller_id THEN 1 END) AS unread,
          p.name AS productName,
          CAST(p.price AS float) AS productPrice,
          pi.image_url AS imageUrl
        FROM CONVERSATIONS c
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
        WHERE c.buyer_id = @userId AND c.is_active = 1
        GROUP BY c.convo_id, p.name, p.price, pi.image_url, latest.body, latest.sent_at, c.last_message_at
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
          m.sent_at AS time
        FROM MESSAGES m
        INNER JOIN CONVERSATIONS c ON c.convo_id = m.convo_id
        WHERE c.buyer_id = @userId AND c.is_active = 1
        ORDER BY m.sent_at ASC
      `),
    );

    const messagesByConversation = messages.reduce<Record<string, MessageRow[]>>((acc, message) => {
      acc[message.convoId] ??= [];
      acc[message.convoId].push(message);
      return acc;
    }, {});

    return conversations.map((conversation) => {
      const convoMessages = messagesByConversation[conversation.id] ?? [];
      const lastMessage = convoMessages.at(-1);

      return {
        id: conversation.id,
        name: conversation.productName ? `Inquiry: ${conversation.productName}` : conversation.name,
        lastMsg: lastMessage?.text ?? 'No messages yet',
        time: this.relativeTime(conversation.time),
        unread: Number(conversation.unread ?? 0),
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
              orderId: `Inquiry ${conversation.id.slice(0, 8).toUpperCase()}`,
              imageUrl: conversation.imageUrl,
            }
          : null,
      };
    });
  }

  async createConversation(userId: string, productId: string) {
    await this.ensureUser(userId);
    await this.ensureProduct(productId);
    const adminId = await this.adminUserId();

    const existing = await this.databaseService.request<{ id: string }>((request) =>
      request
        .input('userId', sql.UniqueIdentifier, userId)
        .input('productId', sql.UniqueIdentifier, productId)
        .query(`
          SELECT TOP 1 CONVERT(varchar(36), convo_id) AS id
          FROM CONVERSATIONS
          WHERE buyer_id = @userId AND product_id = @productId AND is_active = 1
          ORDER BY COALESCE(last_message_at, GETDATE()) DESC
        `),
    );

    if (existing[0]) {
      return this.conversation(userId, existing[0].id);
    }

    const created = await this.databaseService.request<{ id: string }>((request) =>
      request
        .input('userId', sql.UniqueIdentifier, userId)
        .input('adminId', sql.UniqueIdentifier, adminId)
        .input('productId', sql.UniqueIdentifier, productId)
        .query(`
          INSERT INTO CONVERSATIONS (buyer_id, seller_id, product_id, last_message_at)
          OUTPUT CONVERT(varchar(36), inserted.convo_id) AS id
          VALUES (@userId, @adminId, @productId, GETDATE())
        `),
    );

    const conversationId = created[0]?.id;
    await this.databaseService.request((request) =>
      request
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .input('adminId', sql.UniqueIdentifier, adminId)
        .query(`
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

    const conversation = await this.databaseService.request<{ id: string }>((request) =>
      request
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`
          SELECT CONVERT(varchar(36), convo_id) AS id
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
        .input('userId', sql.UniqueIdentifier, userId)
        .input('body', sql.NVarChar(sql.MAX), trimmedText)
        .query(`
          INSERT INTO MESSAGES (convo_id, sender_id, body, is_read)
          VALUES (@conversationId, @userId, @body, 0);

          UPDATE CONVERSATIONS
          SET last_message_at = GETDATE()
          WHERE convo_id = @conversationId;
        `),
    );

    return this.conversation(userId, conversationId);
  }

  async markRead(conversationId: string, userId: string) {
    const conversation = await this.databaseService.request<{ sellerId: string }>((request) =>
      request
        .input('conversationId', sql.UniqueIdentifier, conversationId)
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`
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
          SET is_read = 1
          WHERE convo_id = @conversationId AND sender_id = @sellerId
        `),
    );

    return this.conversation(userId, conversationId);
  }

  private async conversation(userId: string, conversationId: string) {
    const conversations = await this.conversations(userId);
    const conversation = conversations.find((item) => item.id === conversationId);

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  private async ensureUser(userId: string) {
    if (!userId) {
      throw new BadRequestException('User is required');
    }

    const users = await this.databaseService.request<{ id: string }>((request) =>
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

    const products = await this.databaseService.request<{ id: string }>((request) =>
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
}
