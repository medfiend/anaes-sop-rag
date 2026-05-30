import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Initialize real Supabase client if keys are present
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

// Mock database values for pilot demo when Supabase isn't connected yet
export const mockGuidelines = [
  {
    id: "dexmed-sop-afoi-uuid",
    name: "Dexmedetomidine Sedation SOP for Awake Fibreoptic Intubation",
    file_path: "Dexmed SOP for AFOI.KD..pdf", // local file fallback
    status: "Active",
    version: "v1.0.0",
    changelog: "Initial departmental release.",
    date_published: "2025-06-01T00:00:00Z",
    date_next_review: "2027-06-01T00:00:00Z",
    owner_email: "olivia.kent@nhs.net",
    is_emergency: false,
    supersedes_document_id: null
  },
  {
    id: "la-toxicity-guideline-uuid",
    name: "AAGBI Safety Guideline: Management of Local Anaesthetic Toxicity",
    file_path: "la_toxicity_aagbi.pdf",
    status: "Active",
    version: "v2023",
    changelog: "National guideline update.",
    date_published: "2023-03-01T00:00:00Z",
    date_next_review: "2026-03-01T00:00:00Z",
    owner_email: "audit.lead@nhs.net",
    is_emergency: true,
    supersedes_document_id: null
  },
  {
    id: "malignant-hyperthermia-uuid",
    name: "AAGBI Safety Guideline: Management of Malignant Hyperthermia",
    file_path: "malignant_hyperthermia.pdf",
    status: "Active",
    version: "v2024",
    changelog: "Emergency protocol update.",
    date_published: "2024-01-10T00:00:00Z",
    date_next_review: "2027-01-10T00:00:00Z",
    owner_email: "audit.lead@nhs.net",
    is_emergency: true,
    supersedes_document_id: null
  }
];

export const mockChunks = [
  {
    id: "chunk-1",
    document_id: "dexmed-sop-afoi-uuid",
    content: "Dilute Dexmedetomidine 200mcg in 50ml 0.9% Sodium Chloride to achieve a final concentration of 4mcg/ml. Dosing should be weight-based: BMI <30 use patient's actual body weight (ABW), BMI >30 use adjusted body weight (AdjBW).",
    page_number: 4,
    bounding_boxes: [{ x0: 10, y0: 600, x1: 500, y1: 670 }]
  },
  {
    id: "chunk-2",
    document_id: "dexmed-sop-afoi-uuid",
    content: "Recommended regime: Loading dose – 1mcg/kg over 10 minutes. Infusion dose – 0.2 - 0.7 mcg/kg/h titrated to effect. Aim for Ramsay Sedation Scale (RSS) score of 2 or 3.",
    page_number: 4,
    bounding_boxes: [{ x0: 10, y0: 710, x1: 500, y1: 760 }]
  },
  {
    id: "chunk-3",
    document_id: "dexmed-sop-afoi-uuid",
    content: "Devine formula for Ideal Body Weight (IBW): Males: IBW = 50kg + 0.9kg x (height in cm - 152cm). Females: IBW = 45.5kg + 0.9kg x (height in cm - 152cm). Adjusted Body Weight (AdjBW) = IBW + 0.4 x (Actual Weight - IBW).",
    page_number: 9,
    bounding_boxes: [{ x0: 10, y0: 250, x1: 500, y1: 450 }]
  }
];

export const mockCalculator = {
  id: "calc-dexmed-uuid",
  document_id: "dexmed-sop-afoi-uuid",
  is_approved: true,
  schema: {
    calculator_name: "Dexmedetomidine Sedation Infusion Calculator",
    inputs: [
      { id: "sex", label: "Biological Sex", type: "select", options: ["Male", "Female"] },
      { id: "height", label: "Height (cm)", type: "number", defaultValue: 170, min: 100, max: 250 },
      { id: "weight", label: "Actual Body Weight (kg)", type: "number", defaultValue: 70, min: 30, max: 300 }
    ],
    calculations: [
      { id: "bmi", label: "BMI", formula: "weight / ((height/100) * (height/100))", unit: "kg/m²" },
      { id: "ibw", label: "Ideal Body Weight (IBW)", formula: "sex == 'Male' ? (50 + 0.9 * (height - 152)) : (45.5 + 0.9 * (height - 152))", unit: "kg" },
      { id: "dosing_weight", label: "Calculated Dosing Weight", formula: "bmi < 30 ? weight : (ibw + 0.4 * (weight - ibw))", unit: "kg" },
      { id: "loading_dose_vtbi", label: "Loading Dose VTBI (Volume to Be Infused)", formula: "dosing_weight * 0.25", unit: "ml" },
      { id: "loading_rate", label: "Agilia Pump Loading Rate (10-min run)", formula: "(dosing_weight * 0.25) * 6", unit: "ml/h" },
      { id: "maintenance_rate_04", label: "Maintenance Infusion (at 0.4 mcg/kg/h)", formula: "(dosing_weight * 0.4) / 4", unit: "ml/h" },
      { id: "maintenance_rate_min", label: "Min Infusion Limit (at 0.2 mcg/kg/h)", formula: "(dosing_weight * 0.2) / 4", unit: "ml/h" },
      { id: "maintenance_rate_max", label: "Max Infusion Limit (at 0.7 mcg/kg/h)", formula: "(dosing_weight * 0.7) / 4", unit: "ml/h" }
    ]
  }
};
