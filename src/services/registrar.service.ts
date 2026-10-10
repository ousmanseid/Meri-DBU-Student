import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/db.js';
import { env } from '../config/env.js';
import { AuditService } from './audit.service.js';
import { NotificationService } from './notification.service.js';

export interface RegistrarReviewDecision {
  batchId: string;
  reviewerUserId: string;
  action: 'APPROVE' | 'REJECT' | 'RETURN_FOR_CORRECTION';
  comments: string;
  ipAddress?: string;
  userAgent?: string;
}

export class RegistrarService {
  // Get all batches submitted for review
  static async getBatchesForReview(statusFilter?: string) {
    const db = await getDb();
    let sql = `
      SELECT b.*, u.username as submitter_username, u.email as submitter_email,
             c.name as college_name, ay.year_label, s.semester_number
      FROM import_batches b
      JOIN users u ON b.submitting_user_id = u.id
      JOIN organizational_units c ON b.college_id = c.id
      JOIN academic_years ay ON b.academic_year_id = ay.id
      JOIN semesters s ON b.semester_id = s.id
    `;
    const params: any[] = [];
    if (statusFilter) {
      params.push(statusFilter);
      sql += ' WHERE b.status = $1';
    } else {
      sql += " WHERE b.status IN ('SUBMITTED', 'UNDER_REGISTRAR_REVIEW', 'APPROVED', 'REJECTED', 'RETURNED_FOR_CORRECTION')";
    }
    sql += ' ORDER BY b.created_at DESC';

    const res = await db.query(sql, params);
    return res.rows;
  }

  // Get detailed batch view with rows
  static async getBatchDetails(batchId: string) {
    const db = await getDb();
    const batchRes = await db.query(
      `SELECT b.*, u.username as submitter_username, c.name as college_name
       FROM import_batches b
       JOIN users u ON b.submitting_user_id = u.id
       JOIN organizational_units c ON b.college_id = c.id
       WHERE b.id = $1`,
      [batchId]
    );

    if (batchRes.rows.length === 0) {
      throw new Error('Batch not found');
    }

    const rowsRes = await db.query(
      `SELECT * FROM import_batch_rows WHERE batch_id = $1 ORDER BY row_index ASC`,
      [batchId]
    );

    return {
      batch: batchRes.rows[0],
      rows: rowsRes.rows,
    };
  }

  // Execute Review Decision (Approve / Reject / Return)
  static async processBatchDecision(decision: RegistrarReviewDecision) {
    const db = await getDb();

    // 1. Fetch batch
    const batchRes = await db.query('SELECT * FROM import_batches WHERE id = $1', [decision.batchId]);
    if (batchRes.rows.length === 0) {
      throw new Error('Batch not found');
    }

    const batch = batchRes.rows[0];

    // Must be in reviewable state
    if (!['SUBMITTED', 'UNDER_REGISTRAR_REVIEW'].includes(batch.status)) {
      throw new Error(`Batch cannot be reviewed in current status '${batch.status}'.`);
    }

    // 2. Enforce Separation of Duties (Section 6D: Submitter cannot approve their own batch)
    if (env.SEPARATION_OF_DUTIES_STRICT === 'true' && batch.submitting_user_id === decision.reviewerUserId) {
      await AuditService.log({
        actorUserId: decision.reviewerUserId,
        actorRole: 'REGISTRAR',
        action: 'SEPARATION_OF_DUTIES_VIOLATION_BLOCKED',
        entityType: 'IMPORT_BATCH',
        entityId: batch.id,
        ipAddress: decision.ipAddress,
        userAgent: decision.userAgent,
        details: { batchNumber: batch.batch_number },
        outcome: 'BLOCKED',
      });
      throw new Error('Separation of Duties Policy: A submitting user cannot approve their own batch.');
    }

    // 3. Comments validation
    if (['REJECT', 'RETURN_FOR_CORRECTION'].includes(decision.action) && (!decision.comments || decision.comments.trim().length < 5)) {
      throw new Error('A detailed mandatory review comment is required when rejecting or returning a batch for correction.');
    }

    // 4. Atomic Database Transaction for decision execution
    const result = await db.transaction(async (tx) => {
      if (decision.action === 'APPROVE') {
        // Fetch all valid rows in this batch
        const validRowsRes = await tx.query(
          `SELECT * FROM import_batch_rows WHERE batch_id = $1 AND is_valid = TRUE`,
          [batch.id]
        );

        const validRows = validRowsRes.rows;

        // Fetch department lookup to map department_code to department_id
        const deptRes = await tx.query('SELECT id, code FROM departments');
        const deptMap = new Map<string, string>(deptRes.rows.map((d: any) => [d.code.toUpperCase(), d.id]));

        // Fetch programs lookup
        const progRes = await tx.query('SELECT id, code FROM academic_programs');
        const progMap = new Map<string, string>(progRes.rows.map((p: any) => [p.code.toUpperCase(), p.id]));

        let promotedCount = 0;

        for (const row of validRows) {
          const deptId = deptMap.get(row.department_code.toUpperCase()) || null;
          const progId = row.program_code ? progMap.get(row.program_code.toUpperCase()) || null : null;
          const names = row.full_name.split(' ');

          // Insert into official senior_enrollment_records
          await tx.query(
            `INSERT INTO senior_enrollment_records (
              id, student_id_number, full_name, first_name, last_name, gender,
              college_id, department_id, program_id, cohort_year,
              academic_year_id, semester_id, enrollment_status,
              is_eligible_for_activation, is_activated,
              source_batch_id, approved_by_registrar_id, approved_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE, FALSE, $14, $15, CURRENT_TIMESTAMP)
            ON CONFLICT (student_id_number) DO UPDATE SET
              full_name = EXCLUDED.full_name,
              department_id = EXCLUDED.department_id,
              program_id = EXCLUDED.program_id,
              is_eligible_for_activation = TRUE,
              source_batch_id = EXCLUDED.source_batch_id,
              approved_by_registrar_id = EXCLUDED.approved_by_registrar_id,
              approved_at = CURRENT_TIMESTAMP`,
            [
              'sen-' + uuidv4(),
              row.student_id_number,
              row.full_name,
              names[0] || 'Senior',
              names.slice(1).join(' ') || 'Student',
              row.gender || 'M',
              batch.college_id,
              deptId,
              progId,
              row.cohort_year || '2024',
              batch.academic_year_id,
              batch.semester_id,
              row.enrollment_status || 'ACTIVE',
              batch.id,
              decision.reviewerUserId,
            ]
          );

          // Update row status
          await tx.query(`UPDATE import_batch_rows SET status = 'APPROVED' WHERE id = $1`, [row.id]);
          promotedCount++;
        }

        // Update batch status to APPROVED
        await tx.query(
          `UPDATE import_batches
           SET status = 'APPROVED', reviewer_user_id = $1, reviewer_comments = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [decision.reviewerUserId, decision.comments || 'Approved by Registrar', batch.id]
        );

        // Notify Submitting Dean
        await NotificationService.send(
          {
            userId: batch.submitting_user_id,
            title: 'Senior Batch Approved',
            message: `Your enrollment batch ${batch.batch_number} has been approved by the Registrar. ${promotedCount} records are now eligible for senior activation.`,
            type: 'SUCCESS',
          },
          tx
        );

        await AuditService.log(
          {
            actorUserId: decision.reviewerUserId,
            actorRole: 'REGISTRAR',
            action: 'SENIOR_IMPORT_BATCH_APPROVED',
            entityType: 'IMPORT_BATCH',
            entityId: batch.id,
            ipAddress: decision.ipAddress,
            userAgent: decision.userAgent,
            details: {
              batchNumber: batch.batch_number,
              promotedRecords: promotedCount,
              comments: decision.comments,
            },
            outcome: 'SUCCESS',
          },
          tx
        );

        return {
          status: 'APPROVED',
          message: `Batch successfully approved. ${promotedCount} student records promoted to active eligibility registry.`,
          promotedCount,
        };
      } else if (decision.action === 'REJECT') {
        // Update batch status to REJECTED (records NOT promoted!)
        await tx.query(
          `UPDATE import_batches
           SET status = 'REJECTED', reviewer_user_id = $1, reviewer_comments = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [decision.reviewerUserId, decision.comments, batch.id]
        );

        await tx.query(`UPDATE import_batch_rows SET status = 'REJECTED' WHERE batch_id = $1`, [batch.id]);

        await NotificationService.send(
          {
            userId: batch.submitting_user_id,
            title: 'Senior Batch Rejected',
            message: `Your enrollment batch ${batch.batch_number} was rejected by the Registrar. Reason: ${decision.comments}`,
            type: 'WARNING',
          },
          tx
        );

        await AuditService.log(
          {
            actorUserId: decision.reviewerUserId,
            actorRole: 'REGISTRAR',
            action: 'SENIOR_IMPORT_BATCH_REJECTED',
            entityType: 'IMPORT_BATCH',
            entityId: batch.id,
            ipAddress: decision.ipAddress,
            userAgent: decision.userAgent,
            details: { batchNumber: batch.batch_number, reason: decision.comments },
            outcome: 'SUCCESS',
          },
          tx
        );

        return {
          status: 'REJECTED',
          message: 'Batch has been rejected with mandatory comments recorded.',
        };
      } else if (decision.action === 'RETURN_FOR_CORRECTION') {
        // Update batch status to RETURNED_FOR_CORRECTION
        await tx.query(
          `UPDATE import_batches
           SET status = 'RETURNED_FOR_CORRECTION', reviewer_user_id = $1, reviewer_comments = $2, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3`,
          [decision.reviewerUserId, decision.comments, batch.id]
        );

        await NotificationService.send(
          {
            userId: batch.submitting_user_id,
            title: 'Senior Batch Returned for Correction',
            message: `Enrollment batch ${batch.batch_number} has been returned for correction. Feedback: ${decision.comments}`,
            type: 'ACTION_REQUIRED',
          },
          tx
        );

        await AuditService.log(
          {
            actorUserId: decision.reviewerUserId,
            actorRole: 'REGISTRAR',
            action: 'SENIOR_IMPORT_BATCH_RETURNED_FOR_CORRECTION',
            entityType: 'IMPORT_BATCH',
            entityId: batch.id,
            ipAddress: decision.ipAddress,
            userAgent: decision.userAgent,
            details: { batchNumber: batch.batch_number, reason: decision.comments },
            outcome: 'SUCCESS',
          },
          tx
        );

        return {
          status: 'RETURNED_FOR_CORRECTION',
          message: 'Batch returned to Dean for correction.',
        };
      } else {
        throw new Error(`Unsupported review action: ${decision.action}`);
      }
    });

    return result;
  }

  // Get active senior eligibility registry
  static async getApprovedRegistry(filters: { search?: string; collegeId?: string; limit?: number }) {
    const db = await getDb();
    let sql = `
      SELECT s.*, c.name as college_name, d.name as department_name, p.name as program_name
      FROM senior_enrollment_records s
      JOIN organizational_units c ON s.college_id = c.id
      JOIN departments d ON s.department_id = d.id
      LEFT JOIN academic_programs p ON s.program_id = p.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (filters.search) {
      params.push(`%${filters.search.toLowerCase()}%`);
      sql += ` AND (LOWER(s.student_id_number) LIKE $${params.length} OR LOWER(s.full_name) LIKE $${params.length})`;
    }
    if (filters.collegeId) {
      params.push(filters.collegeId);
      sql += ` AND s.college_id = $${params.length}`;
    }
    sql += ' ORDER BY s.approved_at DESC';
    const limit = filters.limit || 50;
    params.push(limit);
    sql += ` LIMIT $${params.length}`;

    const res = await db.query(sql, params);
    return res.rows;
  }
}
