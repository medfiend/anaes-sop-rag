import { useState, useEffect, useMemo } from 'react';
import { create, insert, search, Orama } from '@orama/orama';
import staticGuidelines from '../../data/guidelines_db.json';

export interface SearchResult {
  title: string;
  context: string;
  summaryText: string;
  synonyms: string[];
  breadcrumbs: string[];
  docId: string;
  confidence: number;
  pdfName: string;
  defaultPage: number;
}

export function useSearch() {
  const [guidelines, setGuidelines] = useState<any[]>([]);
  const [oramaDb, setOramaDb] = useState<Orama<any> | null>(null);
  const [indexing, setIndexing] = useState(true);

  // Initialize Orama search engine
  useEffect(() => {
    async function initOrama() {
      try {
        // Fetch guidelines dynamically from backend endpoint
        const resp = await fetch('/api/guidelines');
        const data = await resp.json();
        
        let loadedGuidelines = [];
        if (data.success && data.guidelines) {
          loadedGuidelines = data.guidelines;
        } else {
          // Fallback to static mapping if API is unavailable
          loadedGuidelines = [...staticGuidelines].map((g: any) => ({
            id: g.protocol_id,
            name: g.clinical.title,
            version: g.metadata?.version_hash?.substring(0, 8) || 'v1.0.0',
            owner_email: g.metadata?.owner_email || 'audit.lead@nhs.net',
            status: g.status || 'Active',
            changelog: g.metadata?.changelog || 'Initial release',
            date_published: g.metadata?.compiled_at || '2025-06-01T00:00:00Z',
            date_next_review: g.metadata?.review_due_at || '2027-06-01T00:00:00Z',
            is_emergency: g.protocol_id === 'la-toxicity' || g.protocol_id === 'malignant-hyperthermia' || g.protocol_id === 'resus-als',
            clinical: g.clinical,
            search_tags: g.search_tags,
            pdf_name: g.pdf_name,
            default_page: g.default_page,
            calculator: g.calculator
          }));
        }

        setGuidelines(loadedGuidelines);

        const db = await create({
          schema: {
            title: 'string',
            context: 'string',
            summaryText: 'string',
            synonyms: 'string[]',
            masterVector: 'vector[1024]',
            docId: 'string',
            breadcrumbs: 'string[]',
            pdfName: 'string',
            defaultPage: 'number'
          }
        });

        // Insert guidelines into Orama
        for (const doc of loadedGuidelines) {
          // Skip superseded guidelines so they don't pollute current clinical searches
          if (doc.status === 'superseded' || doc.status === 'Superseded') {
            continue;
          }

          if (doc.records && doc.records.length > 0) {
            // Custom dynamic guideline: Index each parsed segment separately using pre-computed vectors
            for (const rec of doc.records) {
              await insert(db as any, {
                title: rec.title || doc.name,
                context: rec.context || '',
                summaryText: rec.summaryText || doc.name,
                synonyms: rec.synonyms || [],
                breadcrumbs: rec.breadcrumbs || [doc.name],
                docId: doc.id,
                masterVector: rec.masterVector || Array(1024).fill(0),
                pdfName: doc.pdf_name || '',
                defaultPage: 1
              } as any);
            }
          } else {
            // Static guideline: Index as a single document block
            const title = doc.name || '';
            const context = doc.clinical?.steps ? doc.clinical.steps.map((s: any) => s.text).join(' ') : '';
            const summaryText = doc.name || '';
            const synonyms = doc.search_tags || [];
            const breadcrumbs = [doc.name];
            
            // Generate a deterministic mock vector for static guidelines
            const vectorText = `${title} ${context} ${synonyms.join(' ')}`;
            const mockVector = Array(1024).fill(0).map((_, i) => {
              let hash = 0;
              for (let charIndex = 0; charIndex < vectorText.length; charIndex++) {
                hash = vectorText.charCodeAt(charIndex) + ((hash << 5) - hash);
              }
              return Math.sin(hash + i) * 0.1;
            });

            await insert(db as any, {
              title,
              context,
              summaryText,
              synonyms,
              breadcrumbs,
              docId: doc.id,
              masterVector: mockVector,
              pdfName: doc.pdf_name || '',
              defaultPage: doc.default_page || 1
            } as any);
          }
        }

        setOramaDb(db);
      } catch (err) {
        console.error("Failed to initialize Orama database:", err);
      } finally {
        setIndexing(false);
      }
    }

    initOrama();
  }, []);

  /**
   * Search guidelines using hybrid matching (Keyword + Vector similarity)
   */
  const executeSearch = async (query: string, skipEmbedding: boolean = false): Promise<{
    results: SearchResult[];
    isLowConfidence: boolean;
    isNegativeResult: boolean;
    confidenceLevel: number;
  }> => {
    if (!oramaDb) {
      return { results: [], isLowConfidence: false, isNegativeResult: false, confidenceLevel: 100 };
    }

    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) {
      return { results: [], isLowConfidence: false, isNegativeResult: false, confidenceLevel: 100 };
    }

    let queryVector: number[] | null = null;
    if (!skipEmbedding) {
      try {
        // Fetch 1024-dimensional query vector from backend embed route
        const embedResp = await fetch('/api/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        if (embedResp.ok) {
          const embedData = await embedResp.json();
          if (embedData && embedData.vector) {
            queryVector = embedData.vector;
          }
        }
      } catch (err) {
        console.warn("Could not retrieve query vector, falling back to pure keyword search.", err);
      }
    }

    // Execute Hybrid Orama Search with boosting
    const oResults = await search(oramaDb, {
      term: query,
      properties: ['title', 'synonyms', 'context', 'summaryText'],
      boost: {
        title: 3.0,
        synonyms: 2.0
      },
      ...(queryVector ? {
        vector: queryVector,
        property: 'masterVector',
        similarity: 0.65 // cosine similarity threshold
      } : {})
    });

    const parsedResults: SearchResult[] = [];
    let maxConfidence = 0;

    for (const match of oResults.hits) {
      const doc = match.document;
      
      // Calculate search confidence
      let confidence = 0;
      if (queryVector && match.score) {
        // Normalise vector similarity/keyword score to a percentage
        const rawSim = match.score;
        confidence = Math.round(Math.min(100, Math.max(20, (rawSim * 85))));
      } else {
        // Pure text fallback
        confidence = Math.round(Math.min(95, Math.max(30, (match.score * 50))));
      }

      if (confidence > maxConfidence) {
        maxConfidence = confidence;
      }

      parsedResults.push({
        title: doc.title,
        context: doc.context,
        summaryText: doc.summaryText,
        synonyms: doc.synonyms,
        breadcrumbs: doc.breadcrumbs,
        docId: doc.docId,
        confidence,
        pdfName: doc.pdfName || '',
        defaultPage: doc.defaultPage || 1
      });
    }

    // Apply strict guidelines constraints
    const isNegativeResult = parsedResults.length === 0 || maxConfidence < 40;
    const isLowConfidence = !isNegativeResult && maxConfidence < 60;

    if (isNegativeResult) {
      return {
        results: [
          {
            title: "No Matching SOP Guideline Found",
            context: "I cannot find the answer to this question in the active departmental guidelines. Please refer directly to the official guidelines or check the Emergency Protocols panel.",
            summaryText: "No matches found.",
            synonyms: [],
            breadcrumbs: ["System Search"],
            docId: "not-found",
            confidence: 100, // 100% confident it's not in the guidelines
            pdfName: "",
            defaultPage: 1
          }
        ],
        isLowConfidence: false,
        isNegativeResult: true,
        confidenceLevel: 100
      };
    }

    return {
      results: parsedResults.sort((a, b) => b.confidence - a.confidence),
      isLowConfidence,
      isNegativeResult: false,
      confidenceLevel: maxConfidence
    };
  };

  return {
    indexing,
    executeSearch,
    guidelines
  };
}
