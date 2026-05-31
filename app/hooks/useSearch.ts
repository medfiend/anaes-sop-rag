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
  const [oramaDb, setOramaDb] = useState<Orama<any> | null>(null);
  const [indexing, setIndexing] = useState(true);

  // Initialize Orama search engine
  useEffect(() => {
    async function initOrama() {
      try {
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

        // Insert static guidelines into Orama
        for (const doc of staticGuidelines) {
          // Construct text representations
          const title = doc.clinical.title || '';
          const context = doc.clinical.steps ? doc.clinical.steps.map((s: any) => s.text).join(' ') : '';
          const summaryText = doc.clinical.title || '';
          const synonyms = doc.search_tags || [];
          const breadcrumbs = [doc.clinical.title];
          
          // Generate a deterministic mock vector for static guidelines
          const vectorText = `${title} ${context} ${synonyms.join(' ')}`;
          const mockVector = Array(1024).fill(0).map((_, i) => {
            let hash = 0;
            for (let charIndex = 0; charIndex < vectorText.length; charIndex++) {
              hash = vectorText.charCodeAt(charIndex) + ((hash << 5) - hash);
            }
            return Math.sin(hash + i) * 0.1;
          });

          await insert(db, {
            title,
            context,
            summaryText,
            synonyms,
            breadcrumbs,
            docId: doc.protocol_id,
            masterVector: mockVector,
            pdfName: doc.pdf_name || '',
            defaultPage: doc.default_page || 1
          });
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
          const embedData = await embedResp.ok ? await embedResp.json() : null;
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
    executeSearch
  };
}
