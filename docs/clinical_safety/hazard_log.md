# AnaesSOP — Hazard Log (DCB0129)

| Document | Hazard Log |
|---|---|
| System | AnaesSOP — Anaesthetic Clinical Governance Database (pilot) |
| Standard | DCB0129: Clinical Risk Management — Manufacture of Health IT Systems |
| Status | DRAFT — pending review by nominated Clinical Safety Officer (CSO) |
| Last updated | 2026-06-10 |

Risk scoring: Likelihood (1 = very low … 5 = very high) × Severity
(1 = minor … 5 = catastrophic/death). Residual risk is after mitigations.

> NOTE: initial likelihood/severity scores below are the development team's
> first-pass estimates and MUST be ratified or amended by the CSO.

---

## HAZ-01 — Wrong guideline returned for a clinical query

- **Effect:** Clinician acts on a protocol that does not apply to their patient.
- **Possible causes:** keyword search ranks an irrelevant document highest;
  ambiguous query; similar guideline titles.
- **Severity:** 4 | **Initial likelihood:** 3
- **Mitigations (implemented):**
  - Honest qualitative match labels ("strong/partial/weak keyword match")
    instead of fabricated confidence percentages (`app/hooks/useSearch.ts`).
  - Weak matches display an explicit verification warning and offer the
    grounded deep-AI search instead.
  - Every result links the full source PDF at the cited page; title and
    version are always displayed.
  - Negative results state plainly that no guideline matched rather than
    guessing ("zero-hallucination" fallback in `/api/search`).
- **Residual risk:** 2 × 4 — clinician verification against the named source
  PDF remains the control. ACCEPT pending CSO review.

## HAZ-02 — Dose calculator produces an incorrect dose

- **Effect:** Wrong drug dose calculated and potentially administered.
- **Possible causes:** LLM generates a wrong formula during ingestion; formula
  evaluation bug; user reads the wrong row.
- **Severity:** 5 | **Initial likelihood:** 3
- **Mitigations (implemented):**
  - **Human approval gate:** dynamically generated calculators are hidden from
    clinicians until an admin verifies outputs against the source PDF in the
    sandbox and approves them; approval/revocation is recorded in the D1
    audit log with email + timestamp (`/api/calculator-approval`).
  - Formulas are evaluated by a restricted parser (`lib/safeFormula.ts`) —
    no arbitrary code execution; invalid formulas render as "Error", never as
    a number.
  - Unit tests cover the dexmedetomidine IBW/AdjBW chain and AVOID outputs
    (`tests/safeFormula.test.ts`).
  - Passive reference matrix design: the scrolling weight table shows adjacent
    rows so a clinician can visually verify the dose trend (per-row
    cross-checking instruction displayed in the widget).
  - The widget displays a DCB0129 alert instructing cross-reference before
    administration.
- **Residual risk:** 2 × 5 — verification at approval time plus bedside
  cross-check. ACCEPT pending CSO review.

## HAZ-03 — Out-of-date guideline presented as current

- **Effect:** Care follows a superseded or expired protocol.
- **Possible causes:** superseded version still indexed; review date passed
  without re-validation; stale client-side cache (localStorage / service
  worker / pinned offline PDFs).
- **Severity:** 4 | **Initial likelihood:** 3
- **Mitigations (implemented):**
  - Superseding workflow marks replaced guidelines and excludes them from
    search indexing.
  - Review-date governance dashboard: admin panel flags guidelines overdue or
    within 90 days of review, with owner contact guidance.
  - Stale-while-revalidate cache refreshes the guideline list from the network
    on every app load; version and next-review date are displayed on every
    guideline summary.
- **Mitigations (outstanding):** automated owner reminders; explicit "cached
  copy — last refreshed at HH:MM" banner when offline.
- **Residual risk:** 2 × 4. ACCEPT pending CSO review; revisit after pilot.

## HAZ-04 — LLM-generated summary misrepresents the source guideline

- **Effect:** Summary omits a contraindication or distorts an instruction.
- **Possible causes:** compilation model (Llama-3-8b) summarisation error;
  long PDFs truncated to fallback summarisation.
- **Severity:** 4 | **Initial likelihood:** 3
- **Mitigations (implemented):**
  - Source PDF is one tap away from every summary and citation (deep-linked
    to the relevant page from per-page text matching at ingestion).
  - Deep AI search answers are grounded: instructed to answer ONLY from
    guideline text, with an explicit "cannot find" refusal path.
- **Mitigations (outstanding):** owner review/sign-off step for compiled
  summaries (mirroring the calculator gate) before a guideline goes live.
- **Residual risk:** 3 × 4 — HIGHEST residual on the log. Mitigation plan:
  extend the approval gate to summaries; track in backlog.

## HAZ-05 — Emergency protocol unavailable when needed (availability failure)

- **Effect:** Delay accessing crisis algorithm (LA toxicity, MH, ALS) during
  an emergency.
- **Possible causes:** network outage; auth outage; hosting failure.
- **Severity:** 4 | **Initial likelihood:** 2
- **Mitigations (implemented):**
  - Zero-authentication emergency portal: crisis algorithms reachable with no
    login; QRH handbook served as a static public asset.
  - PWA service worker caches the app shell and pinned guideline PDFs for
    offline use; offline fallback page renders if navigation fails.
  - Static guideline dataset is bundled in the client as a search failover.
- **Residual risk:** 1 × 4 — hardcopy QRH remains the departmental ultimate
  fallback. ACCEPT.

## HAZ-06 — Unauthorized modification of clinical content

- **Effect:** Malicious or accidental publication/alteration of guidelines.
- **Possible causes:** ingest endpoint abuse; weak authorization.
- **Severity:** 5 | **Initial likelihood:** 2
- **Mitigations (implemented):**
  - Ingest worker requires the backend shared secret, the demo passcode, or
    an allowlisted admin JWT; the Next.js upload route enforces admin checks
    before forwarding.
  - NHS email-domain policy enforced server-side on all authenticated routes.
  - Every upload/publish/approval writes an audit_logs row (who/what/when).
  - Security headers and strict CSP on all responses.
- **Residual risk:** 1 × 5. ACCEPT pending CSO review.

## HAZ-07 — Wrong patient-context data entry into calculator

- **Effect:** Correct formula, wrong inputs (e.g. lb vs kg, height vs weight).
- **Severity:** 4 | **Initial likelihood:** 3
- **Mitigations (implemented):** input ranges clamped (min/max per schema);
  units displayed on every input and output row; adjacent-row trend
  verification design.
- **Mitigations (outstanding):** absurd-value warnings (e.g. BMI > 60);
  paediatric/adult range guards per calculator.
- **Residual risk:** 2 × 4. Revisit after pilot usability data.

## HAZ-08 — Stale or wrong contact reached via Trust Phonebook

- **Effect:** Delay contacting the right clinician in an urgent situation.
- **Severity:** 3 | **Initial likelihood:** 3
- **Mitigations (implemented):** switchboard number always shown as fallback;
  per-site filtering with explicit site labels; directory served from the
  authenticated API so corrections deploy centrally.
- **Mitigations (outstanding):** dated "directory last updated" stamp; owner
  for directory updates.
- **Residual risk:** 2 × 3. ACCEPT.

---

## Review & sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| Clinical Safety Officer | _pending_ | | |
| Departmental Guideline Lead | _pending_ | | |
| Developer | S. Parashar | | 2026-06-10 |
