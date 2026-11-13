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
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
