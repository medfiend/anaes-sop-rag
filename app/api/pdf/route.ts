import { NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_BUCKET, isR2Configured } from '../../../lib/cloudflare';
import fs from 'fs';
import path from 'path';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const file = searchParams.get('file');

    if (!file) {
      return new Response("Missing file parameter", { status: 400 });
    }

    // 1. Check if the file exists locally in the public folder
    const publicFilePath = path.join(process.cwd(), 'public', file);
    const altPublicFilePath = path.join(process.cwd(), 'public', `guidelines/${file}`);
    
    let localPath = '';
    if (fs.existsSync(publicFilePath)) {
      localPath = publicFilePath;
    } else if (fs.existsSync(altPublicFilePath)) {
      localPath = altPublicFilePath;
    }

    if (localPath) {
      const fileBuffer = fs.readFileSync(localPath);
      return new Response(fileBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${encodeURIComponent(file)}"`,
          'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        }
      });
    }

    // 2. Fetch from Cloudflare R2 for custom uploaded guidelines
    if (!isR2Configured || !r2Client) {
      const missing = [];
      if (!process.env.CLOUDFLARE_ACCOUNT_ID) missing.push('CLOUDFLARE_ACCOUNT_ID');
      if (!process.env.R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
      if (!process.env.R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
      return new Response(
        `Cloudflare R2 is not configured. Missing environment variables: ${missing.join(', ')}. Cannot serve custom file: ${file}`, 
        { status: 500 }
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
    console.error("Error streaming PDF:", error);
    return new Response(`Server error loading PDF: ${error.message}`, { status: 500 });
  }
}

