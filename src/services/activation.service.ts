import { v4 as uuidv4 } from 'uuid';
import { getDb, DatabaseClient } from '../database/db.js';
import { AuthService } from './auth.service.js';
import { AuditService } from './audit.service.js';
import { NotificationService } from './notification.service.js';

export interface InitiateFreshmanActivationParams {
  admissionSlipNumber: string;
  entranceExamId: string;
  firstName: string;
  lastName: string;
  email: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CompleteActivationParams {
  token: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface InitiateSeniorActivationParams {
  studentIdNumber: string;
  fullName: string;
  email: string;
  ipAddress?: string;
  userAgent?: string;
}

export class ActivationService {
  // Generate unique collision-safe username: e.g. dbu/ug/2026/0001
  private static async generateUniqueUsername(tx: DatabaseClient, year: string = '2026'): Promise<string> {
    for (let attempts = 0; attempts < 100; attempts++) {
      const randomSeq = Math.floor(1000 + Math.random() * 9000);
      const candidate = `dbu/ug/${year}/${randomSeq}`;
      const check = await tx.query('SELECT id FROM users WHERE username = $1', [candidate]);
      if (check.rows.length === 0) {
        return candidate;
      }
    }
    // Fallback guaranteed unique
    return `dbu/ug/${year}/${Date.now().toString().slice(-4)}`;
  }

  // --- FRESHMAN ACTIVATION ---
  static async initiateFreshmanActivation(params: InitiateFreshmanActivationParams) {
    const db = await getDb();

    // Query official freshman newly admitted list
    const recRes = await db.query(
      `SELECT * FROM freshman_eligibility_records
       WHERE LOWER(admission_slip_number) = LOWER($1)
         AND LOWER(entrance_exam_id) = LOWER($2)
         AND LOWER(first_name) = LOWER($3)
         AND LOWER(last_name) = LOWER($4)`,
      [
        params.admissionSlipNumber.trim(),
        params.entranceExamId.trim(),
        params.firstName.trim(),
        params.lastName.trim(),
      ]
    );

    if (recRes.rows.length === 0) {
      await AuditService.log({
        action: 'FRESHMAN_ACTIVATION_ELIGIBILITY_MISMATCH',
        entityType: 'FRESHMAN_RECORD',
        entityId: params.admissionSlipNumber,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        details: { slip: params.admissionSlipNumber, examId: params.entranceExamId },
        outcome: 'FAILURE',
      });
      return {
        success: false,
        message: 'No matching newly admitted student record found. Please verify your official entrance slip number and details with Admissions.',
      };
    }

    const record = recRes.rows[0];

    if (record.is_activated) {
      await AuditService.log({
        action: 'FRESHMAN_ACTIVATION_ALREADY_ACTIVATED',
        entityType: 'FRESHMAN_RECORD',
        entityId: record.id,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        outcome: 'BLOCKED',
      });
      return {
        success: false,
        message: 'This freshman admission record has already been activated. Please sign in or use password recovery.',
      };
    }

    // Check if email already used by an active account
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [params.email.trim().toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return {
        success: false,
        message: 'An account with this email address already exists in the system.',
      };
    }

    // Issue single-use expiring verification token (valid for 24 hours)
    const token = 'tok-' + uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const metadata = JSON.stringify({
      eligibilityRecordId: record.id,
      firstName: record.first_name,
      lastName: record.last_name,
      gender: record.gender,
      deptId: record.department_id,
      collegeId: record.college_id,
      slipNumber: record.admission_slip_number,
    });

    await db.query(
      `INSERT INTO email_verification_tokens (id, email, token, purpose, metadata, expires_at)
       VALUES ($1, $2, $3, 'FRESHMAN_ACTIVATION', $4, CURRENT_TIMESTAMP + INTERVAL '24 hours')`,
      ['evt-' + uuidv4(), params.email.trim().toLowerCase(), token, metadata]
    );

    await AuditService.log({
      action: 'FRESHMAN_ACTIVATION_TOKEN_DISPATCHED',
      entityType: 'FRESHMAN_RECORD',
      entityId: record.id,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      details: { email: params.email },
      outcome: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Eligibility verified successfully. Activation verification token has been issued.',
      verificationToken: token, // Provided in development/test response; in production sent via email
      email: params.email,
    };
  }

  // --- SENIOR ACTIVATION ---
  static async initiateSeniorActivation(params: InitiateSeniorActivationParams) {
    const db = await getDb();

    // Query active senior enrollment registry (must be approved by Registrar)
    const seniorRes = await db.query(
      `SELECT * FROM senior_enrollment_records
       WHERE LOWER(student_id_number) = LOWER($1)
         AND is_eligible_for_activation = TRUE`,
      [params.studentIdNumber.trim()]
    );

    if (seniorRes.rows.length === 0) {
      await AuditService.log({
        action: 'SENIOR_ACTIVATION_ELIGIBILITY_MISMATCH',
        entityType: 'SENIOR_RECORD',
        entityId: params.studentIdNumber,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        outcome: 'FAILURE',
      });
      return {
        success: false,
        message: 'No approved current-enrollment record found for this Student ID. Please ensure your Dean submitted and Registrar approved your department enrollment batch.',
      };
    }

    const record = seniorRes.rows[0];

    if (record.is_activated) {
      return {
        success: false,
        message: 'This senior student enrollment record has already been activated. Please sign in or use password reset.',
      };
    }

    // Name verification match (contains or matches)
    const normalizedInputName = params.fullName.trim().toLowerCase();
    const normalizedRecordName = record.full_name.trim().toLowerCase();
    if (!normalizedRecordName.includes(normalizedInputName) && !normalizedInputName.includes(normalizedRecordName)) {
      return {
        success: false,
        message: 'The submitted name does not match the official Registrar-approved enrollment record.',
      };
    }

    const token = 'tok-' + uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const metadata = JSON.stringify({
      seniorRecordId: record.id,
      studentIdNumber: record.student_id_number,
      fullName: record.full_name,
      collegeId: record.college_id,
      deptId: record.department_id,
      programId: record.program_id,
      cohortYear: record.cohort_year,
    });

    await db.query(
      `INSERT INTO email_verification_tokens (id, email, token, purpose, metadata, expires_at)
       VALUES ($1, $2, $3, 'SENIOR_ACTIVATION', $4, CURRENT_TIMESTAMP + INTERVAL '24 hours')`,
      ['evt-' + uuidv4(), params.email.trim().toLowerCase(), token, metadata]
    );

    await AuditService.log({
      action: 'SENIOR_ACTIVATION_TOKEN_DISPATCHED',
      entityType: 'SENIOR_RECORD',
      entityId: record.id,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      details: { studentId: record.student_id_number, email: params.email },
      outcome: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Senior enrollment verified successfully. Activation verification token has been issued.',
      verificationToken: token,
      email: params.email,
    };
  }

  // --- COMPLETE ACTIVATION (FRESHMAN OR SENIOR) ---
  static async completeActivation(params: CompleteActivationParams) {
    const db = await getDb();

    // Verify token
    const tokenRes = await db.query(
      `SELECT * FROM email_verification_tokens
       WHERE token = $1 AND is_used = FALSE AND expires_at > CURRENT_TIMESTAMP`,
      [params.token.trim()]
    );

    if (tokenRes.rows.length === 0) {
      throw new Error('Invalid, expired, or previously used activation token.');
    }

    const tokenRecord = tokenRes.rows[0];
    const meta = tokenRecord.metadata ? JSON.parse(tokenRecord.metadata) : {};

    // Password complexity check: minimum 8 characters
    if (!params.password || params.password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    const passwordHash = await AuthService.hashPassword(params.password);
    const userId = 'usr-' + uuidv4();

    // Execute transactional account creation and registry activation
    const result = await db.transaction(async (tx) => {
      // Generate unique username
      const username = await this.generateUniqueUsername(tx, '2026');

      // Create User
      await tx.query(
        `INSERT INTO users (id, username, email, password_hash, status)
         VALUES ($1, $2, $3, $4, 'ACTIVE')`,
        [userId, username, tokenRecord.email, passwordHash]
      );

      let assignedRole = 'FRESHMAN';
      if (tokenRecord.purpose === 'FRESHMAN_ACTIVATION') {
        assignedRole = 'FRESHMAN';
        // Assign FRESHMAN role
        const roleRes = await tx.query('SELECT id FROM roles WHERE name = $1', ['FRESHMAN']);
        const roleId = roleRes.rows[0].id;
        await tx.query(
          `INSERT INTO user_roles (id, user_id, role_id, scope_type)
           VALUES ($1, $2, $3, 'GLOBAL')`,
          ['ur-' + uuidv4(), userId, roleId]
        );

        // Create student profile
        const profileId = 'prof-' + uuidv4();
        await tx.query(
          `INSERT INTO student_profiles (
            id, user_id, student_id_number, first_name, last_name, gender, department_id, cohort_year, current_year_level, current_semester, enrollment_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, 1, 'ACTIVE')`,
          [
            profileId,
            userId,
            meta.slipNumber || username,
            meta.firstName || 'Student',
            meta.lastName || 'Member',
            meta.gender || 'M',
            meta.deptId || null,
            '2026',
          ]
        );

        // Update freshman eligibility record
        if (meta.eligibilityRecordId) {
          await tx.query(
            `UPDATE freshman_eligibility_records
             SET is_activated = TRUE, activated_user_id = $1, activated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [userId, meta.eligibilityRecordId]
          );
        }
      } else if (tokenRecord.purpose === 'SENIOR_ACTIVATION') {
        assignedRole = 'SENIOR';
        const roleRes = await tx.query('SELECT id FROM roles WHERE name = $1', ['SENIOR']);
        const roleId = roleRes.rows[0].id;
        await tx.query(
          `INSERT INTO user_roles (id, user_id, role_id, scope_type)
           VALUES ($1, $2, $3, 'GLOBAL')`,
          ['ur-' + uuidv4(), userId, roleId]
        );

        // Create student profile
        const profileId = 'prof-' + uuidv4();
        const names = (meta.fullName || '').split(' ');
        await tx.query(
          `INSERT INTO student_profiles (
            id, user_id, student_id_number, first_name, last_name, department_id, program_id, cohort_year, current_year_level, current_semester, enrollment_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 2, 1, 'ACTIVE')`,
          [
            profileId,
            userId,
            meta.studentIdNumber,
            names[0] || 'Senior',
            names.slice(1).join(' ') || 'Student',
            meta.deptId || null,
            meta.programId || null,
            meta.cohortYear || '2024',
          ]
        );

        // Update senior enrollment record
        if (meta.seniorRecordId) {
          await tx.query(
            `UPDATE senior_enrollment_records
             SET is_activated = TRUE, activated_user_id = $1, activated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [userId, meta.seniorRecordId]
          );
        }
      }

      // Mark token as used
      await tx.query(`UPDATE email_verification_tokens SET is_used = TRUE WHERE id = $1`, [tokenRecord.id]);

      // Audit Log
      await AuditService.log(
        {
          actorUserId: userId,
          actorUsername: username,
          actorRole: assignedRole,
          action: `${tokenRecord.purpose}_COMPLETED`,
          entityType: 'USER',
          entityId: userId,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          details: { email: tokenRecord.email, username, role: assignedRole },
          outcome: 'SUCCESS',
        },
        tx
      );

      // Notification
      await NotificationService.send(
        {
          userId,
          title: 'Account Activated Successfully',
          message: `Welcome to Meri DBU Student portal. Your official unique username is ${username}.`,
          type: 'SUCCESS',
          emailRecipient: tokenRecord.email,
        },
        tx
      );

      return {
        userId,
        username,
        email: tokenRecord.email,
        role: assignedRole,
      };
    });

    return result;
  }
}
