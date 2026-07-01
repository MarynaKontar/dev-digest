/**
 * web-source.ts — external URL fetch for the spec/plan resolver.
 *
 * SECURITY — SSRF guard (layers applied in order):
 *
 *   1. Scheme: only http/https are permitted.
 *   2. Allowlist: the hostname must match an entry in the configured list
 *      (exact or wildcard subdomain `*.notion.so`). The URL is rejected before
 *      any DNS resolution when the host is not in the list.
 *   3. DNS IP-block: the hostname is resolved to all its A/AAAA records;
 *      ANY private, loopback, link-local, or cloud-metadata IP causes rejection.
 *      This guards against DNS rebinding — an allowlisted name that resolves to
 *      `169.254.169.254` is still blocked.
 *   4. Redirect re-validation: redirects are followed manually (not by fetch's
 *      built-in redirect: 'follow'). Each hop's URL is re-checked against the
 *      allowlist AND its DNS IPs are re-blocked. Maximum 5 hops.
 *   5. Content-Type: only `text/*` responses are accepted; non-text bodies
 *      (PDFs, images, binaries) are rejected.
 *   6. Size cap: the response body is read up to MAX_RESPONSE_BYTES (512 KB).
 *      A response that is still streaming at that point is truncated.
 *   7. Timeout: the entire request chain must complete within FETCH_TIMEOUT_MS.
 *
 * Returns raw text (HTML is lightly stripped of script/style tags and tag
 * wrappers). The caller is responsible for wrapping the result as untrusted
 * before feeding it to any model.
 */

import { lookup } from 'node:dns/promises';

// ---------- Constants ----------

const MAX_RESPONSE_BYTES = 512 * 1024; // 512 KB
const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

// ---------- IPv4 private range table (start/end inclusive, as plain numbers) ----------
// Using multiplication instead of bit-shifts avoids signed 32-bit overflow issues.

function ipv4ToNum(address: string): number | null {
  const parts = address.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)
  ) {
    return null;
  }
  return (
    (parts[0]! * 16777216) +
    (parts[1]! * 65536) +
    (parts[2]! * 256) +
    parts[3]!
  );
}

const PRIVATE_IPv4_RANGES: Array<{ start: number; end: number; label: string }> = [
  { start: ipv4ToNum('0.0.0.0')!,       end: ipv4ToNum('0.255.255.255')!,   label: '0.0.0.0/8 (this-network)' },
  { start: ipv4ToNum('10.0.0.0')!,      end: ipv4ToNum('10.255.255.255')!,  label: '10.0.0.0/8 (private)' },
  { start: ipv4ToNum('100.64.0.0')!,    end: ipv4ToNum('100.127.255.255')!, label: '100.64.0.0/10 (shared, RFC 6598)' },
  { start: ipv4ToNum('127.0.0.0')!,     end: ipv4ToNum('127.255.255.255')!, label: '127.0.0.0/8 (loopback)' },
  { start: ipv4ToNum('169.254.0.0')!,   end: ipv4ToNum('169.254.255.255')!, label: '169.254.0.0/16 (link-local / cloud-metadata)' },
  { start: ipv4ToNum('172.16.0.0')!,    end: ipv4ToNum('172.31.255.255')!,  label: '172.16.0.0/12 (private)' },
  { start: ipv4ToNum('192.0.0.0')!,     end: ipv4ToNum('192.0.0.255')!,     label: '192.0.0.0/24 (IANA special-purpose)' },
  { start: ipv4ToNum('192.168.0.0')!,   end: ipv4ToNum('192.168.255.255')!, label: '192.168.0.0/16 (private)' },
  { start: ipv4ToNum('198.18.0.0')!,    end: ipv4ToNum('198.19.255.255')!,  label: '198.18.0.0/15 (benchmarking)' },
  { start: ipv4ToNum('198.51.100.0')!,  end: ipv4ToNum('198.51.100.255')!,  label: '198.51.100.0/24 (documentation)' },
  { start: ipv4ToNum('203.0.113.0')!,   end: ipv4ToNum('203.0.113.255')!,   label: '203.0.113.0/24 (documentation)' },
  { start: ipv4ToNum('224.0.0.0')!,     end: ipv4ToNum('239.255.255.255')!, label: '224.0.0.0/4 (multicast)' },
  { start: ipv4ToNum('240.0.0.0')!,     end: ipv4ToNum('255.255.255.255')!, label: '240.0.0.0/4 (reserved)' },
];

// ---------- IP-blocking predicates ----------

/**
 * Returns true when `address` is a blocked IPv4 address (private, loopback,
 * link-local, cloud-metadata, or otherwise reserved).
 */
export function isBlockedIPv4(address: string): boolean {
  const n = ipv4ToNum(address);
  if (n === null) return false; // not a valid IPv4
  return PRIVATE_IPv4_RANGES.some(({ start, end }) => n >= start && n <= end);
}

/**
 * Returns true when `address` is a blocked IPv6 address (loopback, ULA,
 * link-local, or an IPv4-mapped address that resolves to a blocked IPv4).
 */
export function isBlockedIPv6(address: string): boolean {
  const lc = address.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');

  // Loopback: ::1
  if (lc === '::1') return true;

  // ULA (Unique Local Address): fc00::/7 — fc** and fd**
  if (/^f[cd][0-9a-f]{0,2}:/i.test(lc)) return true;

  // Link-local: fe80::/10 — fe80 through febf
  if (/^fe[89ab][0-9a-f]:/i.test(lc)) return true;

  // All-zeros / unspecified: ::
  if (lc === '::' || lc === '0:0:0:0:0:0:0:0') return true;

  // IPv4-mapped: ::ffff:x.x.x.x — re-check the embedded IPv4.
  const mappedV4 = lc.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedV4) {
    return isBlockedIPv4(mappedV4[1]!);
  }

  // IPv4-compatible (deprecated): ::x.x.x.x
  const compatV4 = lc.match(/^::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (compatV4) {
    return isBlockedIPv4(compatV4[1]!);
  }

  return false;
}

/** Returns true if address (IPv4 or IPv6) is in a blocked range. */
function isBlockedIP(address: string): boolean {
  return address.includes(':') ? isBlockedIPv6(address) : isBlockedIPv4(address);
}

// ---------- Allowlist matching ----------

/**
 * Returns true when `hostname` matches an allowlist entry.
 * Supports:
 *   - Exact host: `github.com` matches only `github.com`
 *   - Wildcard subdomain: `*.notion.so` matches `foo.notion.so` but NOT `notion.so`
 *
 * All comparisons are case-insensitive.
 */
export function checkAllowlist(hostname: string, allowlist: string[]): boolean {
  const host = hostname.toLowerCase();
  for (const entry of allowlist) {
    const pattern = entry.toLowerCase();
    if (pattern.startsWith('*.')) {
      // Wildcard: *.notion.so → match foo.notion.so but not notion.so itself
      const base = pattern.slice(2); // 'notion.so'
      if (host.endsWith('.' + base)) return true;
    } else {
      if (host === pattern) return true;
    }
  }
  return false;
}

// ---------- DNS IP-block check ----------

/**
 * Resolves `hostname` to all its A/AAAA records and verifies that NONE of
 * them resolve to a blocked (private/loopback/metadata) IP address.
 *
 * @throws {SsrfBlockedError} when any resolved IP is in a blocked range.
 */
async function assertDnsNotBlocked(hostname: string): Promise<void> {
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new SsrfBlockedError(
      `DNS resolution failed for hostname "${hostname}" — cannot verify IP safety`,
    );
  }

  if (addresses.length === 0) {
    throw new SsrfBlockedError(
      `DNS returned no records for hostname "${hostname}"`,
    );
  }

  for (const { address } of addresses) {
    if (isBlockedIP(address)) {
      throw new SsrfBlockedError(
        `SSRF: hostname "${hostname}" resolves to blocked IP "${address}" — request denied`,
      );
    }
  }
}

// ---------- Error types ----------

export class SsrfBlockedError extends Error {
  readonly name = 'SsrfBlockedError';
  constructor(message: string) {
    super(message);
  }
}

export class AllowlistBlockedError extends Error {
  readonly name = 'AllowlistBlockedError';
  constructor(hostname: string) {
    super(`Host "${hostname}" is not in the spec-fetch allowlist`);
  }
}

// ---------- HTML text extraction ----------

/**
 * Lightly strips HTML markup to extract plain text suitable for an LLM.
 * Removes <script>, <style>, and all remaining HTML tags; collapses whitespace.
 *
 * This is intentionally simple — it handles real-world HTML pages like
 * Notion exports and Google Docs well enough for spec extraction.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------- Core validation step (allowlist + DNS) ----------

async function validateUrl(url: string, allowlist: string[]): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfBlockedError(`Invalid URL: "${url}"`);
  }

  // 1. Scheme gate
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError(`Scheme "${parsed.protocol}" is not permitted`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Guard against bare IP addresses supplied directly (bypass DNS resolution step).
  // IPv4 literal: 1.2.3.4; IPv6 literal: [::1] or an unbracketed IPv6 (must contain
  // a colon). The colon requirement is critical: without it, an all-hex single-label
  // hostname like "cafe" or "deadbeef" would be misclassified as an IP literal and
  // skip the DNS IP-block check — so such names must fall through to the DNS path.
  const isIpLiteral =
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    hostname.startsWith('[') ||
    (/^[0-9a-f:]+$/.test(hostname) && hostname.includes(':'));

  if (isIpLiteral) {
    // Treat the hostname itself as the IP address.
    const addr = hostname.replace(/^\[|\]$/g, '');
    if (isBlockedIP(addr)) {
      throw new SsrfBlockedError(
        `SSRF: direct IP address "${addr}" is in a blocked range`,
      );
    }
    // Even if the IP is public, we still require it to be in the allowlist
    // (an attacker can't enumerate our internal network by supplying a public IP
    // that happens to be on the allowlist).
    if (!checkAllowlist(hostname, allowlist)) {
      throw new AllowlistBlockedError(hostname);
    }
    return;
  }

  // 2. Allowlist gate (before DNS — fail-fast for non-permitted hosts).
  if (!checkAllowlist(hostname, allowlist)) {
    throw new AllowlistBlockedError(hostname);
  }

  // 3. DNS IP-block (defense-in-depth: allowlisted host resolving to private IP = blocked).
  await assertDnsNotBlocked(hostname);
}

// ---------- Main export ----------

/**
 * Fetches an external URL and returns its text content.
 *
 * Enforces the full SSRF guard described in the module header.
 * Returns `null` when the resource yields no usable text.
 *
 * @param url       The URL to fetch (must be http/https).
 * @param allowlist Hostnames allowed for external fetches (from AppConfig).
 */
export async function resolveWebSource(
  url: string,
  allowlist: string[],
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetchWithRedirectGuard(url, allowlist, controller.signal, 0);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function fetchWithRedirectGuard(
  url: string,
  allowlist: string[],
  signal: AbortSignal,
  hopCount: number,
): Promise<string | null> {
  if (hopCount > MAX_REDIRECTS) {
    throw new SsrfBlockedError(`Too many redirects (> ${MAX_REDIRECTS})`);
  }

  // Validate BEFORE making the request.
  await validateUrl(url, allowlist);

  const response = await fetch(url, {
    signal,
    redirect: 'manual', // we follow redirects manually so we can re-validate each hop
    headers: {
      // Prefer plain text / markdown; discourage heavy HTML pages.
      Accept: 'text/plain, text/markdown, text/html;q=0.8, */*;q=0.5',
      'User-Agent': 'DevDigest-SpecFetcher/1.0',
    },
  });

  // Handle redirects (3xx).
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) {
      throw new SsrfBlockedError('Redirect response missing Location header');
    }
    // Resolve relative redirects against the current URL.
    let nextUrl: string;
    try {
      nextUrl = new URL(location, url).toString();
    } catch {
      throw new SsrfBlockedError(`Redirect Location is not a valid URL: "${location}"`);
    }
    // Re-validate the redirect target (allowlist + DNS) before following.
    return fetchWithRedirectGuard(nextUrl, allowlist, signal, hopCount + 1);
  }

  if (!response.ok) {
    // Non-2xx, non-3xx: treat as unavailable (best-effort; caller swallows).
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  // Content-Type gate: only accept text/* responses.
  const contentType = response.headers.get('content-type') ?? '';
  const isText = contentType.split(';')[0]?.trim().startsWith('text/') ?? false;
  if (!isText) {
    throw new SsrfBlockedError(
      `Content-Type "${contentType}" is not text/* — skipping`,
    );
  }

  // Size-capped body read.
  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    totalBytes += value.byteLength;
    if (totalBytes >= MAX_RESPONSE_BYTES) {
      // Cancel the rest of the body to avoid wasting bandwidth.
      await reader.cancel();
      break;
    }
  }

  // Decode the accumulated bytes as UTF-8.
  const raw = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');

  // Strip HTML markup when the content type indicates HTML.
  const isHtml = contentType.includes('html');
  const text = isHtml ? htmlToText(raw) : raw.trim();

  return text.length > 0 ? text : null;
}
