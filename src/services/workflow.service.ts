import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/db.js';
import { AuditService } from './audit.service.js';

export interface WorkflowTransitionParams {
  instanceId: string;
  actorUserId: string;
  actorRole: string;
  action: 'APPROVE' | 'REJECT' | 'RETURN' | 'ESCALATE';
  comments: string;
  ipAddress?: string;
  userAgent?: string;
}

export class WorkflowService {
  static async getWorkflows() {
    const db = await getDb();
    const wfRes = await db.query('SELECT * FROM approval_workflows WHERE is_active = TRUE ORDER BY code ASC');
    const stepsRes = await db.query('SELECT * FROM workflow_steps ORDER BY workflow_id, step_order ASC');

    const stepsByWf = new Map<string, any[]>();
    for (const s of stepsRes.rows) {
      if (!stepsByWf.has(s.workflow_id)) stepsByWf.set(s.workflow_id, []);
      stepsByWf.get(s.workflow_id)!.push(s);
    }

    return wfRes.rows.map((w: any) => ({
      ...w,
      steps: stepsByWf.get(w.id) || [],
    }));
  }

  static async getInstances(filters?: { workflowCode?: string; status?: string }) {
    const db = await getDb();
    let sql = `
      SELECT ai.*, u.username as initiated_by_username
      FROM approval_instances ai
      JOIN users u ON ai.initiated_by_user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (filters?.workflowCode) {
      params.push(filters.workflowCode);
      sql += ` AND ai.workflow_code = $${params.length}`;
    }
    if (filters?.status) {
      params.push(filters.status);
      sql += ` AND ai.status = $${params.length}`;
    }
    sql += ' ORDER BY ai.created_at DESC';
    const res = await db.query(sql, params);
    return res.rows;
  }

  static async executeTransition(params: WorkflowTransitionParams) {
    const db = await getDb();

    const instRes = await db.query('SELECT * FROM approval_instances WHERE id = $1', [params.instanceId]);
    if (instRes.rows.length === 0) {
      throw new Error('Workflow approval instance not found.');
    }

    const instance = instRes.rows[0];

    // Record action
    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO approval_actions (id, instance_id, step_name, actor_user_id, action, comments)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['act-' + uuidv4(), instance.id, `Step ${instance.current_step_order}`, params.actorUserId, params.action, params.comments]
      );

      let newStatus = instance.status;
      if (params.action === 'APPROVE') {
        newStatus = 'APPROVED';
      } else if (params.action === 'REJECT') {
        newStatus = 'REJECTED';
      } else if (params.action === 'RETURN') {
        newStatus = 'RETURNED';
      } else if (params.action === 'ESCALATE') {
        newStatus = 'UNDER_REVIEW';
      }

      await tx.query(
        `UPDATE approval_instances SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [newStatus, instance.id]
      );

      await AuditService.log(
        {
          actorUserId: params.actorUserId,
          actorRole: params.actorRole,
          action: `WORKFLOW_${params.action}`,
          entityType: 'APPROVAL_INSTANCE',
          entityId: instance.id,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          details: {
            workflowCode: instance.workflow_code,
            comments: params.comments,
            newStatus,
          },
          outcome: 'SUCCESS',
        },
        tx
      );
    });

    return { success: true };
  }
}
