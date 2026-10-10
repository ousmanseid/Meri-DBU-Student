# Meri DBU Student: Testing Strategy & Verification Guide

**Institution:** Debre Berhan University (DBU), Ethiopia  
**Repository:** https://github.com/ousmanseid/Meri-DBU-Student  
**Last Updated:** 2026-10-10  

---

## 1. Testing Strategy

The platform maintains automated tests spanning unit, integration, API, security, and end-to-end user journeys using **Vitest** and **Supertest**:

- **Database Isolation:** Tests run against an isolated persistent PostgreSQL/PGlite instance, resetting state cleanly before the test suite executes.
- **Reproducibility:** All 25 mandatory scenarios defined in Section 18 are tested in an automated suite.
- **Continuous Execution:** Zero external dependency on running Docker services; tests execute in under 10 seconds.

---

## 2. Test Execution Commands

```bash
# Run all automated test suites
npm test

# Run tests in watch mode for development
npm run test:watch
```

---

## 3. Mandatory Verification Scenarios (Section 18)

| # | Test Scenario | Verified Behavior | Status |
| :---: | :--- | :--- | :---: |
| **1** | Public access restrictions | Public visitors cannot access private student or staff endpoints. | `PASSED` |
| **2** | Ineligible freshman activation | Missing/inconsistent records fail verification without leaking student data. | `PASSED` |
| **3** | Eligible freshman activation | Successful verification, token dispatch, password setting, and username issuance. | `PASSED` |
| **4** | Token single-use enforcement | Previously used activation tokens cannot be reused. | `PASSED` |
| **5** | Username collision safety | Unique system usernames generated without collision (`dbu/ug/{year}/{seq}`). | `PASSED` |
| **6** | Ineligible senior activation | Senior student absent from Registrar-approved registry cannot activate. | `PASSED` |
| **7** | Dean batch upload & preview | Authorized Dean can upload, preview, and submit a senior enrollment batch. | `PASSED` |
| **8** | Unauthorized batch upload | Non-Dean users cannot upload or preview senior batches. | `PASSED` |
| **9** | Registrar batch approval | Registrar inspects pending batches and approves with atomic registry promotion. | `PASSED` |
| **10** | Unauthorized batch approval | Non-Registrar roles (Deans, Students) cannot approve batches. | `PASSED` |
| **11** | Separation of Duties | Submitting Dean cannot approve their own batch. | `PASSED` |
| **12** | Batch rejection safety | Rejected batches do not activate students or promote records. | `PASSED` |
| **13** | Duplicate import protection | Re-importing existing student IDs detects conflicts without creating duplicate records. | `PASSED` |
| **14** | Approved senior activation | Senior student approved in Scenario 9 can activate their account. | `PASSED` |
| **15** | Cross-organizational denial | Scoped Dean cannot import records for another college. | `PASSED` |
| **16** | Record modification security | Students cannot edit official enrollment fields directly; must submit correction requests. | `PASSED` |
| **17** | Service ticket lifecycle | Students submit service tickets and staff can update and resolve them. | `PASSED` |
| **18** | Access-Aware RAG retrieval | Private staff documents never leak to public AI queries. | `PASSED` |
| **19** | Grounded AI abstention | AI abstains and refers user to Registrar when evidence is missing. | `PASSED` |
| **20** | Prompt injection defense | Prompt injection attempts are sanitized and cannot override policies. | `PASSED` |
| **21** | Multilingual AI (Amharic) | AI assistant correctly detects and answers queries in Amharic. | `PASSED` |
| **22** | Immutable audit trail | Sensitive actions appear in audit logs with actor, action, and outcome. | `PASSED` |
| **23** | Session revocation | Logging out invalidates session tokens immediately. | `PASSED` |
| **24** | Approval workflow engine | Approval workflow instances execute audited state transitions. | `PASSED` |
| **25** | System health & references | Health and reference metadata endpoints return accurate DBU information. | `PASSED` |

---

## 4. Browser UI & Visual Interaction Verification

The application was run locally and verified using an automated browser subagent at `http://localhost:4000`:
- **Branding & Layout:** Verified responsive layout, navigation bar, hero card, academic calendar, and announcement cards.
- **Activation Tabs:** Verified tab switching between Freshman and Senior activation forms with input validation.
- **RAG AI Assistant Drawer:** Tested interactive chat drawer; verified source citations and grounded answers.
- **Browser Session Recording:** Saved in artifacts directory at:
  `C:/Users/ousma/.gemini/antigravity-ide/brain/d2ea3492-75a9-494b-a803-fcf72002fc0e/meri_dbu_ui_test_1791621866874.webp`
