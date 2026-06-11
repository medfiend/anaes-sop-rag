// Load GEMINI_API_KEY from env or .env.local dynamically
if (!process.env.GEMINI_API_KEY) {
  try {
    const envPath = path.join(__dirname, '.env.local');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
      if (match) {
        process.env.GEMINI_API_KEY = match[1].trim();
      }
    }
  } catch (e) {}
}
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const QRH_PAGES = [
  { pageNum: 5, protocolId: "key-basic-plan" },
  { pageNum: 6, protocolId: "resus-als" },
  { pageNum: 7, protocolId: "hypoxia" },
  { pageNum: 8, protocolId: "increased-airway-pressure" },
  { pageNum: 9, protocolId: "hypotension" },
  { pageNum: 10, protocolId: "hypertension" },
  { pageNum: 11, protocolId: "bradycardia" },
  { pageNum: 12, protocolId: "tachycardia" },
  { pageNum: 13, protocolId: "peri-operative-hyperthermia" },
  { pageNum: 14, protocolId: "anaphylaxis" },
  { pageNum: 15, protocolId: "massive-blood-loss" },
  { pageNum: 16, protocolId: "cico" },
  { pageNum: 17, protocolId: "bronchospasm" },
  { pageNum: 18, protocolId: "circulatory-embolus" },
  { pageNum: 19, protocolId: "laryngospasm" },
  { pageNum: 20, protocolId: "patient-fire" },
  // page 21 is malignant-hyperthermia (skipped)
  { pageNum: 22, protocolId: "cardiac-tamponade" },
  // page 23 is la-toxicity (skipped)
  { pageNum: 24, protocolId: "high-central-neuraxial-block" },
  { pageNum: 25, protocolId: "cardiac-ischaemia" },
  { pageNum: 26, protocolId: "neuroprotection-post-arrest" },
  { pageNum: 27, protocolId: "sepsis" },
  { pageNum: 28, protocolId: "mains-oxygen-failure" },
  { pageNum: 29, protocolId: "mains-electricity-failure" },
  { pageNum: 30, protocolId: "emergency-evacuation" }
];

async function compileAll() {
  const pdfjs = require('pdfjs-dist');
  const pdfPath = './public/QRH_complete_June_2023.pdf';
  const dbPath = './data/guidelines_db.json';
  
  let db = [];
  if (fs.existsSync(dbPath)) {
    try {
      db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      console.log(`Loaded existing database with ${db.length} entries.`);
    } catch (e) {
      console.error("Failed to parse existing DB, starting fresh", e);
      db = [];
    }
  }

  const dataBuffer = fs.readFileSync(pdfPath);
  const uint8Array = new Uint8Array(dataBuffer);
  const loadingTask = pdfjs.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;
  
  console.log(`Starting local Ollama + Gemini 3.5 Flash hybrid pipeline for ${QRH_PAGES.length} pages...`);

  for (const item of QRH_PAGES) {
    const { pageNum, protocolId } = item;
    
    // Check if it already exists and skip to avoid duplicate work
    const exists = db.some(doc => doc.protocol_id === protocolId);
    if (exists) {
      console.log(`Page ${pageNum} (${protocolId}) already exists in DB. Skipping.`);
      continue;
    }
    
    console.log(`\n==========================================`);
    console.log(`Ingesting Page ${pageNum} -> Protocol ID: ${protocolId}`);
    console.log(`==========================================`);

    try {
      // 1. Extract Text
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(s => s.str).join(' ');
      
      console.log(`Extracted ${pageText.length} characters of source text.`);

      // 2. Build Ingestion Prompt
      const parsePrompt = `You are a clinical database compiler. Parse the following text from page ${pageNum} of a clinical emergency handbook (QRH) and compile it into a structured JSON schema.

Page Text:
"""
${pageText}
"""

Strictly follow these JSON instructions:
1. "protocol_id" must be "${protocolId}".
2. "status" must be "Active".
3. "metadata": {
     "version_hash": "git_qrh2023",
     "compiled_at": "2023-06-01T00:00:00Z",
     "review_due_at": "2028-06-01T00:00:00Z",
     "owner_email": "audit.lead@nhs.net",
     "supersedes_document_id": null
   }
4. "clinical":
   - "title": Clean clinical title of the protocol.
   - "steps": Array of objects: { "step_number": X, "text": "..." }. Extract the steps sequentially from the main algorithm (starting with the first steps, e.g. "START", and ending with the final step). Include all important clinical instructions and details.
5. "site_logistics":
   Map standard hospital-specific logistics into exactly three site IDs. Use the following structured format:
   {
     "site_1": {
       "hospital_name": "St George's Hospital",
       "emergency_extension": "2222",
       "drug_location": "Obstetric Theatre Drug Fridge / Cardiac Arrest Trolley"
     },
     "site_2": {
       "hospital_name": "Queen Mary's Hospital",
       "emergency_extension": "3333",
       "drug_location": "Main Theatre Fridge / Cardiac Arrest Trolley"
     },
     "site_3": {
       "hospital_name": "Nelson Community Hospital",
       "emergency_extension": "9999",
       "drug_location": "Community Emergency Grab Box / Crash Cart"
     }
   }
6. "search_tags": Generate an array of 10-15 clinical synonyms and search tags (e.g. "anaphylaxis", "shock", "adrenaline").
7. "pdf_name" must be "QRH_complete_June_2023.pdf".
8. "default_page" must be ${pageNum}.
9. "calculator": If there are weight-based drug doses mentioned in the text (such as intramuscular adrenaline doses, IV adrenaline boluses, fluid bolus volumes like 20ml/kg, or other weight-based drug boluses), generate a "calculator" schema with:
   - "calculator_name": A descriptive name.
   - "formula_page": ${pageNum}
   - "inputs": An array of input definitions (usually body weight). E.g.:
     [ { "id": "weight", "label": "Actual Body Weight (kg)", "type": "number", "defaultValue": 70, "min": 10, "max": 200 } ]
   - "calculations": An array of calculation objects: { "id": "...", "label": "...", "formula": "...", "unit": "..." }. E.g.:
     { "id": "fluid_bolus", "label": "Fluid Bolus Volume (20 ml/kg)", "formula": "weight * 20", "unit": "ml" }
   Make sure all formulas are valid simple JavaScript math/ternary expressions. If no weight-based calculations are relevant, omit the "calculator" field (do not include it).

Output ONLY valid raw JSON. No markdown backticks, no explanatory text, no HTML, just the raw JSON object.`;

      // 3. Call local Ollama
      console.log(`Step 1/2: Generating initial JSON with local Ollama (gemma4:e4b)...`);
      const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemma4:e4b",
          prompt: parsePrompt,
          stream: false,
          options: {
            temperature: 0.1
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }
      
      const resData = await response.json();
      let responseText = (resData.response || '').trim();
      
      // Clean Ollama markdown formatting if any
      if (responseText.startsWith("```")) {
        responseText = responseText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      responseText = responseText.trim();
      
      let initialJson;
      try {
        initialJson = JSON.parse(responseText);
      } catch (parseErr) {
        console.warn(`Ollama output parsing error for Page ${pageNum}: ${parseErr.message}. Falling back to Gemini 3.5 Flash for direct parsing...`);
        const fallbackResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: parsePrompt }] }],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json"
              }
            })
          }
        );
        if (!fallbackResponse.ok) {
          throw new Error(`Gemini Fallback Parser failure: ${await fallbackResponse.text()}`);
        }
        const fallbackResData = await fallbackResponse.json();
        let fallbackText = (fallbackResData.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
        if (fallbackText.startsWith("```")) {
          fallbackText = fallbackText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        initialJson = JSON.parse(fallbackText.trim());
      }

      // 4. Adversarial Audit with Gemini 3.5 Flash
      console.log(`Step 2/2: Running safety audit with Gemini 3.5 Flash...`);
      const auditPrompt = `You are a critical medical safety auditor. Your task is to verify that the compiled JSON schema accurately represents the clinical source text of page ${pageNum} of the QRH handbook.

Clinical Source Text:
"""
${pageText}
"""

Compiled JSON Schema:
"""
${JSON.stringify(initialJson, null, 2)}
"""

You must review the JSON schema for:
1. **Clinical Omissions:** Are any critical warnings, doses, steps, or drug details omitted or summarized incorrectly?
2. **Formula Errors:** Do the calculator formulas match the weight-based doses in the text?
3. **Typographical Errors:** Are there any transcription errors or missing details?

If there are any discrepancies, return a verdict of "FAIL", and provide a complete "corrected_json" object reflecting all corrections (this must be a complete drop-in replacement of the guideline JSON schema).
If the JSON is 100% correct and matches the clinical source text, return a verdict of "PASS" and leave "corrected_json" as null.

You MUST return a strict JSON output matching this structure:
{
  "verdict": "PASS" | "FAIL",
  "reason": "Overall summary of audit findings",
  "corrected_json": null | { ... }
}

Output ONLY valid raw JSON. No markdown backticks, no comments.`;

      const auditResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: auditPrompt
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

      if (!auditResponse.ok) {
        throw new Error(`Gemini Auditor failure: ${await auditResponse.text()}`);
      }

      const auditResData = await auditResponse.json();
      let auditText = (auditResData.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      
      // Clean audit markdown formatting if any
      if (auditText.startsWith("```")) {
        auditText = auditText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      auditText = auditText.trim();
      
      const auditReport = JSON.parse(auditText);
      console.log(`[AUDIT RESULT] Page ${pageNum}: Verdict = ${auditReport.verdict}. Reason: ${auditReport.reason}`);

      let finalGuideline = initialJson;
      if (auditReport.verdict === 'FAIL' && auditReport.corrected_json) {
        console.log(`[AUTO-CORRECT] Gemini 3.5 Flash detected discrepancies and corrected the JSON schema.`);
        finalGuideline = auditReport.corrected_json;
      }

      // 5. Save to database array
      db.push(finalGuideline);
      fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
      console.log(`Successfully completed and saved Page ${pageNum} (${protocolId}).`);
      
      // Small cooldown delay between pages
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      console.error(`ERROR compiling Page ${pageNum} (${protocolId}):`, err.message);
      console.log("Waiting 5 seconds before moving to next page...");
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log(`\nIngestion pipeline complete! Total guidelines in database: ${db.length}`);
}

compileAll().catch(err => console.error("Fatal compiler error:", err));
