# AnaesSOP — Clinical Safety Case Report (DCB0129)

| Field | Value |
|---|---|
| System | AnaesSOP — Anaesthetic Clinical Governance Database |
| Release | Pilot (single department, St George's anaesthetics) |
| Standard | DCB0129 (manufacture); deployment Trust to address DCB0160 |
| Status | DRAFT — requires nominated Clinical Safety Officer review |
| Companion document | [hazard_log.md](./hazard_log.md) |
| Date | 2026-06-10 |

## 1. Purpose and scope

This report summarises the clinical risk management activity for the AnaesSOP
pilot: a guideline retrieval and reference application for anaesthetists. It
argues that the residual clinical risk of deploying the pilot, within the
stated intended use, is acceptable, subject to CSO ratification.

**In scope:** guideline search and display, emergency protocol quick access,
dose-calculator reference matrices, trust phonebook, offline pinning, admin
ingestion/governance workflows.

**Out of scope:** the clinical content of the guidelines themselves (owned by
the department's governance process); the deploying Trust's DCB0160
obligations.

## 2. Intended use and clinical claims

AnaesSOP is a **reference and retrieval aid**. It is intended to reduce the
time to locate departmental guidance that clinicians could otherwise locate
manually (shared drives, hardcopy QRH). It makes **no autonomous clinical
decisions** and presents **passive reference matrices**, not patient-specific
prescriptions:

- Search returns departmental documents with qualitative match labels; it
  never synthesises clinical advice outside retrieved guideline text.
- Dose calculators display weight-banded reference tables derived from
  formulas in the source SOP, with the source PDF one tap away; they require
  human verification (admin approval gate) before publication and instruct
  bedside cross-checking before administration.
- The hardcopy QRH and departmental processes remain the authoritative
  fallback at all times.

On this basis the system is positioned as clinical information retrieval
software analogous to a digital guideline binder (SaMD-exemption rationale
to be confirmed by the CSO; if dose calculators are judged to constitute
decision support, MHRA SaMD guidance must be revisited before scale-up).

## 3. Clinical risk management system

- Hazards identified by structured walkthrough of each user journey
  (search → result → PDF; calculator input → output; offline access; admin
  ingestion) and recorded in the hazard log with scores, mitigations, and
  residual risk.
- Mitigations are traced to code: each hazard lists the implementing module.
- Changes affecting clinical behaviour (search ranking, calculator
  evaluation, ingestion compilation) require hazard-log review as part of the
  change process.

## 4. Key engineering controls (summary)

| Control | Implementation |
|---|---|
| Calculator approval gate + audit | `/api/calculator-approval`, admin sandbox, D1 audit_logs |
| Restricted formula evaluation (no code execution) | `lib/safeFormula.ts` + unit tests |
| Honest relevance labelling (no fabricated confidence) | `app/hooks/useSearch.ts` |
| Grounded AI answers with refusal path | `/api/search` system prompt |
| Page-accurate source citations | per-page extraction at upload, worker page mapping |
| Superseding & review-date governance | admin dashboard, status flags, SWR refresh |
| Access control (NHS domain, admin roles, ingest secret) | `lib/authGuard.ts`, worker auth |
| Output sanitisation (XSS) | `lib/markdownFormat.ts` |
| Emergency availability (zero-auth, offline PWA) | public QRH, service worker, pinning |

## 5. Testing summary

- Unit tests: formula evaluator including dependent-calculation chains,
  boundary behaviours and injection rejection (`npm test`).
- Type checking enforced at build (`next build` fails on TS errors).
- MTIR simulation study harness measures retrieval time/success vs baseline.
- Outstanding: end-to-end smoke tests; structured UAT script for pilot users.

## 6. Residual risk statement

All hazards on the log have residual scores ≤ 8 (likelihood × severity) with
HAZ-04 (LLM summary misrepresentation, 12) the highest and carrying a defined
mitigation plan (extend the approval gate to compiled summaries). Subject to
CSO ratification of scores and the HAZ-04 plan, the residual clinical risk of
the pilot deployment is judged acceptable for a single-department pilot with
clinician verification controls in place.

## 7. Sign-off

| Role | Name | Date | Decision |
|---|---|---|---|
| Clinical Safety Officer | _pending_ | | |
| Departmental Clinical Governance Lead | _pending_ | | |
