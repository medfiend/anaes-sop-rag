import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const { query, history } = await req.json();
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // Use service role for backend queries
    const geminiApiKey = process.env.GEMINI_API_KEY || '';
    const openaiApiKey = process.env.OPENAI_API_KEY || '';

    // Check if we are running in Live Mode or Fallback Pilot Mode
    const isLive = supabaseUrl && supabaseServiceKey && geminiApiKey && openaiApiKey;

    if (!isLive) {
      // Fallback Pilot Mode (Simulated RAG)
      return handleMockSearch(query);
    }

    // --- LIVE AI RAG MODE ---
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Generate Embeddings for User Query via OpenAI (text-embedding-3-small)
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        input: query,
        model: 'text-embedding-3-small'
      })
    });

    if (!embeddingResponse.ok) {
      throw new Error(`OpenAI Embedding API error: ${await embeddingResponse.text()}`);
    }

    const embeddingData = await embeddingResponse.json();
    const queryVector = embeddingData.data[0].embedding;

    // 2. Perform Hybrid Similarity Search in Supabase using an RPC function
    // This function performs a cosine-similarity vector scan and filters where status = 'Active'
    const { data: matchedChunks, error: rpcError } = await supabaseClient.rpc('hybrid_search_active', {
      query_text: query,
      query_embedding: queryVector,
      match_threshold: 0.70,
      match_count: 5
    });

    if (rpcError) {
      throw new Error(`Database retrieval error: ${rpcError.message}`);
    }

    // If no context matched the threshold, trigger the clinical fallback
    if (!matchedChunks || matchedChunks.length === 0) {
      // Log the search gap in the database for admin auditing
      await supabaseClient.from('search_gaps').insert({ query });
      return NextResponse.json({
        sender: 'bot',
        text: "I cannot find the answer to this question in the active departmental guidelines. Please refer directly to the official guidelines or check the Emergency Protocols panel.",
        citations: []
      });
    }

    // 3. Format Context for Gemini 1.5 Pro
    const contextText = matchedChunks.map((chunk: any, index: number) => 
      `[Source: ${chunk.doc_name}, Page: ${chunk.page_number}] (ID: ${chunk.doc_id})\nContent: ${chunk.content}`
    ).join('\n\n');

    // 4. Construct Strict System Prompt for Grounding
    const systemPrompt = `You are a clinical decision support bot for the Anaesthetics Department at St George's Hospital.
Your task is to answer the user's clinical query using ONLY the provided active guideline context.

Rules:
1. Base your answer solely on the guideline text provided below. Do not use prior medical knowledge.
2. If the context does not contain the answer, state exactly: "I cannot find the answer to this question in the active departmental guidelines. Please refer directly to the official guidelines or check the Emergency Protocols panel."
3. Cite your sources directly inside the text using [Page X] formatting.
4. Keep your answer brief, structured, and clinically actionable.

Active Guidelines Context:
${contextText}

User Query:
"${query}"`;

    // 5. Invoke Gemini 1.5 Pro API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            temperature: 0.1, // low temperature to ensure strict adherence
            maxOutputTokens: 800
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      throw new Error(`Gemini API error: ${await geminiResponse.text()}`);
    }

    const geminiData = await geminiResponse.json();
    const botText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Error generating response.";

    // Map database structures to UI citation objects
    const citations = matchedChunks.map((chunk: any) => ({
      docId: chunk.doc_id,
      docName: chunk.doc_name,
      page: chunk.page_number,
      highlight: chunk.bounding_boxes?.[0] || { x0: 10, y0: 10, x1: 500, y1: 50 }
    }));

    return NextResponse.json({
      sender: 'bot',
      text: botText,
      citations
    });

  } catch (err: any) {
    console.error("RAG search API Route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Simulated search engine helper for the offline Pilot Mode
function handleMockSearch(query: string) {
  const lowerQuery = query.toLowerCase();
  let botResponse = "";
  let citations: any[] = [];

  const dexmedKeywords = ['dex', 'dexmed', 'afoi', 'sedation', 'intubation', 'weight', 'bmi', 'ibw', 'adjbw', 'abw', 'devine', 'dilute', 'ramsay', 'st george', 'fibreoptic', 'awake', 'infusion', 'loading', 'dose', 'regime', 'olivia', 'kourteli', 'soba', 'concentration'];
  
  if (dexmedKeywords.some(kw => lowerQuery.includes(kw) || kw.includes(lowerQuery))) {
    botResponse = "For **Awake Fibreoptic Intubation (AFOI)** using **Dexmedetomidine** sedation at St George's Hospital:\n\n" +
      "1. **Infusion Setup:** Dilute Dexmedetomidine 200mcg in 50ml 0.9% NaCl, giving a final concentration of **4mcg/ml** [Page 4].\n" +
      "2. **Dosing Weight:** Weight-based dosing should use patient's actual body weight (ABW) if BMI < 30. If BMI > 30, Adjusted Body Weight (AdjBW) must be calculated using the Devine formula [Page 9].\n" +
      "3. **Regime:** Give a **loading dose of 1mcg/kg** over 10 minutes, followed by a **maintenance infusion of 0.2 to 0.7 mcg/kg/h**, titrating to a Ramsay Sedation Scale (RSS) target score of 2 or 3 [Page 4].";
    
    citations = [
      { docId: 'dexmed-sop-afoi-uuid', docName: 'Dexmed SOP for AFOI', page: 4, text: 'Dilute Dexmedetomidine 200mcg in 50ml 0.9% NaCl... concentration 4mcg/ml', highlight: { x0: 10, y0: 600, x1: 500, y1: 760 } },
      { docId: 'dexmed-sop-afoi-uuid', docName: 'Dexmed SOP for AFOI', page: 9, text: 'Devine formula for Ideal Body Weight...', highlight: { x0: 10, y0: 250, x1: 500, y1: 450 } }
    ];
  } 
  else if (lowerQuery.includes('toxicity') || lowerQuery.includes('intralipid') || lowerQuery.includes('local anaesthetic')) {
    botResponse = "In the event of **Local Anaesthetic Toxicity (LAST)**:\n\n" +
      "1. **Immediate Action:** Stop injecting the local anaesthetic, call for help, and manage the airway with 100% oxygen [Page 1].\n" +
      "2. **Fat Emulsion Therapy:** Administer **Intralipid 20%** lipid rescue:\n" +
      "   - Give an immediate **IV bolus of 1.5 ml/kg** over 1 minute [Page 1].\n" +
      "   - Start an **IV infusion of 15 ml/kg/h** [Page 1].\n" +
      "   - Repeat bolus twice at 5-minute intervals if cardiovascular stability is not restored [Page 2].";
    
    citations = [
      { docId: 'la-toxicity-guideline-uuid', docName: 'AAGBI LA Toxicity Guide', page: 1, text: 'Stop injecting LA... Give Intralipid 20% bolus 1.5 ml/kg', highlight: { x0: 20, y0: 300, x1: 480, y1: 450 } }
    ];
  } 
  else if (lowerQuery.includes('hyperthermia') || lowerQuery.includes('malignant')) {
    botResponse = "For **Malignant Hyperthermia Crisis** management:\n\n" +
      "1. **Trigger Stop:** Discontinue all volatile anaesthetics and succinylcholine immediately. Hyperventilate with 100% oxygen at high flows [Page 1].\n" +
      "2. **Antidote:** Administer **Dantrolene** immediately (2.5 mg/kg IV bolus, repeating as necessary up to 10 mg/kg) [Page 2].\n" +
      "3. **Cooling:** Active cooling of patient using iced saline IV infusions, body cavity lavage, and surface ice packs [Page 3].";
    
    citations = [
      { docId: 'malignant-hyperthermia-uuid', docName: 'AAGBI Malignant Hyperthermia Guide', page: 1, text: 'Stop volatile agents... Give Dantrolene', highlight: { x0: 15, y0: 200, x1: 490, y1: 350 } }
    ];
  } 
  else {
    botResponse = "I cannot find the answer to this question in the active departmental guidelines. Please refer directly to the official guidelines or check the Emergency Protocols panel.";
  }

  return NextResponse.json({
    sender: 'bot',
    text: botResponse,
    citations
  });
}
