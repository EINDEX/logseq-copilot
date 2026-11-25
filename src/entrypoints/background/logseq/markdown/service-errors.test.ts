import { describe, expect, test, vi } from 'vitest';
// tool must load first: tool.ts and the services import each other.
import '../tool';
import LogseqService from './service';

const withClient = (client: object) => {
  const service = new LogseqService();
  service.client = client as any;
  return service;
};

describe('LogseqService errors in English', () => {
  test('listTags says Logseq did not return its pages', async () => {
    const service = withClient({
      datascriptQuery: vi.fn(async () => []),
      getAllPages: vi.fn(async () => null),
    });
    await expect(service.listTags()).rejects.toThrow('Logseq did not return its pages.');
  });

  test('listProperties says Logseq did not return the properties of the graph', async () => {
    const service = withClient({ datascriptQuery: vi.fn(async () => null) });
    await expect(service.listProperties()).rejects.toThrow(
      'Logseq did not return the properties of the graph.',
    );
  });
});
