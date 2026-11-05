import type LogseqClient from '../db/client';
import { getBlockMarker } from '../db/status';
import { BlockCache } from './block-cache';
import { parseBlockText, type UuidRef } from './block-text';
import type { CandidateBlock, CandidatePage } from './rank';
import {
  SEARCH_LIMIT,
  type AncestorBlock,
  type RecallSource,
} from './recall';

/*
 * Logseq 2.x (DB graph) shapes, checked against 2.0.2
 * (tests/integration/logseq.test.ts):
 * - `App.search(q, { limit })` answers `{ blocks }`; page hits have
 *   `page?: true` and `tags: [{ ident }]`, block hits `page?: null`.
 * - `Editor.getBlock` has `fullTitle` with references written as
 *   `[[Page title]]` / `#tag` (only `((block uuid))` stays a uuid), while
 *   `content` / `title` hold `[[uuid]]`. Its `tags` are `{ ident }` objects,
 *   the nested `parent` / `page` carry `tags` as ident strings.
 * - Property values of text properties are blocks of their own, marked with
 *   `:logseq.property/created-from-property`.
 * - Tag and property pages are entities with a `db/ident` (`ident`); note
 *   pages and journals have none.
 */
const TEMPLATE_CLASS = ':logseq.class/Template';
const NOISE_PAGE_CLASSES = new Set([':logseq.class/Tag', ':logseq.class/Property']);
const CREATED_FROM_PROPERTY = ':logseq.property/created-from-property';
const BUILT_IN_CLASS = ':logseq.class/';

/** Idents of `tags`: ident strings, `{ ident }` objects or bare ids. */
const tagIdents = (tags: unknown): string[] =>
  Array.isArray(tags)
    ? tags
        .map((tag) => (typeof tag === 'string' ? tag : tag?.ident))
        .filter((ident): ident is string => typeof ident === 'string')
    : [];

const isTemplate = (entity: any) =>
  tagIdents(entity?.tags).includes(TEMPLATE_CLASS);

const rawOf = (block: any): string =>
  block?.fullTitle ?? block?.title ?? block?.content ?? '';

/** Parent block id, undefined when the parent is the page. */
const parentRefOf = (block: any): number | undefined => {
  const parentId = block?.parentId ?? block?.parent?.id;
  const pageId = block?.pageId ?? block?.page?.id;
  return typeof parentId === 'number' && parentId !== pageId
    ? parentId
    : undefined;
};

/** User tags of a page: `tags` holds ids, `refs` the tag entities. */
const pageTags = (page: any): string[] | undefined => {
  const ids = new Set(
    (Array.isArray(page?.tags) ? page.tags : []).map((t: any) =>
      typeof t === 'number' ? t : t?.id,
    ),
  );
  const tags = (Array.isArray(page?.refs) ? page.refs : [])
    .filter(
      (ref: any) =>
        ids.has(ref?.id) &&
        !(typeof ref?.ident === 'string' && ref.ident.startsWith(BUILT_IN_CLASS)),
    )
    .map((ref: any) => ref.title ?? ref.name)
    .filter(Boolean);
  return tags.length ? tags : undefined;
};

export class DBRecallSource implements RecallSource {
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
    const key = String(ref);
    if (!this.pages.has(key)) {
      this.pages.set(
        key,
        this.client
          .getPage(typeof ref === 'number' ? { id: ref } : { uuid: ref })
          .then((page: any): CandidatePage | null =>
            page?.uuid
              ? {
                  uuid: page.uuid,
                  name: page.name ?? String(page.title).toLowerCase(),
                  title: page.title ?? page.originalName ?? page.name,
                  kind: page.journalDay ? 'journal' : 'page',
                  journalDay: page.journalDay || undefined,
                  updatedAt: page.updatedAt,
                  tags: pageTags(page),
                  noise: typeof page.ident === 'string',
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
    if (!block?.uuid) return null;
    const page = await this.readPage(block.page?.uuid ?? block.pageId);
    if (!page) return null;
    const raw = rawOf(block);
    return {
      uuid: block.uuid,
      page,
      raw,
      parsed: parseBlockText(raw, { marker: getBlockMarker(block) }),
      updatedAt: block.updatedAt,
      noise:
        block[CREATED_FROM_PROPERTY] !== undefined ||
        isTemplate(block) ||
        isTemplate(block.parent),
      parentRef: parentRefOf(block),
    };
  }

  async search(query: string) {
    const resp: any = await this.client.search(query, { limit: SEARCH_LIMIT });
    const items: any[] = Array.isArray(resp?.blocks) ? resp.blocks : [];
    const uuidOf = (item: any): string => item.uuid ?? item['block/uuid'];

    const [pages, blocks] = await Promise.all([
      Promise.all(
        items
          .filter((item) => item['page?'] === true)
          .filter(
            (item) => !tagIdents(item.tags).some((t) => NOISE_PAGE_CLASSES.has(t)),
          )
          .map((item) => this.readPage(uuidOf(item))),
      ),
      Promise.all(
        items
          .filter((item) => item['page?'] !== true)
          .map((item) => this.readBlock(uuidOf(item)).catch(() => null)),
      ),
    ]);
    return {
      pages: pages.filter((p): p is CandidatePage => p !== null),
      blocks: blocks.filter((b): b is CandidateBlock => b !== null),
    };
  }

  async getAncestor(ref: number | string): Promise<AncestorBlock | null> {
    const block: any = await this.blocks.get(ref);
    if (!block?.uuid) return null;
    return {
      uuid: block.uuid,
      raw: rawOf(block),
      marker: getBlockMarker(block),
      template: isTemplate(block),
      parentRef: parentRefOf(block),
    };
  }

  async getRefText(ref: UuidRef): Promise<string | undefined> {
    if (ref.kind === 'page') {
      const page = await this.readPage(ref.uuid);
      if (page) return page.title;
    }
    // `[[uuid]]` can point at a block too.
    const block: any = await this.blocks.get(ref.uuid);
    return block?.uuid ? rawOf(block) : undefined;
  }
}
