import { getDb, DatabaseClient } from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';

export interface AuditLogEntry {
  actorUserId?: string | null;
  actorUsername?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, any> | null;
  outcome?: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
}

export class AuditService {
  static async log(entry: AuditLogEntry, txClient?: DatabaseClient): Promise<void> {
    try {
      const db = txClient || (await getDb());
      const id = 'aud-' + uuidv4();
      const detailsJson = entry.details ? JSON.stringify(entry.details) : null;

      await db.query(
        `INSERT INTO audit_logs (
          id, actor_user_id, actor_username, actor_role, action,
          entity_type, entity_id, ip_address, user_agent, details, outcome
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          entry.actorUserId || null,
          entry.actorUsername || 'ANONYMOUS',
          entry.actorRole || 'PUBLIC_VISITOR',
          entry.action,
          entry.entityType,
          entry.entityId,
          entry.ipAddress || null,
          entry.userAgent || null,
          detailsJson,
          entry.outcome || 'SUCCESS',
        ]
      );
    } catch (err) {
      console.error('[AuditService] Failed to write audit record:', err);
    }
  }

  static async getLogs(filters: {
    action?: string;
    actorUserId?: string;
    limit?: number;
    offset?: number;
  }) {
    const db = await getDb();
    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];

    if (filters.action) {
      params.push(filters.action);
      sql += ` AND action = $${params.length}`;
    }

    if (filters.actorUserId) {
      params.push(filters.actorUserId);
      sql += ` AND actor_user_id = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    params.push(limit, offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const res = await db.query(sql, params);
    return res.rows;
  }
}
