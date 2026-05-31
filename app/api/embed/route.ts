import { NextResponse } from 'next/server';
import { runWorkersAI } from '../../../lib/cloudflare';
import { requireAuth } from '../../../lib/authGuard';

export async function POST(req: Request) {
  try {
    // Auth guard
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { query } = await req.json();
    if (!query) {
      return NextResponse.json({ error: "Missing query parameter" }, { status: 400 });
    }

    if (typeof query !== 'string' || query.length > 500) {
      return NextResponse.json({ error: 'Query must be a string under 500 characters.' }, { status: 400 });
    }
    
    // Call Cloudflare Workers AI embedding model
    const embeddingResponse = await runWorkersAI('@cf/qwen/qwen3-embedding-0.6b', {
      text: [query]
    });
    
    if (!embeddingResponse.success || !embeddingResponse.result) {
      // Fallback/mock vector if configuration is not live (1024 float dimensions)
      const mockVector = Array(1024).fill(0).map((_, i) => {
        // Generate pseudo-random numbers deterministic to the query to mimic vector coordinates
        let hash = 0;
        for (let charIndex = 0; charIndex < query.length; charIndex++) {
          hash = query.charCodeAt(charIndex) + ((hash << 5) - hash);
        }
        const val = Math.sin(hash + i) * 0.1;
        return val;
      });

      return NextResponse.json({ 
        vector: mockVector,
        neurons: 0.05,
        success: true,
        mock: true
      });
    }
    
    // Cloudflare Workers AI embedding format returns array of data array
    const vector = embeddingResponse.result.data?.[0] || embeddingResponse.result.embeddings?.[0];
    if (!vector) {
      throw new Error("Could not parse embedding vector from response");
    }
    
    return NextResponse.json({
      vector,
      neurons: embeddingResponse.neurons || 0.1,
      success: true
    });
  } catch (error: any) {
    console.error("Embedding API error:", error);
    return NextResponse.json({ error: 'Embedding service encountered an error.' }, { status: 500 });
  }
}
