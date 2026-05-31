import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html|css|js|gif|svg|png|jpg|jpeg|webp|vector|ico|wasm|json|txt)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Always run for Clerk internal routes (required for Clerk v7 + Next.js 16)
    '/__clerk/(.*)',
  ],
};
