/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pdfjs-dist'],
  // Trust SOP PDFs are served from guidelines/ via the authenticated
  // /api/pdf route; include them in the serverless function bundle.
  outputFileTracingIncludes: {
    '/api/pdf': ['./guidelines/**'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://api.clerk.com; connect-src 'self' https://*.clerk.accounts.dev https://api.clerk.com https://anaessop-ai-worker.raja-parashar.workers.dev https://anaessop-ai-worker.anaessop-ai-worker.workers.dev https://generativelanguage.googleapis.com; img-src 'self' data: blob: https://images.unsplash.com https://img.clerk.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; worker-src 'self' blob:; frame-ancestors 'none'; object-src 'none';",
          }
        ],
      },
    ];
  }
};

module.exports = nextConfig;
