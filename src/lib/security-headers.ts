export function contentSecurityPolicy(
  nonce: string,
  endpoint?: string,
  development = false,
) {
  let origin = "";
  let socket = "";
  if (endpoint) {
    const url = new URL(endpoint);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
      throw new Error("Supabase requires HTTPS except on loopback");
    }
    origin = url.origin;
    socket = origin.replace(/^http/, "ws");
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // Existing React/Radix components use style attributes for layout and colors.
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${origin} ${socket}${development ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    `img-src 'self' data: blob: ${origin}`,
    `media-src 'self' blob: ${origin}`,
    "font-src 'self'",
    "manifest-src 'self'",
    // The interface embeds no frames and starts no workers of its own.
    "frame-src 'none'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Headers that do not depend on the request. next.config.ts sends them with
 * everything Next.js serves; netlify.toml repeats the ones that matter for
 * files the CDN serves directly, which never reach Next.js.
 */
export const staticSecurityHeaders = [
  // Browsers ignore HSTS over HTTP. No preload/includeSubDomains until every
  // subdomain has been inventoried by the deployment owner.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // No other origin gets a window reference to the app or embeds its files.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer",
      "browsing-topics",
      "camera",
      "display-capture",
      "geolocation",
      "gyroscope",
      "hid",
      "magnetometer",
      "microphone",
      "midi",
      "payment",
      "serial",
      "usb",
    ]
      .map((feature) => `${feature}=()`)
      .join(", "),
  },
];
