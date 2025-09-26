/** @type {import('next').NextConfig} */
const GOAPI = process.env.GOAPI_ORIGIN || "http://localhost:8080";

const nextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${GOAPI}/api/:path*` }
    ];
  },
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;
