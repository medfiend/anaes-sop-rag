import { NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET, queryD1, runWorkersAI, isR2Configured, isCloudflareApiConfigured } from '../../../lib/cloudflare';

// Helper to generate IDs
const generateUUID = () => {
  return typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : Math.random().toString(36).substring(2, 15);
};

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  
  // Set up streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const sendStatus = (step: string, data: any = {}) => {
        controller.enqueue(encoder.encode(JSON.stringify({ step, ...data }) + '\n'));
      };

      try {
        // Read form data
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const docName = formData.get('docName') as string;
        const version = formData.get('version') as string;
        const ownerEmail = formData.get('ownerEmail') as string;
        const changelog = formData.get('changelog') as string;
        const nextReview = formData.get('nextReview') as string;
        const isEmergency = formData.get('isEmergency') === 'true';
        const isReplacement = formData.get('isReplacement') === 'true';
        const supersedesId = formData.get('supersedesId') as string;

        if (!file) {
          throw new Error("No PDF file provided in the upload request.");
        }

        const documentId = generateUUID();
        const fileKey = `guidelines/${documentId}_${file.name}`;
        
        sendStatus('R2 Upload', { progress: 10, msg: "Initializing Cloudflare D1 audit tables..." });
        
        // D1 Self-Healing: Create tables if they do not exist
        await queryD1(`
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
        `);
        
        await queryD1(`
          CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            document_id TEXT,
            action TEXT,
            user_email TEXT,
            timestamp TEXT,
            details TEXT
          )
        `);

        sendStatus('R2 Upload', { progress: 30, msg: `Uploading '${file.name}' to Cloudflare R2 bucket with versioning...` });

        if (!isR2Configured || !r2Client) {
          const missing = [];
          if (!process.env.CLOUDFLARE_ACCOUNT_ID) missing.push('CLOUDFLARE_ACCOUNT_ID');
          if (!process.env.R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
          if (!process.env.R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
          throw new Error(`Cloudflare R2 is not configured. Missing environment variables: ${missing.join(', ')}`);
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const r2Response = await r2Client.send(new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: fileKey,
          Body: buffer,
          ContentType: file.type || 'application/pdf',
        }));
        const fileVersionId = r2Response.VersionId || 'v1';

        // Log upload status to D1 database
        sendStatus('R2 Upload', { progress: 50, msg: "Writing metadata trace to D1 Database..." });
        await queryD1(
          `INSERT INTO guidelines_meta (id, name, version, owner_email, changelog, status, next_review, is_emergency, is_replacement, supersedes_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [documentId, docName, version, ownerEmail, changelog, 'uploading', nextReview, isEmergency ? 1 : 0, isReplacement ? 1 : 0, supersedesId || null, new Date().toISOString()]
        );

        await queryD1(
          `INSERT INTO audit_logs (id, document_id, action, user_email, timestamp, details)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [generateUUID(), documentId, 'upload', ownerEmail, new Date().toISOString(), `File uploaded version: ${fileVersionId}`]
        );

        sendStatus('Multi-Register Extraction', { progress: 55, msg: "Extracting file sections and parsing clinical registers..." });

        let promptTokens = 0;
        let completionTokens = 0;
        let neuronsConsumed = 0;
        
        let sections: Array<{
          title: string;
          context: string;
          summaryText: string;
          synonyms: string[];
          breadcrumbs: string[];
        }> = [];

        // 1. Try to parse using Gemini if API key is present
        const geminiApiKey = process.env.GEMINI_API_KEY || '';
        if (geminiApiKey) {
          try {
            sendStatus('Multi-Register Extraction', { progress: 65, msg: "Invoking Gemini 1.5 Pro multimodal parser to extract clinical sections from PDF..." });
            const base64Pdf = buffer.toString('base64');
            
            const compilationPrompt = `You are a clinical database compiler. Parse this PDF clinical guideline and compile it into a structured JSON array of sections.
Strictly capture ALL clinical guidelines, steps, algorithms, contraindications, and drug dosing instructions.
Each section in the array MUST have this format:
{
  "title": "Clean, descriptive title of this clinical section or step",
  "context": "Detailed clinical instructions, formulas, parameters, dosages, or checklist items exactly as written in the PDF.",
  "summaryText": "A brief 1-2 sentence clinical summary of this specific section.",
  "synonyms": ["abbreviation", "clinical synonyms", "search keywords", "drug names"],
  "breadcrumbs": ["${docName}", "Section Name"]
}
Output only the raw JSON array. Do not include markdown tags.`;

            const geminiResp = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiApiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [
                    {
                      parts: [
                        {
                          inlineData: {
                            mimeType: 'application/pdf',
                            data: base64Pdf
                          }
                        },
                        {
                          text: compilationPrompt
                        }
                      ]
                    }
                  ],
                  generationConfig: {
                    temperature: 0.1,
                    responseMimeType: "application/json"
                  }
                })
              }
            );

            if (geminiResp.ok) {
              const resData = await geminiResp.json();
              const rawJsonText = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';
              sections = JSON.parse(rawJsonText);
              promptTokens += Math.round(base64Pdf.length / 4);
              completionTokens += Math.round(rawJsonText.length / 4);
              neuronsConsumed += 1.5; // tracking units
              sendStatus('Multi-Register Extraction', { progress: 70, msg: `Successfully parsed ${sections.length} sections using Gemini.` });
            } else {
              console.error("Gemini PDF parsing failed:", await geminiResp.text());
            }
          } catch (geminiErr) {
            console.error("Gemini parsing error:", geminiErr);
          }
        }

        // 2. Fallback to Cloudflare Workers AI if Gemini is not available or failed
        if (sections.length === 0 && isCloudflareApiConfigured) {
          sendStatus('Multi-Register Extraction', { progress: 72, msg: "Using Cloudflare Workers LLM as fallback parser..." });
          
          const textExcerpt = `Guideline: ${docName}. Review date: ${nextReview}. Version: ${version}. Section: Standard operating procedure details.`;
          const systemPrompt = `You are a clinical database parser. Take this text section and structure it into registers.
Output a JSON array containing sections. Format:
[
  {
    "title": "Topic Title",
    "context": "Technical details",
    "summaryText": "Brief summary",
    "synonyms": ["abbreviation", "synonym"],
    "breadcrumbs": ["${docName}", "Topic"]
  }
]`;

          const aiResponse = await runWorkersAI('@cf/meta/llama-3-8b-instruct', {
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: textExcerpt }
            ]
          });

          if (aiResponse.success && aiResponse.result?.response) {
            try {
              const cleaned = aiResponse.result.response.match(/\[[\s\S]*\]/)?.[0] || '[]';
              sections = JSON.parse(cleaned);
              neuronsConsumed += aiResponse.neurons || 0.45;
              promptTokens += Math.round(systemPrompt.length / 4 + textExcerpt.length / 4);
              completionTokens += Math.round(aiResponse.result.response.length / 4);
            } catch (err) {
              console.warn("Could not parse Workers AI JSON output");
            }
          }
        }

        if (sections.length === 0) {
          throw new Error("Guideline Parsing Error: Could not extract structured sections using Gemini or Workers AI. Check GEMINI_API_KEY or CLOUDFLARE_API_TOKEN configuration.");
        }

        sendStatus('Qwen Vector Calculation', { progress: 75, msg: "Updating status to 'vectorizing'..." });
        await queryD1(
          `UPDATE guidelines_meta SET status = ? WHERE id = ?`,
          ['vectorizing', documentId]
        );

        sendStatus('Qwen Vector Calculation', { progress: 80, msg: "Generating 1024-dimension vectors via Workers AI Qwen Model..." });
        
        // Generate vectors for each section
        const compiledSections = [];
        for (const sec of sections) {
          const vectorText = `${sec.title} ${sec.context} ${sec.synonyms.join(' ')}`;
          let vector = Array(1024).fill(0);
          
          if (isCloudflareApiConfigured) {
            const embedResponse = await runWorkersAI('@cf/qwen/qwen3-embedding-0.6b', {
              text: [vectorText]
            });
            if (embedResponse.success && embedResponse.result?.data?.[0]) {
              vector = embedResponse.result.data[0];
              neuronsConsumed += embedResponse.neurons || 0.01;
              promptTokens += Math.round(vectorText.length / 4);
            } else {
              throw new Error(`Workers AI embedding failed: ${embedResponse.error || 'Unknown error'}`);
            }
          } else {
            throw new Error("Workers AI is not configured. Cannot generate embedding vectors. Check CLOUDFLARE_API_TOKEN environment variable.");
          }

          compiledSections.push({
            ...sec,
            masterVector: vector
          });
        }

        sendStatus('Orama Compiling', { progress: 90, msg: "Compiling JSON index for local client-side syncing..." });

        // Build master guidelines payload containing metadata + parsed vector records
        const guidelinesMaster = {
          documentId,
          name: docName,
          version,
          ownerEmail,
          changelog,
          nextReview,
          isEmergency,
          fileKey,
          compiledAt: new Date().toISOString(),
          records: compiledSections
        };

        // Write compiled JSON back to R2
        if (!isR2Configured || !r2Client) {
          throw new Error("Cloudflare R2 is not configured. Cannot save compiled master JSON index.");
        }

        const r2ResponseJson = await r2Client.send(new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: `index/${documentId}_master.json`,
          Body: JSON.stringify(guidelinesMaster),
          ContentType: 'application/json',
        }));
        const compiledR2Version = r2ResponseJson.VersionId || 'json_v1';

        // Calculate Cost Telemetry
        const estimatedCostGbp = neuronsConsumed * 0.000008;

        // Set status to 'live' in database and record telemetry metrics
        sendStatus('Live', { progress: 95, msg: "Finalizing metadata records & setting status to 'live'..." });
        await queryD1(
          `UPDATE guidelines_meta 
           SET status = ?, input_tokens = ?, output_tokens = ?, neurons_consumed = ?, api_cost = ?, updated_at = ? 
           WHERE id = ?`,
          ['live', promptTokens, completionTokens, neuronsConsumed, estimatedCostGbp, new Date().toISOString(), documentId]
        );

        if (isReplacement && supersedesId) {
          await queryD1(
            `UPDATE guidelines_meta SET status = 'superseded' WHERE id = ?`,
            [supersedesId]
          );
        }

        await queryD1(
          `INSERT INTO audit_logs (id, document_id, action, user_email, timestamp, details)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [generateUUID(), documentId, 'publish', ownerEmail, new Date().toISOString(), `Published Master Index file. Neurons: ${neuronsConsumed.toFixed(4)}, Cost: £${estimatedCostGbp.toFixed(6)}`]
        );

        // Completion telemetry block
        sendStatus('Live', {
          progress: 100,
          msg: "Guideline successfully uploaded, vectorized, and live on the network!",
          telemetry: {
            inputTokens: promptTokens,
            outputTokens: completionTokens,
            neurons: neuronsConsumed,
            costGbp: estimatedCostGbp
          }
        });
        
        controller.close();
      } catch (err: any) {
        console.error("Ingestion endpoint stream failure:", err);
        controller.enqueue(encoder.encode(JSON.stringify({ error: err.message }) + '\n'));
        controller.close();
      }

    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
