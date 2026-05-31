import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    error: "This endpoint has been deprecated. Please use `/api/upload` for PDF guidelines ingestion.",
    success: false
  }, { status: 410 });
}
