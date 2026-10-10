import bcrypt from 'bcryptjs';
import { getDb } from './db.js';

export async function runSeed() {
  const db = await getDb();
  console.log('[Seed] Seeding initial DBU system roles, permissions, reference data, and administrative staff...');

  // 1. Roles
  const roles = [
    { id: 'role-visitor', name: 'PUBLIC_VISITOR', display: 'Public Visitor', desc: 'Prospective student or external public visitor' },
    { id: 'role-freshman', name: 'FRESHMAN', display: 'Freshman Student', desc: 'Newly admitted student with freshman permissions' },
    { id: 'role-senior', name: 'SENIOR', display: 'Senior / Enrolled Student', desc: 'Currently enrolled DBU student' },
    { id: 'role-dean', name: 'DEAN', display: 'College / Faculty Dean', desc: 'Authorized academic leader of a college' },
    { id: 'role-registrar', name: 'REGISTRAR', display: 'University Registrar', desc: 'Official student registry and record authority' },
    { id: 'role-admissions', name: 'ADMISSIONS', display: 'Admissions Officer', desc: 'Admissions and freshman eligibility manager' },
    { id: 'role-dept-head', name: 'DEPT_HEAD', display: 'Department Head', desc: 'Head of academic department' },
    { id: 'role-advisor', name: 'ADVISOR', display: 'Academic Advisor', desc: 'Assigned academic counselor' },
    { id: 'role-instructor', name: 'INSTRUCTOR', display: 'Course Instructor', desc: 'Academic faculty lecturer' },
    { id: 'role-affairs', name: 'STUDENT_AFFAIRS', display: 'Student Affairs Officer', desc: 'Dormitory, meal, clearance, and student support services' },
    { id: 'role-secretary', name: 'SECRETARY', display: 'Faculty / Dept Secretary', desc: 'Administrative clerical support' },
    { id: 'role-admin', name: 'SYSTEM_ADMIN', display: 'System Administrator', desc: 'IT operational platform manager' },
    { id: 'role-ai-admin', name: 'AI_KNOWLEDGE_ADMIN', display: 'AI Knowledge Administrator', desc: 'Document manager and RAG indexing administrator' },
    { id: 'role-auditor', name: 'AUDITOR', display: 'Compliance Auditor', desc: 'Read-only audit trail and compliance reviewer' },
  ];

  for (const r of roles) {
    await db.query(
      `INSERT INTO roles (id, name, display_name, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description;`,
      [r.id, r.name, r.display, r.desc]
    );
  }

  // 2. Permissions
  const permissions = [
    { id: 'p-pub-view', code: 'public:view', module: 'public', desc: 'View public website and announcements' },
    { id: 'p-act-freshman', code: 'activation:freshman', module: 'activation', desc: 'Activate freshman account' },
    { id: 'p-act-senior', code: 'activation:senior', module: 'activation', desc: 'Activate senior account' },
    { id: 'p-stu-portal', code: 'student:portal:view', module: 'student', desc: 'Access student portal and dashboard' },
    { id: 'p-stu-req-create', code: 'student:request:create', module: 'student', desc: 'Submit service inquiries and requests' },
    { id: 'p-stu-corr-create', code: 'student:correction:create', module: 'student', desc: 'Submit official data correction request' },
    { id: 'p-dean-import', code: 'dean:import:manage', module: 'batch_import', desc: 'Upload, preview, and submit senior batches' },
    { id: 'p-reg-review', code: 'registrar:batch:review', module: 'registrar', desc: 'Review, approve, or reject senior batches' },
    { id: 'p-reg-records', code: 'registrar:records:manage', module: 'registrar', desc: 'Manage official enrollment registry' },
    { id: 'p-adm-manage', code: 'admissions:freshman:manage', module: 'admissions', desc: 'Manage freshman eligibility lists' },
    { id: 'p-affairs-proc', code: 'affairs:service:process', module: 'student_affairs', desc: 'Process student service tickets' },
    { id: 'p-admin-manage', code: 'admin:system:manage', module: 'admin', desc: 'Configure system settings, users, and roles' },
    { id: 'p-ai-manage', code: 'ai:knowledge:manage', module: 'ai_rag', desc: 'Upload and index approved documents for RAG' },
    { id: 'p-ai-query', code: 'ai:assistant:query', module: 'ai_rag', desc: 'Chat with AI assistant' },
    { id: 'p-audit-view', code: 'audit:trail:view', module: 'audit', desc: 'Inspect immutable system audit trail' },
  ];

  for (const p of permissions) {
    await db.query(
      `INSERT INTO permissions (id, code, module, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;`,
      [p.id, p.code, p.module, p.desc]
    );
  }

  // 3. Organizational Units (Colleges at Debre Berhan University)
  const units = [
    { id: 'col-ceng', code: 'CENG', name: 'College of Computing and Engineering', type: 'COLLEGE', desc: 'Engineering, Computing, and Architecture programs' },
    { id: 'col-chs', code: 'CHS', name: 'College of Health Sciences', type: 'COLLEGE', desc: 'Medicine, Public Health, Nursing, and Pharmacy' },
    { id: 'col-cbe', code: 'CBE', name: 'College of Business and Economics', type: 'COLLEGE', desc: 'Accounting, Economics, and Management' },
    { id: 'col-cssh', code: 'CSSH', name: 'College of Social Sciences and Humanities', type: 'COLLEGE', desc: 'Social Sciences, Languages, and Law' },
  ];

  for (const u of units) {
    await db.query(
      `INSERT INTO organizational_units (id, code, name, type, description)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;`,
      [u.id, u.code, u.name, u.type, u.desc]
    );
  }

  // 4. Departments
  const departments = [
    { id: 'dept-comp', unitId: 'col-ceng', code: 'COMP', name: 'Department of Computer Science & Software Engineering' },
    { id: 'dept-eeng', unitId: 'col-ceng', code: 'EENG', name: 'Department of Electrical & Computer Engineering' },
    { id: 'dept-med', unitId: 'col-chs', code: 'MED', name: 'School of Medicine' },
    { id: 'dept-acct', unitId: 'col-cbe', code: 'ACCT', name: 'Department of Accounting and Finance' },
  ];

  for (const d of departments) {
    await db.query(
      `INSERT INTO departments (id, unit_id, code, name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;`,
      [d.id, d.unitId, d.code, d.name]
    );
  }

  // 5. Academic Programs
  const programs = [
    { id: 'prog-se', deptId: 'dept-comp', code: 'BSC_SE', name: 'B.Sc. in Software Engineering', level: 'UNDERGRADUATE', years: 5 },
    { id: 'prog-cs', deptId: 'dept-comp', code: 'BSC_CS', name: 'B.Sc. in Computer Science', level: 'UNDERGRADUATE', years: 4 },
    { id: 'prog-ee', deptId: 'dept-eeng', code: 'BSC_EE', name: 'B.Sc. in Electrical Engineering', level: 'UNDERGRADUATE', years: 5 },
    { id: 'prog-med', deptId: 'dept-med', code: 'MD_GEN', name: 'Doctor of Medicine', level: 'UNDERGRADUATE', years: 6 },
  ];

  for (const prog of programs) {
    await db.query(
      `INSERT INTO academic_programs (id, department_id, code, name, degree_level, duration_years)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, duration_years = EXCLUDED.duration_years;`,
      [prog.id, prog.deptId, prog.code, prog.name, prog.level, prog.years]
    );
  }

  // 6. Academic Year & Semesters
  await db.query(
    `INSERT INTO academic_years (id, year_label, is_current)
     VALUES ($1, $2, $3)
     ON CONFLICT (year_label) DO UPDATE SET is_current = EXCLUDED.is_current;`,
    ['ay-2025-2026', '2025/2026 (2018 E.C.)', true]
  );

  await db.query(
    `INSERT INTO semesters (id, academic_year_id, semester_number, start_date, end_date, is_current)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (academic_year_id, semester_number) DO UPDATE SET is_current = EXCLUDED.is_current;`,
    ['sem-2025-1', 'ay-2025-2026', 1, '2025-10-01', '2026-02-15', true]
  );

  await db.query(
    `INSERT INTO semesters (id, academic_year_id, semester_number, start_date, end_date, is_current)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (academic_year_id, semester_number) DO NOTHING;`,
    ['sem-2025-2', 'ay-2025-2026', 2, '2026-02-25', '2026-06-30', false]
  );

  // 7. Configurable Approval Workflows
  const workflows = [
    { id: 'wf-senior', code: 'SENIOR_ENROLLMENT', name: 'Senior Enrollment Batch Approval', desc: 'Dean submits student import; Registrar conducts institutional review and approval' },
    { id: 'wf-corr', code: 'STUDENT_CORRECTION', name: 'Student Record Correction', desc: 'Student requests data correction; Department reviews; Registrar approves' },
    { id: 'wf-service', code: 'SERVICE_REQUEST', name: 'Student Service Ticket', desc: 'Student submits support inquiry; Student Affairs officer resolves' },
    { id: 'wf-doc', code: 'AI_DOC_PUB', name: 'AI Knowledge Publication', desc: 'Document submitted; AI Knowledge Admin reviews and publishes to RAG index' },
  ];

  for (const wf of workflows) {
    await db.query(
      `INSERT INTO approval_workflows (id, code, name, description, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;`,
      [wf.id, wf.code, wf.name, wf.desc]
    );
  }

  // Workflow steps
  // SENIOR_ENROLLMENT steps
  await db.query(
    `INSERT INTO workflow_steps (id, workflow_id, step_order, step_name, required_role, is_mandatory, allow_return)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (workflow_id, step_order) DO NOTHING;`,
    ['ws-sen-1', 'wf-senior', 1, 'Dean Batch Submission', 'DEAN', true, false]
  );
  await db.query(
    `INSERT INTO workflow_steps (id, workflow_id, step_order, step_name, required_role, is_mandatory, allow_return)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (workflow_id, step_order) DO NOTHING;`,
    ['ws-sen-2', 'wf-senior', 2, 'Registrar Institutional Review & Approval', 'REGISTRAR', true, true]
  );

  // 8. Staff Accounts (Realistic Fictional Testing Credentials)
  // Password for all seeded staff: DbuSecure2026!
  const passwordHash = await bcrypt.hash('DbuSecure2026!', 10);

  const staffUsers = [
    {
      id: 'usr-admin',
      username: 'dbu_admin',
      email: 'admin@dbu.edu.et',
      role: 'SYSTEM_ADMIN',
      scopeType: 'GLOBAL',
      scopeId: null,
    },
    {
      id: 'usr-registrar',
      username: 'dbu_registrar',
      email: 'registrar@dbu.edu.et',
      role: 'REGISTRAR',
      scopeType: 'GLOBAL',
      scopeId: null,
    },
    {
      id: 'usr-dean-ceng',
      username: 'dbu_dean_ceng',
      email: 'dean.ceng@dbu.edu.et',
      role: 'DEAN',
      scopeType: 'COLLEGE',
      scopeId: 'col-ceng',
    },
    {
      id: 'usr-admissions',
      username: 'dbu_admissions',
      email: 'admissions@dbu.edu.et',
      role: 'ADMISSIONS',
      scopeType: 'GLOBAL',
      scopeId: null,
    },
    {
      id: 'usr-affairs',
      username: 'dbu_affairs',
      email: 'affairs@dbu.edu.et',
      role: 'STUDENT_AFFAIRS',
      scopeType: 'GLOBAL',
      scopeId: null,
    },
    {
      id: 'usr-ai-admin',
      username: 'dbu_ai_admin',
      email: 'ai.admin@dbu.edu.et',
      role: 'AI_KNOWLEDGE_ADMIN',
      scopeType: 'GLOBAL',
      scopeId: null,
    },
    {
      id: 'usr-auditor',
      username: 'dbu_auditor',
      email: 'auditor@dbu.edu.et',
      role: 'AUDITOR',
      scopeType: 'GLOBAL',
      scopeId: null,
    },
  ];

  for (const u of staffUsers) {
    await db.query(
      `INSERT INTO users (id, username, email, password_hash, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'ACTIVE';`,
      [u.id, u.username, u.email, passwordHash]
    );

    // Fetch role id
    const rRes = await db.query('SELECT id FROM roles WHERE name = $1', [u.role]);
    if (rRes.rows.length > 0) {
      const roleId = rRes.rows[0].id;
      await db.query(
        `INSERT INTO user_roles (id, user_id, role_id, scope_type, scope_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING;`,
        [`ur-${u.id}`, u.id, roleId, u.scopeType, u.scopeId]
      );
    }
  }

  // 9. Realistic Fictional Freshman Eligibility Records for Testing Activation
  const freshmanSeeds = [
    {
      id: 'fresh-001',
      slip: 'DBU-ET-2026-8801',
      examId: 'UEE-994411',
      firstName: 'Abebe',
      lastName: 'Bikila',
      gender: 'M',
      collegeId: 'col-ceng',
      deptId: 'dept-comp',
    },
    {
      id: 'fresh-002',
      slip: 'DBU-ET-2026-8802',
      examId: 'UEE-994412',
      firstName: 'Tigist',
      lastName: 'Assefa',
      gender: 'F',
      collegeId: 'col-ceng',
      deptId: 'dept-eeng',
    },
    {
      id: 'fresh-003',
      slip: 'DBU-ET-2026-8803',
      examId: 'UEE-994413',
      firstName: 'Derartu',
      lastName: 'Tulu',
      gender: 'F',
      collegeId: 'col-chs',
      deptId: 'dept-med',
    },
  ];

  for (const f of freshmanSeeds) {
    await db.query(
      `INSERT INTO freshman_eligibility_records (id, admission_slip_number, entrance_exam_id, first_name, last_name, gender, college_id, department_id, academic_year_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ay-2025-2026')
       ON CONFLICT (admission_slip_number) DO NOTHING;`,
      [f.id, f.slip, f.examId, f.firstName, f.lastName, f.gender, f.collegeId, f.deptId]
    );
  }

  // 10. System Settings
  const settings = [
    { key: 'institution.name', val: 'Debre Berhan University', desc: 'Official University Name' },
    { key: 'institution.location', val: 'Debre Berhan, Amhara Region, Ethiopia', desc: 'Main Campus Location' },
    { key: 'system.version', val: '1.0.0-PROD-READY', desc: 'Meri DBU Student release version' },
    { key: 'activation.username_prefix', val: 'dbu/ug', desc: 'System generated username format' },
    { key: 'security.lockout_threshold', val: '5', desc: 'Maximum failed logins before lockout' },
    { key: 'ai.grounded_abstention_message', val: 'Official information on this query is not documented in approved university sources. Please contact the Debre Berhan University Registrar Office (Block 12) or email info@dbu.edu.et.', desc: 'Grounded RAG abstention text' },
  ];

  for (const s of settings) {
    await db.query(
      `INSERT INTO system_settings (key, value, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
      [s.key, s.val, s.desc]
    );
  }

  // 11. Public announcements seed
  await db.query(
    `INSERT INTO announcements (id, title, content, author_user_id, audience_scope, is_published)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     ON CONFLICT (id) DO NOTHING;`,
    [
      'ann-welcome-2026',
      'Welcome to Debre Berhan University (2025/2026 Academic Year)',
      'Debre Berhan University warmly welcomes all incoming freshman students and returning senior scholars to the 2025/2026 (2018 E.C.) academic year. Please complete online account activation through Meri DBU Student portal before October 25.',
      'usr-admin',
      'PUBLIC',
    ]
  );

  // 12. Official University Documents Repository Seed
  const documentsSeed = [
    {
      id: 'doc-acad-cal-2025',
      title: 'DBU Master Academic Calendar (2025/2026 / 2018 E.C.)',
      category: 'ACADEMIC_CALENDAR',
      filePath: 'storage/documents/academic_calendar_2025_2026.pdf',
      fileSize: 420000,
      mimeType: 'application/pdf',
      accessScope: 'PUBLIC',
      version: '2025.1',
    },
    {
      id: 'doc-senate-leg-2024',
      title: 'Debre Berhan University Senate Legislation (Revised Edition)',
      category: 'SENIOR_POLICY',
      filePath: 'storage/documents/dbu_senate_legislation.pdf',
      fileSize: 1850000,
      mimeType: 'application/pdf',
      accessScope: 'PUBLIC',
      version: '4.2',
    },
    {
      id: 'doc-handbook-fresh-2025',
      title: 'Undergraduate Student Orientation & Campus Life Handbook',
      category: 'STUDENT_HANDBOOK',
      filePath: 'storage/documents/student_handbook_2025.pdf',
      fileSize: 950000,
      mimeType: 'application/pdf',
      accessScope: 'STUDENT_ONLY',
      version: '2025.1',
    },
    {
      id: 'doc-grading-guide',
      title: 'DBU Standard Grading Scale and Academic Standing Directives',
      category: 'REGISTRAR_BULLETIN',
      filePath: 'storage/documents/grading_scale_policy.pdf',
      fileSize: 310000,
      mimeType: 'application/pdf',
      accessScope: 'STUDENT_ONLY',
      version: '3.0',
    },
    {
      id: 'doc-staff-senate-confidential',
      title: 'DBU Examination Security & Disciplinary Board Protocols',
      category: 'SENIOR_POLICY',
      filePath: 'storage/documents/exam_security_confidential.pdf',
      fileSize: 620000,
      mimeType: 'application/pdf',
      accessScope: 'STAFF_ONLY',
      version: '2025.A',
    },
  ];

  for (const doc of documentsSeed) {
    await db.query(
      `INSERT INTO documents (
        id, title, category, file_path, file_size, mime_type, access_scope,
        uploaded_by_user_id, is_indexed_in_rag, version_label
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'usr-admin', TRUE, $8)
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, access_scope = EXCLUDED.access_scope;`,
      [doc.id, doc.title, doc.category, doc.filePath, doc.fileSize, doc.mimeType, doc.accessScope, doc.version]
    );
  }

  console.log('[Seed] Fictional seed data initialized successfully.');
}

if (process.argv[1]?.includes('seed')) {
  runSeed()
    .then(async () => {
      const db = await getDb();
      await db.close();
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed] Seeding failed:', err);
      process.exit(1);
    });
}
