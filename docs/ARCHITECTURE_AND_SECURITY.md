# Meri DBU Student: Architecture & Security Design

**Institution:** Debre Berhan University (DBU), Ethiopia  
**System Architecture & Threat Model Specification**  

---

## 1. System Architecture Diagram

```mermaid
graph TD
    Client[Browser Client / Web UI] -->|HTTP / JSON / REST| AppServer[Express 5 Node.js Server]
    
    subgraph Security Layer
        AppServer --> Helmet[Helmet Security Headers]
        AppServer --> Cors[CORS Middleware]
        AppServer --> RateLimiter[Progressive Rate Limiter]
        AppServer --> AuthMiddleware[RBAC & Scope Authorization]
    end
    
    subgraph Domain Services
        AuthMiddleware --> AuthService[Auth & Session Service]
        AuthMiddleware --> ActService[Freshman & Senior Activation]
        AuthMiddleware --> BatchService[Batch Import Engine]
        AuthMiddleware --> RegService[Registrar Review Service]
        AuthMiddleware --> WorkflowService[University Workflow Engine]
        AuthMiddleware --> RagService[Grounded RAG Assistant]
        AuthMiddleware --> StudentService[Student Services & Inquiries]
        AuthMiddleware --> AuditService[Immutable Audit Logger]
    end
    
    subgraph Data Layer
        AuthService --> DB[(PostgreSQL / PGlite WASM)]
        ActService --> DB
        BatchService --> DB
        RegService --> DB
        WorkflowService --> DB
        RagService --> DB
        StudentService --> DB
        AuditService --> DB
    end
```

---

## 2. Database Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    users ||--o{ user_roles : has
    roles ||--o{ user_roles : assigned_to
    roles ||--o{ role_permissions : has
    permissions ||--o{ role_permissions : granted
    
    users ||--o| student_profiles : has
    organizational_units ||--o{ departments : contains
    departments ||--o{ academic_programs : offers
    departments ||--o{ student_profiles : enrolled_in
    
    import_batches ||--o{ import_batch_rows : contains
    import_batches ||--o{ senior_enrollment_records : promotes_to
    users ||--o{ import_batches : submits
    users ||--o{ import_batches : reviews
    
    approval_workflows ||--o{ workflow_steps : defines
    approval_instances ||--o{ approval_actions : records
    
    users ||--o{ student_service_requests : submits
    student_service_requests ||--o{ service_request_comments : has
    
    documents ||--o{ ai_document_chunks : chunked_into
    users ||--o{ sessions : owns
    users ||--o{ audit_logs : triggers
```

---

## 3. RAG AI Assistant Architecture & Threat Modeling

```mermaid
graph LR
    Doc[Approved University PDF/Text] --> Chunker[Overlapping Chunker (400 chars, 80 overlap)]
    Chunker --> Embedder[Semantic Vector Generator]
    Embedder --> Index[(pgvector / ai_document_chunks)]
    
    UserQuery[User Query (English/Amharic)] --> Sanitizer[Prompt Injection Defense]
    Sanitizer --> QueryEmbedder[Query Vector Calculation]
    QueryEmbedder --> ScopeFilter[Access-Aware Role Filter]
    Index --> ScopeFilter
    ScopeFilter --> Ranker[Cosine Similarity + Keyword Boost]
    Ranker --> Decision{Similarity > Threshold?}
    
    Decision -- Yes --> Generator[Grounded Answer Generator + Citations]
    Decision -- No --> Abstain[Responsible Abstention Notice]
```

### Threat Mitigations

| Threat | Vulnerability | Mitigation Strategy |
| :--- | :--- | :--- |
| **Prompt Injection** | User attempts to override system prompt or exfiltrate passwords | Untrusted content boundaries, keyword sanitization, AI has zero DB write execution permissions. |
| **Confidential Leakage** | Staff senate minutes or private docs leaking to public chat | **Access-Aware Scope Filtering**: Query only searches chunks matching the caller's authorized role (`PUBLIC`, `STUDENT_ONLY`, `STAFF_ONLY`). |
| **Hallucination** | Fabricating deadlines or fees | If composite similarity score is under 0.22, AI strictly abstains and refers the student to the Registrar Office. |
| **Separation of Duties Bypass** | A Dean attempting to approve their own enrollment roster | Backend transaction strictly verifies `batch.submitting_user_id !== decision.reviewerUserId`. |
| **Privilege Escalation** | Client modifying student ID or role via profile endpoint | Server ignores user-controlled role fields; only administrators can alter role assignments via audited actions. |
