import { NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/backend';
import { auth } from '@clerk/nextjs/server';

// Diagnostic endpoint — no auth required, just reports auth state
// Remove this route after debugging is complete
export async function GET(req: Request) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 'NOT SET';
  const secretKeySet = !!process.env.CLERK_SECRET_KEY;
  const secretKeyPrefix = process.env.CLERK_SECRET_KEY?.substring(0, 12) || 'NOT SET';

  // Check Bearer token
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  let bearerResult: any = { present: !!bearerToken };
  if (bearerToken) {
    try {
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      const payload = await clerk.verifyToken(bearerToken);
      bearerResult = { present: true, valid: true, sub: payload?.sub };
    } catch (err: any) {
      bearerResult = { present: true, valid: false, error: err.message };
    }
  }

  // Check cookie-based auth()
  let cookieResult: any = null;
  try {
    const { userId, sessionClaims } = await auth();
    cookieResult = {
      userId: userId || null,
      hasSession: !!userId,
      email: (sessionClaims as any)?.email || (sessionClaims as any)?.email_address || null,
    };
  } catch (err: any) {
    cookieResult = { error: err.message || String(err) };
  }

  return NextResponse.json({
    clerkConfig: {
      publishableKey: publishableKey.substring(0, 20) + '...',
      secretKeySet,
      secretKeyPrefix,
    },
    bearerTokenAuth: bearerResult,
    cookieAuth: cookieResult,
    nodeEnv: process.env.NODE_ENV,
  });
}
