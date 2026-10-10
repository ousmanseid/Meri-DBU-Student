# Meri DBU Student: Architecture Decision Records (ADRs)

**Institution:** Debre Berhan University (DBU), Ethiopia  
**Repository:** https://github.com/ousmanseid/Meri-DBU-Student  
**Last Updated:** 2026-10-10  

---

## ADR-001: Dual-Mode Database Architecture (Production PostgreSQL & Embedded PGlite)

- **Status:** `ACCEPTED`
- **Context:** The application requires full PostgreSQL SQL compliance, transactions, foreign keys, and pgvector capability. However, local developer workstations may lack native PostgreSQL services or Docker.
- **Decision:** Implement an abstraction layer in `src/database/db.ts` that automatically defaults to embedded WASM PostgreSQL (`@electric-sql/pglite`) in development and automated testing, while switching to production `pg.Pool` when `DATABASE_URL` is set and `USE_PGLITE=false`.
- **Consequences:** Tests execute in under 10 seconds without external dependencies, while production deployments use full PostgreSQL instances with zero code changes.

---

## ADR-002: Anti-Enumeration & Privacy-Safe Student Verification

- **Status:** `ACCEPTED`
- **Context:** Public activation forms could be abused by malicious actors to enumerate valid student names, IDs, or admission status.
- **Decision:** Verification failures return safe, generic error responses without disclosing whether a student ID or name exists in the database. Tokens are dispatched asynchronously via single-use expiring links.
- **Consequences:** Protects student data privacy in accordance with institutional guidelines and international best practices.

---

## ADR-003: Access-Aware Retrieval-Augmented Generation (RAG)

- **Status:** `ACCEPTED`
- **Context:** Traditional RAG retrieves chunks purely based on semantic similarity. In a university environment, confidential staff senate minutes or disciplinary records must never leak to public visitors or students through the AI chat interface.
- **Decision:** Ingested chunks store an `access_scope` attribute (`PUBLIC`, `STUDENT_ONLY`, `STAFF_ONLY`, `REGISTRAR_ONLY`). Retrieval queries filter chunk sets by caller role before calculating semantic similarity.
- **Consequences:** Strict zero-leakage guarantee across organizational boundaries.

---

## ADR-004: Enforced Separation of Duties in Academic Batch Approvals

- **Status:** `ACCEPTED`
- **Context:** Deans submit enrollment batches for returning senior students. If a Dean could also approve their own batch, the institutional check-and-balance of the Registrar Office would be compromised.
- **Decision:** The backend database transaction strictly rejects any approval decision where `batch.submitting_user_id === decision.reviewerUserId`.
- **Consequences:** Guarantees institutional record integrity and regulatory compliance.

---

## ADR-005: Dual Calendar & Academic Year Representation

- **Status:** `ACCEPTED`
- **Context:** Higher education in Ethiopia operates primarily on the Ethiopian Calendar (E.C., e.g., 2018 E.C.), while international reporting uses the Gregorian Calendar (G.C., e.g., 2025/2026).
- **Decision:** Academic years and reference records store both formats (`2025/2026 (2018 E.C.)`), and date display converts UTC timestamps appropriately.
- **Consequences:** Clear, unambiguous scheduling for both local administrative staff and international scholars.
