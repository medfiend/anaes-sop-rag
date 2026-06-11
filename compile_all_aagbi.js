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
const METADATA_PATH = "C:/Users/Sid/.gemini/antigravity/brain/16e77139-db4b-4674-8856-52748f2cc06d/scratch/resources_response.json";
const AAGBI_DIR = "./guidelines/AAGBI Guidelines";
const DB_PATH = "./data/aagbi_guidelines_db.json";

// Helper to sanitize title for matching filenames
function sanitizeFilename(title) {
  return title
    .replace(/[\\/:*?"<>|]/g, '') // remove illegal characters
    .replace(/\s+/g, ' ')         // collapse consecutive spaces
    .trim();
}

// Map filename back to AAGBI metadata
function getMetadataMapping() {
  if (!fs.existsSync(METADATA_PATH)) {
    console.error("Metadata JSON file not found at:", METADATA_PATH);
    return {};
  }
  
  const raw = fs.readFileSync(METADATA_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const results = parsed.Results || [];
  
  const mapping = {};
  for (const item of results) {
    const pubDateStr = item.CustomCreated || item.Created;
    const pubDate = new Date(pubDateStr);
    const year = pubDate.getFullYear();
    const cleanTitle = sanitizeFilename(item.Title);
    const expectedFilename = `${year} - ${cleanTitle}.pdf`;
    
    let pdfUrl = null;
    const downloadField = item.CustomFields.find(f => f.CustomFieldDefinitionName === 'DownloadLink1');
    if (downloadField && downloadField.RawFieldValue) {
      try {
        pdfUrl = JSON.parse(downloadField.RawFieldValue);
      } catch (e) {
        pdfUrl = downloadField.RawFieldValue.replace(/"/g, '');
      }
    }
    
    if (!pdfUrl && item.Url) {
      const lowerUrl = item.Url.toLowerCase();
      if (lowerUrl.includes('.pdf')) {
        pdfUrl = item.Url;
        if (pdfUrl.startsWith('/')) {
          pdfUrl = 'https://anaesthetists.org' + pdfUrl;
        }
      } else {
        pdfUrl = item.Url; // Use website page url as fallback
      }
    }
    
    // Fallback for severe LAST
    if (item.Title === 'Management of severe local anaesthetic toxicity' && !pdfUrl) {
      pdfUrl = 'https://rapm.bmj.com/content/rapm/43/2/113.full.pdf';
    }
    
    mapping[expectedFilename.toLowerCase()] = {
      originalUrl: pdfUrl,
      title: item.Title,
      year: year,
      customCreated: pubDateStr
    };
  }
  return mapping;
}

// Find all PDF files in AAGBI Guidelines recursively
function getPdfFiles(dir) {
  let files = [];
  if (!fs.existsSync(dir)) return files;
  
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      files = files.concat(getPdfFiles(filePath));
    } else if (file.toLowerCase().endsWith('.pdf')) {
      files.push({
        relativePath: filePath,
        filename: file
      });
    }
  }
  return files;
}

async function compileAllAagbi() {
  const pdfjs = require('pdfjs-dist');
  
  let db = [];
  if (fs.existsSync(DB_PATH)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      console.log(`Loaded existing AAGBI database with ${db.length} entries.`);
    } catch (e) {
      console.error("Failed to parse AAGBI DB, starting fresh.");
      db = [];
    }
  }
  
  const mapping = getMetadataMapping();
  const pdfFiles = getPdfFiles(AAGBI_DIR);
  console.log(`Found ${pdfFiles.length} AAGBI PDF files on disk.`);
  
  console.log(`Starting local Ollama + Gemini 3.5 Flash hybrid pipeline for AAGBI guidelines...`);
  
  for (let i = 0; i < pdfFiles.length; i++) {
    const fileItem = pdfFiles[i];
    const { filename, relativePath } = fileItem;
    
    // Find metadata
    const meta = mapping[filename.toLowerCase()];
    if (!meta) {
      console.warn(`[WARN] Could not find metadata mapping for: "${filename}". Skipping.`);
      continue;
    }
    
    const protocolId = filename.toLowerCase()
      .replace(/^\d{4}\s*-\s*/, '') // strip year prefix
      .replace(/\.pdf$/, '')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
      
    // Skip if already in DB
    const exists = db.some(doc => doc.protocol_id === protocolId);
    if (exists) {
      console.log(`[${i + 1}/${pdfFiles.length}] Guideline "${meta.title}" (${meta.year}) already exists in DB. Skipping.`);
      continue;
    }
    
    console.log(`\n================================================================`);
    console.log(`[${i + 1}/${pdfFiles.length}] Ingesting: "${meta.title}" (${meta.year})`);
    console.log(`================================================================`);
    
    try {
      // 1. Extract Text (up to first 4 pages, or max 12,000 characters)
      const dataBuffer = fs.readFileSync(relativePath);
      const uint8Array = new Uint8Array(dataBuffer);
      const loadingTask = pdfjs.getDocument({ data: uint8Array });
      const pdf = await loadingTask.promise;
      
      let pageText = '';
      const numPages = Math.min(pdf.numPages, 4); // Limit to first 4 pages for efficiency
      for (let p = 1; p <= numPages; p++) {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        pageText += textContent.items.map(s => s.str).join(' ') + '\n';
      }
      
      const textToParse = pageText.substring(0, 12000);
      console.log(`Extracted ${textToParse.length} characters of text from first ${numPages} pages.`);
      
      // 2. Build Ingestion Prompt
      const parsePrompt = `You are a clinical database compiler. Parse the following text from the Association of Anaesthetists (AAGBI) clinical guideline document and compile it into a structured JSON schema.
      
Source Text:
"""
${textToParse}
"""

Strictly follow these JSON instructions:
1. "protocol_id" must be "${protocolId}".
2. "status" must be "Active".
3. "metadata": {
     "version_hash": "aagbi_${meta.year}",
     "compiled_at": "${meta.customCreated}",
     "review_due_at": "2030-01-01T00:00:00Z",
     "owner_email": "audit.lead@nhs.net",
     "supersedes_document_id": null
   }
4. "clinical":
   - "title": "${meta.title.replace(/"/g, '\\"')}".
   - "steps": Array of key recommendation objects: { "step_number": X, "text": "..." }. Extract the primary guidelines, key clinical actions, or standard recommendations. Keep them sequentially ordered.
   - "summaryText": A clean 1-2 paragraph clinical summary of the guideline.
5. "search_tags": Generate an array of 10-15 clinical synonyms and search tags (e.g., "dementia", "controlled drugs", "consent", "advancement").
6. "pdf_name" must be "${meta.originalUrl}".
7. "default_page": 1
8. "calculator": If there are weight-based drug doses, infusions, fluid boluses, or other calculations mentioned in the text (such as local anaesthetic toxicity rescue doses, dantrolene doses for malignant hyperthermia, paediatric drug doses, fluid resuscitation rates, or calculations of remaining oxygen duration based on pressure/flow), generate a "calculator" schema with:
   - "calculator_name": A descriptive name.
   - "formula_page": 1
   - "inputs": An array of input definitions. E.g.:
     [ { "id": "weight", "label": "Actual Body Weight (kg)", "type": "number", "defaultValue": 70, "min": 10, "max": 200 } ]
   - "calculations": An array of calculation objects: { "id": "...", "label": "...", "formula": "...", "unit": "..." }. E.g.:
     { "id": "bolus_dose", "label": "Intravenous Bolus Dose", "formula": "weight * 2.5", "unit": "mg" }
   Make sure all formulas are valid simple JavaScript math/ternary expressions. If no weight-based or numerical calculations are relevant, omit the "calculator" field (do not include it).

Output ONLY valid raw JSON. No markdown backticks, no explanatory text, no HTML, just the raw JSON object.`;

      // 3. Call local Ollama
      console.log(`Step 1/2: Generating initial JSON with local Ollama (gemma4:e4b)...`);
      let initialJson = null;
      try {
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
        
        if (!response.ok) throw new Error(`Ollama status: ${response.statusText}`);
        
        const resData = await response.json();
        let responseText = (resData.response || '').trim();
        
        if (responseText.startsWith("```")) {
          responseText = responseText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        initialJson = JSON.parse(responseText.trim());
      } catch (parseErr) {
        console.warn(`Ollama failed/misformatted for "${meta.title}": ${parseErr.message}. Falling back to Gemini 3.5 Flash for direct parsing...`);
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
      
      // 4. Safety Audit with Gemini 3.5 Flash
      console.log(`Step 2/2: Running safety audit with Gemini 3.5 Flash...`);
      const auditPrompt = `You are a critical medical safety auditor. Your task is to verify that the compiled JSON schema accurately represents the clinical source text of the AAGBI guideline.
      
Clinical Source Text:
"""
${textToParse}
"""

Compiled JSON Schema:
"""
${JSON.stringify(initialJson, null, 2)}
"""

You must review the JSON schema for:
1. **Clinical Omissions:** Are any critical warnings, doses, steps, or drug details omitted or summarized incorrectly?
2. **Formula Errors:** Do the calculator formulas (if present) match the weight-based doses in the text?
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
            contents: [{ parts: [{ text: auditPrompt }] }],
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
      if (auditText.startsWith("```")) {
        auditText = auditText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      const auditReport = JSON.parse(auditText.trim());
      console.log(`[AUDIT RESULT] Verdict = ${auditReport.verdict}. Reason: ${auditReport.reason}`);
      
      let finalGuideline = initialJson;
      if (auditReport.verdict === 'FAIL' && auditReport.corrected_json) {
        console.log(`[AUTO-CORRECT] Gemini 3.5 Flash detected discrepancies and corrected the JSON schema.`);
        finalGuideline = auditReport.corrected_json;
      }
      
      // Make sure the pdf_name is still the remote URL
      finalGuideline.pdf_name = meta.originalUrl;
      
      db.push(finalGuideline);
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
      console.log(`Successfully completed and saved "${meta.title}".`);
      
      // Cooldown delay
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (err) {
      console.error(`ERROR compiling "${meta.title}":`, err.message);
      console.log("Waiting 5 seconds before moving to next guideline...");
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log(`\nIngestion complete! Total guidelines in AAGBI database: ${db.length}`);
}

compileAllAagbi().catch(err => console.error("Fatal AAGBI compiler error:", err));
