import { getDb, DatabaseClient } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';

export interface CreateNotificationParams {
  userId: string;
  title: string;
  message: string;
  link?: string;
  type?: 'INFO' | 'WARNING' | 'SUCCESS' | 'ACTION_REQUIRED';
  emailRecipient?: string;
}

export class NotificationService {
  static async send(params: CreateNotificationParams, txClient?: DatabaseClient): Promise<string> {
    const db = txClient || (await getDb());
    const notifId = 'notif-' + uuidv4();

    await db.query(
      `INSERT INTO notifications (id, user_id, title, message, link, type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [notifId, params.userId, params.title, params.message, params.link || null, params.type || 'INFO']
    );

    if (params.emailRecipient) {
      const attemptId = 'nda-' + uuidv4();
      await db.query(
        `INSERT INTO notification_delivery_attempts (id, notification_id, recipient_email, channel, status)
         VALUES ($1, $2, $3, 'EMAIL', 'SENT')`,
        [attemptId, notifId, params.emailRecipient]
      );
    }

    return notifId;
  }

  static async getUserNotifications(userId: string) {
    const db = await getDb();
    const res = await db.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    return res.rows;
  }

  static async markAsRead(notificationId: string, userId: string) {
    const db = await getDb();
    await db.query(
      `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
      [notificationId, userId]
    );
  }
}
