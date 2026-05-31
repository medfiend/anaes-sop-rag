import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const ADMIN_EMAILS = ['audit.lead@nhs.net', 's.parashar1@nhs.net'];

/**
 * Verify the request is from an authenticated Clerk user.
 * Returns the user's email if authenticated, or a 401 NextResponse if not.
 *
 * auth() reads the Clerk session from the request cookies automatically.
 * Same-origin fetch() calls from the browser always include cookies.
 */
export async function requireAuth(): Promise<{ email: string } | NextResponse> {
  try {
    const { userId, sessionClaims } = await auth();
    if (!userId) {
      // Log detail so we can see in Vercel function logs what's happening
      console.warn('[requireAuth] userId is null — session cookie not recognised by Clerk');
      return NextResponse.json(
        { error: 'Authentication required. Please sign in.' },
        { status: 401 }
      );
    }
    const email =
      (sessionClaims?.email as string) ||
      (sessionClaims as any)?.email_address ||
      'authenticated-user';
    return { email };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error('[requireAuth] Clerk auth() threw:', msg);
    return NextResponse.json(
      { error: `Authentication error: ${msg}` },
      { status: 401 }
    );
  }
}

/**
 * Verify the request is from an authenticated admin user.
 * Returns the user's email if admin, or a 403/401 NextResponse if not.
 */
export async function requireAdmin(): Promise<{ email: string } | NextResponse> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;

  if (!ADMIN_EMAILS.includes(result.email)) {
    console.warn(`[requireAdmin] Access denied for email: ${result.email}`);
    return NextResponse.json(
      { error: 'Access denied. Admin privileges required.' },
      { status: 403 }
    );
  }
  return result;
}
