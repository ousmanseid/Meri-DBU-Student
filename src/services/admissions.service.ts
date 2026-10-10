import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/db.js';
import { AuditService } from './audit.service.js';

export interface CreateFreshmanRecordInput {
  admissionSlipNumber: string;
  entranceExamId: string;
  firstName: string;
  lastName: string;
  gender: 'M' | 'F' | 'O';
  collegeId: string;
  departmentId: string;
  academicYearId?: string;
}

export class AdmissionsService {
  /**
   * List freshman eligibility registry records with optional search and filters.
   */
  static async listFreshmanRecords(filter?: {
    search?: string;
    collegeId?: string;
    isActivated?: boolean;
    limit?: number;
  }) {
    const db = await getDb();
    let query = `
      SELECT fer.*, ou.name as college_name, d.name as department_name, ay.year_label as academic_year_label
      FROM freshman_eligibility_records fer
      LEFT JOIN organizational_units ou ON fer.college_id = ou.id
      LEFT JOIN departments d ON fer.department_id = d.id
      LEFT JOIN academic_years ay ON fer.academic_year_id = ay.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filter?.collegeId) {
      params.push(filter.collegeId);
      query += ` AND fer.college_id = $${params.length}`;
    }

    if (filter?.isActivated !== undefined) {
      params.push(filter.isActivated);
      query += ` AND fer.is_activated = $${params.length}`;
    }

    if (filter?.search && filter.search.trim()) {
      params.push(`%${filter.search.trim().toLowerCase()}%`);
      query += ` AND (
        LOWER(fer.admission_slip_number) LIKE $${params.length} OR
        LOWER(fer.entrance_exam_id) LIKE $${params.length} OR
        LOWER(fer.first_name) LIKE $${params.length} OR
        LOWER(fer.last_name) LIKE $${params.length}
      )`;
    }

    const limit = Math.min(filter?.limit || 100, 200);
    query += ` ORDER BY fer.created_at DESC LIMIT ${limit}`;

    const res = await db.query(query, params);
    return res.rows;
  }

  /**
   * Register a new freshman eligibility record.
   */
  static async createFreshmanRecord(
    input: CreateFreshmanRecordInput,
    actor: { userId: string; username: string },
    ipAddress?: string,
    userAgent?: string
  ) {
    const db = await getDb();
    const slip = input.admissionSlipNumber.trim();
    const examId = input.entranceExamId.trim();

    // Check duplicate slip or exam id
    const dupRes = await db.query(
      `SELECT * FROM freshman_eligibility_records WHERE admission_slip_number = $1 OR entrance_exam_id = $2`,
      [slip, examId]
    );

    if (dupRes.rows.length > 0) {
      const existing = dupRes.rows[0];
      const conflictField = existing.admission_slip_number === slip ? 'Admission slip number' : 'Entrance exam ID';
      const err = new Error(`${conflictField} is already registered in the freshman eligibility registry.`);
      (err as any).status = 409;
      throw err;
    }

    const recordId = 'fresh-' + uuidv4().slice(0, 8);
    const ayId = input.academicYearId || 'ay-2025-2026';

    const insertRes = await db.query(
      `INSERT INTO freshman_eligibility_records (
        id, admission_slip_number, entrance_exam_id, first_name, last_name, gender, college_id, department_id, academic_year_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        recordId,
        slip,
        examId,
        input.firstName.trim(),
        input.lastName.trim(),
        input.gender,
        input.collegeId,
        input.departmentId,
        ayId,
      ]
    );

    await AuditService.log({
      actorUserId: actor.userId,
      actorUsername: actor.username,
      action: 'FRESHMAN_RECORD_CREATED',
      entityType: 'FRESHMAN_ELIGIBILITY',
      entityId: recordId,
      ipAddress,
      userAgent,
      details: {
        admissionSlipNumber: slip,
        entranceExamId: examId,
        name: `${input.firstName} ${input.lastName}`,
        departmentId: input.departmentId,
      },
      outcome: 'SUCCESS',
    });

    return insertRes.rows[0];
  }

  /**
   * Bulk import freshman eligibility records from CSV.
   */
  static async importFreshmanCsv(
    csvContent: string,
    actor: { userId: string; username: string },
    ipAddress?: string,
    userAgent?: string
  ) {
    const db = await getDb();
    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      throw new Error('CSV must contain a header row and at least one student record.');
    }

    const header = lines[0].toLowerCase().split(',').map((h) => h.trim());
    const slipIdx = header.indexOf('admission_slip_number');
    const examIdx = header.indexOf('entrance_exam_id');
    const firstIdx = header.indexOf('first_name');
    const lastIdx = header.indexOf('last_name');
    const genderIdx = header.indexOf('gender');
    const collegeIdx = header.indexOf('college_id');
    const deptIdx = header.indexOf('department_id');

    if (slipIdx === -1 || examIdx === -1 || firstIdx === -1 || lastIdx === -1) {
      throw new Error(
        'CSV header missing required fields: admission_slip_number, entrance_exam_id, first_name, last_name'
      );
    }

    let importedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    await db.transaction(async (tx) => {
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => p.trim());
        const slip = parts[slipIdx];
        const examId = parts[examIdx];
        const firstName = parts[firstIdx];
        const lastName = parts[lastIdx];
        const gender = genderIdx !== -1 ? parts[genderIdx] : 'M';
        const collegeId = collegeIdx !== -1 ? parts[collegeIdx] : 'col-ceng';
        const deptId = deptIdx !== -1 ? parts[deptIdx] : 'dept-comp';

        if (!slip || !examId || !firstName || !lastName) {
          skippedCount++;
          errors.push(`Row ${i}: Missing mandatory field(s).`);
          continue;
        }

        const existing = await tx.query(
          `SELECT id FROM freshman_eligibility_records WHERE admission_slip_number = $1 OR entrance_exam_id = $2`,
          [slip, examId]
        );

        if (existing.rows.length > 0) {
          skippedCount++;
          errors.push(`Row ${i}: Duplicate admission slip (${slip}) or exam ID (${examId}).`);
          continue;
        }

        await tx.query(
          `INSERT INTO freshman_eligibility_records (
            id, admission_slip_number, entrance_exam_id, first_name, last_name, gender, college_id, department_id, academic_year_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ay-2025-2026')`,
          ['fresh-' + uuidv4().slice(0, 8), slip, examId, firstName, lastName, gender, collegeId, deptId]
        );
        importedCount++;
      }

      await AuditService.log(
        {
          actorUserId: actor.userId,
          actorUsername: actor.username,
          action: 'FRESHMAN_RECORDS_BULK_IMPORTED',
          entityType: 'FRESHMAN_ELIGIBILITY',
          entityId: 'BULK',
          ipAddress,
          userAgent,
          details: { totalRows: lines.length - 1, importedCount, skippedCount },
          outcome: 'SUCCESS',
        },
        tx
      );
    });

    return {
      totalRows: lines.length - 1,
      importedCount,
      skippedCount,
      errors,
    };
  }

  /**
   * Delete / Revoke an unactivated freshman eligibility record.
   */
  static async deleteFreshmanRecord(
    id: string,
    actor: { userId: string; username: string },
    ipAddress?: string,
    userAgent?: string
  ) {
    const db = await getDb();
    const existingRes = await db.query(`SELECT * FROM freshman_eligibility_records WHERE id = $1`, [id]);

    if (existingRes.rows.length === 0) {
      const err = new Error('Freshman record not found.');
      (err as any).status = 404;
      throw err;
    }

    const record = existingRes.rows[0];
    if (record.is_activated) {
      const err = new Error('Cannot delete an already activated student record.');
      (err as any).status = 400;
      throw err;
    }

    await db.query(`DELETE FROM freshman_eligibility_records WHERE id = $1`, [id]);

    await AuditService.log({
      actorUserId: actor.userId,
      actorUsername: actor.username,
      action: 'FRESHMAN_RECORD_DELETED',
      entityType: 'FRESHMAN_ELIGIBILITY',
      entityId: id,
      ipAddress,
      userAgent,
      details: { admissionSlipNumber: record.admission_slip_number, name: `${record.first_name} ${record.last_name}` },
      outcome: 'SUCCESS',
    });

    return { success: true, message: 'Freshman eligibility record revoked successfully.' };
  }
}
