export interface Env {
  AI: any;
  R2_BUCKET: any;
  D1_DATABASE: any;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Only accept POST requests on the /ingest path
    if (request.method !== "POST" || url.pathname !== "/ingest") {
      return new Response("Not Found. POST to /ingest is required.", { status: 404 });
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
        return new Response(JSON.stringify({ error: "Missing required fields (documentId, name, rawText)" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      console.log(`[CF WORKER AI] Starting compilation for: ${name} (${documentId})`);

      // 2. Perform layout section parsing using LLM
      const systemPrompt = `You are a clinical database compiler. Parse this clinical guideline text and compile it into a structured JSON object.
Strictly capture ALL clinical guidelines, steps, algorithms, contraindications, and drug dosing instructions.

Your JSON structure MUST follow this schema:
{
  "summaryText": "Provide a comprehensive clinical summary of the key aspects of the entire guidance, structured in a highly useful manner with bullet points and clear warnings (avoiding raw PDF filler text). Use markdown for layout and formatting.",
  "records": [
    {
      "title": "Clean, descriptive title of this clinical section or step",
      "context": "Detailed clinical instructions, formulas, parameters, dosages, or checklist items exactly as written.",
      "summaryText": "A brief clinical summary of this specific section.",
      "synonyms": ["abbreviation", "clinical synonyms", "search keywords", "drug names"],
      "breadcrumbs": ["${name}", "Section Name"]
    }
  ],
  "calculator": null
}

If the guideline specifies demographic-based drug dosing guidelines or calculations (e.g. weight-based or age-based adjustments for drugs like paracetamol, ibuprofen, diclofenac, morphine, dihydrocodeine, omeprazole, ondansetron, oromorph, etc.), you MUST dynamically generate an interactive calculator schema under the "calculator" field instead of null.
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

      // Fallback if parser failed to build JSON
      if (sections.length === 0) {
        sections = [
          {
            title: `${name} - Core Section`,
            context: rawText,
            summaryText: `Auto-extracted content from ${name}.`,
            synonyms: [name.toLowerCase().replace(/\s+/g, '-')],
            breadcrumbs: [name, "Core Section"]
          }
        ];
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

      return new Response(JSON.stringify({
        success: true,
        documentId,
        sectionsCount: sections.length,
        masterIndexKey: r2MasterKey,
        summaryIndexKey: r2SummaryKey,
        msg: "Guideline compiled, vectorized with Qwen AI, and registered live on R2/D1!"
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

    } catch (err: any) {
      console.error("Worker processing failure:", err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};
