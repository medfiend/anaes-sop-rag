import { useState, useEffect, useCallback } from 'react';
import { create, insert, search, Orama } from '@orama/orama';
import staticGuidelines from '../../data/guidelines_db.json';

const STATIC_GUIDELINE_IDS = [
  'la-toxicity', 'malignant-hyperthermia', 'resus-als', 'dexmed-sop-afoi', 'post-op-fossa',
  'key-basic-plan', 'hypoxia', 'increased-airway-pressure', 'hypotension', 'hypertension',
  'bradycardia', 'tachycardia', 'peri-operative-hyperthermia', 'anaphylaxis', 'massive-blood-loss',
  'cico', 'bronchospasm', 'circulatory-embolus', 'laryngospasm', 'patient-fire',
  'cardiac-tamponade', 'high-central-neuraxial-block', 'cardiac-ischaemia', 'neuroprotection-post-arrest',
  'sepsis', 'mains-oxygen-failure', 'mains-electricity-failure', 'emergency-evacuation'
];


/**
 * Qualitative match strength shown to clinicians instead of a fabricated
 * "confidence %". These are keyword (BM25) relevance bands, nothing more —
 * we deliberately avoid implying statistical precision we don't have.
 */
export type MatchStrength = 'strong' | 'partial' | 'weak';

export const MATCH_STRENGTH_LABELS: Record<MatchStrength, string> = {
  strong: 'Strong keyword match',
  partial: 'Partial keyword match',
  weak: 'Weak keyword match',
};

export interface SearchResult {
  title: string;
  context: string;
  summaryText: string;
  synonyms: string[];
  breadcrumbs: string[];
  docId: string;
  matchStrength: MatchStrength;
  pdfName: string;
  defaultPage: number;
}

// Relevance bands derived from Orama BM25 scores. Below NEGATIVE the result
// set is treated as "not found"; below PARTIAL we suggest the deep AI search.
const SCORE_NEGATIVE_THRESHOLD = 0.8;
const SCORE_PARTIAL_THRESHOLD = 1.2;
const SCORE_STRONG_THRESHOLD = 1.6;

function strengthForScore(score: number): MatchStrength {
  if (score >= SCORE_STRONG_THRESHOLD) return 'strong';
  if (score >= SCORE_PARTIAL_THRESHOLD) return 'partial';
  return 'weak';
}

const SEARCH_SCHEMA = {
  title: 'string',
  context: 'string',
  summaryText: 'string',
  synonyms: 'string[]',
  docId: 'string',
  breadcrumbs: 'string[]',
  pdfName: 'string',
  defaultPage: 'number',
} as const;

/** Map the bundled static guideline DB into the shared guideline shape. */
function mapStaticGuidelines(): any[] {
  return [...staticGuidelines].map((g: any) => ({
    id: g.protocol_id,
    name: g.clinical.title,
    version: g.metadata?.version_hash?.substring(0, 8) || 'v1.0.0',
    owner_email: g.metadata?.owner_email || 'audit.lead@nhs.net',
    status: g.status || 'Active',
    changelog: g.metadata?.changelog || 'Initial release',
    date_published: g.metadata?.compiled_at || '2025-06-01T00:00:00Z',
    date_next_review: g.metadata?.review_due_at || '2027-06-01T00:00:00Z',
    is_emergency: STATIC_GUIDELINE_IDS.includes(g.protocol_id) && g.protocol_id !== 'dexmed-sop-afoi' && g.protocol_id !== 'post-op-fossa',
    clinical: g.clinical,
    search_tags: g.search_tags || [],
    pdf_name: g.pdf_name,
    default_page: g.default_page,
    calculator: g.calculator,
    summaryText: g.clinical?.steps ? g.clinical.steps.map((s: any) => s.text).join(' ') : 'NHS clinical guideline',
  }));
}

/** Build a fresh Orama keyword index from a guideline list. */
async function buildIndex(list: any[]): Promise<Orama<any>> {
  const db = await create({ schema: SEARCH_SCHEMA as any });

  for (const doc of list) {
    // Skip superseded guidelines
    if (doc.status === 'superseded' || doc.status === 'Superseded') {
      continue;
    }

    if (doc.records && doc.records.length > 0) {
      // Custom Dynamic Guideline (Full records loaded): Index each segment separately
      for (const rec of doc.records) {
        await insert(db as any, {
          title: rec.title || doc.name,
          context: rec.context || '',
          summaryText: rec.summaryText || doc.name,
          synonyms: rec.synonyms || [],
          breadcrumbs: rec.breadcrumbs || [doc.name],
          docId: doc.id,
          pdfName: doc.pdf_name || '',
          defaultPage: rec.page || 1,
        } as any);
      }
    } else {
      // Lightweight Guideline Summary OR Static Guideline: Index as a single document block
      await insert(db as any, {
        title: doc.name || '',
        context: doc.summaryText || doc.clinical?.steps?.map((s: any) => s.text).join(' ') || '',
        summaryText: doc.summaryText || doc.name || '',
        synonyms: doc.search_tags || [],
        breadcrumbs: [doc.name || ''],
        docId: doc.id,
        pdfName: doc.pdf_name || '',
        defaultPage: doc.default_page || 1,
      } as any);
    }
  }

  return db;
}

export function useSearch() {
  const [guidelines, setGuidelines] = useState<any[]>([]);
  const [oramaDb, setOramaDb] = useState<Orama<any> | null>(null);
  const [indexing, setIndexing] = useState(true);

  // Initialize Orama search engine with Stale-While-Revalidate LocalStorage caching
  useEffect(() => {
    async function initOrama() {
      try {
        let loadedGuidelines: any[] = [];

        // 1. Try to load from LocalStorage first for instant startup
        const localCached = typeof window !== 'undefined' ? localStorage.getItem('cached_guidelines_master') : null;
        if (localCached) {
          try {
            loadedGuidelines = JSON.parse(localCached);
          } catch (e) {
            console.error('Failed to parse cached guidelines:', e);
          }
        }

        // If no cache, use static guidelines as a base initial state
        if (loadedGuidelines.length === 0) {
          loadedGuidelines = mapStaticGuidelines();
        }

        setGuidelines(loadedGuidelines);
        setOramaDb(await buildIndex(loadedGuidelines));
        setIndexing(false);

        // 2. Fetch in background (SWR) from network
        try {
          const resp = await fetch('/api/guidelines');
          const data = await resp.json();
          if (data.success && data.guidelines) {
            const freshGuidelines = data.guidelines;
            const newGuidelinesStr = JSON.stringify(freshGuidelines);

            if (newGuidelinesStr !== localCached) {
              if (typeof window !== 'undefined') {
                localStorage.setItem('cached_guidelines_master', newGuidelinesStr);
              }
              setGuidelines(freshGuidelines);
              setOramaDb(await buildIndex(freshGuidelines));
            }
          }
        } catch (fetchErr) {
          console.warn('SWR background fetch failed, using local offline guidelines:', fetchErr);
        }
      } catch (err) {
        console.error('Failed to initialize Orama database:', err);
      }
    }

    initOrama();
  }, []);

  /**
   * Search guidelines using keyword (BM25) matching with field boosts.
   */
  const executeSearch = useCallback(async (query: string): Promise<{
    results: SearchResult[];
    isLowConfidence: boolean;
    isNegativeResult: boolean;
  }> => {
    if (!oramaDb) {
      return { results: [], isLowConfidence: false, isNegativeResult: false };
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return { results: [], isLowConfidence: false, isNegativeResult: false };
    }

    const oResults = await search(oramaDb, {
      term: trimmedQuery,
      properties: ['title', 'synonyms', 'context', 'summaryText'],
      boost: {
        title: 3.0,
        synonyms: 2.0,
      },
    });

    let maxScore = 0;
    const parsedResults: Array<SearchResult & { score: number }> = [];

    for (const match of oResults.hits) {
      const doc = match.document as any;
      const score = match.score || 0;
      if (score > maxScore) maxScore = score;

      parsedResults.push({
        title: doc.title,
        context: doc.context,
        summaryText: doc.summaryText,
        synonyms: doc.synonyms,
        breadcrumbs: doc.breadcrumbs,
        docId: doc.docId,
        matchStrength: strengthForScore(score),
        pdfName: doc.pdfName || '',
        defaultPage: doc.defaultPage || 1,
        score,
      });
    }

    const isNegativeResult = parsedResults.length === 0 || maxScore < SCORE_NEGATIVE_THRESHOLD;
    const isLowConfidence = !isNegativeResult && maxScore < SCORE_PARTIAL_THRESHOLD;

    if (isNegativeResult) {
      return { results: [], isLowConfidence: false, isNegativeResult: true };
    }

    return {
      results: parsedResults
        .sort((a, b) => b.score - a.score)
        .map(({ score, ...rest }) => rest),
      isLowConfidence,
      isNegativeResult: false,
    };
  }, [oramaDb]);

  return {
    indexing,
    executeSearch,
    guidelines,
    setGuidelines,
  };
}
