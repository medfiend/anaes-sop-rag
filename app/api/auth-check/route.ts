import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

// Diagnostic endpoint — no auth required, just reports auth state
// Remove this route after debugging is complete
export async function GET() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 'NOT SET';
  const secretKeySet = !!process.env.CLERK_SECRET_KEY;
  const secretKeyPrefix = process.env.CLERK_SECRET_KEY?.substring(0, 12) || 'NOT SET';

  let authResult: any = null;
  try {
    const { userId, sessionClaims } = await auth();
    authResult = {
      userId: userId || null,
      hasSession: !!userId,
      email: (sessionClaims as any)?.email || (sessionClaims as any)?.email_address || null,
    };
  } catch (err: any) {
    authResult = { error: err.message || String(err) };
  }

  return NextResponse.json({
    clerkConfig: {
      publishableKey: publishableKey.substring(0, 20) + '...',
      secretKeySet,
      secretKeyPrefix,
    },
    authState: authResult,
    nodeEnv: process.env.NODE_ENV,
  });
}
