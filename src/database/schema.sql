-- ==============================================================================
-- MERI DBU STUDENT: MASTER DATABASE SCHEMA (POSTGRESQL COMPATIBLE)
-- Debre Berhan University, Ethiopia
-- ==============================================================================

-- Enable standard UUID generation if available
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username VARCHAR(100) UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_ACTIVATION', -- PENDING_ACTIVATION, ACTIVE, SUSPENDED, LOCKED
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMP,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL, -- PUBLIC_VISITOR, FRESHMAN, SENIOR, DEAN, REGISTRAR, ADMISSIONS, DEPT_HEAD, ADVISOR, INSTRUCTOR, STUDENT_AFFAIRS, SECRETARY, SYSTEM_ADMIN, AI_KNOWLEDGE_ADMIN, AUDITOR
    display_name VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,
    module VARCHAR(50) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS user_roles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    scope_type VARCHAR(50) NOT NULL DEFAULT 'GLOBAL', -- GLOBAL, COLLEGE, DEPARTMENT, ASSIGNED
    scope_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, role_id, scope_type, scope_id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    id TEXT PRIMARY KEY,
    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    UNIQUE(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS organizational_units (
    id TEXT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL, -- e.g. CENG (College of Engineering), CHS (College of Health Sciences)
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'COLLEGE', -- COLLEGE, FACULTY, DIRECTORATE, OFFICE
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    unit_id TEXT NOT NULL REFERENCES organizational_units(id) ON DELETE RESTRICT,
    code VARCHAR(50) UNIQUE NOT NULL, -- e.g. COMP, EE, MECH
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS academic_programs (
    id TEXT PRIMARY KEY,
    department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    code VARCHAR(50) UNIQUE NOT NULL, -- e.g. BSC_SE, BSC_CS
    name VARCHAR(255) NOT NULL,
    degree_level VARCHAR(50) NOT NULL DEFAULT 'UNDERGRADUATE', -- UNDERGRADUATE, POSTGRADUATE
    duration_years INT NOT NULL DEFAULT 4,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS academic_years (
    id TEXT PRIMARY KEY,
    year_label VARCHAR(50) UNIQUE NOT NULL, -- e.g. 2025/2026 (2018 E.C.)
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS semesters (
    id TEXT PRIMARY KEY,
    academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    semester_number INT NOT NULL, -- 1, 2, 3 (Summer)
    start_date DATE,
    end_date DATE,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(academic_year_id, semester_number)
);

CREATE TABLE IF NOT EXISTS student_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    student_id_number VARCHAR(50) UNIQUE NOT NULL, -- e.g. DBU/1401234
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    gender VARCHAR(10),
    department_id TEXT REFERENCES departments(id),
    program_id TEXT REFERENCES academic_programs(id),
    cohort_year VARCHAR(50),
    current_year_level INT NOT NULL DEFAULT 1,
    current_semester INT NOT NULL DEFAULT 1,
    enrollment_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, LEAVE, WITHDRAWN, GRADUATED
    phone VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Official Freshman newly admitted list
CREATE TABLE IF NOT EXISTS freshman_eligibility_records (
    id TEXT PRIMARY KEY,
    admission_slip_number VARCHAR(100) UNIQUE NOT NULL, -- National Exam registration / slip number
    entrance_exam_id VARCHAR(100) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    gender VARCHAR(10),
    college_id TEXT REFERENCES organizational_units(id),
    department_id TEXT REFERENCES departments(id),
    academic_year_id TEXT REFERENCES academic_years(id),
    is_activated BOOLEAN NOT NULL DEFAULT FALSE,
    activated_user_id TEXT REFERENCES users(id),
    activated_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Batch Import System (Section 6)
CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY,
    batch_number VARCHAR(50) UNIQUE NOT NULL,
    submitting_user_id TEXT NOT NULL REFERENCES users(id),
    college_id TEXT NOT NULL REFERENCES organizational_units(id),
    academic_year_id TEXT NOT NULL REFERENCES academic_years(id),
    semester_id TEXT NOT NULL REFERENCES semesters(id),
    file_name VARCHAR(255) NOT NULL,
    file_size INT NOT NULL,
    file_checksum VARCHAR(64) NOT NULL, -- SHA-256 idempotency hash
    row_count INT NOT NULL DEFAULT 0,
    valid_row_count INT NOT NULL DEFAULT 0,
    invalid_row_count INT NOT NULL DEFAULT 0,
    duplicate_row_count INT NOT NULL DEFAULT 0,
    conflict_row_count INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT', 
    -- DRAFT, VALIDATING, VALIDATION_FAILED, SUBMITTED, UNDER_REGISTRAR_REVIEW, RETURNED_FOR_CORRECTION, REJECTED, APPROVED, CANCELLED
    reviewer_user_id TEXT REFERENCES users(id),
    reviewer_comments TEXT,
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_batch_rows (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    row_index INT NOT NULL,
    student_id_number VARCHAR(50) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    gender VARCHAR(10),
    department_code VARCHAR(50) NOT NULL,
    program_code VARCHAR(50),
    cohort_year VARCHAR(50),
    enrollment_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    raw_data TEXT NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT TRUE,
    validation_errors TEXT, -- JSON string array of error messages
    conflict_type VARCHAR(50), -- DUPLICATE_IN_FILE, ALREADY_ENROLLED, MISMATCHED_NAME
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Official Senior Enrollment Registry (Populated strictly on Registrar approval)
CREATE TABLE IF NOT EXISTS senior_enrollment_records (
    id TEXT PRIMARY KEY,
    student_id_number VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    gender VARCHAR(10),
    college_id TEXT NOT NULL REFERENCES organizational_units(id),
    department_id TEXT NOT NULL REFERENCES departments(id),
    program_id TEXT REFERENCES academic_programs(id),
    cohort_year VARCHAR(50),
    academic_year_id TEXT NOT NULL REFERENCES academic_years(id),
    semester_id TEXT NOT NULL REFERENCES semesters(id),
    enrollment_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    is_eligible_for_activation BOOLEAN NOT NULL DEFAULT TRUE,
    is_activated BOOLEAN NOT NULL DEFAULT FALSE,
    activated_user_id TEXT REFERENCES users(id),
    activated_at TIMESTAMP,
    source_batch_id TEXT NOT NULL REFERENCES import_batches(id),
    approved_by_registrar_id TEXT NOT NULL REFERENCES users(id),
    approved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Configurable University Approval Workflows (Section 7)
CREATE TABLE IF NOT EXISTS approval_workflows (
    id TEXT PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL, -- SENIOR_ENROLLMENT, STUDENT_CORRECTION, LEAVE_REQUEST, SERVICE_ESCALATION, ANNOUNCEMENT_PUB, AI_DOC_PUB
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflow_steps (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
    step_order INT NOT NULL,
    step_name VARCHAR(100) NOT NULL,
    required_role VARCHAR(50) NOT NULL,
    is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
    allow_return BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workflow_id, step_order)
);

CREATE TABLE IF NOT EXISTS approval_instances (
    id TEXT PRIMARY KEY,
    workflow_code VARCHAR(100) NOT NULL REFERENCES approval_workflows(code),
    entity_type VARCHAR(100) NOT NULL, -- e.g. IMPORT_BATCH, CORRECTION_REQUEST, SERVICE_REQUEST, DOCUMENT
    entity_id TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED', -- SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, RETURNED
    current_step_order INT NOT NULL DEFAULT 1,
    initiated_by_user_id TEXT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS approval_actions (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES approval_instances(id) ON DELETE CASCADE,
    step_name VARCHAR(100) NOT NULL,
    actor_user_id TEXT NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL, -- APPROVE, REJECT, RETURN, ESCALATE
    comments TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Student Data Correction Requests
CREATE TABLE IF NOT EXISTS correction_requests (
    id TEXT PRIMARY KEY,
    student_user_id TEXT NOT NULL REFERENCES users(id),
    student_id_number VARCHAR(50) NOT NULL,
    field_name VARCHAR(100) NOT NULL, -- first_name, last_name, phone, department, etc.
    old_value TEXT NOT NULL,
    requested_value TEXT NOT NULL,
    reason TEXT NOT NULL,
    supporting_document_url TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, UNDER_REVIEW, APPROVED, REJECTED
    reviewed_by_user_id TEXT REFERENCES users(id),
    review_comments TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tokens & Sessions (Section 8)
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id TEXT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(50) NOT NULL, -- FRESHMAN_ACTIVATION, SENIOR_ACTIVATION, EMAIL_VERIFY, PASSWORD_RESET
    metadata TEXT, -- JSON extra context
    expires_at TIMESTAMP NOT NULL,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(100),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Announcements & Public Content (Section 9)
CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    author_user_id TEXT NOT NULL REFERENCES users(id),
    audience_scope VARCHAR(50) NOT NULL DEFAULT 'PUBLIC', -- PUBLIC, ALL_STUDENTS, FRESHMEN, SENIORS, STAFF_ONLY
    college_id TEXT REFERENCES organizational_units(id),
    department_id TEXT REFERENCES departments(id),
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Document Repository (Sections 10 & 14)
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- ACADEMIC_CALENDAR, ADMISSION_GUIDE, STUDENT_HANDBOOK, SENIOR_POLICY, REGISTRAR_BULLETIN
    file_path TEXT NOT NULL,
    file_size INT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    access_scope VARCHAR(50) NOT NULL DEFAULT 'PUBLIC', -- PUBLIC, STUDENT_ONLY, STAFF_ONLY, REGISTRAR_ONLY
    department_id TEXT REFERENCES departments(id),
    uploaded_by_user_id TEXT NOT NULL REFERENCES users(id),
    is_indexed_in_rag BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    effective_date DATE,
    version_label VARCHAR(50) NOT NULL DEFAULT '1.0',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Student Service Requests (Section 9)
CREATE TABLE IF NOT EXISTS student_service_requests (
    id TEXT PRIMARY KEY,
    ticket_number VARCHAR(50) UNIQUE NOT NULL,
    student_user_id TEXT NOT NULL REFERENCES users(id),
    service_type VARCHAR(100) NOT NULL, -- ID_CARD, DORMITORY, TRANSCRIPT, CLEARANCE, ADVISING, GENERAL
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(50) NOT NULL DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, URGENT
    status VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED', -- SUBMITTED, ASSIGNED, IN_PROGRESS, RESOLVED, REJECTED, ESCALATED
    assigned_staff_id TEXT REFERENCES users(id),
    resolution_notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_request_comments (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL REFERENCES student_service_requests(id) ON DELETE CASCADE,
    author_user_id TEXT NOT NULL REFERENCES users(id),
    is_internal_note BOOLEAN NOT NULL DEFAULT FALSE,
    comment TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Notifications (Section 15)
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    type VARCHAR(50) NOT NULL DEFAULT 'INFO', -- INFO, WARNING, SUCCESS, ACTION_REQUIRED
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
    id TEXT PRIMARY KEY,
    notification_id TEXT REFERENCES notifications(id) ON DELETE CASCADE,
    recipient_email VARCHAR(255) NOT NULL,
    channel VARCHAR(50) NOT NULL DEFAULT 'EMAIL',
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, SENT, FAILED
    error_message TEXT,
    attempt_count INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Immutable Audit Log Trail (Section 17)
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT REFERENCES users(id),
    actor_username VARCHAR(100),
    actor_role VARCHAR(50),
    action VARCHAR(100) NOT NULL, -- USER_LOGIN, FRESHMAN_ACTIVATED, SENIOR_IMPORT_SUBMITTED, BATCH_APPROVED, BATCH_REJECTED, etc.
    entity_type VARCHAR(100) NOT NULL,
    entity_id TEXT NOT NULL,
    ip_address VARCHAR(100),
    user_agent TEXT,
    details TEXT, -- JSON detailed metadata
    outcome VARCHAR(50) NOT NULL DEFAULT 'SUCCESS', -- SUCCESS, FAILURE, BLOCKED
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Evidence-Grounded AI Assistant & RAG (Section 10)
CREATE TABLE IF NOT EXISTS ai_document_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    section_title VARCHAR(255),
    page_number INT,
    access_scope VARCHAR(50) NOT NULL DEFAULT 'PUBLIC', -- Matches document access scope
    metadata TEXT, -- JSON
    embedding_json TEXT, -- Serialized dense vector embedding
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    sender VARCHAR(50) NOT NULL, -- USER, ASSISTANT
    content TEXT NOT NULL,
    citations TEXT, -- JSON array of source citations
    confidence_score FLOAT,
    abstained BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- System Settings & Configuration (Section 7 & 11)
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_by_user_id TEXT REFERENCES users(id),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance & integrity
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_freshman_eligibility_slip ON freshman_eligibility_records(admission_slip_number);
CREATE INDEX IF NOT EXISTS idx_freshman_eligibility_exam ON freshman_eligibility_records(entrance_exam_id);
CREATE INDEX IF NOT EXISTS idx_senior_enrollment_sid ON senior_enrollment_records(student_id_number);
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON import_batches(status);
CREATE INDEX IF NOT EXISTS idx_import_batches_checksum ON import_batches(file_checksum);
CREATE INDEX IF NOT EXISTS idx_import_batch_rows_batch ON import_batch_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_doc ON ai_document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_ai_chunks_scope ON ai_document_chunks(access_scope);
