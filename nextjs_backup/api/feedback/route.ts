import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const { email, feedback, category } = await req.json();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    const isLive = supabaseUrl && supabaseServiceKey;

    if (!isLive) {
      // Mock feedback submission
      console.log(`[FEEDBACK SUBMITTED] User: ${email} | Cat: ${category} | Msg: ${feedback}`);
      return NextResponse.json({ success: true, message: "Feedback submitted locally in pilot mode." });
    }

    // --- LIVE DB FEEDBACK LOGGER ---
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const { error } = await supabaseClient.from('user_feedbacks').insert({
      user_email: email,
      feedback: feedback,
      category: category
    });

    if (error) {
      throw new Error(`Database error logging feedback: ${error.message}`);
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("Feedback API Route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
