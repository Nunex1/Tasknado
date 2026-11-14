import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./src/lib/security-headers";
const config: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: staticSecurityHeaders }];
  },
};
export default config;
