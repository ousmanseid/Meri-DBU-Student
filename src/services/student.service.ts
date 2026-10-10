import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/db.js';
import { AuditService } from './audit.service.js';
import { NotificationService } from './notification.service.js';

export interface CreateServiceRequestParams {
  studentUserId: string;
  serviceType: string;
  subject: string;
  description: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

export interface CreateCorrectionRequestParams {
  studentUserId: string;
  fieldName: string;
  oldValue: string;
  requestedValue: string;
  reason: string;
  supportingDocumentUrl?: string;
}

export class StudentService {
  static async getStudentProfile(userId: string) {
    const db = await getDb();
    const res = await db.query(
      `SELECT sp.*, u.username, u.email, d.name as department_name, d.code as department_code,
              c.name as college_name, p.name as program_name
       FROM student_profiles sp
       JOIN users u ON sp.user_id = u.id
       LEFT JOIN departments d ON sp.department_id = d.id
       LEFT JOIN organizational_units c ON d.unit_id = c.id
       LEFT JOIN academic_programs p ON sp.program_id = p.id
       WHERE sp.user_id = $1`,
      [userId]
    );
    return res.rows[0] || null;
  }

  static async createServiceRequest(params: CreateServiceRequestParams) {
    const db = await getDb();
    const requestId = 'req-' + uuidv4();
    const ticketNumber = `TKT-${Date.now().toString().slice(-6)}`;

    await db.query(
      `INSERT INTO student_service_requests (
        id, ticket_number, student_user_id, service_type, subject, description, priority, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'SUBMITTED')`,
      [
        requestId,
        ticketNumber,
        params.studentUserId,
        params.serviceType,
        params.subject,
        params.description,
        params.priority || 'MEDIUM',
      ]
    );

    await AuditService.log({
      actorUserId: params.studentUserId,
      actorRole: 'STUDENT',
      action: 'SERVICE_REQUEST_SUBMITTED',
      entityType: 'SERVICE_REQUEST',
      entityId: requestId,
      details: { ticketNumber, type: params.serviceType, subject: params.subject },
      outcome: 'SUCCESS',
    });

    return { requestId, ticketNumber };
  }

  static async getStudentServiceRequests(userId: string) {
    const db = await getDb();
    const res = await db.query(
      `SELECT * FROM student_service_requests WHERE student_user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows;
  }

  static async getAllServiceRequests(filters?: { status?: string; serviceType?: string }) {
    const db = await getDb();
    let sql = `
      SELECT sr.*, u.username as student_username, sp.student_id_number, sp.first_name, sp.last_name
      FROM student_service_requests sr
      JOIN users u ON sr.student_user_id = u.id
      LEFT JOIN student_profiles sp ON sr.student_user_id = sp.user_id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (filters?.status) {
      params.push(filters.status);
      sql += ` AND sr.status = $${params.length}`;
    }
    if (filters?.serviceType) {
      params.push(filters.serviceType);
      sql += ` AND sr.service_type = $${params.length}`;
    }
    sql += ' ORDER BY sr.created_at DESC';
    const res = await db.query(sql, params);
    return res.rows;
  }

  static async updateServiceRequestStatus(
    requestId: string,
    staffUserId: string,
    status: string,
    resolutionNotes?: string
  ) {
    const db = await getDb();
    const reqRes = await db.query(`SELECT * FROM student_service_requests WHERE id = $1`, [requestId]);
    if (reqRes.rows.length === 0) {
      throw new Error('Service request not found.');
    }
    const ticket = reqRes.rows[0];

    await db.query(
      `UPDATE student_service_requests
       SET status = $1, assigned_staff_id = $2, resolution_notes = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [status, staffUserId, resolutionNotes || null, requestId]
    );

    // Notify student
    await NotificationService.send({
      userId: ticket.student_user_id,
      title: `Service Request ${ticket.ticket_number} Updated`,
      message: `Your inquiry (${ticket.subject}) has been marked as ${status}.${resolutionNotes ? ' Notes: ' + resolutionNotes : ''}`,
      type: status === 'RESOLVED' ? 'SUCCESS' : status === 'REJECTED' ? 'WARNING' : 'INFO',
    });

    await AuditService.log({
      actorUserId: staffUserId,
      actorRole: 'STAFF',
      action: 'SERVICE_REQUEST_STATUS_UPDATED',
      entityType: 'SERVICE_REQUEST',
      entityId: requestId,
      details: { newStatus: status, resolutionNotes },
      outcome: 'SUCCESS',
    });
  }

  static async createCorrectionRequest(params: CreateCorrectionRequestParams) {
    const db = await getDb();
    const profile = await this.getStudentProfile(params.studentUserId);
    if (!profile) {
      throw new Error('Student profile not found');
    }

    const reqId = 'corr-' + uuidv4();
    await db.query(
      `INSERT INTO correction_requests (
        id, student_user_id, student_id_number, field_name, old_value, requested_value,
        reason, supporting_document_url, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING')`,
      [
        reqId,
        params.studentUserId,
        profile.student_id_number,
        params.fieldName,
        params.oldValue,
        params.requestedValue,
        params.reason,
        params.supportingDocumentUrl || null,
      ]
    );

    await AuditService.log({
      actorUserId: params.studentUserId,
      actorRole: 'STUDENT',
      action: 'CORRECTION_REQUEST_SUBMITTED',
      entityType: 'CORRECTION_REQUEST',
      entityId: reqId,
      details: { field: params.fieldName, requestedValue: params.requestedValue },
      outcome: 'SUCCESS',
    });

    return { reqId };
  }

  static async getCorrectionRequests(userId?: string) {
    const db = await getDb();
    let sql = `
      SELECT cr.*, u.username as student_username
      FROM correction_requests cr
      JOIN users u ON cr.student_user_id = u.id
    `;
    const params: any[] = [];
    if (userId) {
      params.push(userId);
      sql += ' WHERE cr.student_user_id = $1';
    }
    sql += ' ORDER BY cr.created_at DESC';
    const res = await db.query(sql, params);
    return res.rows;
  }

  static async reviewCorrectionRequest(
    requestId: string,
    reviewerUserId: string,
    action: 'APPROVE' | 'REJECT',
    reviewComments?: string
  ) {
    const db = await getDb();
    const reqRes = await db.query(`SELECT * FROM correction_requests WHERE id = $1`, [requestId]);

    if (reqRes.rows.length === 0) {
      const err = new Error('Correction request not found.');
      (err as any).status = 404;
      throw err;
    }

    const corr = reqRes.rows[0];
    if (corr.status !== 'PENDING' && corr.status !== 'UNDER_REVIEW') {
      const err = new Error(`Request has already been decided (${corr.status}).`);
      (err as any).status = 400;
      throw err;
    }

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    await db.transaction(async (tx) => {
      await tx.query(
        `UPDATE correction_requests
         SET status = $1, reviewed_by_user_id = $2, review_comments = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [newStatus, reviewerUserId, reviewComments || null, requestId]
      );

      // If approved, update student profile atomically
      if (action === 'APPROVE') {
        const allowedColumns: Record<string, string> = {
          first_name: 'first_name',
          last_name: 'last_name',
          phone: 'phone',
          gender: 'gender',
        };

        const targetColumn = allowedColumns[corr.field_name];
        if (targetColumn) {
          await tx.query(
            `UPDATE student_profiles SET ${targetColumn} = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
            [corr.requested_value, corr.student_user_id]
          );
        }
      }

      // Notify student
      await NotificationService.send(
        {
          userId: corr.student_user_id,
          title: `Data Correction ${newStatus}`,
          message: `Your request to correct "${corr.field_name}" has been ${newStatus.toLowerCase()} by the Registrar. ${reviewComments ? 'Comments: ' + reviewComments : ''}`,
          type: action === 'APPROVE' ? 'SUCCESS' : 'WARNING',
        },
        tx
      );

      await AuditService.log(
        {
          actorUserId: reviewerUserId,
          actorRole: 'REGISTRAR',
          action: action === 'APPROVE' ? 'CORRECTION_REQUEST_APPROVED' : 'CORRECTION_REQUEST_REJECTED',
          entityType: 'CORRECTION_REQUEST',
          entityId: requestId,
          details: {
            studentUserId: corr.student_user_id,
            field: corr.field_name,
            oldValue: corr.old_value,
            newValue: corr.requested_value,
            reviewComments,
          },
          outcome: 'SUCCESS',
        },
        tx
      );
    });

    return {
      success: true,
      status: newStatus,
      message: `Correction request ${newStatus.toLowerCase()} successfully.`,
    };
  }
}
