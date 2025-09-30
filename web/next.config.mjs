/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true
  },
  // In development, Next.js uses eval-based source maps. If a CSP is present
  // without 'unsafe-eval', dev will break. Provide a permissive CSP only in dev.
  async headers() {
    if (process.env.NODE_ENV === 'production') return [];
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data: blob: https:; connect-src 'self' http: https: ws: wss:; worker-src 'self' blob:; frame-ancestors 'self'; base-uri 'self'"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
