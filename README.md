# Meri DBU Student (ደብረ ብርሃን ዩኒቨርሲቲ)

**Official Web Platform for Debre Berhan University (DBU), Ethiopia**  
*A centralized, secure, role-based student information, academic verification, and student-support platform.*

---

## 🌟 Overview

Meri DBU Student is a state-of-the-art web application developed to modernize and secure student onboarding and academic record verification for Debre Berhan University. Built to reflect Ethiopian higher-education administrative practices, the platform provides:

- **Public University Portal**: Announcements, academic calendar, program directories, and admissions guidance.
- **Freshman & Senior Account Activation**: Multi-step identity verification against official rosters, anti-enumeration security, expiring single-use verification tokens, unique collision-safe username generation (`dbu/ug/{year}/{seq}`), and password setting.
- **Senior Batch Import & Registrar Review Engine**: CSV/XLSX template generation, streaming validation, conflict and duplicate detection, batch state machines, separation of duties enforcement (submitter cannot approve), and transactional database promotion into the active enrollment registry.
- **University Approval Workflows Engine**: Configurable higher-education administrative approval flows for record corrections, leaves, and student service inquiries.
- **Student Services & Inquiry Desk**: Ticket creation, status transitions, internal notes, and official data correction requests.
- **Evidence-Grounded AI Assistant (RAG)**: Multi-lingual AI (English & Amharic) grounded strictly in approved university documents with verifiable citations and official abstention when evidence is missing.
- **Role-Based Access Control (RBAC)**: Server-enforced permissions across 14 institutional roles with organizational scope boundaries (College, Department).
- **Immutable Audit Logging**: Append-only audit trail capturing all security-sensitive actions and administrative decisions.

---

## 🏗️ System Architecture & Technology Stack

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Runtime** | Node.js 22 LTS | High-performance asynchronous execution |
| **Language** | TypeScript (ES2022 / ESM) | Strict type safety, clean domain models, compilation integrity |
| **Framework** | Express 5 | Robust HTTP server, security middleware stack, modular routing |
| **Database** | PostgreSQL & PGlite | Production PostgreSQL client + embedded WASM PostgreSQL for local zero-dependency development |
| **AI / RAG** | Dense Semantic Vector Engine | 128-dimensional cosine vector embeddings, access-aware scope filtering |
| **Validation** | Zod | Strict schema validation for environment variables, API inputs, and batches |
| **Security** | Helmet, Bcrypt, Rate-Limiting | Security headers, password hashing, brute-force lockout, CSRF protection |
| **Testing** | Vitest & Supertest | Automated unit, integration, API, security, and RBAC test suites |

---

## 🚀 Quickstart Guide (Beginner Friendly)

### 1. Prerequisites
Make sure you have [Node.js](https://nodejs.org/) (version 20 or higher) installed on your system.
Verify in terminal:
```bash
node -v
npm -v
```

### 2. Installation
Clone or navigate to the project directory:
```bash
cd "d:\Meri DBU Student"
npm install
```

### 3. Database Migration & Seed
Run database migrations and initialize sample university reference data and staff accounts:
```bash
npm run migrate
npm run seed
```

### 4. Running the Application
Start the development server:
```bash
npm run dev
```
Or build and start the production server:
```bash
npm run build
npm start
```
The server will be available at: **`http://localhost:4000`**

### 5. Running Automated Tests
Execute the complete test suite covering all 25 mandatory scenarios:
```bash
npm test
```

---

## 🔑 Default Evaluation Accounts (Fictional Development Data)

*All seed accounts are initialized with password:* **`DbuSecure2026!`**

| Role | Username / Email | Scope |
| :--- | :--- | :--- |
| **System Administrator** | `admin@dbu.edu.et` (`dbu_admin`) | Global Operational Scope |
| **University Registrar** | `registrar@dbu.edu.et` (`dbu_registrar`) | Institutional Registry Authority |
| **College Dean (CENG)** | `dean.ceng@dbu.edu.et` (`dbu_dean_ceng`) | College of Computing & Engineering |
| **Admissions Officer** | `admissions@dbu.edu.et` (`dbu_admissions`) | Freshman Eligibility Lists |
| **Student Affairs** | `affairs@dbu.edu.et` (`dbu_affairs`) | Student Services & Tickets |
| **AI Knowledge Admin** | `ai.admin@dbu.edu.et` (`dbu_ai_admin`) | Document Ingestion & RAG Indexing |
| **Compliance Auditor** | `auditor@dbu.edu.et` (`dbu_auditor`) | Read-Only Audit Trail |

---

## 📂 Project Directory Structure

```
d:/Meri DBU Student/
├── public/                     # Frontend Web UI (HTML, CSS, JS)
│   ├── index.html              # Master portal interface
│   ├── styles.css              # DBU Gold & Navy design system
│   └── app.js                  # Frontend client application logic
├── src/
│   ├── config/                 # Environment validation (Zod)
│   ├── database/               # PostgreSQL schema, migrations & seed
│   ├── middleware/             # RBAC authorization, rate limiting, error handling
│   ├── routes/                 # REST API router (/api/v1)
│   ├── services/               # Business logic & domain services
│   │   ├── activation.service.ts
│   │   ├── audit.service.ts
│   │   ├── auth.service.ts
│   │   ├── batch-import.service.ts
│   │   ├── notification.service.ts
│   │   ├── rag.service.ts
│   │   ├── registrar.service.ts
│   │   ├── student.service.ts
│   │   └── workflow.service.ts
│   ├── app.ts                  # Express application setup
│   └── server.ts               # Server bootstrap & graceful shutdown
├── tests/
│   └── platform.test.ts        # 25 mandatory verification test scenarios
├── tsconfig.json               # TypeScript configuration
├── vitest.config.ts            # Vitest automated test configuration
└── package.json                # Project dependencies & npm scripts
```

---

## 🛡️ Security Features
- **Strict Role-Based Access Control**: Server-enforced middleware prevents horizontal and vertical privilege escalation.
- **Separation of Duties**: Academic Deans who submit enrollment batches cannot approve them.
- **Account Lockout & Progressive Throttling**: Protects authentication endpoints from credential-stuffing and brute-force attacks.
- **Access-Aware AI RAG**: Chunks are scoped (`PUBLIC`, `STUDENT_ONLY`, `STAFF_ONLY`); visitors and students cannot retrieve confidential administrative documents.
- **Grounded AI Abstention**: Prevents hallucination of academic policies, deadlines, or fees.

---

## 📜 License
Developed for Debre Berhan University (DBU), Ethiopia. All rights reserved.
