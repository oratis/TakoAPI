// Only ever redirect back to a same-origin path after sign-in. An absolute URL,
// a protocol-relative "//evil.com", or anything that isn't a plain path is
// replaced by the home page — the classic open-redirect guard.
export function safeCallbackUrl(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  // Auth pages themselves are never a useful destination.
  if (/^\/(?:[a-z]{2}\/)?auth\//.test(raw)) return fallback;
  return raw;
}
