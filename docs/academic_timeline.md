# Academic Portfolio & Clinical Governance Pipeline
## Multi-Conference Submission Roadmap (2026-2027)

This roadmap documents our timeline, codebase alignment, and assigned tasks for the clinical study submissions of the AnaesSOP project. By establishing empirical metrics (Mean Time to Information Retrieval - MTIR) and tracking governance frameworks, this pipeline supports academic dissemination and NHS-wide scaling audits.

---

## 1. SALG Patient Safety Conference 2026
* **Submission Deadline**: Late August / Early September 2026
* **Focus Area**: Active Gap Analysis & Automated Review-Date Safeguards
* **Core Hypothesis**: Automating guideline expiry warnings and mapping clinical inventory against national standards reduces the administrative burden and prevents the bedside use of outdated policies.

### Codebase Alignment & Target Files
* **Gap Analysis Dashboard**: Located in the `gaps` tab of [app/admin/page.tsx](file:///c:/Users/Sid/Documents/NHS%20Employment/Anaesthetics/ST4%20Anaesthesia/SOP%20RAG/app/admin/page.tsx), matching existing files against guidelines.
* **Review Cycle Reminders**: Supported by publication metadata stored in D1 and defined in [lib/supabaseClient.ts](file:///c:/Users/Sid/Documents/NHS%20Employment/Anaesthetics/ST4%20Anaesthesia/SOP%20RAG/lib/supabaseClient.ts) (fields: `date_next_review`, `owner_email`, `status`).

### Assigned Tasks & Timeline
* [ ] Integrate automated cron-triggered check scripts that run daily, identifying any guideline within 30 days of expiry.
* [ ] Implement an automatic SMTP reminder email trigger to guideline owners (`owner_email`) when review cycle hashes lapse.
* [ ] Expand the national guidelines gap checklist (AAGBI, Resus Council) from mock entries to a configurable database table.

---

## 2. Association of Anaesthetists WSM 2027
* **Submission Deadline**: September 2, 2026
* **Focus Area**: Hard Quantitative MTIR Simulation Data for Journal Publication
* **Core Hypothesis**: Clinicians utilizing AnaesSOP's offline-first, grounded RAG search locate critical emergency protocols (e.g. Local Anaesthetic Toxicity, Malignant Hyperthermia) significantly faster and with higher dosing accuracy than those using traditional desktop intranet PDF directories.

### Codebase Alignment & Target Files
* **Simulation API endpoint**: [app/api/analytics/mtir/route.ts](file:///c:/Users/Sid/Documents/NHS%20Employment/Anaesthetics/ST4%20Anaesthesia/SOP%20RAG/app/api/analytics/mtir/route.ts)
* **Statistical CLI Analyzer**: `pipeline/mtir_simulation.ts`
* **Baseline Trial Entry UI**: Tab `'mtir'` in [app/admin/page.tsx](file:///c:/Users/Sid/Documents/NHS%20Employment/Anaesthetics/ST4%20Anaesthesia/SOP%20RAG/app/admin/page.tsx)

### Assigned Tasks & Timeline
* [x] Build the anonymous simulation logging database tables and Next.js POST/GET endpoint.
* [ ] Recruit a trial cohort of 20 anaesthetic registrars. Segment participants by experience level (`ST3`, `ST4`, `ST5-7`, `Consultant`).
* [ ] Administer 3 clinical lookup scenarios (e.g., Dexmedetomidine Adjusted Body Weight dosing) across both arms:
  * **Control Arm (Baseline)**: Traditional intranet lookup. Evaluator records metrics manually.
  * **Intervention Arm (App)**: Search via AnaesSOP. App logs lookup timings and accuracy telemetry automatically.
* [ ] Run `pipeline/mtir_simulation.ts --analyze` to calculate means, standard deviations, speedup factors, and confidence intervals for abstract tables.

---

## 3. Bristol Patient Safety Conference 2027
* **Submission Deadline**: Early March 2027
* **Focus Area**: The Scalable NHS Departmental Implementation Blueprint
* **Core Hypothesis**: A Progressive Web App (PWA) with client-side indexing and geofenced directory filters can be rapidly configured and scaled across distinct NHS hospital trusts with minimal server costs and zero configuration on end-user mobile devices.

### Codebase Alignment & Target Files
* **Offline Service Workers & Caching**: Configured in `next.config.js` and `app.json` for offline basement theatre use.
* **Geofenced Sites Setup**: Defined in [lib/sitesConfig.ts](file:///c:/Users/Sid/Documents/NHS%20Employment/Anaesthetics/ST4%20Anaesthesia/SOP%20RAG/lib/sitesConfig.ts) to filter directory lists by current GPS coordinates.

### Assigned Tasks & Timeline
* [ ] Conduct site connectivity audits (e.g., verifying 100% offline capability inside lead-lined MRI scanning suites).
* [ ] Document a step-by-step trust deployment playbook: uploading hospital extension numbers, geofence coordinates, and embedding local guideline directories.
* [ ] Present the cost-effectiveness audit showing near-zero monthly maintenance costs when hosted on serverless infrastructure.
