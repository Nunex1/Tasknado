import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./src/lib/security-headers";
const config: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/brand/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      { source: "/(.*)", headers: staticSecurityHeaders },
    ];
  },
};
export default config;
