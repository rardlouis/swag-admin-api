import { BadRequestException, Injectable } from '@nestjs/common';
import * as sql from 'mssql/msnodesqlv8';
import { DatabaseService } from '../database/database.service';

type PushPayload = { title: string; body: string; data?: Record<string, string> };
type OrderNotification = PushPayload & { orderId: string; eventKey: string };
type NotificationPreferences = { emailNotificationsEnabled: boolean; smsNotificationsEnabled: boolean };

@Injectable()
export class NotificationsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async register(userId: string, token: string) {
    if (!/^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$/.test(token?.trim() ?? '')) {
      throw new BadRequestException('Invalid push token');
    }
    await this.ensureTable();
    await this.databaseService.request((request) => request
      .input('userId', sql.UniqueIdentifier, userId)
      .input('token', sql.NVarChar(255), token.trim()).query(`
        MERGE PUSH_TOKENS AS target USING (SELECT @token AS expo_push_token) AS source
        ON target.expo_push_token = source.expo_push_token
        WHEN MATCHED THEN UPDATE SET user_id = @userId, is_active = 1, updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (push_token_id, user_id, expo_push_token, is_active, created_at, updated_at)
          VALUES (NEWID(), @userId, @token, 1, SYSUTCDATETIME(), SYSUTCDATETIME());
      `));
    return { registered: true };
  }

  async unregister(userId: string, token: string) {
    await this.ensureTable();
    await this.databaseService.request((request) => request.input('userId', sql.UniqueIdentifier, userId).input('token', sql.NVarChar(255), token).query(
      'UPDATE PUSH_TOKENS SET is_active = 0, updated_at = SYSUTCDATETIME() WHERE user_id = @userId AND expo_push_token = @token',
    ));
    return { unregistered: true };
  }

  async preferences(userId: string): Promise<NotificationPreferences> {
    await this.ensurePreferenceColumns();
    const rows = await this.databaseService.request<{ emailEnabled: boolean | number; smsEnabled: boolean | number }>((request) => request
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`SELECT email_notifications_enabled AS emailEnabled, sms_notifications_enabled AS smsEnabled FROM USERS WHERE user_id = @userId AND is_admin = 0`));
    if (!rows[0]) throw new BadRequestException('User was not found.');
    const smsEnabled = Boolean(rows[0].smsEnabled);
    // Legacy rows have both flags off; preserve the required Email default.
    return { emailNotificationsEnabled: smsEnabled ? Boolean(rows[0].emailEnabled) : true, smsNotificationsEnabled: smsEnabled };
  }

  async updatePreferences(userId: string, body: { emailNotificationsEnabled?: boolean; smsNotificationsEnabled?: boolean }) {
    await this.ensurePreferenceColumns();
    if (body.emailNotificationsEnabled !== undefined && typeof body.emailNotificationsEnabled !== 'boolean') throw new BadRequestException('Email preference must be true or false.');
    if (body.smsNotificationsEnabled !== undefined && typeof body.smsNotificationsEnabled !== 'boolean') throw new BadRequestException('SMS preference must be true or false.');
    const requestedSms = body.smsNotificationsEnabled === true;
    const requestedEmail = body.emailNotificationsEnabled === undefined ? !requestedSms : body.emailNotificationsEnabled;
    if (requestedEmail || requestedSms) {
      const users = await this.databaseService.request<{ email: string | null; phone: string | null }>((request) => request.input('userId', sql.UniqueIdentifier, userId).query('SELECT email, phone FROM USERS WHERE user_id = @userId AND is_admin = 0'));
      const user = users[0];
      if (!user) throw new BadRequestException('User was not found.');
      if (requestedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email?.trim() ?? '')) throw new BadRequestException('A valid email address is required for email order confirmations.');
      if (requestedSms && !/^9\d{9}$/.test((user.phone ?? '').trim())) throw new BadRequestException('A valid Philippine mobile number is required for SMS order confirmations.');
    }
    await this.databaseService.request((request) => request
      .input('userId', sql.UniqueIdentifier, userId)
      .input('emailEnabled', sql.Bit, requestedSms ? 0 : 1)
      .input('smsEnabled', sql.Bit, requestedSms ? 1 : 0)
      .query(`UPDATE USERS SET email_notifications_enabled = @emailEnabled, sms_notifications_enabled = @smsEnabled WHERE user_id = @userId AND is_admin = 0`));
    return this.preferences(userId);
  }

  async notifyOrder(userId: string, notification: OrderNotification) {
    // Push remains independent of the external-channel preferences.
    void this.notifyUser(userId, { title: notification.title, body: notification.body, data: { ...notification.data, type: 'order', orderId: notification.orderId } });
  }

  async notifyOrderConfirmation(userId: string, orderId: string) {
    const eventKey = `ORDER_CONFIRMATION:${orderId}`;
    const preferences = await this.preferences(userId);
    // Email is the default. SMS is chosen only when it is explicitly enabled
    // and email is disabled by the customer settings screen.
    const channel = preferences.smsNotificationsEnabled && !preferences.emailNotificationsEnabled ? 'sms' : 'email';
    if (!(await this.claimOrderDelivery(orderId, eventKey, channel))) return { delivered: false, duplicate: true };
    try {
      if (channel === 'email') {
        await this.sendBrevoEmail(userId, 'Payment confirmed — A\'FRO order', `Your payment for order ${orderId.slice(0, 8).toUpperCase()} has been confirmed. Thank you for shopping with A'FRO.`);
      } else {
        await this.sendIprogOrderSms(userId, orderId);
      }
      await this.finishOrderDelivery(orderId, eventKey, channel, 'sent');
      return { delivered: true, channel };
    } catch (error) {
      await this.finishOrderDelivery(orderId, eventKey, channel, 'failed');
      console.warn('[Notifications] Order confirmation delivery failed', { orderId, channel, message: error instanceof Error ? error.message : String(error) });
      return { delivered: false, channel };
    }
  }

  async sendWelcomeEmail(userId: string) {
    await this.ensureWelcomeColumn();
    const claimed = await this.databaseService.request<{ userId: string }>((request) => request.input('userId', sql.UniqueIdentifier, userId).query(`
      UPDATE USERS SET welcome_email_sent_at = SYSUTCDATETIME()
      OUTPUT CONVERT(varchar(36), inserted.user_id) AS userId
      WHERE user_id = @userId AND welcome_email_sent_at IS NULL
    `));
    if (!claimed[0]) return { sent: false, duplicate: true };
    try {
      await this.sendBrevoEmail(userId, 'Welcome to A\'FRO', 'Thank you for creating an A\'FRO account. We are happy to have you here.');
      return { sent: true };
    } catch (error) {
      await this.databaseService.request((request) => request.input('userId', sql.UniqueIdentifier, userId).query('UPDATE USERS SET welcome_email_sent_at = NULL WHERE user_id = @userId'));
      console.warn('[Notifications] Welcome email delivery failed', { userId, message: error instanceof Error ? error.message : String(error) });
      return { sent: false };
    }
  }

  async createAdminNotification(input: { type: string; entityType: string; entityId: string; title: string; body: string; eventKey?: string }) {
    await this.ensureAdminNotificationsTable();
    const rows = await this.databaseService.request<{ id: string }>((request) => request
      .input('type', sql.NVarChar(30), input.type)
      .input('entityType', sql.NVarChar(30), input.entityType)
      .input('entityId', sql.UniqueIdentifier, input.entityId)
      .input('title', sql.NVarChar(150), input.title)
      .input('body', sql.NVarChar(500), input.body)
      .input('eventKey', sql.NVarChar(120), input.eventKey ?? null)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM ADMIN_NOTIFICATIONS WHERE event_key = @eventKey AND @eventKey IS NOT NULL)
        BEGIN
          INSERT INTO ADMIN_NOTIFICATIONS (notification_id, notification_type, entity_type, entity_id, title, body, event_key, is_read, created_at)
          OUTPUT CONVERT(varchar(36), inserted.notification_id) AS id
          VALUES (NEWID(), @type, @entityType, @entityId, @title, @body, @eventKey, 0, SYSUTCDATETIME());
        END
      `));
    return { id: rows[0]?.id ?? null };
  }

  async adminNotifications() {
    await this.ensureAdminNotificationsTable();
    return this.databaseService.query(`
      SELECT TOP 50 CONVERT(varchar(36), notification_id) AS id, notification_type AS type, entity_type AS entityType,
        CONVERT(varchar(36), entity_id) AS entityId, title, body AS text, is_read AS isRead, created_at AS createdAt
      FROM ADMIN_NOTIFICATIONS ORDER BY created_at DESC
    `);
  }

  async markAdminNotificationRead(notificationId: string) {
    await this.ensureAdminNotificationsTable();
    await this.databaseService.request((request) => request.input('id', sql.UniqueIdentifier, notificationId).query(`
      UPDATE ADMIN_NOTIFICATIONS SET is_read = 1, read_at = COALESCE(read_at, SYSUTCDATETIME()) WHERE notification_id = @id
    `));
    return { read: true };
  }

  async notifyUser(userId: string, payload: PushPayload) {
    try {
      await this.ensureTable();
      const tokens = await this.databaseService.request<{ token: string }>((request) => request.input('userId', sql.UniqueIdentifier, userId).query(
        'SELECT expo_push_token AS token FROM PUSH_TOKENS WHERE user_id = @userId AND is_active = 1',
      ));
      if (!tokens.length) return;
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(tokens.map(({ token }) => ({ to: token, sound: 'default', title: payload.title, body: payload.body, data: payload.data ?? {} }))),
      });
      if (!response.ok) throw new Error(`Expo Push returned ${response.status}`);
      const result = await response.json() as { data?: Array<{ status?: string; details?: { error?: string } }> };
      const invalid = result.data?.filter((item) => item.details?.error === 'DeviceNotRegistered').length ?? 0;
      if (invalid) await this.databaseService.request((request) => request.input('userId', sql.UniqueIdentifier, userId).query(
        "UPDATE PUSH_TOKENS SET is_active = 0 WHERE user_id = @userId AND expo_push_token LIKE 'ExponentPushToken[%]'",
      ));
    } catch (error) {
      // Push delivery is intentionally best-effort and must never fail an order/chat update.
      console.warn('[Notifications] Push delivery failed', error instanceof Error ? error.message : String(error));
    }
  }

  private async ensureTable() {
    await this.databaseService.query(`
      IF OBJECT_ID('dbo.PUSH_TOKENS', 'U') IS NULL
      CREATE TABLE dbo.PUSH_TOKENS (
        push_token_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        user_id UNIQUEIDENTIFIER NOT NULL,
        expo_push_token NVARCHAR(255) NOT NULL UNIQUE,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      );
    `);
  }

  private async ensurePreferenceColumns() {
    for (const [name, definition] of [
      ['email_notifications_enabled', 'BIT NOT NULL CONSTRAINT DF_USERS_EMAIL_NOTIFICATIONS_ENABLED DEFAULT ((0))'],
      ['sms_notifications_enabled', 'BIT NOT NULL CONSTRAINT DF_USERS_SMS_NOTIFICATIONS_ENABLED DEFAULT ((0))'],
    ]) {
      if (!(await this.databaseService.columnExists('USERS', name))) {
        await this.databaseService.query(`ALTER TABLE USERS ADD ${name} ${definition}`);
      }
    }
  }

  private async ensureOrderDeliveriesTable() {
    await this.databaseService.query(`
      IF OBJECT_ID('dbo.ORDER_NOTIFICATION_DELIVERIES', 'U') IS NULL
      CREATE TABLE dbo.ORDER_NOTIFICATION_DELIVERIES (
        delivery_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(), order_id UNIQUEIDENTIFIER NOT NULL,
        event_key NVARCHAR(120) NOT NULL, channel NVARCHAR(20) NOT NULL, delivery_status NVARCHAR(20) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(), completed_at DATETIME2 NULL,
        CONSTRAINT UQ_ORDER_NOTIFICATION_DELIVERY UNIQUE (order_id, event_key, channel)
      );
    `);
  }

  private async claimOrderDelivery(orderId: string, eventKey: string, channel: string) {
    await this.ensureOrderDeliveriesTable();
    const rows = await this.databaseService.request<{ claimed: number }>((request) => request
      .input('orderId', sql.UniqueIdentifier, orderId).input('eventKey', sql.NVarChar(120), eventKey).input('channel', sql.NVarChar(20), channel)
      .query(`IF NOT EXISTS (SELECT 1 FROM ORDER_NOTIFICATION_DELIVERIES WHERE order_id = @orderId AND event_key = @eventKey AND channel = @channel)
        BEGIN INSERT INTO ORDER_NOTIFICATION_DELIVERIES (order_id, event_key, channel, delivery_status) VALUES (@orderId, @eventKey, @channel, 'pending'); SELECT CAST(1 AS int) AS claimed; END
        ELSE SELECT CAST(0 AS int) AS claimed;`));
    return Boolean(rows[0]?.claimed);
  }

  private async finishOrderDelivery(orderId: string, eventKey: string, channel: string, status: 'sent' | 'failed') {
    await this.databaseService.request((request) => request.input('orderId', sql.UniqueIdentifier, orderId).input('eventKey', sql.NVarChar(120), eventKey).input('channel', sql.NVarChar(20), channel).input('status', sql.NVarChar(20), status).query(
      `UPDATE ORDER_NOTIFICATION_DELIVERIES SET delivery_status = @status, completed_at = SYSUTCDATETIME() WHERE order_id = @orderId AND event_key = @eventKey AND channel = @channel`,
    ));
  }

  private async sendBrevoEmail(userId: string, title: string, body: string) {
    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) throw new Error('Brevo is not configured');
    const users = await this.databaseService.request<{ email: string; fullName: string }>((request) => request.input('userId', sql.UniqueIdentifier, userId).query(`SELECT email, full_name AS fullName FROM USERS WHERE user_id = @userId`));
    if (!users[0]?.email) throw new Error('User email is unavailable');
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || "A'FRO" }, to: [{ email: users[0].email, name: users[0].fullName }], subject: title, htmlContent: `<p>${body.replace(/[&<>]/g, (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[value]!))}</p>` }),
    });
    if (!response.ok) throw new Error('Brevo request failed');
  }

  private async sendIprogOrderSms(userId: string, orderId: string) {
    // Only IPROG OTP endpoints are documented/configured in this project.
    // A transactional endpoint, its authentication field, and payload schema
    // must be provided before SMS confirmations can be safely sent.
    void userId; void orderId;
    throw new Error('IPROG transactional SMS is not configured.');
  }

  private async ensureWelcomeColumn() {
    if (!(await this.databaseService.columnExists('USERS', 'welcome_email_sent_at'))) {
      await this.databaseService.query('ALTER TABLE USERS ADD welcome_email_sent_at DATETIME2 NULL');
    }
  }

  private async ensureAdminNotificationsTable() {
    await this.databaseService.query(`
      IF OBJECT_ID('dbo.ADMIN_NOTIFICATIONS', 'U') IS NULL
      CREATE TABLE dbo.ADMIN_NOTIFICATIONS (
        notification_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY, notification_type NVARCHAR(30) NOT NULL,
        entity_type NVARCHAR(30) NOT NULL, entity_id UNIQUEIDENTIFIER NOT NULL, title NVARCHAR(150) NOT NULL,
        body NVARCHAR(500) NOT NULL, event_key NVARCHAR(120) NULL, is_read BIT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(), read_at DATETIME2 NULL
      );
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_ADMIN_NOTIFICATIONS_EVENT_KEY')
      CREATE UNIQUE INDEX UX_ADMIN_NOTIFICATIONS_EVENT_KEY ON ADMIN_NOTIFICATIONS(event_key) WHERE event_key IS NOT NULL;
    `);
  }
}
