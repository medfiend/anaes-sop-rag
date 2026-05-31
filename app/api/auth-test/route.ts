import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const authState = await auth();
    return NextResponse.json({
      success: true,
      authenticated: !!authState.userId,
      userId: authState.userId,
      email: authState.sessionClaims?.email || (authState.sessionClaims as any)?.email_address || null,
      claims: authState.sessionClaims
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || String(err),
      stack: err.stack
    }, { status: 500 });
  }
}
