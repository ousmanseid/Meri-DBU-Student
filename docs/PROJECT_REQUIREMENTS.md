# Meri DBU Student: Master Project Requirements & Traceability Matrix

**Repository:** https://github.com/ousmanseid/Meri-DBU-Student  
**Institution:** Debre Berhan University (DBU), Ethiopia  
**System Name:** Meri DBU Student  
**Last Updated:** 2026-10-10  

---

## 1. Requirements Checklist & Traceability Matrix

| Req ID | Priority | Category | Requirement Description | Implementation Files | Test Scenario | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-001** | `CRITICAL` | Security | Public visitors cannot access private dashboards, student profiles, or staff functions. | `src/middleware/auth.middleware.ts`, `src/routes/api.router.ts` | Scenario 1 | `COMPLETED` |
| **REQ-002** | `CRITICAL` | Activation | Ineligible freshman records not on official list cannot activate accounts (anti-enumeration). | `src/services/activation.service.ts` | Scenario 2 | `COMPLETED` |
| **REQ-003** | `CRITICAL` | Activation | Eligible freshman completes verification, email token, sets password, receives unique username. | `src/services/activation.service.ts` | Scenario 3 | `COMPLETED` |
| **REQ-004** | `HIGH` | Security | Activation tokens expire and cannot be reused. | `src/services/activation.service.ts` | Scenario 4 | `COMPLETED` |
| **REQ-005** | `HIGH` | Activation | Username generation is collision-safe and strictly unique (`dbu/ug/{year}/{seq}`). | `src/services/activation.service.ts` | Scenario 5 | `COMPLETED` |
| **REQ-006** | `CRITICAL` | Activation | Senior students absent from Registrar-approved enrollment registry cannot activate. | `src/services/activation.service.ts` | Scenario 6 | `COMPLETED` |
| **REQ-007** | `CRITICAL` | Batch Import | Authorized Dean uploads, previews, and submits senior enrollment batch within college scope. | `src/services/batch-import.service.ts` | Scenario 7 | `COMPLETED` |
| **REQ-008** | `CRITICAL` | Authorization | Unauthorized users (e.g. students, visitors) cannot upload or submit senior batches. | `src/middleware/auth.middleware.ts` | Scenario 8 | `COMPLETED` |
| **REQ-009** | `CRITICAL` | Registrar | Registrar can inspect, validate, and approve submitted batches with atomic registry promotion. | `src/services/registrar.service.ts` | Scenario 9 | `COMPLETED` |
| **REQ-010** | `CRITICAL` | Authorization | Unauthorized roles (e.g. Deans, Students) cannot approve batches. | `src/middleware/auth.middleware.ts` | Scenario 10 | `COMPLETED` |
| **REQ-011** | `CRITICAL` | Compliance | Separation of Duties: Submitting Dean cannot approve their own batch. | `src/services/registrar.service.ts` | Scenario 11 | `COMPLETED` |
| **REQ-012** | `CRITICAL` | Batch Import | Rejected or returned batches do not promote records or allow senior activation. | `src/services/registrar.service.ts` | Scenario 12 | `COMPLETED` |
| **REQ-013** | `HIGH` | Data Integrity | Duplicate imports or repeated uploads do not create duplicate student records. | `src/services/batch-import.service.ts` | Scenario 13 | `COMPLETED` |
| **REQ-014** | `CRITICAL` | Activation | Senior students approved by Registrar can complete activation. | `src/services/activation.service.ts` | Scenario 14 | `COMPLETED` |
| **REQ-015** | `HIGH` | Scope Access | Cross-college import attempts by scoped Deans are strictly denied. | `src/middleware/auth.middleware.ts` | Scenario 15 | `COMPLETED` |
| **REQ-016** | `HIGH` | Student Data | Students cannot directly edit official enrollment records; must use correction request flow. | `src/services/student.service.ts` | Scenario 16 | `COMPLETED` |
| **REQ-017** | `MEDIUM` | Student Services| Students submit service requests (ID card, clearance, dorms) and staff can process them. | `src/services/student.service.ts` | Scenario 17 | `COMPLETED` |
| **REQ-018** | `CRITICAL` | AI / RAG | Access-Aware Retrieval: Private staff documents never leak to public/student AI queries. | `src/services/rag.service.ts` | Scenario 18 | `COMPLETED` |
| **REQ-019** | `HIGH` | AI / RAG | Grounded Abstention: AI cites approved sources and abstains when evidence is missing. | `src/services/rag.service.ts` | Scenario 19 | `COMPLETED` |
| **REQ-020** | `HIGH` | Security | Prompt injection defense: Sanitizes query patterns and isolates untrusted document data. | `src/services/rag.service.ts` | Scenario 20 | `COMPLETED` |
| **REQ-021** | `MEDIUM` | Localization | Multi-lingual AI: Accurately detects and responds to Amharic queries. | `src/services/rag.service.ts` | Scenario 21 | `COMPLETED` |
| **REQ-022** | `HIGH` | Audit | Sensitive administrative and student actions appear in append-only audit trail. | `src/services/audit.service.ts` | Scenario 22 | `COMPLETED` |
| **REQ-023** | `HIGH` | Security | Session revocation on logout invalidates future requests immediately. | `src/services/auth.service.ts` | Scenario 23 | `COMPLETED` |
| **REQ-024** | `MEDIUM` | Workflows | Configurable higher-education approval workflow instances execute audited state transitions. | `src/services/workflow.service.ts` | Scenario 24 | `COMPLETED` |
| **REQ-025** | `HIGH` | Operations | System health and reference endpoints return accurate DBU institution metadata. | `src/routes/api.router.ts` | Scenario 25 | `COMPLETED` |

---

## 2. Current Blockers & University Policy Questions

1. **National Exam ID Integration:** Current implementation verifies against `freshman_eligibility_records`. Official automated integration with Ethiopia's Ministry of Education / Educational Assessment and Examinations Service (EAES) API requires institutional API keys and authorized network gateway access.
2. **Bulk Notification Delivery:** Verification links are recorded in `notification_delivery_attempts`. For production, SMTP relay (e.g., Ethio Telecom SMTP or SendGrid/Amazon SES) must be configured in `.env`.
3. **Official Ethiopian Calendar Conversion:** UI displays both Gregorian (2025/2026) and Ethiopian Calendar (2018 E.C.) dates. Full Geez numeral date rendering can be enhanced in future localization updates.
