/**
 * specfetch.test.ts — hermetic unit tests for the spec/plan resolver adapter.
 *
 * No DB, no Docker, no real network calls. Covers four surfaces:
 *   1. extractReferences (pure) — no mocks needed.
 *   2. resolveGitSource         — MockGitClient.
 *   3. SSRF guard predicates    — pure functions, no I/O.
 *   4. resolveWebSource         — dns/promises lookup + global fetch both mocked.
 *   5. SpecFetchResolver.resolve — truncation to token budget tested end-to-end.
 *
 * DNS mock: vi.mock('node:dns/promises') is hoisted before all imports so
 *   web-source.ts receives the mocked lookup on its own import.
 * Fetch mock: vi.stubGlobal('fetch', ...) per-test; restored in afterEach.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RepoRef } from '@devdigest/shared';
import { extractReferences } from './extract-references.js';
import { resolveGitSource } from './git-source.js';
import {
  resolveWebSource,
  isBlockedIPv4,
  isBlockedIPv6,
  checkAllowlist,
  AllowlistBlockedError,
  SsrfBlockedError,
} from './web-source.js';
import { SpecFetchResolver } from './index.js';
import type { AppConfig } from '../../platform/config.js';
import { MockGitClient, MockGitHubClient } from '../../adapters/mocks.js';

// Hoist the DNS module mock BEFORE any imports resolve it.
// vi.mock is statically hoisted by Vitest's transformer, so web-source.ts
// receives the mocked lookup when it first imports node:dns/promises.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

// Import the (now-mocked) lookup so we can configure it per-test.
import { lookup } from 'node:dns/promises';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO_REF: RepoRef = { owner: 'acme-corp', name: 'platform-api' };

/** Minimal AppConfig adequate for SpecFetchResolver unit tests. */
function makeSpecConfig(overrides: {
  intentSpecMaxTokens?: number;
  intentSpecAllowlist?: string[];
} = {}): AppConfig {
  return {
    databaseUrl: 'postgres://unused@localhost/unused',
    apiPort: 3001,
    webPort: 3000,
    cloneDir: '/tmp/unused-clone',
    secretsPath: '/tmp/unused-secrets',
    nodeEnv: 'test',
    logLevel: 'silent',
    webOrigin: 'http://localhost:3000',
    embeddingsEnabled: false,
    repoIntelEnabled: false,
    intentSpecAllowlist: overrides.intentSpecAllowlist ?? ['docs.google.com', 'github.com', '*.notion.so'],
    intentSpecMaxTokens: overrides.intentSpecMaxTokens ?? 6000,
  };
}

/** Returns a minimal mocked fetch Response with the given text body. */
function makeTextResponse(body: string, contentType = 'text/plain'): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
}

// Type alias to keep mock-resolve-value calls concise.
type DnsAddress = { address: string; family: number };

// ---------------------------------------------------------------------------
// 1. extractReferences — pure PR body parser
// ---------------------------------------------------------------------------

describe('extractReferences — pure PR body parser', () => {
  it('extracts an in-repo markdown file path as git-file', () => {
    const body = 'See the plan at [Implementation Plan](docs/plans/rate-limit.md) for details.';
    const refs = extractReferences(body, REPO_REF);

    const gitFile = refs.find((r) => r.kind === 'git-file');
    expect(gitFile).toBeDefined();
    expect(gitFile!.ref).toBe('docs/plans/rate-limit.md');
  });

  it('classifies a GitHub blob URL as github-blob', () => {
    const blobUrl =
      'https://github.com/acme-corp/platform-api/blob/main/docs/plans/auth.md';
    const body = `See the plan: ${blobUrl}`;
    const refs = extractReferences(body, REPO_REF);

    const blobRef = refs.find((r) => r.kind === 'github-blob');
    expect(blobRef).toBeDefined();
    expect(blobRef!.ref).toBe(blobUrl);
    expect(blobRef!.host).toBe('github.com');
  });

  it('classifies a GitHub issues URL as github-issue', () => {
    const issueUrl = 'https://github.com/acme-corp/platform-api/issues/47';
    const body = `Closes ${issueUrl}`;
    const refs = extractReferences(body, REPO_REF);

    const issueRef = refs.find((r) => r.kind === 'github-issue');
    expect(issueRef).toBeDefined();
    expect(issueRef!.ref).toBe(issueUrl);
  });

  it('expands bare #N shorthand to a github-issue URL for this repo', () => {
    const body = 'Fixes #83 — adds rate limiting middleware.';
    const refs = extractReferences(body, REPO_REF);

    const issueRef = refs.find((r) => r.kind === 'github-issue');
    expect(issueRef).toBeDefined();
    expect(issueRef!.ref).toBe(
      `https://github.com/${REPO_REF.owner}/${REPO_REF.name}/issues/83`,
    );
  });

  it('classifies a non-GitHub https URL as external', () => {
    const notionUrl = 'https://workspace.notion.so/Spec-Rate-Limiting-abc123';
    const body = `Spec: ${notionUrl}`;
    const refs = extractReferences(body, REPO_REF);

    const ext = refs.find((r) => r.kind === 'external');
    expect(ext).toBeDefined();
    expect(ext!.ref).toContain('notion.so');
    expect(ext!.host).toContain('notion.so');
  });

  it('extracts an inline fenced plan block as inline', () => {
    const body = '```plan\nAdd rate limiting to /auth routes\n```';
    const refs = extractReferences(body, REPO_REF);

    const inline = refs.find((r) => r.kind === 'inline');
    expect(inline).toBeDefined();
    expect(inline!.ref).toContain('rate limiting');
  });

  it('deduplicates identical references, keeping the first occurrence', () => {
    const body = [
      'Related: docs/plans/rate-limit.md',
      'See also [Plan](docs/plans/rate-limit.md)',
    ].join('\n');
    const refs = extractReferences(body, REPO_REF);

    const gitFiles = refs.filter((r) => r.kind === 'git-file');
    expect(gitFiles).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. resolveGitSource — in-repo file adapter
// ---------------------------------------------------------------------------

describe('resolveGitSource — in-repo file adapter', () => {
  it('reads a file from the local clone and returns its content', async () => {
    const fileContent = '# Rate Limiting Plan\n\nApply leaky-bucket algorithm per IP.';
    const git = new MockGitClient({ files: { 'docs/plans/rate-limit.md': fileContent } });

    const text = await resolveGitSource(git, REPO_REF, 'docs/plans/rate-limit.md');

    expect(text).toBe(fileContent);
  });

  it('rejects a path traversal attempt (../) and returns null without throwing', async () => {
    const git = new MockGitClient({
      files: { '../../../etc/passwd': 'root:x:0:0' },
    });

    const result = await resolveGitSource(git, REPO_REF, '../../../etc/passwd');

    expect(result).toBeNull();
  });

  it('rejects an absolute path starting with / and returns null without throwing', async () => {
    const git = new MockGitClient({
      files: { '/etc/shadow': 'sensitive' },
    });

    const result = await resolveGitSource(git, REPO_REF, '/etc/shadow');

    expect(result).toBeNull();
  });

  it('swallows a git.readFile error and returns null (best-effort)', async () => {
    const failingGit = {
      readFile: async () => { throw new Error('clone missing — repo not yet synced'); },
    } as unknown as Parameters<typeof resolveGitSource>[0];

    const result = await resolveGitSource(failingGit, REPO_REF, 'docs/plans/x.md');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. SSRF guard — pure predicates (no I/O)
// ---------------------------------------------------------------------------

describe('SSRF guard — pure predicates (no I/O)', () => {
  describe('isBlockedIPv4', () => {
    it('blocks loopback 127.0.0.1', () => {
      expect(isBlockedIPv4('127.0.0.1')).toBe(true);
    });

    it('blocks cloud-metadata 169.254.169.254', () => {
      expect(isBlockedIPv4('169.254.169.254')).toBe(true);
    });

    it('blocks RFC-1918 private 10.42.0.1', () => {
      expect(isBlockedIPv4('10.42.0.1')).toBe(true);
    });

    it('does not block a public Google IP 142.250.185.110', () => {
      expect(isBlockedIPv4('142.250.185.110')).toBe(false);
    });
  });

  describe('isBlockedIPv6', () => {
    it('blocks the IPv6 loopback ::1', () => {
      expect(isBlockedIPv6('::1')).toBe(true);
    });

    it('does not block a public IPv6 address (2606:4700::1)', () => {
      expect(isBlockedIPv6('2606:4700::1')).toBe(false);
    });
  });

  describe('checkAllowlist', () => {
    const allowlist = ['github.com', 'raw.githubusercontent.com', '*.notion.so', 'docs.google.com'];

    it('matches an exact hostname', () => {
      expect(checkAllowlist('github.com', allowlist)).toBe(true);
    });

    it('matches a wildcard subdomain entry *.notion.so', () => {
      expect(checkAllowlist('workspace.notion.so', allowlist)).toBe(true);
    });

    it('does NOT match the bare parent domain when the entry is *.notion.so', () => {
      // *.notion.so must NOT match notion.so itself (only subdomains)
      expect(checkAllowlist('notion.so', allowlist)).toBe(false);
    });

    it('rejects an unlisted hostname', () => {
      expect(checkAllowlist('evil.example.com', allowlist)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 4. resolveWebSource — integration (dns + fetch mocked)
// ---------------------------------------------------------------------------

describe('resolveWebSource — SSRF guard (dns lookup + fetch mocked)', () => {
  // Convenience alias for the mocked function.
  const mockLookup = lookup as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockLookup.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a non-allowlisted host with AllowlistBlockedError and never calls fetch', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      resolveWebSource('https://evil.example.com/spec.md', ['docs.google.com']),
    ).rejects.toThrow(AllowlistBlockedError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects an allowlisted host that resolves to private RFC-1918 IP — fetch never called', async () => {
    mockLookup.mockResolvedValue([{ address: '10.42.0.1', family: 4 }] as DnsAddress[]);
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      resolveWebSource('https://docs.google.com/internal-spec', ['docs.google.com']),
    ).rejects.toThrow(SsrfBlockedError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects an allowlisted host resolving to cloud-metadata IP 169.254.169.254 — fetch never called', async () => {
    mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as DnsAddress[]);
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      resolveWebSource('https://docs.google.com/meta', ['docs.google.com']),
    ).rejects.toThrow(SsrfBlockedError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('accepts an allowlisted host with a public IP, calls fetch, returns content', async () => {
    mockLookup.mockResolvedValue([{ address: '142.250.185.110', family: 4 }] as DnsAddress[]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeTextResponse('# Rate Limiting Spec\n\nApply leaky-bucket.')),
    );

    const result = await resolveWebSource('https://docs.google.com/spec', ['docs.google.com']);

    expect(result).toContain('Rate Limiting Spec');
  });

  it('rejects a redirect to a blocked private IP (169.254.x) before fetching the redirect target', async () => {
    // DNS for the original host returns a public IP.
    mockLookup.mockResolvedValue([{ address: '142.250.185.110', family: 4 }] as DnsAddress[]);

    const mockFetch = vi.fn().mockResolvedValue({
      status: 302,
      ok: false,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'location'
            ? 'http://169.254.169.254/latest/meta-data/'
            : null,
      },
      body: null,
    } as unknown as Response);
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      resolveWebSource('https://docs.google.com/plan', ['docs.google.com']),
    ).rejects.toThrow(SsrfBlockedError);

    // fetch was called once for the original URL; never for the redirect target.
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('bare hex single-label hostname "cafe" is NOT treated as an IP literal — reaches AllowlistBlockedError', async () => {
    // "cafe" is all-hex but has no colons, so isIpLiteral = false.
    // It must be rejected at the allowlist gate, NOT at the IP-literal gate.
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const error = await resolveWebSource('http://cafe/spec', ['docs.google.com']).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(AllowlistBlockedError);
    // Specifically NOT "direct IP address" — that would mean it was caught by the IP-literal path.
    expect((error as Error).message).not.toContain('direct IP address');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects a non-text/* content-type (e.g. application/json) with SsrfBlockedError', async () => {
    mockLookup.mockResolvedValue([{ address: '142.250.185.110', family: 4 }] as DnsAddress[]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeTextResponse('{"doc":"data"}', 'application/json; charset=utf-8')),
    );

    await expect(
      resolveWebSource('https://docs.google.com/api', ['docs.google.com']),
    ).rejects.toThrow(SsrfBlockedError);
  });

  it('stops reading and returns partial text when the streamed body exceeds MAX_RESPONSE_BYTES (512 KB)', async () => {
    mockLookup.mockResolvedValue([{ address: '142.250.185.110', family: 4 }] as DnsAddress[]);

    // Deliver the body in 3 chunks of 256 KB each (768 KB total).
    // The size cap (MAX_RESPONSE_BYTES = 512 * 1024) fires after chunk 2:
    //   chunk 1: totalBytes = 262 144 < 524 288 → continue
    //   chunk 2: totalBytes = 524 288 >= 524 288 → reader.cancel() + break
    // Result accumulates exactly 2 × 256 KB = 512 KB ≤ MAX_RESPONSE_BYTES. ✓
    const CHUNK_SIZE = 256 * 1024; // 256 KB per pull
    const encoder = new TextEncoder();
    let pulls = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (pulls >= 3) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode('A'.repeat(CHUNK_SIZE)));
        pulls++;
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    );

    const result = await resolveWebSource(
      'https://docs.google.com/large-spec',
      ['docs.google.com'],
    );

    expect(result).not.toBeNull();
    // The cap stops reading after exactly 2 × 256 KB chunks — result fits within the cap.
    expect(Buffer.byteLength(result!, 'utf8')).toBeLessThanOrEqual(512 * 1024);
  });
});

// ---------------------------------------------------------------------------
// 5. SpecFetchResolver.resolve — truncation to token budget
// ---------------------------------------------------------------------------

describe('SpecFetchResolver.resolve — truncation to token budget', () => {
  it('sets truncated: true when resolved file content exceeds intentSpecMaxTokens', async () => {
    // Token budget = 5 tokens ≈ 20 chars; file is 200 chars (~50 tokens) → must truncate.
    const config = makeSpecConfig({ intentSpecMaxTokens: 5 });
    const git = new MockGitClient({
      files: {
        'docs/plans/big-plan.md': 'A'.repeat(200),
      },
    });
    const resolver = new SpecFetchResolver(git, new MockGitHubClient(), config);

    const results = await resolver.resolve(
      '[Plan](docs/plans/big-plan.md)',
      REPO_REF,
      'deadbeef01234567',
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.truncated).toBe(true);
    // Text should be the first (5 * 4 =) 20 chars.
    expect(results[0]!.text).toBe('A'.repeat(20));
  });

  it('leaves truncated: false when resolved content fits within the token budget', async () => {
    const shortContent = '# Plan\n\nAdd rate limiting.';
    const config = makeSpecConfig({ intentSpecMaxTokens: 6000 });
    const git = new MockGitClient({
      files: { 'docs/plans/small.md': shortContent },
    });
    const resolver = new SpecFetchResolver(git, new MockGitHubClient(), config);

    const results = await resolver.resolve(
      '[Small Plan](docs/plans/small.md)',
      REPO_REF,
      'abc1234',
    );

    expect(results).toHaveLength(1);
    expect(results[0]!.truncated).toBe(false);
    expect(results[0]!.text).toBe(shortContent);
  });
});
