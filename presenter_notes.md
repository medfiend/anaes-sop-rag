# Presenter Notes: AnaesSOP Clinical Governance Pitch
### *A Guideline to Securing Trust Approval for the Departmental Pilot*

Use these notes when presenting the slide deck or detailed business case to the Trust Clinical Governance Lead, Clinical Safety Officer (CSO), and IT Security Board. 

---

## 📣 General Pitch Strategy: "Safety & Efficiency First"
*   **The Mindset**: Governance leads are risk-averse. They care about two things: **reducing clinical error rates** and **protecting the Trust from regulatory liability**. 
*   **The Tone**: Position **AnaesSOP** not as a "cool tech app," but as a **clinical governance quality improvement (QI) tool** that reinforces existing policies, eliminates bed-side math errors under stress, and provides a clear audit trail.

---

## Slide 1: Point-of-Care Guideline Retrieval Friction
> **Visual Reference**: Slide 1 (Introduction)

*   **The Hook (Start here)**: 
    > *"Think about the last time you had a patient in an active crisis—like local anaesthetic toxicity in theatres or a pediatric resuscitation in ED. You need the exact dosing protocol, and you need it immediately. Today, that means leaving the bedside to find an open intranet terminal, typing in logins, and searching folder directories under intense stress. This bottleneck takes 3 to 5 minutes. In acute medicine, that delay is a clinical risk."*
*   **Key Talking Points**:
    *   **Intranet Friction**: Finding PDFs on intranets is slow, and they render in desktop-only formats which are unreadable on mobile phones without pinch-zooming.
    *   **Hallucination Hazard**: Clinicians are starting to use public AI tools like ChatGPT on shift to search guidelines or calculate drug doses. This is highly dangerous because public LLMs hallucinate math and decimals. We must provide a secure, department-controlled alternative.
*   **Handling Objections**:
    *   *Objection: "Why not just use our printed handbook binders?"*
    *   *Response*: Binders are physically tied to single locations (e.g. the anaesthetic prep room). If a crisis happens in MRI or CT, you don't have it. Binders also suffer from version lag when guidelines are updated.
*   **Transition CTA**:
    > *"But to put this on a clinician's phone, we must address the biggest governance question: clinical safety and software regulations. Let's look at how we've engineered safety into the calculator."*

---

## Slide 2: Clinical Safety & SaMD Qualification (NHS DCB0129)
> **Visual Reference**: Slide 2 (Regulatory Exemption)

*   **The Hook**:
    > *"Under MHRA guidelines, if software takes a patient's weight and outputs a single dynamic dose, it is legally classified as a Software as a Medical Device (SaMD). This requires CE/UKCA marking and exposes the Trust to regulatory liability. We have designed AnaesSOP to legally bypass this classification entirely."*
*   **Key Talking Points**:
    *   **MHRA Exemption (Passive Reference Pathway)**: The app replicates a physical booklet using a **Tape-Scroller Highlight Lookup**. We do not allow typing in weight parameters. 
    *   **Calculated at Ingestion**: All math is pre-compiled at 1kg intervals. The clinician scrolls to select the weight.
    *   **Adjacent Context**: Crucially, neighboring weights (above and below the selection) remain fully visible. The clinician can confirm the mathematical trend, satisfying the MHRA requirement for a human-in-the-loop, user-verifiable lookup.
*   **Handling Objections**:
    *   *Objection: "Is the math safe?"*
    *   *Response*: The calculations are pre-validated during build-time against official department sheets. Every calculator output displays a direct link to open the source guideline PDF, ensuring clinicians can instantly verify the source.
*   **Transition CTA**:
    > *"By ensuring clinical safety, we've also addressed the second pillar of DTAC: technical security and data privacy on the edge."*

---

## Slide 3: Technical Security & Data Governance (NHS DTAC)
> **Visual Reference**: Slide 3 (Technical Security)

*   **The Hook**:
    > *"Because we are deploying this at the edge, data security is non-negotiable. We have built the system to align strictly with the NHS Digital Technology Assessment Criteria (DTAC) and tested it against OWASP API vulnerability benchmarks."*
*   **Key Talking Points**:
    *   **Cryptographic Signature Verification**: We've implemented RS256 signature verification on the Cloudflare Edge Worker. The worker checks Clerk JWT signatures using native SubtleCrypto APIs, rejecting unauthenticated requests.
    *   **R2 Isolation**: Directory listing is disabled at the bucket level. Parameters are validated using strict regex to block path traversal (`..`, `/`, `\`) or wildcard listings, enforcing single-file constraints.
    *   **Zero Patient Data (PII)**: The system only processes public PDF guidelines and phone extensions. No patient data ever enters the system, which simplifies GDPR compliance.
*   **Handling Objections**:
    *   *Objection: "Can hackers inject fake guidelines?"*
    *   *Response*: No. The edge workers require a cryptographically verified token. Only whitelisted Trust administrators signed in via secure NHS accounts can access the upload route.
*   **Transition CTA**:
    > *"This secure framework allows us to deliver powerful operational tools directly to our department."*

---

## Slide 4: Operational Impact & QI Tools
> **Visual Reference**: Slide 4 (Operational Impact)

*   **The Hook**:
    > *"Beyond guideline search, AnaesSOP functions as a quality improvement tool, allowing the governance team to keep guidelines active and measure departmental compliance."*
*   **Key Talking Points**:
    *   **Version Expiry Reminders**: The system tracks guidelines and flags them 60 days before they expire, ensuring the library remains current.
    *   **Clinical Gap Analysis**: It matches the local guideline index against national standards (AAGBI, Resus Council) to identify compliance gaps.
    *   **Emergency Bypass**: Critical crisis protocols bypass all login walls, loading in under 3 seconds to save vital time.
    *   **Geofenced Phonebook**: Auto-filters switchboard page extensions based on device GPS, allowing tap-to-dial for immediate escalation.
*   **Transition CTA**:
    *   > *"To deploy this securely, we've designed a structured, phased implementation roadmap."*

---

## Slide 5: Pilot Implementation Plan
> **Visual Reference**: Slide 5 (Pilot Roadmap)

*   **The Hook**:
    > *"We are not proposing a hospital-wide rollout today. We are proposing a controlled, 8-week pilot within our department to gather usability metrics and verify safety before requesting trust-wide expansion."*
*   **Key Talking Points**:
    *   **Phase 1-2 (Weeks 1-4)**: Scope, content ingestion, and secure sandbox testing using a whitelist.
    *   **Phase 3 (Weeks 5-8)**: Roll out the Progressive Web App (PWA) to 20-30 registrars and consultants, capturing bedside usability data.
    *   **Evaluation (Week 9+)**: Present Mean Time to Information Retrieval (MTIR) and feedback metrics to show measurable efficiency gains.
*   **Transition CTA**:
    > *"To launch this 8-week pilot, we need a few key decisions and approvals from you today. Let's look at the gating checklist."*

---

## Slide 6: Governance Decisions & Gating
> **Visual Reference**: Slide 6 (Governance Gating)

*   **The Hook (The Close)**: 
    > *"To get this pilot off the ground, we have five specific, actionable gating items that need input from clinical leadership:"*
*   **Key Talking Points (Go through each one clearly)**:
    1.  **CSO Sign-Off**: We need to designate a consultant to act as Clinical Safety Officer to review and sign off the safety log.
    2.  **Guideline Scope**: We recommend starting with 10-15 core guidelines (e.g. ALS, LA Toxicity, Hyperthermia). We need input on which departmental SOPs to prioritize next.
    3.  **Phonebook Verification**: We need to confirm that emergency pager bleep codes and dialing prefixes are accurate in our geofenced contact list.
    4.  **Auth Domains Whitelist**: Confirm that registration is restricted strictly to `@nhs.net` and local Trust email domains during the pilot.
    5.  **Hosting Approval**: Approve the serverless edge sandbox hosting on Cloudflare UK edge servers for the duration of the pilot.
*   **Final Closing Statement**:
    > *"With your approval on these gating items, we can launch the sandbox phase next week and begin saving critical time at the bedside. What are your thoughts on starting the scoping phase?"*
