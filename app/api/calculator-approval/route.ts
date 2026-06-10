import { NextResponse } from 'next/server';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET, isR2Configured, queryD1 } from '../../../lib/cloudflare';
import { requireAdmin } from '../../../lib/authGuard';

/**
 * Admin clinical sign-off for LLM-generated dose calculators (DCB0129 gate).
 *
 * POST { documentId: string, approved: boolean }
 *
 * Updates the calculator approval flag on the guideline's master and summary
 * JSON in R2 (and the consolidated summaries index), and writes an audit_logs
 * row recording who approved/revoked and when.
 */
export async function POST(req: Request) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { documentId, approved } = await req.json();

    if (!documentId || typeof documentId !== 'string' || typeof approved !== 'boolean') {
      return NextResponse.json({ error: 'documentId (string) and approved (boolean) are required.' }, { status: 400 });
    }
    if (documentId.includes('..') || documentId.includes('/') || documentId.includes('\\') || /[*?%#$:;]/.test(documentId)) {
      return NextResponse.json({ error: 'Invalid documentId.' }, { status: 400 });
    }

    if (!isR2Configured || !r2Client) {
      return NextResponse.json({ error: 'Storage service is not configured.' }, { status: 503 });
    }

    const approvedAt = new Date().toISOString();
    const approvedBy = authResult.email;

    // 1. Update the master index (full guideline incl. calculator schema)
    const masterKey = `index/${documentId}_master.json`;
    let master: any;
    try {
      const masterObj = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: masterKey }));
      master = JSON.parse(await masterObj.Body!.transformToString());
    } catch (err) {
      console.error(`Calculator approval: master index not found for ${documentId}:`, err);
      return NextResponse.json({ error: 'Guideline not found.' }, { status: 404 });
    }

    if (!master.calculator) {
      return NextResponse.json({ error: 'This guideline has no calculator to approve.' }, { status: 400 });
    }

    master.calculatorApproved = approved;
    master.calculatorApprovedBy = approved ? approvedBy : null;
    master.calculatorApprovedAt = approved ? approvedAt : null;

    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: masterKey,
      Body: JSON.stringify(master),
      ContentType: 'application/json',
    }));

    // 2. Update the per-guideline summary
    const summaryKey = `index/${documentId}_summary.json`;
    let summary: any = null;
    try {
      const summaryObj = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: summaryKey }));
      summary = JSON.parse(await summaryObj.Body!.transformToString());
      summary.calculator_approved = approved;
      summary.calculator_approved_by = approved ? approvedBy : null;
      summary.calculator_approved_at = approved ? approvedAt : null;
      await r2Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: summaryKey,
        Body: JSON.stringify(summary),
        ContentType: 'application/json',
      }));
    } catch (err) {
      console.warn(`Calculator approval: summary index missing for ${documentId} (continuing):`, err);
    }

    // 3. Update the consolidated summaries master index
    try {
      const summariesKey = 'index/summaries_master.json';
      const summariesObj = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: summariesKey }));
      const allSummaries: any[] = JSON.parse(await summariesObj.Body!.transformToString());
      const updated = allSummaries.map((s: any) =>
        s.id === documentId
          ? { ...s, calculator_approved: approved, calculator_approved_by: approved ? approvedBy : null, calculator_approved_at: approved ? approvedAt : null }
          : s
      );
      await r2Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: summariesKey,
        Body: JSON.stringify(updated),
        ContentType: 'application/json',
      }));
    } catch (err) {
      console.warn('Calculator approval: could not update summaries_master.json (continuing):', err);
    }

    // 4. Audit trail in D1
    try {
      await queryD1(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          document_id TEXT,
          action TEXT,
          user_email TEXT,
          timestamp TEXT,
          details TEXT
        )
      `);
      await queryD1(
        `INSERT INTO audit_logs (id, document_id, action, user_email, timestamp, details)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          documentId,
          approved ? 'calculator_approved' : 'calculator_approval_revoked',
          approvedBy,
          approvedAt,
          `Dose calculator "${master.calculator?.calculator_name || master.calculator?.calculatorName || 'unnamed'}" ${approved ? 'approved for clinical use' : 'approval revoked'} by ${approvedBy}.`,
        ]
      );
    } catch (auditErr) {
      // The approval itself succeeded; surface but don't roll back.
      console.error('Calculator approval: audit log write failed:', auditErr);
    }

    return NextResponse.json({
      success: true,
      documentId,
      calculator_approved: approved,
      calculator_approved_by: approved ? approvedBy : null,
      calculator_approved_at: approved ? approvedAt : null,
    });
  } catch (error: any) {
    console.error('Calculator approval endpoint error:', error);
    return NextResponse.json({ error: 'Failed to update calculator approval.' }, { status: 500 });
  }
}
