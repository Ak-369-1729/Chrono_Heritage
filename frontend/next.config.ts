import type { NextConfig } from "next";

// The API is reached through a runtime proxy route (src/app/api/[...path]/route.ts),
// so the backend URL is read from CHRONO_API_URL at request time, never baked into the build.
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
