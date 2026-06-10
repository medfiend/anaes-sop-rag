import { createClerkClient, verifyToken } from '@clerk/backend';
import { auth } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'audit.lead@nhs.net,s.parashar1@nhs.net')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * NHS staff domain policy. Admin emails are allowed regardless so that the
 * demo identity and any explicitly trusted accounts keep working.
 */
function isPermittedEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return lower.endsWith('@nhs.net') || lower.endsWith('.nhs.uk') || ADMIN_EMAILS.includes(lower);
}

/** Parse a cookie header into name/value pairs (exact matching, no substring tricks). */
function getCookieValue(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    if (part.slice(0, eqIdx).trim() === name) {
      return decodeURIComponent(part.slice(eqIdx + 1).trim());
    }
  }
  return null;
}

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
  // --- Path 0: Demo Mode Bypass ---
  if (process.env.DEMO_MODE === 'true' && process.env.DEMO_PASSCODE) {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    const cookieHeader = req.headers.get('cookie') || '';
    const demoCookie = getCookieValue(cookieHeader, 'demo_passcode');

    if (demoCookie === process.env.DEMO_PASSCODE || bearerToken === process.env.DEMO_PASSCODE) {
      return { userId: 'demo-user-id', email: 'audit.lead@nhs.net' };
    }
  }

  // --- Path 1: Bearer token from Authorization header ---
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (bearerToken) {
    try {
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      const payload = await verifyToken(bearerToken, { secretKey: process.env.CLERK_SECRET_KEY });
      if (payload?.sub) {
        // Fetch user details from Clerk to get their email
        const user = await clerk.users.getUser(payload.sub);
        const email =
          user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress ||
          user.emailAddresses[0]?.emailAddress ||
          '';
        if (email) {
          return { userId: payload.sub, email };
        }
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
      let email =
        (sessionClaims?.email as string) ||
        (sessionClaims as any)?.email_address ||
        '';
      // Session tokens often omit the email claim — resolve it from the
      // Clerk backend so the NHS-domain policy below can be enforced.
      if (!email) {
        try {
          const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
          const user = await clerk.users.getUser(userId);
          email =
            user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress ||
            user.emailAddresses[0]?.emailAddress ||
            '';
        } catch (lookupErr: any) {
          console.warn('[authGuard] Could not resolve user email from Clerk:', lookupErr.message || lookupErr);
        }
      }
      if (email) {
        return { userId, email };
      }
    }
  } catch (err: any) {
    console.error('[authGuard] auth() threw:', err.message || err);
  }

  return null;
}

/**
 * Verify the request is from an authenticated Clerk user on a permitted
 * NHS email domain. Accepts both Authorization: Bearer JWT and session cookies.
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

  if (!isPermittedEmail(user.email)) {
    console.warn('[authGuard] requireAuth: non-NHS email rejected:', user.email);
    return NextResponse.json(
      { error: 'Access is restricted to NHS staff accounts (@nhs.net or .nhs.uk).' },
      { status: 403 }
    );
  }

  return { email: user.email };
}

/**
 * Verify the request is from an authenticated admin user.
 * Admin = email on the ADMIN_EMAILS allowlist, OR a Clerk user whose
 * publicMetadata.role is "admin" (set in the Clerk dashboard) — so new
 * admins can be added without a code change.
 */
export async function requireAdmin(req: Request): Promise<{ email: string } | NextResponse> {
  const user = await getVerifiedUser(req);
  if (!user) {
    console.warn('[authGuard] requireAdmin: no authenticated user found');
    return NextResponse.json(
      { error: 'Authentication required. Please sign in.' },
      { status: 401 }
    );
  }

  if (!isPermittedEmail(user.email)) {
    console.warn('[authGuard] requireAdmin: non-NHS email rejected:', user.email);
    return NextResponse.json(
      { error: 'Access is restricted to NHS staff accounts (@nhs.net or .nhs.uk).' },
      { status: 403 }
    );
  }

  if (ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return { email: user.email };
  }

  // Fall back to the Clerk role flag (skipped for the synthetic demo user)
  if (user.userId !== 'demo-user-id') {
    try {
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
      const clerkUser = await clerk.users.getUser(user.userId);
      if ((clerkUser.publicMetadata as any)?.role === 'admin') {
        return { email: user.email };
      }
    } catch (err: any) {
      console.warn('[authGuard] requireAdmin: metadata lookup failed:', err.message || err);
    }
  }

  console.warn('[authGuard] requireAdmin: access denied for', user.email);
  return NextResponse.json(
    { error: 'Access denied. Admin privileges required.' },
    { status: 403 }
  );
}
