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
      const systemPrompt = `You are a clinical database compiler. Segment the provided clinical guideline text into logical registers.
For each register, identify:
- "title": Clean clinical section header (e.g. "Dosing Guidelines")
- "context": Full detailed clinical text instructions
- "summaryText": 1-2 sentence brief summary
- "synonyms": Array of abbreviations, synonyms, or shortcodes
- "breadcrumbs": Breadcrumbs trace starting with the guideline name

Output ONLY a JSON array with this exact structure:
[
  {
    "title": "...",
    "context": "...",
    "summaryText": "...",
    "synonyms": ["...", "..."],
    "breadcrumbs": ["...", "..."]
  }
]`;

      const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: rawText }
        ]
      });

      let sections: any[] = [];
      if (aiResponse && aiResponse.response) {
        try {
          // Parse JSON from the markdown code blocks
          const cleanedText = aiResponse.response.match(/\[[\s\S]*\]/)?.[0] || '[]';
          sections = JSON.parse(cleanedText);
        } catch (err) {
          console.error("AI response parsing error:", err);
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

      // 3. Generate Qwen 1024-dimensional embeddings for each section
      const compiledSections = [];
      let totalNeurons = 0;

      for (const section of sections) {
        const textToEmbed = `${section.title} ${section.context} ${section.synonyms.join(' ')}`;
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

      // 4. Compile the final Orama guidelinesMaster JSON payload
      const guidelinesMaster = {
        documentId,
        name,
        version: version || "v1.0.0",
        ownerEmail: ownerEmail || "audit.lead@nhs.net",
        changelog: changelog || "Initial upload",
        nextReview: nextReview || "",
        isEmergency: !!isEmergency,
        fileKey: `guidelines/${documentId}_guideline.pdf`,
        compiledAt: new Date().toISOString(),
        records: compiledSections
      };

      // 5. Upload compiled master JSON file back to R2 Bucket
      const r2Key = `index/${documentId}_master.json`;
      await env.R2_BUCKET.put(r2Key, JSON.stringify(guidelinesMaster), {
        httpMetadata: { contentType: 'application/json' }
      });

      // 6. Write tracking rows to D1 Database
      // Create tables if they do not exist (Self-healing schema)
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
          created_at TEXT
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
        `INSERT OR REPLACE INTO guidelines_meta (id, name, version, owner_email, changelog, status, next_review, is_emergency, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        documentId,
        name,
        version || "v1.0.0",
        ownerEmail || "audit.lead@nhs.net",
        changelog || "Ingested via AI Worker",
        "live",
        nextReview || "",
        isEmergency ? 1 : 0,
        new Date().toISOString()
      ).run();

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
        `Successfully indexed ${sections.length} layout sections to R2 master index.`
      ).run();

      return new Response(JSON.stringify({
        success: true,
        documentId,
        sectionsCount: sections.length,
        masterIndexKey: r2Key,
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
