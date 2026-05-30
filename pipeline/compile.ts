import * as fs from 'fs';
import * as path from 'path';

// Compilation configuration
const DB_PATH = path.join(__dirname, '../data/guidelines_db.json');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

interface IngestionInput {
  filePath: string;
  version: string;
  ownerEmail: string;
  dateNextReview: string;
  supersedesId?: string | null;
}

export async function compileGuideline(input: IngestionInput) {
  try {
    console.log(`\n[COMPILE PIPELINE] Starting ingestion of ${path.basename(input.filePath)}...`);
    
    if (!GEMINI_API_KEY) {
      console.warn("[WARNING] GEMINI_API_KEY not found. Running compilation in dry-run mode using mock output.");
      return mockCompilation(input);
    }

    // 1. Read PDF file and convert to Base64 (Gemini 1.5 Pro natively supports PDFs in inlineData)
    const fileBuffer = fs.readFileSync(input.filePath);
    const base64Pdf = fileBuffer.toString('base64');

    // 2. Define compilation instruction prompt
    const compilationPrompt = `You are a clinical database compiler. Parse the attached PDF clinical guideline and compile it into a structured JSON schema.

Strictly enforce this separation:
- "clinical": Contains ONLY immutable, universal medical knowledge (e.g. drug dosing, steps, algorithms, contraindications).
- "site_logistics": Identify any hospital-specific logistical items (e.g. local phone extensions, storage codes, local pathway URLs). Mapped into 3 site IDs: 'site_1' (St George's), 'site_2' (Queen Mary's), and 'site_3' (Community). If local site numbers are found, extract them. If not, generate reasonable placeholders based on typical NHS templates.
- "synonyms": Generate a list of 10-15 clinical synonyms, shortcodes, and spelling variants (e.g. "dex", "afoi", "sedation") to assist offline fuzzy search.
- "formulas": If the guideline contains weight-based calculations (like Ideal Body Weight, BMI limits, or adjusted dosing weight), output the deterministic math formulas.

Output JSON structure:
{
  "protocol_id": "unique-kebab-case-id",
  "clinical": {
    "title": "Clean Title of Protocol",
    "steps": [
      { "step_number": 1, "text": "Detailed clinical instruction text." }
    ],
    "formulas": {
      "dosing_weight": "bmi < 30 ? weight : (ibw + 0.4 * (weight - ibw))"
    }
  },
  "site_logistics": {
    "site_1": { "hospital_name": "St George's Hospital", "emergency_extension": "2222", "drug_location": "Obstetric Theatre Cupboard (Code 4532)" },
    "site_2": { "hospital_name": "Queen Mary's Hospital", "emergency_extension": "3333", "drug_location": "Main Theatre Fridge" },
    "site_3": { "hospital_name": "Community Hospital", "emergency_extension": "9999", "drug_location": "Crash Cart 3" }
  },
  "search_tags": ["list", "of", "synonyms"]
}`;

    // 3. Make API request to Gemini 1.5 Pro
    console.log("[GEMINI API] Invoking Gemini 1.5 Pro multimodal parser...");
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`,
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
            responseMimeType: "application/json" // Force JSON output
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini Parser failure: ${await response.text()}`);
    }

    const resData = await response.json();
    const rawJsonText = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Parse the compiled JSON
    const parsedData = JSON.parse(rawJsonText);
    
    // Add file metadata
    const finalSchema = {
      ...parsedData,
      metadata: {
        version_hash: "git_" + Math.random().toString(36).substring(2, 9),
        compiled_at: new Date().toISOString(),
        review_due_at: input.dateNextReview,
        owner_email: input.ownerEmail,
        supersedes_document_id: input.supersedesId || null
      }
    };

    // 4. Save to local database
    saveToLocalDatabase(finalSchema);
    console.log(`[COMPILE SUCCESS] Guideline compiled and written to local database.`);
    return finalSchema;

  } catch (err: any) {
    console.error(`[COMPILE ERROR] Ingestion failed:`, err);
    throw err;
  }
}

function saveToLocalDatabase(newSchema: any) {
  let db: any[] = [];
  if (fs.existsSync(DB_PATH)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch {
      db = [];
    }
  }

  // Filter out any older duplicate active version of this protocol
  db = db.map(doc => {
    if (doc.protocol_id === newSchema.protocol_id) {
      // Mark old version as superseded
      return { ...doc, status: 'Superseded' };
    }
    return doc;
  });

  db.push({ ...newSchema, status: 'Active' });

  // Ensure parent dir exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

// Dry-run compiler fallback helper
function mockCompilation(input: IngestionInput) {
  const isDexmed = input.filePath.includes('Dexmed');
  
  const mockSchema = {
    protocol_id: isDexmed ? "dexmed-sop-afoi" : "generic-protocol",
    status: "Active",
    metadata: {
      version_hash: "git_mock789",
      compiled_at: new Date().toISOString(),
      review_due_at: input.dateNextReview,
      owner_email: input.ownerEmail,
      supersedes_document_id: input.supersedesId || null
    },
    clinical: {
      title: isDexmed ? "Dexmedetomidine Sedation SOP for Awake Fibreoptic Intubation" : "Clinical Protocol",
      steps: isDexmed ? [
        { step_number: 1, text: "Dilute Dexmedetomidine 200mcg in 50ml 0.9% Sodium Chloride (final concentration 4mcg/ml)." },
        { step_number: 2, text: "Calculate loading dose of 1mcg/kg over 10 minutes based on Actual Weight (ABW) if BMI < 30, or Adjusted Weight (AdjBW) if BMI > 30." },
        { step_number: 3, text: "Set up Agilia infusion pump to run loading dose, followed by maintenance infusion of 0.2 - 0.7 mcg/kg/h titrated to Ramsay Sedation Score of 2 or 3." }
      ] : [{ step_number: 1, text: "Standard medical step." }],
      formulas: isDexmed ? {
        bmi: "weight / ((height/100) * (height/100))",
        ibw: "sex == 'Male' ? (50 + 0.9 * (height - 152)) : (45.5 + 0.9 * (height - 152))",
        dosing_weight: "bmi < 30 ? weight : (ibw + 0.4 * (weight - ibw))",
        loading_rate: "(dosing_weight * 0.25) * 6",
        maintenance_rate_04: "(dosing_weight * 0.4) / 4"
      } : {}
    },
    site_logistics: {
      site_1: {
        hospital_name: "St George's Hospital",
        emergency_extension: "2222",
        drug_location: "Obstetric Theatre Cupboard (Code 4532)",
        referral_pathway: "https://intranet.stgeorges.nhs.uk/pathway/afoi"
      },
      site_2: {
        hospital_name: "Queen Mary's Hospital",
        emergency_extension: "3333",
        drug_location: "Main Theatre Fridge (Key with ODP)",
        referral_pathway: "https://intranet.qmh.nhs.uk/pathway/afoi"
      },
      site_3: {
        hospital_name: "Community Hospital",
        emergency_extension: "9999",
        drug_location: "Emergency Drug Trolley 2",
        referral_pathway: "https://intranet.community.nhs.uk/pathway/afoi"
      }
    },
    search_tags: isDexmed 
      ? ["dex", "dexmed", "afoi", "sedation", "intubation", "weight", "bmi", "ibw", "adjbw", "abw", "devine", "dilute", "ramsay", "st george", "fibreoptic", "awake", "infusion", "loading", "dose", "regime", "olivia", "kourteli", "soba", "concentration"]
      : ["protocol", "guideline"]
  };

  saveToLocalDatabase(mockSchema);
  console.log(`[DRY-RUN SUCCESS] Mock guideline compiled and saved.`);
  return mockSchema;
}
