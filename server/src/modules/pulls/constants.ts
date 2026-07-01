/**
 * Smart Diff classifier constants.
 *
 * Patterns are evaluated in priority order:
 *   boilerplate → wiring → (else) core
 *
 * BOILERPLATE_PATTERNS: lock files, dist output, snapshots, SQL migrations.
 * WIRING_PATTERNS: config files, tsconfig variants, dotfiles, index/barrel files.
 */

// Threshold for the split_suggestion.too_big flag (total additions+deletions).
export const SMART_DIFF_TOO_BIG_LINES = 600;

/**
 * A file matching any of these patterns is classified as 'boilerplate'.
 * Checked before WIRING_PATTERNS.
 */
export const BOILERPLATE_PATTERNS: RegExp[] = [
  // Lock files (exact basename)
  /(?:^|[/\\])pnpm-lock\.yaml$/,
  /(?:^|[/\\])package-lock\.json$/,
  /(?:^|[/\\])yarn\.lock$/,
  // dist/ output directory
  /(?:^|[/\\])dist[/\\]/,
  // Jest/Vitest snapshots directory and .snap files
  /(?:^|[/\\])__snapshots__[/\\]/,
  /\.snap$/,
  // SQL migration files
  /\.sql$/,
  // migrations/ directory (any depth)
  /(?:^|[/\\])migrations[/\\]/,
];

/**
 * A file matching any of these patterns (and not already boilerplate) is
 * classified as 'wiring'.
 */
export const WIRING_PATTERNS: RegExp[] = [
  // Config files: vite.config.ts, jest.config.js, etc.
  /\.config\.[^/\\]+$/,
  // tsconfig variants: tsconfig.json, tsconfig.base.json, tsconfig.app.json, …
  /(?:^|[/\\])tsconfig[^/\\]*\.json$/,
  // Dotfiles: .eslintrc, .prettierrc, .gitignore, .babelrc, etc.
  /(?:^|[/\\])\.[^/\\]+$/,
  // Index / barrel files: index.ts, index.tsx
  /(?:^|[/\\])index\.tsx?$/,
];
