// lib/security/sanitize.ts

/**
 * Allows only safe link targets:
 *  - Single-slash internal archive paths (`/p/slug`, `/?tab=videos`) — rejects protocol-relative `//...` and `/\...`
 *  - Standard web URLs (`https://...` or `http://...`)
 *  - Email links (`mailto:...`)
 * Rejects `javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, control characters, and malformed schemes.
 */
export function sanitizeSafeHref(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;

  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  // Reject ASCII control characters, null bytes, or whitespace inside URL
  if (/[\u0000-\u001F\u007F\s]/.test(trimmed)) {
    return null;
  }

  // Internal relative route (must start with single `/`, never `//` or `/\`)
  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
      return null;
    }
    return trimmed;
  }

  // Explicitly block dangerous schemes even if URL constructor parses them
  if (/^(javascript|data|vbscript|file|blob):/i.test(trimmed)) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol === 'https:' || protocol === 'http:') {
      if (!parsed.hostname) return null;
      return parsed.toString();
    }

    if (protocol === 'mailto:') {
      // Ensure non-empty recipient without HTML/angle-bracket injection
      const recipient = trimmed.slice('mailto:'.length);
      if (!recipient || /[<>"'`{}|\\^[\]]/.test(recipient)) {
        return null;
      }
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Sanitizes curator-supplied custom CSS declarations before mounting inside a scoped
 * `#flyer-scope-<id> { ... }` rule block.
 * Strips `</style>`, `<script>`, CSS comments, `@import`, `expression(`, `javascript:`,
 * `url(...)` (both closed and unclosed), and `{ } < >` breakout characters.
 */
export function sanitizeScopedFlyerCss(raw?: string | null): string | undefined {
  if (typeof raw !== 'string') return undefined;

  const cleaned = raw
    // Strip control chars and CSS backslash escapes used to obfuscate keywords
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\\]/g, '')
    // Strip comments first so `ex/**/pression(` or `@/**/import` cannot bypass filters
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\*[\s\S]*$/g, '')
    // Strip HTML tag breakouts
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/<\/?script[^>]*>/gi, '')
    // Strip external rule imports & legacy execution vectors
    .replace(/@(import|charset|namespace)\b[^;]*/gi, '')
    .replace(/expression\s*\([^)]*\)?/gi, '')
    .replace(/-moz-binding\s*:[^;]*/gi, '')
    .replace(/behavior\s*:[^;]*/gi, '')
    .replace(/(javascript|vbscript|data)\s*:/gi, '')
    // Strip closed and unclosed url(...) tokens
    .replace(/url\s*\([^)]*\)/gi, 'none')
    .replace(/url\s*\([^;]*/gi, 'none')
    // Strip rule-block braces and angle brackets so styles stay inside `#flyer-scope-id { ... }`
    .replace(/[{}<>]/g, '')
    .trim()
    .slice(0, 1800);

  return cleaned || undefined;
}
