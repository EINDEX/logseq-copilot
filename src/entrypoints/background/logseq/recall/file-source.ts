import type LogseqClient from '../markdown/client';
import { moreBlocks } from '../markdown/more-blocks';
import { BlockCache } from './block-cache';
import { parseBlockText, type UuidRef } from './block-text';
import type { CandidateBlock, CandidatePage } from './rank';
import { SEARCH_LIMIT, type AncestorBlock, type RecallSource } from './recall';

/*
 * Logseq 0.10.x (file graph) shapes, checked against 0.10.15
 * (tests/integration/logseq.test.ts):
 * - `App.search(q)` answers `{ blocks: [{ 'block/uuid', ... }], pages:
 *   [original names] }` and returns at most 10 blocks; a second `opts`
 *   argument (`{ limit }`) is ignored.
 * - The simple query `DB.q "q"` answers every block whose markdown
 *   `content` contains `q` (case-sensitive, the words in that order), as
 *   whole blocks: the `Editor.getBlock` fields without `children`
 *   (tests/integration/recall.test.ts).
 * - `Editor.getBlock` has the markdown `content` (page references are
 *   names, block references `((uuid))`), `marker`, `properties`, and
 *   `page` / `parent` as `{ id }`. Blocks have no `updatedAt`.
 * - Template blocks carry a `template::` property; their children are the
 *   template content.
 */
const pageTags = (page: any): string[] | undefined => {
  const tags = page?.properties?.tags;
  const list = Array.isArray(tags)
    ? tags
    : typeof tags === 'string'
      ? tags.split(',')
      : [];
  const names = list.map((t) => String(t).trim()).filter(Boolean);
  return names.length ? names : undefined;
};

const isTemplate = (block: any) => block?.properties?.template !== undefined;

/** Parent block id, undefined when the parent is the page. */
const parentRefOf = (block: any): number | undefined => {
  const parentId = block?.parent?.id;
  return typeof parentId === 'number' && parentId !== block?.page?.id
    ? parentId
    : undefined;
};

export class FileRecallSource implements RecallSource {
  private pages = new Map<string, Promise<CandidatePage | null>>();
  private blocks: BlockCache;

  constructor(
    private client: LogseqClient,
    private graphName: () => Promise<string>,
  ) {
    this.blocks = new BlockCache((ref) =>
      this.client.getBlockViaUuid(ref as string),
    );
  }

  getGraph() {
    return this.graphName();
  }

  private readPage(ref: string | number): Promise<CandidatePage | null> {
    const key = `${typeof ref}:${ref}`;
    if (!this.pages.has(key)) {
      this.pages.set(
        key,
        this.client
          .getPage(typeof ref === 'number' ? { id: ref } : { name: ref })
          .then((page: any): CandidatePage | null =>
            page?.uuid
              ? {
                  uuid: page.uuid,
                  name: page.name,
                  title: page.originalName ?? page.name,
                  kind: page['journal?'] ? 'journal' : 'page',
                  journalDay: page.journalDay || undefined,
                  updatedAt: page.updatedAt,
                  tags: pageTags(page),
                }
              : null,
          )
          .catch(() => null),
      );
    }
    return this.pages.get(key)!;
  }

  private async readBlock(uuid: string): Promise<CandidateBlock | null> {
    const block: any = await this.blocks.get(uuid);
    if (!block?.uuid || block.page?.id === undefined) return null;
    const page = await this.readPage(block.page.id);
    if (!page) return null;
    const raw: string = block.content ?? '';
    return {
      uuid: block.uuid,
      page,
      raw,
      parsed: parseBlockText(raw, { marker: block.marker }),
      updatedAt: block.updatedAt,
      noise: isTemplate(block),
      parentRef: parentRefOf(block),
    };
  }

  async search(query: string) {
    const resp: any = await this.client.search(query);
    const blocks: any[] = Array.isArray(resp?.blocks) ? resp.blocks : [];
    const pageNames: string[] = Array.isArray(resp?.pages) ? resp.pages : [];
    const uuids: string[] = blocks.map((b) => b['block/uuid']);
    // A full answer is completed by a full-text query (whole blocks, so
    // they go into the block cache), as the search sidebar does.
    const extra = await moreBlocks(this.client, query, uuids, SEARCH_LIMIT);
    extra.forEach((block) => this.blocks.add(block));
    uuids.push(...extra.map((block) => block.uuid));
    const [pages, candidates] = await Promise.all([
      Promise.all(pageNames.map((name) => this.readPage(name))),
      Promise.all(uuids.map((uuid) => this.readBlock(uuid).catch(() => null))),
    ]);
    return {
      pages: pages.filter((p): p is CandidatePage => p !== null),
      blocks: candidates.filter((b): b is CandidateBlock => b !== null),
    };
  }

  async getAncestor(ref: number | string): Promise<AncestorBlock | null> {
    const block: any = await this.blocks.get(ref);
    if (!block?.uuid) return null;
    return {
      uuid: block.uuid,
      raw: block.content ?? '',
      marker: block.marker,
      template: isTemplate(block),
      parentRef: parentRefOf(block),
    };
  }

  async getRefText(ref: UuidRef): Promise<string | undefined> {
    // Page references in file graphs are names, only blocks need a lookup.
    if (ref.kind !== 'block') return undefined;
    const block: any = await this.blocks.get(ref.uuid);
    return block?.uuid ? (block.content ?? '') : undefined;
  }
}
