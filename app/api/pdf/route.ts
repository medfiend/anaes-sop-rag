import { NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../lib/cloudflare';
import { requireAuth } from '../../../lib/authGuard';
import fs from 'fs';
import path from 'path';

export async function GET(req: Request) {
  try {
    // 1. Authenticate Request
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { searchParams } = new URL(req.url);
    const file = searchParams.get('file');

    if (!file || typeof file !== 'string') {
      return new Response("Missing file parameter", { status: 400 });
    }

    // Path traversal & character validation protection to block directory enumeration/listing wildcards
    if (file.includes('..') || file.includes('/') || file.includes('\\') || /[*?%#$:;]/.test(file)) {
      return new Response("Invalid file path", { status: 400 });
    }

    // 2. Check local folders. Trust SOP PDFs live in guidelines/ (NOT public/)
    // so they are only reachable through this authenticated route; only the
    // QRH emergency handbook remains in public/ for zero-auth crisis access.
    const candidatePaths = [
      path.join(process.cwd(), 'guidelines', file),
      path.join(process.cwd(), 'public', file),
      path.join(process.cwd(), 'public', `guidelines/${file}`),
    ];
    const localPath = candidatePaths.find(p => fs.existsSync(p)) || '';

    if (localPath) {
      const fileBuffer = fs.readFileSync(localPath);
      return new Response(fileBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${encodeURIComponent(file)}"`,
          'Cache-Control': 'private, max-age=86400', // authenticated content — browser cache only
        }
      });
    }

    // 3. Fetch from Cloudflare R2 for custom uploaded guidelines
    if (!isR2Configured || !r2Client) {
      return new Response(
        "File storage service is temporarily unavailable. Please try again later.", 
        { status: 503 }
      );
    }

    let r2Object: any = null;
    let fileKey = file;

    try {
      r2Object = await r2Client.send(new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: fileKey
      }));
    } catch (err1) {
      try {
        fileKey = `guidelines/${file}`;
        r2Object = await r2Client.send(new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: fileKey
        }));
      } catch (err2) {
        console.error(`File '${file}' not found in R2 bucket under direct or guidelines/ prefix.`);
        return new Response(`File '${file}' not found.`, { status: 404 });
      }
    }

    if (!r2Object || !r2Object.Body) {
      return new Response("The file in R2 contains no data", { status: 404 });
    }

    // Read the stream into a byte array
    const byteArray = await r2Object.Body.transformToByteArray();

    return new Response(byteArray, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${encodeURIComponent(file)}"`,
        'Cache-Control': 'private, max-age=3600', // authenticated content — browser cache only
      }
    });

  } catch (error: any) {
    console.error("Error streaming PDF:", error);
    return new Response("An error occurred loading this file.", { status: 500 });
  }
}
