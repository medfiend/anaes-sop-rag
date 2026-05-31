import { NextResponse } from 'next/server';
import { queryD1 } from '../../../lib/cloudflare';
import { requireAuth } from '../../../lib/authGuard';

// Helper to generate IDs
const generateUUID = () => {
  return typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : Math.random().toString(36).substring(2, 15);
};

export async function POST(req: Request) {
  try {
    // Auth guard
    const authResult = await requireAuth();
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { feedback, category } = await req.json();

    // Input validation
    const VALID_CATEGORIES = ['General Feedback', 'Bug Report', 'Feature Request', 'Clinical Content', 'Usability'];
    if (!feedback || typeof feedback !== 'string' || feedback.trim().length === 0) {
      return NextResponse.json({ error: 'Feedback text is required.' }, { status: 400 });
    }
    if (feedback.length > 2000) {
      return NextResponse.json({ error: 'Feedback must be under 2000 characters.' }, { status: 400 });
    }
    const validCategory = VALID_CATEGORIES.includes(category) ? category : 'General Feedback';

    // D1 Self-Healing Table initialization
    await queryD1(`
      CREATE TABLE IF NOT EXISTS user_feedbacks (
        id TEXT PRIMARY KEY,
        user_email TEXT,
        feedback TEXT,
        category TEXT,
        created_at TEXT
      )
    `);

    // Log feedback submission
    const feedbackId = generateUUID();
    const result = await queryD1(
      `INSERT INTO user_feedbacks (id, user_email, feedback, category, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [feedbackId, authResult.email, feedback, validCategory, new Date().toISOString()]
    );

    if (!result.success) {
      throw new Error(`D1 Database insertion failed: ${result.error}`);
    }

    return NextResponse.json({ success: true, message: "Feedback logged in D1 database successfully." });

  } catch (err: any) {
    console.error("Feedback API Route error:", err);
    return NextResponse.json({ error: 'Failed to submit feedback. Please try again.' }, { status: 500 });
  }
}
