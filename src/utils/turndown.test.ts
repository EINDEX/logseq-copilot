import { describe, expect, it } from 'vitest';
import { buildTurndownService } from './utils';

describe('buildTurndownService', () => {
  it('builds a working turndown service without CommonJS require', () => {
    const service = buildTurndownService();
    const container = document.createElement('div');
    container.innerHTML = '<p>hello <a href="https://example.com/x">link</a></p>';
    expect(service.turndown(container)).toBe('hello [link](https://example.com/x)');
  });
});
