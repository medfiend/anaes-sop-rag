import { S3Client } from '@aws-sdk/client-s3';

// Initialize Cloudflare R2 Client (S3 Compatible)
const clAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID || '';
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
const r2BucketName = process.env.R2_BUCKET_NAME || 'anaessop-guidelines';

export const isR2Configured = !!(clAccountId && r2AccessKeyId && r2SecretAccessKey);

export const r2Client = isR2Configured
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${clAccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      },
    })
  : null;

export const R2_BUCKET = r2BucketName;

// Initialize D1 database and Workers AI HTTP helpers
const clApiToken = process.env.CLOUDFLARE_API_TOKEN || '';
const d1DatabaseId = process.env.D1_DATABASE_ID || '';

export const isCloudflareApiConfigured = !!(clAccountId && clApiToken);

/**
 * Execute a SQL query against Cloudflare D1 via the Client HTTP API.
 * Falls back to local logging and mock response if credentials are not configured.
 */
export async function queryD1(sql: string, params: any[] = []): Promise<{ success: boolean; results?: any[]; error?: string }> {
  if (!isCloudflareApiConfigured || !d1DatabaseId) {
    console.log(`[D1 MOCK QUERY] ${sql} | Params: ${JSON.stringify(params)}`);
    // Return dummy success structure
    return { success: true, results: [] };
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${clAccountId}/d1/database/${d1DatabaseId}/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${clApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql,
          params,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `D1 API Error: ${errorText}` };
    }

    const data = await response.json();
    if (data.success) {
      // D1 API returns database results under data.result[0].results
      const results = data.result?.[0]?.results || [];
      return { success: true, results };
    } else {
      return { success: false, error: data.errors?.[0]?.message || 'Query failed' };
    }
  } catch (error: any) {
    console.error("D1 Query execution failure:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Call Workers AI models via HTTP API.
 * Falls back to mock outputs if keys are not set.
 */
export async function runWorkersAI(
  model: string,
  input: any
): Promise<{ success: boolean; result?: any; error?: string; neurons?: number }> {
  if (!isCloudflareApiConfigured) {
    console.log(`[WORKERS AI MOCK] Running model: ${model}`);
    return { success: true, result: null };
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${clAccountId}/ai/run/${model}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${clApiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `AI API Error: ${errorText}` };
    }

    const data = await response.json();
    if (data.success) {
      // Cloudflare returns Neurons consumed in response headers/meta if available, or we estimate
      // Let's grab neurons if available, or return the standard response
      return { 
        success: true, 
        result: data.result,
        neurons: data.result?.meta?.neurons || 0
      };
    } else {
      return { success: false, error: data.errors?.[0]?.message || 'AI generation failed' };
    }
  } catch (error: any) {
    console.error("Workers AI failure:", error);
    return { success: false, error: error.message };
  }
}
