import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const ADMIN_EMAILS = ['audit.lead@nhs.net', 's.parashar1@nhs.net'];

/**
 * Verify the request is from an authenticated Clerk user.
 * Returns the user's email if authenticated, or a 401 NextResponse if not.
 */
export async function requireAuth(): Promise<{ email: string } | NextResponse> {
  try {
    const { userId, sessionClaims } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in.' },
        { status: 401 }
      );
    }
    const email = (sessionClaims?.email as string) || (sessionClaims as any)?.email_address || 'authenticated-user';
    return { email };
  } catch (err: any) {
    console.error("Clerk requireAuth error:", err);
    return NextResponse.json(
      { error: `Authentication error: ${err.message || String(err)}` },
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
    return NextResponse.json(
      { error: 'Access denied. Admin privileges required.' },
      { status: 403 }
    );
  }
  return result;
}
