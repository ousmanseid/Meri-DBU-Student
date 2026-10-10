import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/db.js';
import {
  AuthenticatedRequest,
  authenticateToken,
  requireAuth,
  requireRoles,
  requireScope,
} from '../middleware/auth.middleware.js';
import { rateLimiter } from '../middleware/error.middleware.js';
import { AuthService } from '../services/auth.service.js';
import { ActivationService } from '../services/activation.service.js';
import { BatchImportService } from '../services/batch-import.service.js';
import { RegistrarService } from '../services/registrar.service.js';
import { WorkflowService } from '../services/workflow.service.js';
import { StudentService } from '../services/student.service.js';
import { AnnouncementService } from '../services/announcement.service.js';
import { DocumentService } from '../services/document.service.js';
import { NotificationService } from '../services/notification.service.js';
import { AdmissionsService } from '../services/admissions.service.js';
import { RagService } from '../services/rag.service.js';
import { AuditService } from '../services/audit.service.js';

export const apiRouter = Router();

// Apply token extraction to all API routes
apiRouter.use(authenticateToken);

// ------------------------------------------------------------------------------
// HEALTH & READINESS (Section 12 & 19)
// ------------------------------------------------------------------------------
apiRouter.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    institution: 'Debre Berhan University',
    platform: 'Meri DBU Student',
    timestamp: new Date().toISOString(),
  });
});

apiRouter.get('/ready', async (req, res) => {
  try {
    const db = await getDb();
    await db.query('SELECT 1');
    res.json({ status: 'READY', database: 'CONNECTED', timestamp: new Date().toISOString() });
  } catch (err: any) {
    res.status(503).json({ status: 'NOT_READY', error: err.message });
  }
});

// ------------------------------------------------------------------------------
// SYSTEM REFERENCE DATA (Public)
// ------------------------------------------------------------------------------
apiRouter.get('/system/references', async (req, res, next) => {
  try {
    const db = await getDb();
    const colleges = (await db.query('SELECT * FROM organizational_units ORDER BY name ASC')).rows;
    const departments = (await db.query('SELECT * FROM departments ORDER BY name ASC')).rows;
    const programs = (await db.query('SELECT * FROM academic_programs ORDER BY name ASC')).rows;
    const academicYears = (await db.query('SELECT * FROM academic_years ORDER BY year_label DESC')).rows;
    const semesters = (await db.query('SELECT * FROM semesters ORDER BY semester_number ASC')).rows;

    res.json({
      success: true,
      colleges,
      departments,
      programs,
      academicYears,
      semesters,
    });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------------------
// AUTHENTICATION (Section 8)
// ------------------------------------------------------------------------------
const loginSchema = z.object({
  identifier: z.string().min(1, 'Username or email required'),
  password: z.string().min(1, 'Password required'),
});

apiRouter.post('/auth/login', rateLimiter(15, 60000), async (req, res, next) => {
  try {
    const { identifier, password } = loginSchema.parse(req.body);
    const session = await AuthService.authenticateUser(
      identifier,
      password,
      req.ip,
      req.headers['user-agent']
    );
    res.json({ success: true, ...session });
  } catch (err: any) {
    if (
      err.message?.includes('Invalid credentials') ||
      err.message?.includes('Account is') ||
      err.message?.includes('Account has not been activated')
    ) {
      err.status = 401;
    }
    next(err);
  }
});

apiRouter.post('/auth/logout', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (req.user?.sessionToken) {
      await AuthService.revokeSession(req.user.sessionToken);
    }
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
});

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ success: true, user: req.user });
});

const forgotPasswordSchema = z.object({
  identifier: z.string().min(1, 'Username or email required'),
});

apiRouter.post('/auth/forgot-password', rateLimiter(10, 60000), async (req, res, next) => {
  try {
    const { identifier } = forgotPasswordSchema.parse(req.body);
    const result = await AuthService.requestPasswordReset(identifier, req.ip, req.headers['user-agent']);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const resetPasswordSchema = z.object({
  token: z.string().min(5, 'Valid token required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

apiRouter.post('/auth/reset-password', rateLimiter(10, 60000), async (req, res, next) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);
    const result = await AuthService.resetPassword(token, password, req.ip, req.headers['user-agent']);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------------------
// ACCOUNT ACTIVATION (Sections 5 & 8)
// ------------------------------------------------------------------------------
const freshmanVerifySchema = z.object({
  admissionSlipNumber: z.string().min(3),
  entranceExamId: z.string().min(3),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
});

apiRouter.post('/activation/freshman/verify', rateLimiter(10, 60000), async (req, res, next) => {
  try {
    const data = freshmanVerifySchema.parse(req.body);
    const result = await ActivationService.initiateFreshmanActivation({
      ...data,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const seniorVerifySchema = z.object({
  studentIdNumber: z.string().min(4),
  fullName: z.string().min(3),
  email: z.string().email(),
});

apiRouter.post('/activation/senior/verify', rateLimiter(10, 60000), async (req, res, next) => {
  try {
    const data = seniorVerifySchema.parse(req.body);
    const result = await ActivationService.initiateSeniorActivation({
      ...data,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const completeActivationSchema = z.object({
  token: z.string().min(5),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

apiRouter.post('/activation/complete', rateLimiter(10, 60000), async (req, res, next) => {
  try {
    const data = completeActivationSchema.parse(req.body);
    const result = await ActivationService.completeActivation({
      ...data,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------------------
// SENIOR STUDENT IMPORT (Dean Scope - Section 6)
// ------------------------------------------------------------------------------
apiRouter.get('/imports/template', (req, res) => {
  const csv = BatchImportService.getTemplateCsv();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="dbu_senior_import_template.csv"');
  res.send(csv);
});

const previewImportSchema = z.object({
  collegeId: z.string().min(1),
  academicYearId: z.string().min(1),
  semesterId: z.string().min(1),
  csvContent: z.string().min(10, 'CSV content is required'),
  fileName: z.string().default('senior_enrollment.csv'),
});

apiRouter.post(
  '/imports/preview',
  requireAuth,
  requireRoles('DEAN', 'SYSTEM_ADMIN'),
  requireScope('COLLEGE'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = previewImportSchema.parse(req.body);
      const preview = await BatchImportService.parseAndPreviewCsv(
        data.csvContent,
        req.user!.userId,
        data.collegeId,
        data.academicYearId,
        data.semesterId,
        data.fileName,
        Buffer.byteLength(data.csvContent, 'utf-8')
      );
      res.json({ success: true, ...preview });
    } catch (err) {
      next(err);
    }
  }
);

apiRouter.post(
  '/imports/:id/submit',
  requireAuth,
  requireRoles('DEAN', 'SYSTEM_ADMIN'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await BatchImportService.submitBatchForReview(req.params.id as string, req.user!.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

apiRouter.get(
  '/imports/my-batches',
  requireAuth,
  requireRoles('DEAN', 'SYSTEM_ADMIN'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const collegeScope = req.user!.scopes.find((s) => s.scopeType === 'COLLEGE')?.scopeId || undefined;
      const batches = await BatchImportService.getDeanBatches(collegeScope);
      res.json({ success: true, batches });
    } catch (err) {
      next(err);
    }
  }
);

// ------------------------------------------------------------------------------
// REGISTRAR REVIEW & APPROVAL (Section 6D, 6E)
// ------------------------------------------------------------------------------
apiRouter.get(
  '/registrar/batches',
  requireAuth,
  requireRoles('REGISTRAR', 'SYSTEM_ADMIN', 'AUDITOR'),
  async (req, res, next) => {
    try {
      const statusFilter = req.query.status as string | undefined;
      const batches = await RegistrarService.getBatchesForReview(statusFilter);
      res.json({ success: true, batches });
    } catch (err) {
      next(err);
    }
  }
);

apiRouter.get(
  '/registrar/batches/:id',
  requireAuth,
  requireRoles('REGISTRAR', 'DEAN', 'SYSTEM_ADMIN', 'AUDITOR'),
  async (req, res, next) => {
    try {
      const details = await RegistrarService.getBatchDetails(req.params.id as string);
      res.json({ success: true, ...details });
    } catch (err) {
      next(err);
    }
  }
);

const registrarDecisionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'RETURN_FOR_CORRECTION']),
  comments: z.string().default(''),
});

apiRouter.post(
  '/registrar/batches/:id/decision',
  requireAuth,
  requireRoles('REGISTRAR', 'SYSTEM_ADMIN'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = registrarDecisionSchema.parse(req.body);
      const result = await RegistrarService.processBatchDecision({
        batchId: req.params.id as string,
        reviewerUserId: req.user!.userId,
        action: data.action,
        comments: data.comments,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

apiRouter.get(
  '/registrar/registry',
  requireAuth,
  requireRoles('REGISTRAR', 'DEAN', 'ADMISSIONS', 'SYSTEM_ADMIN', 'AUDITOR'),
  async (req, res, next) => {
    try {
      const search = req.query.search as string | undefined;
      const collegeId = req.query.collegeId as string | undefined;
      const records = await RegistrarService.getApprovedRegistry({ search, collegeId });
      res.json({ success: true, records });
    } catch (err) {
      next(err);
    }
  }
);

// ------------------------------------------------------------------------------
// UNIVERSITY APPROVAL WORKFLOW ENGINE (Section 7)
// ------------------------------------------------------------------------------
apiRouter.get('/workflows', requireAuth, async (req, res, next) => {
  try {
    const workflows = await WorkflowService.getWorkflows();
    res.json({ success: true, workflows });
  } catch (err) {
    next(err);
  }
});

apiRouter.get('/workflows/instances', requireAuth, async (req, res, next) => {
  try {
    const instances = await WorkflowService.getInstances({
      workflowCode: req.query.workflowCode as string | undefined,
      status: req.query.status as string | undefined,
    });
    res.json({ success: true, instances });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------------------
// STUDENT PORTAL & SERVICES (Section 9)
// ------------------------------------------------------------------------------
apiRouter.get('/student/profile', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const profile = await StudentService.getStudentProfile(req.user!.userId);
    res.json({ success: true, profile });
  } catch (err) {
    next(err);
  }
});

const serviceReqSchema = z.object({
  serviceType: z.string().min(2),
  subject: z.string().min(3),
  description: z.string().min(5),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
});

apiRouter.post('/student/requests', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = serviceReqSchema.parse(req.body);
    const result = await StudentService.createServiceRequest({
      ...data,
      studentUserId: req.user!.userId,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

apiRouter.get('/student/requests', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const requests = await StudentService.getStudentServiceRequests(req.user!.userId);
    res.json({ success: true, requests });
  } catch (err) {
    next(err);
  }
});

const correctionReqSchema = z.object({
  fieldName: z.string().min(2),
  oldValue: z.string().min(1),
  requestedValue: z.string().min(1),
  reason: z.string().min(5),
});

apiRouter.post('/student/corrections', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = correctionReqSchema.parse(req.body);
    const result = await StudentService.createCorrectionRequest({
      ...data,
      studentUserId: req.user!.userId,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

apiRouter.get('/student/corrections', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const isStaff = req.user!.roles.some((r) => ['REGISTRAR', 'DEAN', 'SYSTEM_ADMIN'].includes(r));
    const requests = await StudentService.getCorrectionRequests(isStaff ? undefined : req.user!.userId);
    res.json({ success: true, requests });
  } catch (err) {
    next(err);
  }
});

// Staff handling student service tickets
apiRouter.get(
  '/staff/requests',
  requireAuth,
  requireRoles('STUDENT_AFFAIRS', 'SYSTEM_ADMIN', 'DEPT_HEAD'),
  async (req, res, next) => {
    try {
      const requests = await StudentService.getAllServiceRequests();
      res.json({ success: true, requests });
    } catch (err) {
      next(err);
    }
  }
);

apiRouter.patch(
  '/staff/requests/:id',
  requireAuth,
  requireRoles('STUDENT_AFFAIRS', 'SYSTEM_ADMIN'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { status, resolutionNotes } = req.body;
      await StudentService.updateServiceRequestStatus(req.params.id as string, req.user!.userId, status, resolutionNotes);
      res.json({ success: true, message: 'Request status updated' });
    } catch (err) {
      next(err);
    }
  }
);

// ------------------------------------------------------------------------------
// ANNOUNCEMENTS & DOCUMENTS (Sections 9 & 14)
// ------------------------------------------------------------------------------
apiRouter.get('/announcements', async (req: AuthenticatedRequest, res, next) => {
  try {
    const role = req.user?.roles[0] || 'PUBLIC_VISITOR';
    const announcements = await AnnouncementService.getAnnouncements(role);
    res.json({ success: true, announcements });
  } catch (err) {
    next(err);
  }
});

apiRouter.post(
  '/announcements',
  requireAuth,
  requireRoles('SYSTEM_ADMIN', 'REGISTRAR', 'DEAN', 'ADMISSIONS'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { title, content, audienceScope, collegeId, departmentId } = req.body;
      const result = await AnnouncementService.createAnnouncement({
        title,
        content,
        authorUserId: req.user!.userId,
        audienceScope,
        collegeId,
        departmentId,
      });
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

// ------------------------------------------------------------------------------
// DOCUMENT REPOSITORY & SECURE DOWNLOADS (Sections 10, 13 & 14)
// ------------------------------------------------------------------------------
apiRouter.get('/documents', async (req: AuthenticatedRequest, res, next) => {
  try {
    const roles = req.user?.roles || [];
    const category = req.query.category as string | undefined;
    const search = req.query.search as string | undefined;
    const docs = await DocumentService.listDocuments(roles, category, search);
    res.json({ success: true, documents: docs });
  } catch (err) {
    next(err);
  }
});

apiRouter.get('/documents/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const roles = req.user?.roles || [];
    const doc = await DocumentService.getDocumentById(req.params.id as string, roles);
    res.json({ success: true, document: doc });
  } catch (err) {
    next(err);
  }
});

const createDocSchema = z.object({
  title: z.string().min(2, 'Title required'),
  category: z.string().min(2, 'Category required'),
  accessScope: z.enum(['PUBLIC', 'STUDENT_ONLY', 'STAFF_ONLY', 'REGISTRAR_ONLY']),
  content: z.string().optional(),
  versionLabel: z.string().default('1.0'),
  effectiveDate: z.string().optional(),
  departmentId: z.string().optional(),
  indexInRag: z.boolean().default(false),
});

apiRouter.post(
  '/documents',
  requireAuth,
  requireRoles('SYSTEM_ADMIN', 'REGISTRAR', 'AI_KNOWLEDGE_ADMIN', 'DEAN'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = createDocSchema.parse(req.body);
      const doc = await DocumentService.createDocument(
        data,
        {
          userId: req.user!.userId,
          username: req.user!.username,
          roles: req.user!.roles,
        },
        req.ip,
        req.headers['user-agent'] as string | undefined
      );
      res.json({ success: true, document: doc });
    } catch (err) {
      next(err);
    }
  }
);

apiRouter.get('/documents/:id/download', async (req: AuthenticatedRequest, res, next) => {
  try {
    const roles = req.user?.roles || [];
    const download = await DocumentService.getDocumentDownload(
      req.params.id as string,
      roles,
      req.user ? { userId: req.user.userId, username: req.user.username } : undefined,
      req.ip,
      req.headers['user-agent'] as string | undefined
    );

    res.setHeader('Content-Type', download.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${download.filename}"`);
    res.send(download.fileContent);
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------------------
// NOTIFICATION CENTER (Section 15)
// ------------------------------------------------------------------------------
apiRouter.get('/notifications', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const notifications = await NotificationService.getUserNotifications(userId);
    const unreadCount = await NotificationService.getUnreadCount(userId);
    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    next(err);
  }
});

apiRouter.patch('/notifications/:id/read', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    await NotificationService.markAsRead(req.params.id as string, userId);
    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err) {
    next(err);
  }
});

apiRouter.post('/notifications/mark-all-read', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    await NotificationService.markAllAsRead(userId);
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------------------
// ADMISSIONS OFFICE (Section 7)
// ------------------------------------------------------------------------------
apiRouter.get(
  '/admissions/records',
  requireAuth,
  requireRoles('ADMISSIONS', 'SYSTEM_ADMIN', 'REGISTRAR'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const records = await AdmissionsService.listFreshmanRecords({
        search: req.query.search as string | undefined,
        collegeId: req.query.collegeId as string | undefined,
        isActivated: req.query.isActivated !== undefined ? req.query.isActivated === 'true' : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 100,
      });
      res.json({ success: true, records });
    } catch (err) {
      next(err);
    }
  }
);

const createFreshmanSchema = z.object({
  admissionSlipNumber: z.string().min(3),
  entranceExamId: z.string().min(3),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  gender: z.enum(['M', 'F', 'O']),
  collegeId: z.string().min(2),
  departmentId: z.string().min(2),
  academicYearId: z.string().optional(),
});

apiRouter.post(
  '/admissions/records',
  requireAuth,
  requireRoles('ADMISSIONS', 'SYSTEM_ADMIN'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = createFreshmanSchema.parse(req.body);
      const record = await AdmissionsService.createFreshmanRecord(
        data,
        { userId: req.user!.userId, username: req.user!.username },
        req.ip,
        req.headers['user-agent'] as string | undefined
      );
      res.json({ success: true, record });
    } catch (err) {
      next(err);
    }
  }
);

apiRouter.post(
  '/admissions/import',
  requireAuth,
  requireRoles('ADMISSIONS', 'SYSTEM_ADMIN'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { csvContent } = z.object({ csvContent: z.string().min(10) }).parse(req.body);
      const summary = await AdmissionsService.importFreshmanCsv(
        csvContent,
        { userId: req.user!.userId, username: req.user!.username },
        req.ip,
        req.headers['user-agent'] as string | undefined
      );
      res.json({ success: true, summary });
    } catch (err) {
      next(err);
    }
  }
);

apiRouter.delete(
  '/admissions/records/:id',
  requireAuth,
  requireRoles('ADMISSIONS', 'SYSTEM_ADMIN'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await AdmissionsService.deleteFreshmanRecord(
        req.params.id as string,
        { userId: req.user!.userId, username: req.user!.username },
        req.ip,
        req.headers['user-agent'] as string | undefined
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ------------------------------------------------------------------------------
// EVIDENCE-GROUNDED AI ASSISTANT (RAG) (Section 10)
// ------------------------------------------------------------------------------
const aiQuerySchema = z.object({
  query: z.string().min(2, 'Query must be at least 2 characters'),
});

apiRouter.post('/ai/query', rateLimiter(20, 60000), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { query } = aiQuerySchema.parse(req.body);
    const userRole = req.user?.roles[0] || 'PUBLIC_VISITOR';
    const userId = req.user?.userId;

    const answer = await RagService.queryAssistant(query, userRole, userId);
    res.json({ success: true, ...answer });
  } catch (err) {
    next(err);
  }
});

// Document Ingestion for RAG
const ingestSchema = z.object({
  documentId: z.string().optional(),
  title: z.string().min(2),
  versionLabel: z.string().default('1.0'),
  accessScope: z.enum(['PUBLIC', 'STUDENT_ONLY', 'STAFF_ONLY', 'REGISTRAR_ONLY']),
  rawText: z.string().min(10),
  sectionTitle: z.string().default('General Section'),
  category: z.string().default('STUDENT_HANDBOOK'),
});

apiRouter.post(
  '/ai/ingest',
  requireAuth,
  requireRoles('AI_KNOWLEDGE_ADMIN', 'SYSTEM_ADMIN'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = ingestSchema.parse(req.body);
      const db = await getDb();
      const docId = data.documentId || 'doc-' + uuidv4();

      // Ensure document row exists
      await db.query(
        `INSERT INTO documents (
          id, title, category, file_path, file_size, mime_type, access_scope, uploaded_by_user_id, version_label
        ) VALUES ($1, $2, $3, $4, $5, 'text/plain', $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, access_scope = EXCLUDED.access_scope`,
        [
          docId,
          data.title,
          data.category,
          'internal/indexed',
          Buffer.byteLength(data.rawText, 'utf-8'),
          data.accessScope,
          req.user!.userId,
          data.versionLabel,
        ]
      );

      const result = await RagService.ingestDocument({
        documentId: docId,
        title: data.title,
        versionLabel: data.versionLabel,
        accessScope: data.accessScope,
        rawText: data.rawText,
        sectionTitle: data.sectionTitle,
      });

      res.json({ success: true, message: 'Document successfully ingested and indexed.', ...result });
    } catch (err) {
      next(err);
    }
  }
);

// ------------------------------------------------------------------------------
// AUDIT LOGS (Section 17)
// ------------------------------------------------------------------------------
apiRouter.get(
  '/audit/logs',
  requireAuth,
  requireRoles('AUDITOR', 'SYSTEM_ADMIN'),
  async (req, res, next) => {
    try {
      const logs = await AuditService.getLogs({
        action: req.query.action as string | undefined,
        limit: Number(req.query.limit) || 50,
      });
      res.json({ success: true, logs });
    } catch (err) {
      next(err);
    }
  }
);
