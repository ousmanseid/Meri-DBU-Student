import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/db.js';
import { env } from '../config/env.js';
import { AuditService } from './audit.service.js';

export interface UserSessionData {
  userId: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  scopes: { role: string; scopeType: string; scopeId: string | null }[];
  sessionToken: string;
}

export class AuthService {
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static async authenticateUser(
    identifier: string, // username or email
    password: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<UserSessionData> {
    const db = await getDb();

    // Query user by username or email
    const userRes = await db.query(
      `SELECT * FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)`,
      [identifier.trim()]
    );

    if (userRes.rows.length === 0) {
      await AuditService.log({
        actorUsername: identifier,
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'USER',
        entityId: 'UNKNOWN',
        ipAddress,
        userAgent,
        details: { reason: 'User not found' },
        outcome: 'FAILURE',
      });
      // Generic message to prevent username enumeration
      throw new Error('Invalid credentials provided.');
    }

    const user = userRes.rows[0];

    // Check account lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await AuditService.log({
        actorUserId: user.id,
        actorUsername: user.username,
        action: 'AUTH_ACCOUNT_LOCKED_ATTEMPT',
        entityType: 'USER',
        entityId: user.id,
        ipAddress,
        userAgent,
        outcome: 'BLOCKED',
      });
      throw new Error('Account is temporarily locked due to excessive failed attempts. Please try again later.');
    }

    if (user.status === 'SUSPENDED') {
      throw new Error('Account is suspended. Please contact the University Registrar.');
    }

    if (user.status === 'PENDING_ACTIVATION') {
      throw new Error('Account has not been activated yet. Please complete online student activation.');
    }

    if (!user.password_hash) {
      throw new Error('Account password is not set. Please complete student activation.');
    }

    // Verify password
    const isPasswordValid = await this.verifyPassword(password, user.password_hash);

    if (!isPasswordValid) {
      const failedAttempts = (user.failed_login_attempts || 0) + 1;
      let lockoutSql = '';
      const params: any[] = [failedAttempts, user.id];

      if (failedAttempts >= env.MAX_LOGIN_ATTEMPTS) {
        lockoutSql = `, locked_until = CURRENT_TIMESTAMP + INTERVAL '${env.LOCKOUT_DURATION_MINUTES} minutes'`;
      }

      await db.query(
        `UPDATE users SET failed_login_attempts = $1 ${lockoutSql} WHERE id = $2`,
        params
      );

      await AuditService.log({
        actorUserId: user.id,
        actorUsername: user.username,
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'USER',
        entityId: user.id,
        ipAddress,
        userAgent,
        details: { failedAttempts },
        outcome: 'FAILURE',
      });

      throw new Error('Invalid credentials provided.');
    }

    // Reset failed attempts upon successful authentication
    await db.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [user.id]
    );

    // Fetch user roles & scopes
    const rolesRes = await db.query(
      `SELECT r.name as role_name, ur.scope_type, ur.scope_id
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [user.id]
    );

    const roles = Array.from(new Set(rolesRes.rows.map((r: any) => r.role_name)));
    const scopes = rolesRes.rows.map((r: any) => ({
      role: r.role_name,
      scopeType: r.scope_type,
      scopeId: r.scope_id,
    }));

    // Fetch permissions
    const permRes = await db.query(
      `SELECT DISTINCT p.code
       FROM user_roles ur
       JOIN role_permissions rp ON ur.role_id = rp.role_id
       JOIN permissions p ON rp.permission_id = p.id
       WHERE ur.user_id = $1`,
      [user.id]
    );

    const permissions = permRes.rows.map((p: any) => p.code);

    // Create session token
    const sessionToken = 'ses-' + uuidv4();

    await db.query(
      `INSERT INTO sessions (id, user_id, session_token, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP + INTERVAL '${env.SESSION_TIMEOUT_MINUTES} minutes')`,
      ['sess-' + uuidv4(), user.id, sessionToken, ipAddress || null, userAgent || null]
    );

    await AuditService.log({
      actorUserId: user.id,
      actorUsername: user.username,
      actorRole: roles[0] || 'USER',
      action: 'AUTH_LOGIN_SUCCESS',
      entityType: 'USER',
      entityId: user.id,
      ipAddress,
      userAgent,
      outcome: 'SUCCESS',
    });

    return {
      userId: user.id,
      username: user.username,
      email: user.email,
      roles,
      permissions,
      scopes,
      sessionToken,
    };
  }

  static async getSession(sessionToken: string): Promise<UserSessionData | null> {
    const db = await getDb();
    const sessionRes = await db.query(
      `SELECT s.*, u.username, u.email, u.status
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.session_token = $1 AND s.is_revoked = FALSE AND s.expires_at > CURRENT_TIMESTAMP`,
      [sessionToken]
    );

    if (sessionRes.rows.length === 0) {
      return null;
    }

    const s = sessionRes.rows[0];

    const rolesRes = await db.query(
      `SELECT r.name as role_name, ur.scope_type, ur.scope_id
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [s.user_id]
    );

    const roles = Array.from(new Set(rolesRes.rows.map((r: any) => r.role_name)));
    const scopes = rolesRes.rows.map((r: any) => ({
      role: r.role_name,
      scopeType: r.scope_type,
      scopeId: r.scope_id,
    }));

    const permRes = await db.query(
      `SELECT DISTINCT p.code
       FROM user_roles ur
       JOIN role_permissions rp ON ur.role_id = rp.role_id
       JOIN permissions p ON rp.permission_id = p.id
       WHERE ur.user_id = $1`,
      [s.user_id]
    );

    return {
      userId: s.user_id,
      username: s.username,
      email: s.email,
      roles,
      permissions: permRes.rows.map((p: any) => p.code),
      scopes,
      sessionToken,
    };
  }

  static async revokeSession(sessionToken: string): Promise<void> {
    const db = await getDb();
    await db.query(
      `UPDATE sessions SET is_revoked = TRUE WHERE session_token = $1`,
      [sessionToken]
    );
  }
}
