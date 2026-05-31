import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const authState = await auth();
    
    const secretKey = process.env.CLERK_SECRET_KEY || '';
    const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

    return NextResponse.json({
      success: true,
      authenticated: !!authState.userId,
      userId: authState.userId,
      email: authState.sessionClaims?.email || (authState.sessionClaims as any)?.email_address || null,
      envCheck: {
        isSecretKeySet: !!secretKey,
        secretKeyPrefix: secretKey ? secretKey.substring(0, 8) : null,
        secretKeyLength: secretKey.length,
        isPublishableKeySet: !!publishableKey,
        publishableKeyPrefix: publishableKey ? publishableKey.substring(0, 8) : null,
        publishableKeyLength: publishableKey.length,
      }
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || String(err),
      stack: err.stack
    }, { status: 500 });
  }
}
