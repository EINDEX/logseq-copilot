import {
  ChangeBlockMarkerResult,
  LogseqBlockType,
  LogseqPageIdenity,
} from '@/types/logseqBlock';
import LogseqClient from './client';
import { renderBlock, resolveBlockRefs } from '../tool';
import { LogseqServiceInterface } from '../interfaces';
import { blockUuid, writeClipBlocks } from '../clip-blocks';
import { createNoteBlockApi } from '../note-blocks';
import { findGroupTarget, type GroupRequest } from '../clip-group';
import { expandClips } from '../clip-recall';
import type { ClipBlock } from '@/utils/clip-template';
import type { TemplateTag } from '@/utils/storage';
import { LogseqError, NoSearchingResult, throwIfClientError } from '../error';
import log from '@/utils/logger';
import type { RecallResult } from '@/types/recall';
import { recall, type RecallOptions } from '../recall/recall';
import { DBRecallSource } from '../recall/db-source';
import {
  getBlockMarker,
  splitTaskMarker,
  STATUS_PROPERTY,
  STATUS_TITLE_BY_MARKER,
} from './status';
import {
  mentionsScope,
  scopePrefixes,
  storedHostPath,
} from '@/utils/recall-scope';

export { getBlockMarker };

/** Set on the classes Logseq ships (Task, Page, ...). */
const BUILT_IN_PROPERTY = ':logseq.property/built-in?';

// Logseq 2.0.x returns `uuid`; older builds nested it as `block/uuid: {uuid}`.
const getItemUuid = (item: any): string =>
  item.uuid ??
  (typeof item['block/uuid'] === 'string'
    ? item['block/uuid']
    : item['block/uuid']?.uuid);

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_REF_RE = new RegExp(`(#?)\\[\\[(${UUID})\\]\\]`, 'gi');

/**
 * DB graphs store page refs and tags by uuid: `content` / `title` /
 * `rawTitle` read `[[6ad8…]]` and `#[[6ad8…]]`, `fullTitle` has the page
 * names. Use the readable text (older 2.x builds without `fullTitle` keep
 * `content`, see resolveUuidRefs).
 */
export const useReadableContent = <T extends { content?: string; fullTitle?: string; rawTitle?: string } | null | undefined>(
  block: T,
): T => {
  if (block && typeof block.fullTitle === 'string' && block.fullTitle) {
    if (typeof block.rawTitle !== 'string') block.rawTitle = block.content;
    block.content = block.fullTitle;
  }
  return block;
};

/**
 * Replace the `[[uuid]]` / `#[[uuid]]` placeholders left in `content` (no
 * `fullTitle`) with page names, read through `getName` (cached by the
 * caller). A page that cannot be read shows as "Untitled", never as a uuid.
 */
export const resolveUuidRefs = async (
  content: string,
  getName: (uuid: string) => Promise<string | undefined>,
) => {
  const uuids = [...new Set([...content.matchAll(UUID_REF_RE)].map((m) => m[2]))];
  if (uuids.length === 0) return content;
  const names = new Map<string, string>();
  await Promise.all(
    uuids.map(async (uuid) => {
      names.set(uuid, (await getName(uuid).catch(() => undefined)) || 'Untitled');
    }),
  );
  return content.replace(UUID_REF_RE, (_match, hash: string, uuid: string) => {
    const name = names.get(uuid)!;
    return hash && /^[^\s#,.!?;:()[\]{}"'<>]+$/.test(name) ? `#${name}` : `${hash}[[${name}]]`;
  });
};

/**
 * Built-in classes Logseq never shows on a block (`internal-tags` in
 * logseq.db.frontend.class: Page, Property, Tag, Root, Asset).
 */
const INTERNAL_TAGS = new Set([
  ':logseq.class/Page',
  ':logseq.class/Property',
  ':logseq.class/Tag',
  ':logseq.class/Root',
  ':logseq.class/Asset',
]);

/**
 * The tags Logseq DB shows after a block (`tags-cp` in
 * frontend/components/block.cljs): the block's classes (`tags`) without the
 * internal ones, those marked `hide-from-node`, and those written inline in
 * the title (`#[[uuid]]`, already rendered in the text). #Task is left out
 * too when the block has a status: the checkbox already says it is a task.
 */
export const getBlockTags = (block: any, marker = getBlockMarker(block)): string[] => {
  const tags: any[] = Array.isArray(block?.tags) ? block.tags : [];
  const raw = String(block?.rawTitle ?? block?.title ?? '');
  return tags
    .filter((tag) => tag && typeof tag === 'object')
    .filter((tag) => !INTERNAL_TAGS.has(tag.ident))
    .filter((tag) => !tag[':logseq.property.class/hide-from-node'])
    .filter((tag) => !(tag.uuid && raw.includes(`[[${tag.uuid}]]`)))
    .filter((tag) => !(marker && tag.ident === ':logseq.class/Task'))
    .map((tag) => String(tag.title ?? tag.fullTitle ?? tag.name ?? ''))
    .filter(Boolean);
};

/** Per-search cache: the same page is read once, not once per block. */
type PageCache = Map<string, Promise<LogseqPageIdenity>>;

export default class LogseqDBService implements LogseqServiceInterface {
  public client: LogseqClient = new LogseqClient();

  private noteBlocks = createNoteBlockApi(
    this.client,
    () => this.getGraph(),
    (text) =>
      resolveUuidRefs(text, async (uuid) => {
        const page: any = await this.client.getPage({ uuid });
        return page?.originalName ?? page?.title ?? page?.name;
      }),
  );
  public readBlock = (uuid: string) => this.noteBlocks.readBlock(uuid);
  public insertChildBlock = (parentUuid: string, content: string) =>
    this.noteBlocks.insertChildBlock(parentUuid, content);
  public updateBlockText = (uuid: string, content: string) =>
    this.noteBlocks.updateBlockText(uuid, content);
  public removeBlock = (uuid: string) => this.noteBlocks.removeBlock(uuid);

  public async getGraph() {
    const graph = throwIfClientError(await this.client.getGraph());
    return graph.name.replace('logseq_db_', '');
  }

  public async showMsg(message: string) {
    return await this.client.showMsg(message);
  }

  public async getVersion() {
    return (throwIfClientError(await this.client.getVersion()) as any).version;
  }

  private async searchGraph(graphName: string, query: string) {
    const resp: any = await this.client.search(query);
    const cache: PageCache = new Map();
    const response: {
      blocks: LogseqBlockType[];
      pages: LogseqPageIdenity[];
      count: number;
      graph: string;
    } = {
      blocks: [],
      pages: [],
      count: 0,
      graph: graphName,
    };

    // Block hits carry `page?: null` (not `false`), only pages have `true`.
    response.pages = await Promise.all(
      resp.blocks
        .filter((item: any) => item['page?'] === true)
        .map(async (item: any) => {
          return await this.client.getPage({
            uuid: getItemUuid(item),
          });
        }),
    );
    // Hits that cannot be read as a block (e.g. already deleted) are skipped.
    const blocks = await Promise.all(
      resp.blocks
        .filter((item: any) => item['page?'] !== true)
        .map(
          async (item: any) =>
            await this.findBlock(getItemUuid(item), graphName, query, false, cache),
        ),
    );
    response.blocks = blocks.filter(
      (block): block is LogseqBlockType => block !== null,
    );

    return response;
  }

  public async search(query: string) {
    const graph = await this.getGraph();
    log.debug(`DG Graph Name: ${graph}`);
    const resp = {
      msg: 'success',
      status: 200,
      response: await this.searchGraph(graph, query),
    };
    return resp;
  }

  public async getBlock(
    blockUuid: string,
    graph: string,
    query?: string,
    includeChildren: boolean = false,
  ) {
    const block = await this.findBlock(blockUuid, graph, query, includeChildren);
    if (block === null) {
      throw new LogseqError(NoSearchingResult);
    }
    return block;
  }

  private getPageCached(page: Partial<LogseqPageIdenity>, cache: PageCache) {
    const key = String(page.id ?? page.uuid ?? page.name);
    if (!cache.has(key)) cache.set(key, this.client.getPage(page));
    return cache.get(key)!;
  }

  /** Readable text of a DB block: names for page refs, never uuids. */
  private async readable<T extends any>(block: T, cache: PageCache): Promise<T> {
    const b = block as any;
    if (!b) return block;
    useReadableContent(b);
    if (typeof b.content === 'string') {
      b.content = await resolveUuidRefs(b.content, async (uuid) => {
        const page: any = await this.getPageCached({ uuid }, cache);
        return page?.originalName ?? page?.title ?? page?.name;
      });
    }
    return block;
  }

  private async findBlock(
    blockUuid: string,
    graph: string,
    query?: string,
    includeChildren: boolean = false,
    cache: PageCache = new Map(),
  ): Promise<LogseqBlockType | null> {
    const block = await this.client.getBlockViaUuid(blockUuid, {
      includeChildren,
    });
    if (!block) {
      return null;
    }
    if (block.page) {
      block.page = await this.getPageCached(block.page, cache);
    }
    await this.readable(block, cache);
    await resolveBlockRefs(block, async (uuid) =>
      this.readable(await this.client.getBlockViaUuid(uuid), cache),
    );
    return this.render(block, graph, query);
  }

  // The status lives in a property, so the rendered text has no marker to cut
  // out: render without it, then expose it for the status badge.
  private render(block: LogseqBlockType, graph: string, query?: string) {
    block.marker = '';
    renderBlock(block, graph, query);
    block.marker = getBlockMarker(block);
    block.tagNames = getBlockTags(block, block.marker);
    return block;
  }

  public async urlSearch(url: URL, opt: { scopeDepth?: number } = {}) {
    const graph = await this.getGraph();
    const blockUuidSet = new Set();
    const blocks: LogseqBlockType[] = [];

    const blockAdd = (block: LogseqBlockType) => {
      if (blockUuidSet.has(block.uuid)) {
        return;
      }
      blockUuidSet.add(block.uuid);
      blocks.push(block);
    };

    const find = async (
      url: string,
      keep: (block: LogseqBlockType) => boolean = () => true,
    ) => {
      const results = await this.searchGraph(graph, url);
      results.blocks.filter(keep).forEach(blockAdd);
    };

    if (url.pathname) {
      await find(url.host + url.pathname);
    }

    // A clip writes an unpaired parenthesis of the path as `%28` or `\)`.
    const stored = storedHostPath(url);
    if (stored !== url.host + url.pathname) {
      await find(stored);
    }

    const count = blocks.length;

    // Parent paths, narrowest first. Search matches substrings, so keep only
    // blocks that mention the whole path (not github.com/foo/barbaz).
    for (const prefix of scopePrefixes(url, opt.scopeDepth).slice(1)) {
      await find(prefix, (block) => mentionsScope(block.content, prefix));
    }

    const cache: PageCache = new Map();
    const clips = await expandClips(
      blocks.map((block) => this.render(block, graph, url.href)),
      count,
      {
        getBlock: (ref) => this.client.getBlockViaUuid(ref),
        getTree: (uuid) =>
          this.client.getBlockViaUuid(uuid, { includeChildren: true }),
        prepare: async (block, page) => {
          block.page = page;
          await this.readable(block, cache);
          await resolveBlockRefs(block, async (uuid) =>
            this.readable(await this.client.getBlockViaUuid(uuid), cache),
          );
          return this.render(block, graph, url.href);
        },
      },
    );

    return {
      status: 200,
      msg: 'success',
      response: {
        blocks: clips.blocks,
        graph: graph,
      },
      count: clips.count,
    };
  }

  public async recall(
    query: string,
    options?: RecallOptions,
  ): Promise<RecallResult> {
    return recall(
      new DBRecallSource(this.client, () => this.getGraph()),
      query,
      options,
    );
  }

  /**
   * Appends a clip: its root block and the tree below it. A task marker at the
   * start of any block (root or child), `TODO ` or `LATER `, becomes the
   * block's status: Logseq keeps tasks in a property, not in the text.
   * Properties (`key:: value`) stay text: a DB graph does not read them from
   * the text, and setting them through the API would create a property of the
   * plugin instead of the user's own.
   *
   * The tag goes on the root as a class (`addBlockTag`), the text stays clean.
   */
  public async clipBlocks(
    page: string,
    root: ClipBlock,
    opts: { tag?: TemplateTag; group?: GroupRequest } = {},
  ) {
    const write = async (
      create: (text: string) => Promise<unknown>,
      content: string,
    ) => {
      const { content: text, status } = splitTaskMarker(content);
      const uuid = blockUuid(await create(text));
      if (status) {
        const result = await this.client.setBlockStatus(uuid, status);
        if (result && typeof result === 'object' && 'error' in result) {
          throw new Error(String(result.error));
        }
      }
      return { uuid, ...(text !== content && { text }) };
    };
    const name = opts.tag?.name.trim();
    // A block of a DB graph is a task when it has a status.
    const target = opts.group
      ? findGroupTarget(
          await this.client.getPageBlocksTree(page),
          opts.group,
          root.content,
          (block) => getBlockMarker(block) !== '' || Boolean(block?.[STATUS_PROPERTY]),
        )
      : undefined;
    return await writeClipBlocks(
      page,
      root,
      {
        append: (to, content) =>
          write((text) => this.client.appendBlock(to, text), content),
        insertChild: (parentUuid, content) =>
          write(
            (text) => this.client.insertChildBlock(parentUuid, text),
            content,
          ),
      },
      name ? (rootUuid) => this.tagBlock(rootUuid, name) : undefined,
      target,
    );
  }

  /** The tags of the graph, as getAllTags answers them. */
  private async allTags(): Promise<any[]> {
    const tags = await this.client.getAllTags();
    if (!Array.isArray(tags)) {
      throw new Error(
        tags && typeof tags === 'object' && 'error' in tags
          ? String((tags as any).error)
          : 'Logseq did not return its tags.',
      );
    }
    return tags;
  }

  /**
   * The uuid of the tag `name`: the graph's own tag of that title (any case),
   * otherwise the class `createPage` makes (it returns the class itself when
   * there is one, so no duplicate). Never `createTag`, which makes a second
   * class in the plugin namespace.
   */
  private async resolveTagUuid(name: string): Promise<string> {
    const wanted = name.toLowerCase();
    const found = (await this.allTags()).find((tag) =>
      [tag?.title, tag?.name].some(
        (text) => typeof text === 'string' && text.toLowerCase() === wanted,
      ),
    );
    if (typeof found?.uuid === 'string' && found.uuid) return found.uuid;
    const page = await this.client.createPage(
      name,
      {},
      { class: true, redirect: false },
    );
    return blockUuid(page);
  }

  /**
   * Tags `rootUuid` with the tag `name` by uuid, never by name: a name can
   * resolve to the wrong class. A failure (the HTTP API reports one as a 200
   * response carrying `{ error }`) is logged by the caller, not a clip failure.
   */
  private async tagBlock(rootUuid: string, name: string) {
    const tagUuid = await this.resolveTagUuid(name);
    const result = await this.client.addBlockTag(rootUuid, tagUuid);
    if (result && typeof result === 'object' && 'error' in result) {
      throw new Error(String((result as any).error));
    }
  }

  /** The graph's own tags, built-in classes left out. */
  public async listTags(): Promise<TemplateTag[]> {
    const names = new Map<string, TemplateTag>();
    for (const tag of await this.allTags()) {
      if (tag?.[BUILT_IN_PROPERTY]) continue;
      const name = tag?.title ?? tag?.name;
      if (typeof name !== 'string' || !name.trim()) continue;
      if (!names.has(name.toLowerCase())) {
        names.set(name.toLowerCase(), {
          name,
          ...(typeof tag.uuid === 'string' && { uuid: tag.uuid }),
        });
      }
    }
    return [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  public async changeBlockMarker(
    uuid: string,
    marker: string,
  ): Promise<ChangeBlockMarkerResult> {
    const failed = (msg: string): ChangeBlockMarkerResult => ({
      type: 'change-block-marker-result',
      uuid: uuid,
      status: 'failed',
      marker: marker,
      msg: msg,
    });

    const status = STATUS_TITLE_BY_MARKER[marker.toUpperCase()];
    if (!status) {
      return failed(`Not support marker ${marker} on a DB graph.`);
    }
    const block = await this.client.getBlockViaUuid(uuid);
    if (!block) {
      return failed(`Block ${uuid} not found.`);
    }

    const result = await this.client.setBlockStatus(uuid, status);
    // The HTTP API reports failures as a 200 response carrying `{ error }`.
    if (result && typeof result === 'object' && 'error' in result) {
      return failed(String(result.error));
    }
    return {
      type: 'change-block-marker-result',
      uuid: uuid,
      status: 'success',
      marker: marker,
    };
  }
}
