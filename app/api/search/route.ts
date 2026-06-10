import { NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET, queryD1, runWorkersAI, isR2Configured } from '../../../lib/cloudflare';
import { requireAuth } from '../../../lib/authGuard';
import staticGuidelines from '../../../data/guidelines_db.json';

// Helper to stream/read text from an S3 body stream
async function streamToString(stream: any): Promise<string> {
  const chunks: any[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: any) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err: any) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

export async function POST(req: Request) {
  try {
    // Auth guard
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { query } = await req.json();
    if (!query) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    if (typeof query !== 'string' || query.length > 500) {
      return NextResponse.json({ error: 'Query must be a string under 500 characters.' }, { status: 400 });
    }

    // Escape/sanitize query against basic prompt injection
    const sanitizedQuery = query
      .replace(/[\r\n]+/g, ' ')
      .replace(/[<>]/g, '') // remove HTML/XML tag markers
      .substring(0, 500);

    const geminiApiKey = process.env.GEMINI_API_KEY || '';
    
    // 1. Gather all guideline contexts (Static + R2 custom indices)
    let allGuidelines: any[] = [...staticGuidelines];

    // Try to retrieve custom guidelines from Cloudflare D1 and R2
    try {
      const { results: customGuides } = await queryD1(
        "SELECT id, name, status FROM guidelines_meta WHERE status = 'live'"
      );

      if (customGuides && customGuides.length > 0 && isR2Configured && r2Client) {
        for (const guide of customGuides) {
          try {
            // Fetch compiled guidelines_master.json from R2
            const r2Object = await r2Client.send(new GetObjectCommand({
              Bucket: R2_BUCKET,
              Key: `index/${guide.id}_master.json`
            }));
            
            if (r2Object.Body) {
              const bodyStr = await streamToString(r2Object.Body);
              
              // Protected JSON.parse of custom master payload
              let customMaster: any = null;
              try {
                customMaster = JSON.parse(bodyStr);
              } catch (parseErr) {
                console.error(`Failed to parse master index JSON for guideline ${guide.id}:`, parseErr);
                continue;
              }
              
              if (customMaster && customMaster.records) {
                // Re-format custom master JSON structure to match static db context
                const steps = customMaster.records.map((r: any, idx: number) => ({
                  step_number: idx + 1,
                  text: r.context,
                  page: r.page || 1
                }));

                const fileKey = customMaster.fileKey || '';
                allGuidelines.push({
                  protocol_id: customMaster.documentId,
                  clinical: {
                    title: customMaster.name,
                    steps
                  },
                  search_tags: customMaster.records[0]?.synonyms || [],
                  pdf_name: fileKey.startsWith('guidelines/') ? fileKey.substring(11) : fileKey,
                  default_page: customMaster.records[0]?.page || 1,
                  site_logistics: {
                    site_1: { hospital_name: "St George's Hospital", emergency_extension: "2222", drug_location: "Pharmacy", referral_pathway: "" }
                  }
                });
              }
            }
          } catch (r2Err) {
            console.error(`Failed to fetch custom guideline ${guide.id} from R2:`, r2Err);
          }
        }
      }
    } catch (d1Err) {
      console.warn("Could not query custom guidelines from Cloudflare D1/R2, running on static database only.", d1Err);
    }

    // 2. Scan all guidelines for simple text/synonym matches to build a dense context payload
    const lowerQuery = sanitizedQuery.toLowerCase();
    const matchedContexts: string[] = [];
    const citations: any[] = [];

    for (const doc of allGuidelines) {
      let matches = false;
      
      // Match title or synonyms/tags
      if (
        doc.clinical.title.toLowerCase().includes(lowerQuery) ||
        (doc.search_tags && doc.search_tags.some((tag: string) => lowerQuery.includes(tag.toLowerCase())))
      ) {
        matches = true;
      }

      // Match steps
      const matchedSteps = doc.clinical.steps.filter((step: any) => 
        step.text.toLowerCase().includes(lowerQuery)
      );

      if (matches || matchedSteps.length > 0) {
        const docName = doc.clinical.title;
        const stepsText = doc.clinical.steps.map((s: any) => `Step ${s.step_number}: ${s.text}`).join('\n');
        matchedContexts.push(`[Guideline Document: ${docName}]\n${stepsText}`);

        citations.push({
          docId: doc.protocol_id,
          docName: doc.clinical.title,
          pdfName: doc.pdf_name || '',
          // Prefer the page of the best-matching step, fall back to the doc default
          page: matchedSteps[0]?.page || doc.default_page || 1
        });
      }
    }

    // 3. Strict negative fallback: If nothing matched at all, enforce zero hallucination
    if (matchedContexts.length === 0) {
      return NextResponse.json({
        sender: 'bot',
        text: "I cannot find the answer to this question in the active departmental guidelines. Please refer directly to the official guidelines or check the Emergency Protocols panel.",
        citations: [],
        confidence: 100,
        isNegative: true
      });
    }

    const contextText = matchedContexts.join('\n\n---\n\n');

    // 4. Construct Grounding System Prompt
    const systemPrompt = `You are a clinical decision support assistant for the Anaesthetics Department.
Your task is to answer the user's clinical query using ONLY the provided guideline context below.

STRICT INSTRUCTIONS:
1. Base your answer solely on the provided Guideline Documents text. Do not use outside medical knowledge.
2. If the context does not contain the answer, state exactly: "I cannot find the answer to this question in the active departmental guidelines. Please refer directly to the official guidelines or check the Emergency Protocols panel."
3. Cite the matching guideline title directly in your text.
4. Keep your answer brief, bulleted, and clinically actionable.
5. UNDER NO CIRCUMSTANCES SHALL YOU HALLUCINATE OR CREATE INSTRUCTIONS NOT EXPLICITLY WRITTEN IN THE CONTEXT.

Active Guideline Context:
${contextText}

User Query (respond ONLY based on the guideline context above):
<user_query>${sanitizedQuery}</user_query>`;

    // 5. Query Gemini API (frontier model) or Workers AI LLM (fallback)
    let botResponseText = "";
    let isMock = false;

    if (geminiApiKey) {
      const geminiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: {
              temperature: 0.0,
              maxOutputTokens: 600
            }
          })
        }
      );

      if (geminiResp.ok) {
        const geminiData = await geminiResp.json();
        botResponseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      } else {
        console.error("Gemini API call failed, falling back to Workers AI.");
      }
    }

    // Fallback: Workers AI llama-3-8b-instruct
    if (!botResponseText) {
      const aiResponse = await runWorkersAI('@cf/meta/llama-3-8b-instruct', {
        messages: [
          { role: 'system', content: "You are a clinical assistant that follows system prompt instructions precisely." },
          { role: 'user', content: systemPrompt }
        ]
      });

      if (aiResponse.success && aiResponse.result?.response) {
        botResponseText = aiResponse.result.response;
      } else {
        // Safe hardcoded static answer if all APIs fail
        botResponseText = "Could not reach online search APIs. Please consult the static guidelines or local manuals.";
        isMock = true;
      }
    }

    return NextResponse.json({
      sender: 'bot',
      text: botResponseText,
      citations,
      confidence: 100,
      mock: isMock
    });

  } catch (error: any) {
    console.error("Online LLM Search endpoint error:", error);
    return NextResponse.json({ error: 'Search service encountered an error. Please try again.' }, { status: 500 });
  }
}
