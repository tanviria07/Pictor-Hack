/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /** Proxy /api to the Go server so the browser uses same-origin requests (no CORS). */
  async rewrites() {
    const backend = (process.env.BACKEND_URL || "http://127.0.0.1:8080").replace(
      /\/$/,
      "",
    );
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
