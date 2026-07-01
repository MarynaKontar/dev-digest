import { describe, it, expect } from 'vitest';
import { classifyFile } from './classifier.js';

describe('classifyFile', () => {
  // --- Boilerplate ---
  describe('boilerplate', () => {
    it('classifies pnpm-lock.yaml as boilerplate', () => {
      expect(classifyFile('pnpm-lock.yaml')).toBe('boilerplate');
    });

    it('classifies SQL migration file as boilerplate', () => {
      expect(classifyFile('0001_migration.sql')).toBe('boilerplate');
    });

    it('classifies package-lock.json as boilerplate', () => {
      expect(classifyFile('package-lock.json')).toBe('boilerplate');
    });

    it('classifies dist/ output file as boilerplate', () => {
      expect(classifyFile('dist/bundle.js')).toBe('boilerplate');
    });

    it('classifies snapshot file as boilerplate', () => {
      expect(classifyFile('__snapshots__/Foo.snap')).toBe('boilerplate');
    });
  });

  // --- Wiring ---
  describe('wiring', () => {
    it('classifies src/index.ts as wiring', () => {
      expect(classifyFile('src/index.ts')).toBe('wiring');
    });

    it('classifies vite.config.ts as wiring', () => {
      expect(classifyFile('vite.config.ts')).toBe('wiring');
    });

    it('classifies tsconfig.json as wiring', () => {
      expect(classifyFile('tsconfig.json')).toBe('wiring');
    });

    it('classifies nested index.tsx as wiring', () => {
      expect(classifyFile('client/src/components/x/index.tsx')).toBe('wiring');
    });

    it('classifies dotfile as wiring', () => {
      expect(classifyFile('.eslintrc')).toBe('wiring');
    });
  });

  // --- Core ---
  describe('core', () => {
    it('classifies a service module as core', () => {
      expect(classifyFile('src/modules/reviews/service.ts')).toBe('core');
    });

    it('classifies a Next.js page as core', () => {
      expect(classifyFile('client/src/app/page.tsx')).toBe('core');
    });

    it('classifies reviewer-core source as core', () => {
      expect(classifyFile('reviewer-core/src/prompt.ts')).toBe('core');
    });

    it('classifies server platform file as core', () => {
      expect(classifyFile('server/src/platform/container.ts')).toBe('core');
    });

    it('classifies a shared UI component as core', () => {
      expect(classifyFile('src/components/Button.tsx')).toBe('core');
    });
  });
});
