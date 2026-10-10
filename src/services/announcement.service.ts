import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/db.js';
import { AuditService } from './audit.service.js';

export interface CreateAnnouncementParams {
  title: string;
  content: string;
  authorUserId: string;
  audienceScope?: 'PUBLIC' | 'ALL_STUDENTS' | 'FRESHMEN' | 'SENIORS' | 'STAFF_ONLY';
  collegeId?: string;
  departmentId?: string;
}

export class AnnouncementService {
  static async getAnnouncements(role: string = 'PUBLIC_VISITOR') {
    const db = await getDb();
    let scopes: string[] = ['PUBLIC'];

    if (role === 'FRESHMAN') {
      scopes = ['PUBLIC', 'ALL_STUDENTS', 'FRESHMEN'];
    } else if (role === 'SENIOR') {
      scopes = ['PUBLIC', 'ALL_STUDENTS', 'SENIORS'];
    } else if (['DEAN', 'REGISTRAR', 'ADMISSIONS', 'DEPT_HEAD', 'ADVISOR', 'INSTRUCTOR', 'STUDENT_AFFAIRS', 'SYSTEM_ADMIN'].includes(role)) {
      scopes = ['PUBLIC', 'ALL_STUDENTS', 'FRESHMEN', 'SENIORS', 'STAFF_ONLY'];
    }

    const placeholders = scopes.map((_, i) => `$${i + 1}`).join(', ');
    const res = await db.query(
      `SELECT a.*, u.username as author_name
       FROM announcements a
       JOIN users u ON a.author_user_id = u.id
       WHERE a.is_published = TRUE AND a.audience_scope IN (${placeholders})
       ORDER BY a.published_at DESC LIMIT 50`,
      scopes
    );
    return res.rows;
  }

  static async createAnnouncement(params: CreateAnnouncementParams) {
    const db = await getDb();
    const id = 'ann-' + uuidv4();

    await db.query(
      `INSERT INTO announcements (
        id, title, content, author_user_id, audience_scope, college_id, department_id, is_published, published_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP)`,
      [
        id,
        params.title,
        params.content,
        params.authorUserId,
        params.audienceScope || 'PUBLIC',
        params.collegeId || null,
        params.departmentId || null,
      ]
    );

    await AuditService.log({
      actorUserId: params.authorUserId,
      action: 'ANNOUNCEMENT_PUBLISHED',
      entityType: 'ANNOUNCEMENT',
      entityId: id,
      details: { title: params.title, scope: params.audienceScope },
      outcome: 'SUCCESS',
    });

    return { id };
  }
}
