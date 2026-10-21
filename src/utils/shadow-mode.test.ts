import { describe, expect, test } from 'vitest';
import { resolveShadowRootMode } from './shadow-mode';

describe('resolveShadowRootMode', () => {
  test('packaged builds use a closed shadow root', () => {
    expect(resolveShadowRootMode({ dev: false })).toBe('closed');
    expect(resolveShadowRootMode({ dev: false, e2e: undefined })).toBe('closed');
  });

  test('dev builds use an open shadow root', () => {
    expect(resolveShadowRootMode({ dev: true })).toBe('open');
  });

  test('E2E builds (WXT_E2E=true) use an open shadow root', () => {
    expect(resolveShadowRootMode({ dev: false, e2e: 'true' })).toBe('open');
    expect(resolveShadowRootMode({ dev: false, e2e: true })).toBe('open');
  });

  test('only an explicit "true" turns on the E2E mode', () => {
    for (const e2e of ['', 'false', '0', 'yes']) {
      expect(resolveShadowRootMode({ dev: false, e2e })).toBe('closed');
    }
  });
});
