export interface Env {
  AI: any;
  R2_BUCKET: any;
  D1_DATABASE: any;
  CLERK_JWKS_URL?: string;
  DEMO_MODE?: string;
  DEMO_PASSCODE?: string;
  /** Shared secret for trusted server-to-server calls from the Next.js backend. */
  WORKER_SHARED_SECRET?: string;
  /** Comma-separated list of admin emails permitted to ingest via direct JWT. */
  ADMIN_EMAILS?: string;
}

// Helper functions for JWT verification on the Edge using Web Crypto APIs

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  try {
    return atob(base64);
  } catch (err) {
    throw new Error('Base64url decoding failed');
  }
}

function base64UrlDecodeToBytes(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (err) {
    throw new Error('Base64url byte decoding failed');
  }
}

// In-memory cache for JWKS keys to avoid repeating fetch calls
let cachedJwks: any = null;
let cachedJwksTimestamp = 0;
const JWKS_CACHE_TTL = 3600 * 1000; // 1 hour

async function fetchJwks(jwksUrl: string): Promise<any> {
  const now = Date.now();
  if (cachedJwks && (now - cachedJwksTimestamp < JWKS_CACHE_TTL)) {
    return cachedJwks;
  }
  const res = await fetch(jwksUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS keys from ${jwksUrl}`);
  }
  const jwks = await res.json();
  cachedJwks = jwks;
  cachedJwksTimestamp = now;
  return jwks;
}

interface ClerkJwtPayload {
  sub: string;
  exp: number;
  nbf?: number;
  email?: string;
  [key: string]: any;
}

async function verifyClerkJwt(token: string, env: Env): Promise<ClerkJwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('JWT must consist of three parts (header, payload, signature).');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  
  let header: any;
  try {
    header = JSON.parse(base64UrlDecode(headerB64));
  } catch (err) {
    throw new Error('Failed to parse JWT header.');
  }

  if (header.alg !== 'RS256') {
    throw new Error('Unsupported JWT signing algorithm. Only RS256 is supported.');
  }

  const kid = header.kid;
  if (!kid) {
    throw new Error('Missing kid (Key ID) in JWT header.');
  }

  let payload: ClerkJwtPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch (err) {
    throw new Error('Failed to parse JWT payload.');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp && nowSeconds >= payload.exp) {
    throw new Error('JWT token has expired.');
  }

  if (payload.nbf && nowSeconds < payload.nbf) {
    throw new Error('JWT token is not active yet.');
  }

  const jwksUrl = env.CLERK_JWKS_URL || 'https://upright-goblin-40.clerk.accounts.dev/.well-known/jwks.json';
  const jwks = await fetchJwks(jwksUrl);

  const jwk = jwks.keys?.find((k: any) => k.kid === kid);
  if (!jwk) {
    throw new Error(`Matching JWK key with kid "${kid}" not found in JWKS.`);
  }

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' }
    },
    false,
    ['verify']
  );

  const dataBytes = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64UrlDecodeToBytes(signatureB64);

  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBytes,
    dataBytes
  );

  if (!isValid) {
    throw new Error('JWT signature is invalid.');
  }

  return payload;
}

function createSecureResponse(body: string | Uint8Array, status: number, contentType = 'application/json', extraHeaders: Record<string, string> = {}): Response {
  const headers = new Headers({
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; sandbox;",
    'Referrer-Policy': 'no-referrer',
    ...extraHeaders
  });
  return new Response(body, { status, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Only accept POST requests on the /ingest path
    if (request.method !== "POST" || url.pathname !== "/ingest") {
      return createSecureResponse("Not Found. POST to /ingest is required.", 404, 'text/plain');
    }

    // Authorization Guard.
    // Ingestion publishes live clinical guidelines, so a signed-in user is NOT
    // enough — the caller must be one of:
    //   1. Demo mode passcode bearer (pilot demo deployments only)
    //   2. The trusted Next.js backend, via the X-Worker-Secret shared secret
    //   3. A Clerk JWT whose verified email claim is on the admin allowlist
    const authHeader = request.headers.get("Authorization") || request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;
    const workerSecret = request.headers.get("X-Worker-Secret");

    const adminEmails = (env.ADMIN_EMAILS || 'audit.lead@nhs.net,s.parashar1@nhs.net')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    let isAuthorized = false;
    let authErrorMsg = '';

    if (env.DEMO_MODE === 'true' && env.DEMO_PASSCODE && token === env.DEMO_PASSCODE) {
      // 1. Demo Mode Bypass
      console.log("[CF WORKER AI] Authorization granted via Demo Passcode.");
      isAuthorized = true;
    } else if (env.WORKER_SHARED_SECRET && workerSecret === env.WORKER_SHARED_SECRET) {
      // 2. Trusted backend (the Next.js /api/upload route enforces requireAdmin)
      console.log("[CF WORKER AI] Authorization granted via backend shared secret.");
      isAuthorized = true;
    } else if (token) {
      // 3. Direct Clerk JWT — must verify AND carry an allowlisted admin email claim
      try {
        const payload = await verifyClerkJwt(token, env);
        const claimEmail = (payload.email || (payload as any).email_address || '').toLowerCase();
        if (claimEmail && adminEmails.includes(claimEmail)) {
          console.log(`[CF WORKER AI] JWT verified for admin. sub: ${payload.sub}`);
          isAuthorized = true;
        } else {
          authErrorMsg = 'Token is valid but does not belong to an authorized admin.';
        }
      } catch (err: any) {
        authErrorMsg = err.message || 'Verification failed';
        console.error("[CF WORKER AI] JWT Verification error:", authErrorMsg);
      }
    } else {
      authErrorMsg = 'Missing or malformed Authorization header.';
    }

    if (!isAuthorized) {
      return createSecureResponse(JSON.stringify({ error: `Unauthorized: ${authErrorMsg}` }), 401);
    }

    try {
      // 1. Parse JSON body payload
      const body = await request.json() as any;
      const {
        documentId,
        name,
        version,
        ownerEmail,
        changelog,
        nextReview,
        isEmergency,
        isReplacement,
        supersedesId,
        fileKey,
        rawText
      } = body;

      if (!documentId || !name || !rawText) {
        return createSecureResponse(JSON.stringify({ error: "Missing required fields (documentId, name, rawText)" }), 400);
      }

      // Input validation & Path traversal protection on documentId to enforce single-file constraints
      if (typeof documentId !== 'string' || documentId.includes('..') || documentId.includes('/') || documentId.includes('\\') || /[*?%#$:;]/.test(documentId)) {
        return createSecureResponse(JSON.stringify({ error: "Invalid documentId parameter." }), 400);
      }

      console.log(`[CF WORKER AI] Starting compilation for: ${name} (${documentId})`);

      // 2. Perform layout section parsing using LLM
      const systemPrompt = `You are a clinical database compiler. Parse this clinical guideline text and compile it into a structured JSON object containing up to 5 of the most critical clinical considerations, steps, warnings, or dosing instructions.

Your JSON structure MUST follow this schema:
{
  "summaryText": "Provide a comprehensive clinical summary of the key aspects of the entire guidance, structured in a highly useful manner with bullet points and clear warnings (avoiding raw PDF filler text). Use markdown for layout and formatting.",
  "records": [
    {
      "title": "Clean, descriptive title of this clinical section or step",
      "context": "Concise, bulleted clinical instructions, formulas, parameters, dosages, or checklist items for this section (limit to 150 words).",
      "summaryText": "A brief clinical summary of this specific section.",
      "synonyms": ["abbreviation", "clinical synonyms", "search keywords", "drug names"],
      "breadcrumbs": ["${name}", "Section Name"]
    }
  ],
  "calculator": null
}

If the guideline specifies demographic-based drug dosing guidelines, adjustments, infusion rates, or calculations (e.g. weight-based or age-based adjustments for drugs like dexmedetomidine, paracetamol, ibuprofen, diclofenac, morphine, dihydrocodeine, omeprazole, ondansetron, oromorph, etc.), you MUST dynamically generate an interactive calculator schema under the "calculator" field instead of null.
The calculator schema MUST have this structure:
{
  "calculator_name": "Descriptive title of the dose calculator (e.g., Paediatric Posterior Fossa Post-Op Analgesia Calculator)",
  "inputs": [
    {
      "id": "weight",
      "label": "Actual Body Weight (kg)",
      "type": "number",
      "defaultValue": 15,
      "min": 2,
      "max": 120
    }
  ],
  "calculations": [
    {
      "id": "paracetamol_dose",
      "label": "Paracetamol IV/PO Dose (15 mg/kg QDS)",
      "formula": "weight * 15",
      "unit": "mg"
    }
  ]
}

Ensure all formulas are valid, safe JavaScript mathematical expressions using ONLY input variables from the inputs array (like 'weight', 'age', etc.), standard operators (+, -, *, /), Math methods (like Math.ceil, Math.round), and ternary condition statements (like 'weight >= 20 ? 20 : 10'). No complex scripts.
Output only the raw JSON. Do not wrap in markdown code blocks.`;

      const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: rawText }
        ]
      });

      let sections: any[] = [];
      let calculator: any = null;
      let summaryText = "";

      if (aiResponse && aiResponse.response) {
        try {
          const cleanedText = aiResponse.response.trim().replace(/^```json\s*/i, '').replace(/```$/, '');
          const parsed = JSON.parse(cleanedText);
          summaryText = parsed.summaryText || "";
          if (parsed.records) {
            sections = parsed.records;
            calculator = parsed.calculator || null;
          } else if (Array.isArray(parsed)) {
            sections = parsed;
          }
        } catch (err) {
          console.error("AI response parsing error, trying regex extract:", err);
          try {
            const matchesObj = aiResponse.response.match(/\{[\s\S]*\}/)?.[0];
            if (matchesObj) {
              const parsed = JSON.parse(matchesObj);
              summaryText = parsed.summaryText || "";
              sections = parsed.records || [];
              calculator = parsed.calculator || null;
            }
          } catch (regErr) {
            console.error("Regex parsing fallback failed:", regErr);
          }
        }
      }

      // 2.5 Robust text summary fallback if JSON parsing failed
      if (sections.length === 0) {
        console.log(`[CF WORKER AI] JSON extraction failed. Running robust text summary fallback model...`);
        try {
          const fallbackPrompt = `You are a clinical audit lead. Summarize the key clinical considerations, instructions, warnings, and dosing guidelines from this clinical document: "${name}".
Provide 3 to 5 distinct clinical categories or steps. For each category/step, output the category name prefixed with "SECTION:" on its own line, followed by concise clinical instructions as bullet points.

Example format:
SECTION: Patient Assessment
- Assess airway patency and administer high-flow oxygen.
- Confirm patient weight for dose calculations.

SECTION: Dosing and Infusion Setup
- Initial loading dose is 1 mcg/kg over 10 minutes.
- titration to Ramsay Sedation Scale of 2 or 3.

Do not include any intro, outro, or markdown code blocks. Summarize this text:
${rawText.substring(0, 12000)}`;

          const fallbackResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
            messages: [
              { role: 'user', content: fallbackPrompt }
            ]
          });

          if (fallbackResponse && fallbackResponse.response) {
            const lines = fallbackResponse.response.split('\n');
            let currentTitle = "";
            let currentBullets: string[] = [];
            const parsedRecords: any[] = [];

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith("SECTION:")) {
                if (currentTitle && currentBullets.length > 0) {
                  parsedRecords.push({
                    title: currentTitle,
                    context: currentBullets.join('\n'),
                    summaryText: currentTitle,
                    synonyms: [name.toLowerCase().replace(/\s+/g, '-')],
                    breadcrumbs: [name, currentTitle]
                  });
                }
                currentTitle = trimmed.substring(8).trim();
                currentBullets = [];
              } else if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
                currentBullets.push(trimmed);
              } else if (trimmed.length > 0) {
                if (currentTitle) {
                  currentBullets.push(trimmed);
                }
              }
            }

            if (currentTitle && currentBullets.length > 0) {
              parsedRecords.push({
                title: currentTitle,
                context: currentBullets.join('\n'),
                summaryText: currentTitle,
                synonyms: [name.toLowerCase().replace(/\s+/g, '-')],
                breadcrumbs: [name, currentTitle]
              });
            }

            if (parsedRecords.length > 0) {
              sections = parsedRecords;
              summaryText = `### Key SOP Considerations for ${name}\n\n` + parsedRecords.map(r => `**${r.title}**\n${r.context}`).join('\n\n');
            }
          }
        } catch (fallbackErr) {
          console.error("Text summary fallback failed:", fallbackErr);
        }
      }

      // Hard fallback if everything failed
      if (sections.length === 0) {
        sections = [
          {
            title: `${name} - Core Guidance`,
            context: rawText.substring(0, 1500) + (rawText.length > 1500 ? "\n\n[Content truncated. Please refer to the source PDF document for complete details.]" : ""),
            summaryText: `Auto-extracted content from ${name}.`,
            synonyms: [name.toLowerCase().replace(/\s+/g, '-')],
            breadcrumbs: [name, "Core Guidance"]
          }
        ];
      }

      // Fallback calculator for Dexmedetomidine if not generated by LLM
      const lowerText = rawText.toLowerCase();
      if (!calculator && (lowerText.includes("dexmedetomidine") || lowerText.includes("dexmed"))) {
        console.log("[CF WORKER AI] Injecting default Dexmedetomidine calculator schema...");
        calculator = {
          "calculator_name": "Dexmedetomidine AFOI Sedation Calculator",
          "inputs": [
            {
              "id": "gender",
              "label": "Gender",
              "type": "select",
              "defaultValue": "Male",
              "options": ["Male", "Female"]
            },
            {
              "id": "height",
              "label": "Height (cm)",
              "type": "number",
              "defaultValue": 170,
              "min": 100,
              "max": 220
            },
            {
              "id": "weight",
              "label": "Actual Weight (kg)",
              "type": "number",
              "defaultValue": 70,
              "min": 30,
              "max": 200
            }
          ],
          "calculations": [
            {
              "id": "ibw",
              "label": "Ideal Body Weight (IBW)",
              "formula": "gender === 'Male' ? 50 + 0.9 * (height - 152) : 45.5 + 0.9 * (height - 152)",
              "unit": "kg"
            },
            {
              "id": "bmi",
              "label": "Body Mass Index (BMI)",
              "formula": "weight / ((height/100) * (height/100))",
              "unit": "kg/m²"
            },
            {
              "id": "dosing_weight",
              "label": "Calculated Dosing Weight (ABW if BMI < 30, AdjBW if BMI > 30)",
              "formula": "bmi > 30 ? ibw + 0.4 * (weight - ibw) : weight",
              "unit": "kg"
            },
            {
              "id": "loading_dose",
              "label": "Loading Dose (1 mcg/kg over 10-15 min)",
              "formula": "dosing_weight * 1",
              "unit": "mcg"
            },
            {
              "id": "infusion_rate_low",
              "label": "Maintenance Infusion Rate (0.2 mcg/kg/h)",
              "formula": "dosing_weight * 0.2",
              "unit": "mcg/h"
            },
            {
              "id": "infusion_rate_high",
              "label": "Maintenance Infusion Rate (0.7 mcg/kg/h)",
              "formula": "dosing_weight * 0.7",
              "unit": "mcg/h"
            }
          ]
        };
      }

      if (!summaryText) {
        summaryText = `### Clinical Overview for ${name}\n\nThis guideline provides Standard Operating Procedures and clinical protocols for ${name}. Review version ${version || 'v1.0.0'} and discuss details with the clinical owner.`;
      }

      // 3. Generate Qwen 1024-dimensional embeddings for each section
      const compiledSections = [];
      for (const section of sections) {
        const textToEmbed = `${section.title} ${section.context} ${section.synonyms ? section.synonyms.join(' ') : ''}`;
        let embeddingVector = Array(1024).fill(0);

        try {
          const embedRes = await env.AI.run('@cf/qwen/qwen3-embedding-0.6b', {
            text: [textToEmbed]
          });
          if (embedRes && embedRes.data?.[0]) {
            embeddingVector = embedRes.data[0];
          }
        } catch (embedErr) {
          console.error("Failed to generate embedding for section:", section.title, embedErr);
        }

        compiledSections.push({
          ...section,
          masterVector: embeddingVector
        });
      }

      const finalFileKey = fileKey || `guidelines/${documentId}_guideline.pdf`;

      // Validation on compiled file key to prevent directory manipulation
      if (finalFileKey.includes('..') || /[*?%#$:;]/.test(finalFileKey)) {
        return createSecureResponse(JSON.stringify({ error: "Invalid fileKey parameter." }), 400);
      }

      // 4. Compile the final Orama guidelinesMaster JSON payload
      const guidelinesMaster = {
        documentId,
        name,
        version: version || "v1.0.0",
        ownerEmail: ownerEmail || "audit.lead@nhs.net",
        changelog: changelog || "Initial upload",
        nextReview: nextReview || "",
        isEmergency: !!isEmergency,
        fileKey: finalFileKey,
        compiledAt: new Date().toISOString(),
        records: compiledSections,
        calculator: calculator
      };

      // Compile the lightweight summary JSON payload
      const guidelinesSummary = {
        id: documentId,
        name,
        version: version || "v1.0.0",
        owner_email: ownerEmail || "audit.lead@nhs.net",
        changelog: changelog || "Initial upload",
        date_published: new Date().toISOString(),
        date_next_review: nextReview || "",
        is_emergency: !!isEmergency,
        status: "live",
        pdf_name: finalFileKey.startsWith('guidelines/') ? finalFileKey.substring(11) : finalFileKey,
        fileKey: finalFileKey,
        summaryText,
        search_tags: Array.from(new Set(compiledSections.flatMap(s => s.synonyms || []))),
        hasCalculator: !!calculator
      };

      // 5. Upload compiled master and summary JSON files to R2 Bucket
      const r2MasterKey = `index/${documentId}_master.json`;
      await env.R2_BUCKET.put(r2MasterKey, JSON.stringify(guidelinesMaster), {
        httpMetadata: { contentType: 'application/json' }
      });

      const r2SummaryKey = `index/${documentId}_summary.json`;
      await env.R2_BUCKET.put(r2SummaryKey, JSON.stringify(guidelinesSummary), {
        httpMetadata: { contentType: 'application/json' }
      });

      // 6. Update consolidated summaries master index file in R2
      let allSummaries: any[] = [];
      const summariesKey = "index/summaries_master.json";
      try {
        const summariesObject = await env.R2_BUCKET.get(summariesKey);
        if (summariesObject) {
          const summariesText = await summariesObject.text();
          allSummaries = JSON.parse(summariesText);
        }
      } catch (err) {
        console.warn("Could not load index/summaries_master.json from R2, starting new master list.", err);
      }

      // Filter out older duplicate versions of this guideline ID
      allSummaries = allSummaries.filter((s: any) => s.id !== documentId);

      // Handle replacements (superseding older versions)
      if (isReplacement && supersedesId) {
        allSummaries = allSummaries.map((s: any) => {
          if (s.id === supersedesId) {
            return { ...s, status: 'superseded' };
          }
          return s;
        });
      }

      // Append the new summary
      allSummaries.push(guidelinesSummary);

      // Write consolidated index back to R2
      await env.R2_BUCKET.put(summariesKey, JSON.stringify(allSummaries), {
        httpMetadata: { contentType: 'application/json' }
      });

      // 7. Write tracking rows to D1 Database
      await env.D1_DATABASE.prepare(`
        CREATE TABLE IF NOT EXISTS guidelines_meta (
          id TEXT PRIMARY KEY,
          name TEXT,
          version TEXT,
          owner_email TEXT,
          changelog TEXT,
          status TEXT,
          next_review TEXT,
          is_emergency INTEGER,
          is_replacement INTEGER,
          supersedes_id TEXT,
          created_at TEXT,
          updated_at TEXT,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          neurons_consumed REAL DEFAULT 0,
          api_cost REAL DEFAULT 0
        )
      `).run();

      await env.D1_DATABASE.prepare(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          document_id TEXT,
          action TEXT,
          user_email TEXT,
          timestamp TEXT,
          details TEXT
        )
      `).run();

      // Write metadata & audit logging
      await env.D1_DATABASE.prepare(
        `INSERT OR REPLACE INTO guidelines_meta 
         (id, name, version, owner_email, changelog, status, next_review, is_emergency, is_replacement, supersedes_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        documentId,
        name,
        version || "v1.0.0",
        ownerEmail || "audit.lead@nhs.net",
        changelog || "Ingested via AI Worker",
        "live",
        nextReview || "",
        isEmergency ? 1 : 0,
        isReplacement ? 1 : 0,
        supersedesId || null,
        new Date().toISOString()
      ).run();

      if (isReplacement && supersedesId) {
        await env.D1_DATABASE.prepare(
          `UPDATE guidelines_meta SET status = 'superseded' WHERE id = ?`
        ).bind(supersedesId).run();
      }

      const auditId = Math.random().toString(36).substring(2, 15);
      await env.D1_DATABASE.prepare(
        `INSERT INTO audit_logs (id, document_id, action, user_email, timestamp, details)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        auditId,
        documentId,
        "publish",
        ownerEmail || "system-worker",
        new Date().toISOString(),
        `Successfully indexed layout master and summary to R2 index using Cloudflare Neurons.`
      ).run();

      return createSecureResponse(JSON.stringify({
        success: true,
        documentId,
        sectionsCount: sections.length,
        masterIndexKey: r2MasterKey,
        summaryIndexKey: r2SummaryKey,
        msg: "Guideline compiled, vectorized with Qwen AI, and registered live on R2/D1!"
      }), 200);

    } catch (err: any) {
      console.error("Worker processing failure:", err);
      return createSecureResponse(JSON.stringify({ error: err.message }), 500);
    }
  }
};
