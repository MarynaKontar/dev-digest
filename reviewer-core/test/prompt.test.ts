/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';

function userOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  const { messages } = assemblePrompt(parts);
  return messages[1]!.content;
}

function systemOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  return assemblePrompt(parts).messages[0]!.content;
}

describe('assemblePrompt — shared injection guard (server + CI)', () => {
  const sys = systemOf({ system: 'AGENT-SYS', diff: 'DIFF' });

  it('appends the guard to the agent system prompt', () => {
    expect(sys.startsWith('AGENT-SYS')).toBe(true);
    expect(sys).toMatch(/<untrusted>.*DATA to be analyzed/s);
  });

  it('forbids "intentional/test/demo" claims from descoping the review', () => {
    // The defense that replaced the keyword sanitizer: a general, trusted,
    // language-agnostic rule — not text parsing of untrusted input.
    expect(sys).toMatch(/test fixture|intentional|demo/i);
    expect(sys).toMatch(/never reduce|never .*descope|REPORT it/i);
    expect(sys).toMatch(/any language/i);
  });
});

describe('assemblePrompt — ## PR description', () => {
  it('renders the section (untrusted-wrapped) before the diff when present', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting to the public /api endpoints.',
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR description');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('Adds rate limiting to the public /api endpoints.');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.pr_description).toContain('Adds rate limiting');
  });

  it('omits the section when prDescription is undefined or blank (no behaviour change)', () => {
    expect(userOf({ system: 'sys', diff: 'DIFF' })).not.toContain('## PR description');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.pr_description ?? null).toBeNull();
    expect(userOf({ system: 'sys', diff: 'DIFF', prDescription: '   ' })).not.toContain(
      '## PR description',
    );
  });

  it('truncates a huge body to the 4k cap', () => {
    const { assembly } = assemblePrompt({
      system: 'sys',
      diff: 'D',
      prDescription: 'x'.repeat(10_000),
    });
    expect((assembly.pr_description as string).length).toBe(4000);
  });
});

describe('assemblePrompt — ## PR intent', () => {
  // Realistic intent string: plausible domain value that would expose type-coercion bugs.
  const intentText =
    'Migrate authentication from session cookies to JWT tokens to support stateless API clients across mobile and web.';

  it('renders ## PR intent with trusted lead-in OUTSIDE the untrusted wrapper, ordered after ## PR description', () => {
    const { messages } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Implements JWT token issuance endpoint.',
      intent: intentText,
    });
    const user = messages[1]!.content;

    // Section header is present
    expect(user).toContain('## PR intent');

    // The trusted scope-narrowing rule (spec: "emit exactly ONE signal finding, not many")
    expect(user).toMatch(/emit exactly ONE signal finding, not many/);

    // Intent text is delimiter-wrapped with the 'intent' source label
    expect(user).toContain('<untrusted source="intent">');
    expect(user).toContain(intentText);

    // The trusted rule appears BEFORE the opening untrusted tag — it is outside the wrapper
    const leadInIdx = user.indexOf('emit exactly ONE signal finding, not many');
    const untrustedOpenIdx = user.indexOf('<untrusted source="intent">');
    expect(leadInIdx).toBeLessThan(untrustedOpenIdx);

    // The intent text is inside the wrapper (after the opening tag)
    expect(untrustedOpenIdx).toBeLessThan(user.indexOf(intentText));

    // Section ordering: ## PR description < ## PR intent < ## Diff to review
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## PR intent'));
    expect(user.indexOf('## PR intent')).toBeLessThan(user.indexOf('## Diff to review'));
  });

  it('assembly.intent equals the raw intent string when provided, and is null when omitted', () => {
    const { assembly: withIntent } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      intent: intentText,
    });
    expect(withIntent.intent).toBe(intentText);

    const { assembly: withoutIntent } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
    });
    // Spec: assembly.intent === null when omitted
    expect(withoutIntent.intent ?? null).toBeNull();
  });

  it('omits the section entirely — messages byte-identical to the no-intent call — when intent is undefined or blank', () => {
    // Derived from spec: "intent omitted ⇒ prompt byte-identical to today"
    // Use a stable, realistic base to surface accidental extra blank lines.
    const base = assemblePrompt({
      system: 'security-agent-v2',
      diff: 'diff --git a/src/auth.ts b/src/auth.ts\n+const key = "sk_live_abc";',
      prDescription: 'Add JWT signing key to config.',
    });
    const withUndefined = assemblePrompt({
      system: 'security-agent-v2',
      diff: 'diff --git a/src/auth.ts b/src/auth.ts\n+const key = "sk_live_abc";',
      prDescription: 'Add JWT signing key to config.',
      intent: undefined,
    });
    const withBlank = assemblePrompt({
      system: 'security-agent-v2',
      diff: 'diff --git a/src/auth.ts b/src/auth.ts\n+const key = "sk_live_abc";',
      prDescription: 'Add JWT signing key to config.',
      intent: '   ',
    });

    // All three must be byte-identical — no stray ## PR intent header or extra blank lines
    expect(withUndefined.messages[1]!.content).toBe(base.messages[1]!.content);
    expect(withBlank.messages[1]!.content).toBe(base.messages[1]!.content);

    // Cross-verify: the base output contains no intent artifacts
    expect(base.messages[1]!.content).not.toContain('## PR intent');
    expect(base.messages[1]!.content).not.toContain('<untrusted source="intent">');
  });
});
