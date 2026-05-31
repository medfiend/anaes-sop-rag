import { NextResponse } from 'next/server';
import { queryD1 } from '../../../lib/cloudflare';

// Helper to generate IDs
const generateUUID = () => {
  return typeof crypto !== 'undefined' && crypto.randomUUID 
    ? crypto.randomUUID() 
    : Math.random().toString(36).substring(2, 15);
};

export async function POST(req: Request) {
  try {
    const { email, feedback, category } = await req.json();

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
      [feedbackId, email || 'anonymous', feedback || '', category || 'General Feedback', new Date().toISOString()]
    );

    if (!result.success) {
      throw new Error(`D1 Database insertion failed: ${result.error}`);
    }

    return NextResponse.json({ success: true, message: "Feedback logged in D1 database successfully." });

  } catch (err: any) {
    console.error("Feedback API Route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
