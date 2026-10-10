# Meri DBU Student: Software Requirements Specification (SRS)

**Institution:** Debre Berhan University (DBU), Ethiopia  
**System Name:** Meri DBU Student Platform  
**Document Version:** 1.0.0-PROD-READY  

---

## 1. Introduction

### 1.1 Purpose
Meri DBU Student is a centralized, role-based student information, academic verification, and student-support platform for Debre Berhan University (DBU), Ethiopia. This specification details all functional and non-functional requirements, business workflows, actor responsibilities, and system constraints.

### 1.2 System Scope
The platform complements official university student information systems (SIS) by handling:
- Public admissions guidance, notices, and academic calendars.
- Multi-factor freshman and senior student account activation.
- Senior-student batch imports with strict validation, deduplication, and Registrar institutional review.
- University administrative approval workflows conforming to Ethiopian higher-education practices.
- Student service inquiries and official record correction requests.
- Multi-lingual evidence-grounded AI knowledge retrieval (RAG) with source citations.

---

## 2. Actors & Responsibilities Matrix

| Actor | Responsibilities | Scope Restrictions |
| :--- | :--- | :--- |
| **Public Visitor** | Browses public notices, catalogs, academic calendar, and asks public AI assistant. | Denied access to private student dashboards or staff portals. |
| **Freshman Student** | Initiates activation with entrance slip & exam ID, verifies email, sets password, accesses student portal. | Cannot activate without matching authorized newly admitted list. |
| **Senior Student** | Activates account against Registrar-approved enrollment record, views academic profile, files service requests. | Cannot create or approve own enrollment record. |
| **College Dean** | Uploads senior student enrollment CSV/XLSX batches, inspects validation preview, submits to Registrar. | Restricted strictly to assigned College/Faculty. Cannot approve own batches. |
| **University Registrar** | Reviews submitted batches, inspects row-level discrepancies, approves or rejects with mandatory justification, manages official registry. | Separation of duties enforced. Submitter cannot approve. |
| **Admissions Officer** | Manages freshman admission eligibility rosters, verifies entrance exam records. | Scoped to freshman admissions. |
| **Student Affairs** | Receives, assigns, and resolves student service tickets (ID card, clearance, dormitories). | Scoped to assigned service categories. |
| **AI Knowledge Admin** | Ingests university policy documents, assigns access scopes, triggers indexing. | Cannot expose restricted staff docs to public scope. |
| **Compliance Auditor** | Read-only inspection of immutable system audit trails. | Cannot alter audit logs or modify student records. |
| **System Administrator** | Manages system settings, role assignments, operational platform health. | Least-privilege. No authority to alter academic decisions. |

---

## 3. Detailed Business Workflows

### 3.1 Freshman Account Activation Sequence
```mermaid
sequenceDiagram
    autonumber
    actor Student as Freshman Student
    participant UI as Portal Web UI
    participant Svc as Activation Service
    participant DB as DBU Database
    participant Audit as Audit Log

    Student->>UI: Enter Slip Number, Exam ID, Name, Email
    UI->>Svc: POST /api/v1/activation/freshman/verify
    Svc->>DB: Match against freshman_eligibility_records
    alt Match Found & Not Activated
        Svc->>DB: Store single-use expiring token (24h)
        Svc->>Audit: Log FRESHMAN_ACTIVATION_TOKEN_DISPATCHED
        Svc-->>UI: Return eligibility confirmed + Token
        Student->>UI: Set secure password (min 8 chars)
        UI->>Svc: POST /api/v1/activation/complete
        Svc->>DB: In Transaction: Create User, Assign FRESHMAN role, Generate unique username (dbu/ug/2026/XXXX), Create student_profile, Mark eligible record activated
        Svc->>Audit: Log FRESHMAN_ACTIVATION_COMPLETED
        Svc-->>UI: Return Username & Activation Confirmation
    else Ineligible or Already Activated
        Svc-->>UI: Return safe generic error message
    end
```

### 3.2 Senior Student Import & Registrar Approval Workflow
```mermaid
sequenceDiagram
    autonumber
    actor Dean as College Dean
    actor Reg as University Registrar
    participant Import as Batch Import Engine
    participant DB as DBU Database
    participant RegSvc as Registrar Service

    Dean->>Import: Upload Senior Enrollment CSV (College Scope)
    Import->>Import: Stream parse, header check, department validation
    Import->>Import: Deduplicate rows & detect conflicts against Senior Registry
    Import->>DB: Store batch as DRAFT with SHA-256 checksum
    Import-->>Dean: Return Preview (Total, Valid, Invalid, Duplicate, Conflict counts)
    Dean->>Import: Submit Batch for Institutional Review
    Import->>DB: Transition batch state to UNDER_REGISTRAR_REVIEW
    Reg->>RegSvc: Inspect pending batch rows and discrepancies
    alt Registrar Approves
        Reg->>RegSvc: POST /batches/{id}/decision (APPROVE)
        RegSvc->>DB: In Transaction: Promote valid rows to senior_enrollment_records with provenance, update batch status to APPROVED, notify Dean
    else Registrar Returns or Rejects
        Reg->>RegSvc: POST /batches/{id}/decision (REJECT / RETURN + Mandatory Comment)
        RegSvc->>DB: Update batch status, records remain unpromoted, notify Dean
    end
```

---

## 4. Non-Functional Requirements

- **Security**: Argon2id / Bcrypt 10-round password hashing, rate limiting on authentication routes, progressive lockout after 5 failed attempts, CSRF protection, secure HTTP headers via Helmet.
- **Data Integrity**: Database transactions for multi-step approval workflows and batch registry promotions. Foreign keys with RESTRICT/CASCADE rules prevent orphaned records.
- **Auditability**: All state-changing administrative actions recorded to append-only `audit_logs` table.
- **Availability & Portability**: Dual-mode database layer supporting production PostgreSQL and embedded PGlite for zero-dependency execution.
- **Usability & Accessibility**: Modern responsive layout tested on desktop, tablet, and mobile with WCAG contrast and bilingual English/Amharic UI elements.
