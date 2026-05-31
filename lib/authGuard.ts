import { createClerkClient } from '@clerk/backend';
import { auth } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';

const ADMIN_EMAILS = ['audit.lead@nhs.net', 's.parashar1@nhs.net'];

/**
 * Get a verified Clerk user from a request.
 *
 * Strategy:
 * 1. Try the Authorization: Bearer <token> header first — this is the JWT
 *    that the admin page explicitly sends via getToken(). We verify it
 *    directly with the Clerk backend SDK, bypassing the middleware cookie
 *    system (which has issues with test-instance keys on Vercel deployments).
 * 2. Fall back to auth() (cookie-based session) for any other route.
 */
async function getVerifiedUser(req: Request): Promise<{ userId: string; email: string } | null> {
  // --- Path 1: Bearer token from Authorization header ---
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (bearerToken) {
    try {
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      const payload = await clerk.verifyToken(bearerToken);
      if (payload?.sub) {
        // Fetch user details from Clerk to get their email
        const user = await clerk.users.getUser(payload.sub);
        const email =
          user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress ||
          user.emailAddresses[0]?.emailAddress ||
          'authenticated-user';
        return { userId: payload.sub, email };
      }
    } catch (err: any) {
      console.warn('[authGuard] Bearer token verification failed:', err.message || err);
      // Fall through to cookie-based auth
    }
  }

  // --- Path 2: Cookie-based session via Clerk middleware ---
  try {
    const { userId, sessionClaims } = await auth();
    if (userId) {
      const email =
        (sessionClaims?.email as string) ||
        (sessionClaims as any)?.email_address ||
        'authenticated-user';
      return { userId, email };
    }
  } catch (err: any) {
    console.error('[authGuard] auth() threw:', err.message || err);
  }

  return null;
}

/**
 * Verify the request is from an authenticated Clerk user.
 * Accepts both Authorization: Bearer JWT and session cookies.
 */
export async function requireAuth(req: Request): Promise<{ email: string } | NextResponse> {
  const user = await getVerifiedUser(req);
  if (!user) {
    console.warn('[authGuard] requireAuth: no authenticated user found');
    return NextResponse.json(
      { error: 'Authentication required. Please sign in.' },
      { status: 401 }
    );
  }
  return { email: user.email };
}

/**
 * Verify the request is from an authenticated admin user.
 */
export async function requireAdmin(req: Request): Promise<{ email: string } | NextResponse> {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;

  if (!ADMIN_EMAILS.includes(result.email)) {
    console.warn('[authGuard] requireAdmin: access denied for', result.email);
    return NextResponse.json(
      { error: 'Access denied. Admin privileges required.' },
      { status: 403 }
    );
  }
  return result;
}
