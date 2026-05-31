import { NextResponse } from 'next/server';
import { queryD1 } from '../../../lib/cloudflare';
import staticGuidelines from '../../../data/guidelines_db.json';

export async function GET() {
  try {
    let mergedGuidelines = [...staticGuidelines].map(g => ({
      id: g.protocol_id,
      name: g.clinical.title,
      version: g.metadata?.version_hash?.substring(0, 8) || 'v1.0.0',
      owner_email: g.metadata?.owner_email || 'audit.lead@nhs.net',
      status: g.metadata?.status || 'Active',
      changelog: g.metadata?.changelog || 'Initial release',
      date_published: g.metadata?.compiled_at || '2025-06-01T00:00:00Z',
      date_next_review: g.metadata?.review_due_at || '2027-06-01T00:00:00Z',
      is_emergency: g.protocol_id === 'la-toxicity' || g.protocol_id === 'malignant-hyperthermia' || g.protocol_id === 'resus-als'
    }));

    // Fetch custom guidelines from D1 database
    try {
      const { results: customGuides } = await queryD1(
        "SELECT id, name, version, owner_email, status, changelog, created_at, next_review, is_emergency, supersedes_id FROM guidelines_meta ORDER BY created_at DESC"
      );

      if (customGuides && customGuides.length > 0) {
        customGuides.forEach((g: any) => {
          // Skip uncompleted/failed uploads from older code runs
          if (g.status === 'uploading' || g.status === 'vectorizing') {
            return;
          }

          // If the custom guideline is a replacement and is live, mark the superseded guideline as superseded in the runtime list
          if (g.status === 'live' && g.supersedes_id) {
            const index = mergedGuidelines.findIndex(mg => mg.id === g.supersedes_id);
            if (index !== -1) {
              mergedGuidelines[index].status = 'superseded';
            }
          }


          mergedGuidelines.push({
            id: g.id,
            name: g.name,
            version: g.version,
            owner_email: g.owner_email,
            status: g.status,
            changelog: g.changelog,
            date_published: g.created_at,
            date_next_review: g.next_review || '2028-01-01',
            is_emergency: !!g.is_emergency
          });
        });
      }
    } catch (d1Err) {
      console.warn("Could not query guidelines from D1, returning static list only:", d1Err);
    }

    return NextResponse.json({ success: true, guidelines: mergedGuidelines });
  } catch (error: any) {
    console.error("GET guidelines error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
