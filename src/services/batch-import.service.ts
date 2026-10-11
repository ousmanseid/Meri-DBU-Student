import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';
import { getDb, DatabaseClient } from '../database/db.js';
import { AuditService } from './audit.service.js';

export interface BatchRowInput {
  studentIdNumber: string;
  fullName: string;
  gender: string;
  departmentCode: string;
  programCode?: string;
  cohortYear?: string;
  enrollmentStatus?: string;
}

export interface ParsedRowValidation {
  rowIndex: number;
  data: BatchRowInput;
  isValid: boolean;
  errors: string[];
  conflictType?: 'DUPLICATE_IN_FILE' | 'ALREADY_ENROLLED' | 'UNKNOWN_DEPARTMENT';
}

export interface ImportPreviewResult {
  batchId: string;
  batchNumber: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  conflictRows: number;
  fileChecksum: string;
  rows: ParsedRowValidation[];
}

export class BatchImportService {
  // Official CSV Template Generator
  static getTemplateCsv(): string {
    return [
      'student_id_number,full_name,gender,department_code,program_code,cohort_year,enrollment_status',
      'DBU/1501234,Yared Solomon Wolde,M,COMP,BSC_SE,2024,ACTIVE',
      'DBU/1501235,Bethlehem Kebede Tessema,F,COMP,BSC_CS,2024,ACTIVE',
      'DBU/1501236,Kassahun Hailemariam,M,EENG,BSC_EE,2024,ACTIVE',
    ].join('\n');
  }

  // Official XLSX Workbook Template Generator
  static async getTemplateXlsx(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Senior Enrollment Template');
    sheet.columns = [
      { header: 'student_id_number', key: 'student_id_number', width: 20 },
      { header: 'full_name', key: 'full_name', width: 30 },
      { header: 'gender', key: 'gender', width: 10 },
      { header: 'department_code', key: 'department_code', width: 18 },
      { header: 'program_code', key: 'program_code', width: 16 },
      { header: 'cohort_year', key: 'cohort_year', width: 14 },
      { header: 'enrollment_status', key: 'enrollment_status', width: 18 },
    ];

    sheet.addRow({
      student_id_number: 'DBU/1501234',
      full_name: 'Yared Solomon Wolde',
      gender: 'M',
      department_code: 'COMP',
      program_code: 'BSC_SE',
      cohort_year: '2024',
      enrollment_status: 'ACTIVE',
    });
    sheet.addRow({
      student_id_number: 'DBU/1501235',
      full_name: 'Bethlehem Kebede Tessema',
      gender: 'F',
      department_code: 'COMP',
      program_code: 'BSC_CS',
      cohort_year: '2024',
      enrollment_status: 'ACTIVE',
    });

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  // Parse and preview Excel XLSX workbook buffer
  static async parseAndPreviewXlsx(
    buffer: Buffer,
    submittingUserId: string,
    collegeId: string,
    academicYearId: string,
    semesterId: string,
    fileName: string,
    fileSize: number
  ): Promise<ImportPreviewResult> {
    const fileChecksum = crypto.createHash('sha256').update(buffer).digest('hex');

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as any);
    } catch (err: any) {
      throw new Error(`Failed to parse Excel workbook: ${err.message}`);
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      throw new Error('The submitted Excel file does not contain any data rows.');
    }

    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = String(cell.value || '').trim();
    });

    const records: Record<string, string>[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const rec: Record<string, string> = {};
      row.eachCell((cell, colNumber) => {
        const h = headers[colNumber];
        if (h) {
          rec[h] = String(cell.value ?? '').trim();
        }
      });
      if (Object.keys(rec).length > 0) {
        records.push(rec);
      }
    });

    if (records.length === 0) {
      throw new Error('The submitted Excel workbook does not contain any valid data rows.');
    }

    return this.processRecordsValidation(
      records,
      submittingUserId,
      collegeId,
      academicYearId,
      semesterId,
      fileName,
      fileSize,
      fileChecksum
    );
  }

  // Parse and validate CSV string buffer
  static async parseAndPreviewCsv(
    csvContent: string,
    submittingUserId: string,
    collegeId: string,
    academicYearId: string,
    semesterId: string,
    fileName: string,
    fileSize: number
  ): Promise<ImportPreviewResult> {
    const fileChecksum = crypto.createHash('sha256').update(csvContent).digest('hex');

    // Parse CSV records
    let records: Record<string, string>[];
    try {
      records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (parseErr: any) {
      throw new Error(`CSV format error: ${parseErr.message}`);
    }

    if (records.length === 0) {
      throw new Error('The submitted CSV file does not contain any data rows.');
    }

    return this.processRecordsValidation(
      records,
      submittingUserId,
      collegeId,
      academicYearId,
      semesterId,
      fileName,
      fileSize,
      fileChecksum
    );
  }

  // Common shared record validation, duplicate detection, and draft batch persistence
  static async processRecordsValidation(
    records: Record<string, string>[],
    submittingUserId: string,
    collegeId: string,
    academicYearId: string,
    semesterId: string,
    fileName: string,
    fileSize: number,
    fileChecksum: string
  ): Promise<ImportPreviewResult> {
    const db = await getDb();

    if (records.length > 5000) {
      throw new Error('Batch exceeds maximum supported limit of 5,000 records per upload.');
    }

    // Load available departments for validation
    const deptRes = await db.query('SELECT code, unit_id FROM departments');
    const validDeptCodes = new Map<string, string>(deptRes.rows.map((d: any) => [d.code.toUpperCase(), d.unit_id]));

    // Query existing enrolled students to detect existing-record conflicts
    const existingEnrolledRes = await db.query('SELECT LOWER(student_id_number) as sid FROM senior_enrollment_records');
    const existingIds = new Set<string>(existingEnrolledRes.rows.map((r: any) => r.sid));

    const seenIdsInBatch = new Set<string>();
    const parsedRows: ParsedRowValidation[] = [];
    let validCount = 0;
    let invalidCount = 0;
    let duplicateCount = 0;
    let conflictCount = 0;

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowIndex = i + 1;
      const errors: string[] = [];
      let conflictType: ParsedRowValidation['conflictType'] = undefined;

      const sid = (row.student_id_number || row.student_id || row['Student ID'] || '').trim();
      const fullName = (row.full_name || row.name || row['Full Name'] || '').trim();
      const gender = (row.gender || row['Gender'] || 'M').trim().toUpperCase();
      const deptCode = (row.department_code || row.dept || row['Department Code'] || '').trim().toUpperCase();
      const progCode = (row.program_code || row['Program Code'] || '').trim().toUpperCase();
      const cohortYear = (row.cohort_year || row['Cohort'] || '2024').trim();
      const enrollmentStatus = (row.enrollment_status || row['Status'] || 'ACTIVE').trim().toUpperCase();

      // Field Validations
      if (!sid) {
        errors.push('Student ID number is required');
      } else if (!/^DBU\/[A-Z0-9\-_/]+$/i.test(sid) && sid.length < 5) {
        errors.push('Student ID number must follow DBU format (e.g. DBU/1501234)');
      }

      if (!fullName) {
        errors.push('Student Full Name is required');
      } else if (fullName.split(' ').length < 2) {
        errors.push('Full name must include at least first and father name');
      }

      if (!['M', 'F', 'MALE', 'FEMALE'].includes(gender)) {
        errors.push('Gender must be M or F');
      }

      if (!deptCode) {
        errors.push('Department code is required');
      } else if (!validDeptCodes.has(deptCode)) {
        errors.push(`Unknown department code '${deptCode}'`);
        conflictType = 'UNKNOWN_DEPARTMENT';
      }

      // Check duplicate within file
      const lowerSid = sid.toLowerCase();
      if (lowerSid && seenIdsInBatch.has(lowerSid)) {
        errors.push(`Duplicate Student ID '${sid}' found multiple times in this batch`);
        conflictType = 'DUPLICATE_IN_FILE';
        duplicateCount++;
      } else if (lowerSid) {
        seenIdsInBatch.add(lowerSid);
      }

      // Check existing conflict in registry
      if (lowerSid && existingIds.has(lowerSid)) {
        errors.push(`Student ID '${sid}' already exists in active Senior Enrollment Registry`);
        conflictType = 'ALREADY_ENROLLED';
        conflictCount++;
      }

      const isValid = errors.length === 0;
      if (isValid) {
        validCount++;
      } else {
        invalidCount++;
      }

      parsedRows.push({
        rowIndex,
        data: {
          studentIdNumber: sid,
          fullName,
          gender: gender === 'MALE' ? 'M' : gender === 'FEMALE' ? 'F' : gender,
          departmentCode: deptCode,
          programCode: progCode,
          cohortYear,
          enrollmentStatus,
        },
        isValid,
        errors,
        conflictType,
      });
    }

    const batchId = 'bat-' + uuidv4();
    const batchNumber = `BAT-DBU-${Date.now().toString().slice(-6)}`;

    // Store Batch and Rows in Database as DRAFT
    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO import_batches (
          id, batch_number, submitting_user_id, college_id, academic_year_id, semester_id,
          file_name, file_size, file_checksum, row_count, valid_row_count, invalid_row_count,
          duplicate_row_count, conflict_row_count, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'DRAFT')`,
        [
          batchId,
          batchNumber,
          submittingUserId,
          collegeId,
          academicYearId,
          semesterId,
          fileName,
          fileSize,
          fileChecksum,
          records.length,
          validCount,
          invalidCount,
          duplicateCount,
          conflictCount,
        ]
      );

      for (const pr of parsedRows) {
        await tx.query(
          `INSERT INTO import_batch_rows (
            id, batch_id, row_index, student_id_number, full_name, gender,
            department_code, program_code, cohort_year, enrollment_status,
            raw_data, is_valid, validation_errors, conflict_type, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            'row-' + uuidv4(),
            batchId,
            pr.rowIndex,
            pr.data.studentIdNumber || 'UNKNOWN',
            pr.data.fullName || 'UNKNOWN',
            pr.data.gender,
            pr.data.departmentCode,
            pr.data.programCode || null,
            pr.data.cohortYear || null,
            pr.data.enrollmentStatus || 'ACTIVE',
            JSON.stringify(pr.data),
            pr.isValid,
            JSON.stringify(pr.errors),
            pr.conflictType || null,
            pr.isValid ? 'VALID' : 'INVALID',
          ]
        );
      }
    });

    return {
      batchId,
      batchNumber,
      totalRows: records.length,
      validRows: validCount,
      invalidRows: invalidCount,
      duplicateRows: duplicateCount,
      conflictRows: conflictCount,
      fileChecksum,
      rows: parsedRows,
    };
  }

  // Submit batch for Registrar review
  static async submitBatchForReview(batchId: string, submittingUserId: string) {
    const db = await getDb();

    const batchRes = await db.query('SELECT * FROM import_batches WHERE id = $1', [batchId]);
    if (batchRes.rows.length === 0) {
      throw new Error('Import batch not found.');
    }

    const batch = batchRes.rows[0];

    if (batch.submitting_user_id !== submittingUserId) {
      throw new Error('Only the submitting Dean / academic officer can submit this batch.');
    }

    if (batch.status !== 'DRAFT' && batch.status !== 'RETURNED_FOR_CORRECTION') {
      throw new Error(`Batch cannot be submitted from status '${batch.status}'. Current status is not editable.`);
    }

    if (batch.valid_row_count === 0) {
      throw new Error('Cannot submit batch: There are no valid student enrollment records.');
    }

    await db.query(
      `UPDATE import_batches
       SET status = 'UNDER_REGISTRAR_REVIEW', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [batchId]
    );

    // Register into approval instances
    await db.query(
      `INSERT INTO approval_instances (id, workflow_code, entity_type, entity_id, status, initiated_by_user_id)
       VALUES ($1, 'SENIOR_ENROLLMENT', 'IMPORT_BATCH', $2, 'UNDER_REVIEW', $3)
       ON CONFLICT DO NOTHING`,
      ['appr-' + uuidv4(), batchId, submittingUserId]
    );

    await AuditService.log({
      actorUserId: submittingUserId,
      actorRole: 'DEAN',
      action: 'SENIOR_IMPORT_SUBMITTED',
      entityType: 'IMPORT_BATCH',
      entityId: batchId,
      details: {
        batchNumber: batch.batch_number,
        validRows: batch.valid_row_count,
        totalRows: batch.row_count,
      },
      outcome: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Batch successfully submitted for Registrar institutional review.',
      batchId,
      status: 'UNDER_REGISTRAR_REVIEW',
    };
  }

  static async getDeanBatches(collegeId?: string) {
    const db = await getDb();
    let sql = `SELECT b.*, u.username as submitter_username, c.name as college_name
               FROM import_batches b
               JOIN users u ON b.submitting_user_id = u.id
               JOIN organizational_units c ON b.college_id = c.id`;
    const params: any[] = [];
    if (collegeId) {
      params.push(collegeId);
      sql += ` WHERE b.college_id = $1`;
    }
    sql += ` ORDER BY b.created_at DESC`;
    const res = await db.query(sql, params);
    return res.rows;
  }
}
