import { NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { queryD1, r2Client, R2_BUCKET, isR2Configured } from '../../../lib/cloudflare';
import { requireAuth } from '../../../lib/authGuard';
import staticGuidelines from '../../../data/guidelines_db.json';

export async function GET(req: Request) {
  try {
    // Auth guard — guideline content is restricted to signed-in NHS staff.
    // (Emergency bypass uses the static guidelines bundled with the client.)
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    // 1. Dynamic Pull-Through Mode: Load the full master guideline index from R2
    if (id) {
      // Input validation & Path traversal protection on id to block directory listing/enumeration manipulation
      if (typeof id !== 'string' || id.includes('..') || id.includes('/') || id.includes('\\') || /[*?%#$:;]/.test(id)) {
        return NextResponse.json({ success: false, error: 'Invalid guideline identifier.' }, { status: 400 });
      }

      if (!isR2Configured || !r2Client) {
        return NextResponse.json({ success: false, error: 'Storage service not configured.' }, { status: 500 });
      }

      try {
        const r2Object = await r2Client.send(new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: `index/${id}_master.json`
        }));

        if (r2Object && r2Object.Body) {
          const r2Text = await r2Object.Body.transformToString();
          const masterData = JSON.parse(r2Text);
          
          const fullGuideline = {
            id: masterData.documentId,
            name: masterData.name,
            version: masterData.version,
            owner_email: masterData.ownerEmail,
            status: 'live',
            changelog: masterData.changelog,
            date_published: masterData.compiledAt,
            date_next_review: masterData.nextReview || '2028-01-01',
            is_emergency: !!masterData.isEmergency,
            pdf_name: masterData.fileKey.startsWith('guidelines/') ? masterData.fileKey.substring(11) : masterData.fileKey,
            fileKey: masterData.fileKey,
            records: masterData.records || [],
            calculator: masterData.calculator,
            calculator_approved: masterData.calculatorApproved === true,
            calculator_approved_by: masterData.calculatorApprovedBy || null,
            calculator_approved_at: masterData.calculatorApprovedAt || null
          };

          return NextResponse.json({ success: true, guideline: fullGuideline });
        }
      } catch (r2Err) {
        console.error(`Failed to pull through master index for guideline ${id}:`, r2Err);
        return NextResponse.json({ success: false, error: 'Guideline full content not found or inaccessible.' }, { status: 404 });
      }
    }

    // 2. Consolidated List Mode: Fetch lightweight summaries for custom guidelines
    let allSummaries: any[] = [];
    let r2MasterSummariesLoaded = false;

    if (isR2Configured && r2Client) {
      try {
        const r2Object = await r2Client.send(new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: 'index/summaries_master.json'
        }));
        if (r2Object && r2Object.Body) {
          const r2Text = await r2Object.Body.transformToString();
          allSummaries = JSON.parse(r2Text);
          r2MasterSummariesLoaded = true;
        }
      } catch (r2Err) {
        console.warn("Could not load index/summaries_master.json from R2, will reconstruct dynamically:", r2Err);
      }
    }

    // Fallback dynamic construction if summaries_master.json doesn't exist in R2
    if (!r2MasterSummariesLoaded) {
      try {
        const { results: customGuides } = await queryD1(
          "SELECT id, name, version, owner_email, status, changelog, created_at, next_review, is_emergency, supersedes_id FROM guidelines_meta ORDER BY created_at DESC"
        );

        if (customGuides && customGuides.length > 0) {
          const customSummaries = await Promise.all(customGuides.map(async (g: any) => {
            if (g.status === 'uploading' || g.status === 'vectorizing') {
              return null;
            }
            if (isR2Configured && r2Client) {
              try {
                const r2Object = await r2Client.send(new GetObjectCommand({
                  Bucket: R2_BUCKET,
                  Key: `index/${g.id}_summary.json`
                }));
                if (r2Object && r2Object.Body) {
                  const r2Text = await r2Object.Body.transformToString();
                  return JSON.parse(r2Text);
                }
              } catch (r2Err) {
                console.warn(`Could not load summary for guideline ${g.id} from R2:`, r2Err);
              }
            }
            return {
              id: g.id,
              name: g.name,
              version: g.version,
              owner_email: g.owner_email,
              status: g.status,
              changelog: g.changelog,
              date_published: g.created_at,
              date_next_review: g.next_review || '2028-01-01',
              is_emergency: !!g.is_emergency,
              pdf_name: `${g.id}_guideline.pdf`,
              summaryText: `Clinical guideline details for ${g.name}.`,
              search_tags: [g.name.toLowerCase()],
              hasCalculator: false
            };
          }));

          allSummaries = customSummaries.filter(Boolean) as any[];
        }
      } catch (d1Err) {
        console.warn("Could not query custom guidelines from D1:", d1Err);
      }
    }

    // Static guidelines (always full context for local failover and offline emergency access)
    const staticGuidesList = [...staticGuidelines].map((g: any) => ({
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
      search_tags: g.search_tags || [],
      pdf_name: g.pdf_name,
      default_page: g.default_page,
      calculator: g.calculator,
      summaryText: g.clinical.steps ? g.clinical.steps.map((s: any) => s.text).join(' ') : "NHS clinical guideline"
    }));

    // Filter summaries list to extract only custom dynamic ones and prevent duplicates of static guidelines
    const customGuidesList = allSummaries.filter((s: any) => 
      !['la-toxicity', 'malignant-hyperthermia', 'resus-als', 'dexmed-sop-afoi', 'post-op-fossa'].includes(s.id)
    );

    // Apply superseding states to static guidelines list if replaced by dynamic custom guidelines
    customGuidesList.forEach(cs => {
      if (cs.status === 'live' && cs.supersedes_id) {
        const index = staticGuidesList.findIndex(mg => mg.id === cs.supersedes_id);
        if (index !== -1) {
          staticGuidesList[index].status = 'superseded';
        }
      }
    });

    const mergedGuidelines = [...staticGuidesList, ...customGuidesList];
    return NextResponse.json({ success: true, guidelines: mergedGuidelines });
  } catch (error: any) {
    console.error("GET guidelines error:", error);
    // Safe fallback state: Return at least the static guidelines array even if the entire logic fails
    try {
      const fallbackGuidelines = [...staticGuidelines].map((g: any) => ({
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
      return NextResponse.json({ success: true, guidelines: fallbackGuidelines, fallback: true });
    } catch (fallbackErr) {
      return NextResponse.json({ success: false, error: 'Failed to load guidelines. Please refresh the page.' }, { status: 500 });
    }
  }
}
