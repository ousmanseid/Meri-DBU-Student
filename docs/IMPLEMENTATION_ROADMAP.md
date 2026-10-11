# Meri DBU Student: Implementation Roadmap & Backlog

**Institution:** Debre Berhan University (DBU), Ethiopia  
**Repository:** https://github.com/ousmanseid/Meri-DBU-Student  
**Last Updated:** 2026-10-10  

---

## 1. Roadmap Milestones

### Phase 1: Foundation & Core Platform (Completed)
- [x] Node.js 22 LTS, TypeScript, and Express setup.
- [x] Dual-mode PostgreSQL database client supporting production PostgreSQL via `pg` and embedded WASM PostgreSQL via `@electric-sql/pglite`.
- [x] Master database schema with 35+ normalized tables, foreign keys, constraints, and indexes.
- [x] Database migrations runner and initial reference data seed script.
- [x] Structured request logging, error handling, and health/readiness endpoints.

### Phase 2: Authentication & Role-Based Access Control (Completed)
- [x] 14 institutional roles and fine-grained permission matrix.
- [x] Server-enforced RBAC middleware with organizational scope restrictions (College, Department).
- [x] Bcrypt password hashing, session tokens, progressive lockout, and session revocation.

### Phase 3: Identity Verification & Account Activation (Completed)
- [x] Freshman activation with entrance slip/exam ID matching against official records.
- [x] Senior student activation strictly dependent on Registrar-approved enrollment records.
- [x] Expiring single-use email verification tokens.
- [x] Unique collision-safe system username generation (`dbu/ug/{year}/{seq}`).
- [x] Transactional user provisioning and activation event audit logging.

### Phase 4: Senior Batch Import & Registrar Review Engine (Completed)
- [x] Dean batch import studio with CSV template generation.
- [x] Streaming parser, header checks, data validation, deduplication, and registry conflict detection.
- [x] Batch preview with valid, invalid, duplicate, and conflicting row counts.
- [x] Batch state machine with cryptographic SHA-256 checksum for idempotency.
- [x] Enforced separation of duties: Submitting Dean cannot approve their own batch.
- [x] Registrar review desk with batch inspection, row-level error display, and mandatory justification for rejections/returns.
- [x] Atomic promotion of approved records into active `senior_enrollment_records`.

### Phase 5: Student Services & Configurable Workflows (Completed)
- [x] Student dashboard with profile details, academic level, and enrollment status badge.
- [x] Support ticket creation (ID cards, dormitories, clearance, transcripts) and status tracking.
- [x] Student data correction requests.
- [x] Configurable higher-education workflow engine.

### Phase 6: Evidence-Grounded AI Assistant (RAG) (Completed)
- [x] Policy document ingestion, chunking with overlap, and metadata preservation.
- [x] 128-dimensional dense semantic vector calculation and cosine similarity search.
- [x] Access-aware retrieval: filters chunks by user role (`PUBLIC`, `STUDENT_ONLY`, `STAFF_ONLY`).
- [x] Grounded answers with source citations and section references.
- [x] Official abstention when facts are unconfirmed, referring users to the Registrar.
- [x] Multi-lingual query support (English and Amharic).
- [x] Prompt injection defense and untrusted content boundaries.

### Phase 7: UI/UX & Browser Verification (Completed)
- [x] Modern responsive UI with Debre Berhan University branding (Navy `#002d62`, Gold `#cfa83b`, Emerald `#00897b`).
- [x] Single-page application with tabs for Public Home, Activation, Student Portal, Dean Console, Registrar Desk, Admissions, Student Affairs, and Audit Viewer.
- [x] Floating interactive AI chat drawer.
- [x] Browser subagent verification (10/10 rating, WebP video recorded).

### Phase 8: Security & Account Recovery (Completed)
- [x] Password recovery request endpoint with rate-limiting and anti-enumeration.
- [x] Single-use cryptographically random password reset tokens (`crypto.randomBytes(32)`).
- [x] Automatic revocation of all active sessions upon password reset.

### Phase 9: Institutional Document Repository (Completed)
- [x] Multi-tier document access control (`PUBLIC`, `STUDENT_ONLY`, `STAFF_ONLY`).
- [x] Document download endpoint enforcing authentication, authorization, and audit logging.
- [x] Frontend document repository browser with search, category filtering, and direct downloads.

### Phase 10: In-App Notification Center (Completed)
- [x] In-app notification delivery for account activation, password reset, and administrative updates.
- [x] Notification endpoints (`GET /api/v1/notifications`, `PATCH /mark-read`, `PATCH /read-all`).
- [x] Notification preferences configuration (`email`, `in_app`, `sms`).
- [x] Interactive header notification bell with live unread badge and dropdown menu.

### Phase 11: Admissions Directorate Freshman Eligibility Management (Completed)
- [x] Full CRUD operations on `freshman_eligibility_records` restricted to `ADMISSIONS_OFFICER` and `SUPER_ADMIN`.
- [x] Protection against deleting activated student records.
- [x] Duplicate entrance exam slip registration prevention.
- [x] Dedicated Admissions Portal UI tab with real-time statistics and add/delete actions.

### Phase 12: Registrar Corrections & Student Affairs Ticket Resolution (Completed)
- [x] Registrar review desk for student data correction requests (`APPROVED`, `REJECTED`).
- [x] Atomic update of student profile records upon correction approval.
- [x] Student Affairs staff review and resolution desk for student support tickets (`RESOLVED`, `CLOSED`).
- [x] Dedicated UI management consoles for both Registrar and Student Affairs staff.

### Phase 13: Native XLSX Binary Workbook Senior Enrollment (Completed)
- [x] Native `.xlsx` binary workbook generation for senior student import templates using `exceljs`.
- [x] Multi-format file uploader supporting both `.xlsx` and `.csv` in Dean Import Studio.
- [x] In-memory workbook parsing, column normalization, and validation with zero disk footprint.
- [x] Automated integration test verifying XLSX template download, parsing, and Registrar promotion (Scenario 34).

---

## 2. Future Enhancements & Backlog

| Backlog Item | Priority | Target Phase | Description |
| :--- | :--- | :--- | :--- |
| **MoE / EAES API Connector** | Medium | v1.1.0 | Automated integration with Ethiopian Ministry of Education national exam database. |
| **Ethiopic Geez Date Formatter** | Low | v1.2.0 | Utility to convert dates into official Ethiopian calendar Geez numerals (e.g., ፳፻፲፰ ዓ.ም). |
| **SMS Gateway Notification** | Medium | v1.2.0 | Ethio Telecom SMS gateway integration for verification codes. |

