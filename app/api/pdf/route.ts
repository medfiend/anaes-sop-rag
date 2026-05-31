import { NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../lib/cloudflare';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const file = searchParams.get('file');

    if (!file) {
      return new Response("Missing file parameter", { status: 400 });
    }

    if (!isR2Configured || !r2Client) {
      return new Response("Cloudflare R2 storage is not configured on the server", { status: 500 });
    }

    // Try common keys in the R2 bucket:
    // 1. Check if the file is stored under its exact name (e.g., "Dexmed SOP for AFOI.KD..pdf")
    // 2. Check if the file is stored in the "guidelines/" folder (e.g., "guidelines/Dexmed SOP for AFOI.KD..pdf")
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
        return new Response(`File '${file}' not found in Cloudflare R2 bucket.`, { status: 404 });
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
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      }
    });

  } catch (error: any) {
    console.error("Error streaming PDF from R2:", error);
    return new Response(`Server error loading PDF from R2: ${error.message}`, { status: 500 });
  }
}
