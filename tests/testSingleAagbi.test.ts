import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { evaluateCalculations } from '../lib/safeFormula.ts';

// Load GEMINI_API_KEY from env or .env.local dynamically
if (!process.env.GEMINI_API_KEY) {
  try {
    const envPath = path.join(process.cwd(), '.env.local');
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
const pdfPath = './guidelines/AAGBI Guidelines/Clinical and Procedural/2021 - Malignant hyperthermia 2020.pdf';

test('Ingest Malignant Hyperthermia and Verify Calculator', async () => {
  const pdfjs = await import('pdfjs-dist');
  
  assert.ok(fs.existsSync(pdfPath), `PDF file must exist at ${pdfPath}`);
  
  const dataBuffer = fs.readFileSync(pdfPath);
  const uint8Array = new Uint8Array(dataBuffer);
  const loadingTask = pdfjs.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;
  
  let pageText = '';
  const numPages = Math.min(pdf.numPages, 4);
  for (let p = 1; p <= numPages; p++) {
    const page = await pdf.getPage(p);
    const textContent = await page.getTextContent();
    pageText += textContent.items.map((s: any) => s.str).join(' ') + '\n';
  }
  
  const textToParse = pageText.substring(0, 12000);
  console.log(`Extracted ${textToParse.length} characters.`);

  const protocolId = 'malignant-hyperthermia-2020';
  const meta = {
    title: 'Malignant hyperthermia 2020',
    year: 2021,
    originalUrl: 'https://anaesthetists.org/Portals/0/PDFs/Guidelines/Malignant%20hyperthermia%202020.pdf',
    customCreated: '2021-01-01T00:00:00Z'
  };

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

  console.log(`Step 1/2: Generating initial JSON with local Ollama...`);
  let initialJson = null;
  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemma4:e4b",
        prompt: parsePrompt,
        stream: false,
        options: { temperature: 0.1 }
      })
    });
    
    assert.ok(response.ok, `Ollama request failed: ${response.statusText}`);
    const resData = await response.json();
    let responseText = (resData.response || '').trim();
    if (responseText.startsWith("```")) {
      responseText = responseText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    initialJson = JSON.parse(responseText.trim());
  } catch (parseErr) {
    console.warn(`Ollama failed/misformatted: ${parseErr.message}. Falling back to Gemini 3.5 Flash for direct parsing...`);
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
      const errorText = await fallbackResponse.text();
      throw new Error(`Gemini Fallback Parser failure: ${errorText}`);
    }
    const fallbackResData = await fallbackResponse.json();
    let fallbackText = (fallbackResData.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    if (fallbackText.startsWith("```")) {
      fallbackText = fallbackText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    initialJson = JSON.parse(fallbackText.trim());
  }

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
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
      })
    }
  );

  assert.ok(auditResponse.ok, `Gemini Auditor failed`);
  const auditResData = await auditResponse.json();
  let auditText = (auditResData.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  if (auditText.startsWith("```")) {
    auditText = auditText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  const auditReport = JSON.parse(auditText.trim());
  console.log(`[AUDIT RESULT] Verdict = ${auditReport.verdict}. Reason: ${auditReport.reason}`);

  let finalGuideline = initialJson;
  if (auditReport.verdict === 'FAIL' && auditReport.corrected_json) {
    console.log(`[AUTO-CORRECT] Gemini corrected the JSON schema.`);
    finalGuideline = auditReport.corrected_json;
  }

  console.log('Final Ingested Guideline JSON:\n', JSON.stringify(finalGuideline, null, 2));

  // Verify that a calculator was generated!
  assert.ok(finalGuideline.calculator, 'Guideline MUST contain a calculator object!');
  assert.ok(finalGuideline.calculator.calculations.length > 0, 'Calculator must have calculations!');

  // Test the calculations with weight = 70
  const calc = finalGuideline.calculator;
  const testScope = { weight: 70 };
  const results = evaluateCalculations(calc.calculations, testScope);
  console.log('Test Calculation Results (weight = 70):', results);

  for (const key of Object.keys(results)) {
    assert.notEqual(results[key], 'Error', `Calculation ${key} failed to evaluate!`);
  }
});
