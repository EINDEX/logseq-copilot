import {
  ChangeBlockMarkerResult,
  LogseqBlockType,
  LogseqPageIdenity,
} from '@/types/logseqBlock';
import LogseqClient from './client';
import { renderBlock, resolveBlockRefs } from '../tool';
import { LogseqServiceInterface } from '../interfaces';
import { LogseqError, NoSearchingResult, throwIfClientError } from '../error';
import log from '@/utils/logger';

const STATUS_PROPERTY = ':logseq.property/status';
const STATUS_IDENT_PREFIX = `${STATUS_PROPERTY}.`;

// Marker -> title of the built-in status choice (Backlog, Todo, Doing,
// In Review, Done, Canceled). Logseq clears the property for unknown titles,
// so only markers with an exact counterpart are accepted.
const STATUS_TITLE_BY_MARKER: Record<string, string> = {
  TODO: 'Todo',
  DOING: 'Doing',
  DONE: 'Done',
  CANCELED: 'Canceled',
  CANCELLED: 'Canceled',
};

/**
 * DB graphs keep the task state in the `logseq.property/status` property, e.g.
 * `{ ident: ':logseq.property/status.todo', title: 'Todo' }`, not as a text
 * prefix. Returns the equivalent file-graph style marker (TODO, DONE, ...).
 */
export const getBlockMarker = (block: any): string => {
  const ident = block?.[STATUS_PROPERTY]?.ident;
  return typeof ident === 'string' && ident.startsWith(STATUS_IDENT_PREFIX)
    ? ident.slice(STATUS_IDENT_PREFIX.length).toUpperCase()
    : '';
};

// Logseq 2.0.x returns `uuid`; older builds nested it as `block/uuid: {uuid}`.
const getItemUuid = (item: any): string =>
  item.uuid ??
  (typeof item['block/uuid'] === 'string'
    ? item['block/uuid']
    : item['block/uuid']?.uuid);

/**
 * DB graphs store page refs and tags by uuid: `content` / `title` read
 * `[[6ad8…]]` and `#[[6ad8…]]`, `fullTitle` has the page names. Use the
 * readable text (older 2.x builds without `fullTitle` keep `content`).
 */
export const useReadableContent = <T extends { content?: string; fullTitle?: string } | null | undefined>(
  block: T,
): T => {
  if (block && typeof block.fullTitle === 'string' && block.fullTitle) {
    block.content = block.fullTitle;
  }
  return block;
};

export default class LogseqDBService implements LogseqServiceInterface {
  public client: LogseqClient = new LogseqClient();

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
            await this.findBlock(getItemUuid(item), graphName, query),
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

  private async findBlock(
    blockUuid: string,
    graph: string,
    query?: string,
    includeChildren: boolean = false,
  ): Promise<LogseqBlockType | null> {
    const block = await this.client.getBlockViaUuid(blockUuid, {
      includeChildren,
    });
    if (!block) {
      return null;
    }
    if (block.page) {
      block.page = await this.client.getPage(block.page);
    }
    useReadableContent(block);
    await resolveBlockRefs(block, async (uuid) =>
      useReadableContent(await this.client.getBlockViaUuid(uuid)),
    );
    return this.render(block, graph, query);
  }

  // The status lives in a property, so the rendered text has no marker to cut
  // out: render without it, then expose it for the status badge.
  private render(block: LogseqBlockType, graph: string, query?: string) {
    block.marker = '';
    renderBlock(block, graph, query);
    block.marker = getBlockMarker(block);
    return block;
  }

  public async urlSearch(url: URL, opt: { fuzzy?: boolean } = { fuzzy: false }) {
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

    const find = async (url: string) => {
      const results = await this.searchGraph(graph, url);
      results.blocks.forEach(blockAdd);
    };

    if (url.pathname) {
      await find(url.host + url.pathname);
    }

    const count = blocks.length;

    if (url.host && opt.fuzzy) {
      await find(url.host);
    }

    return {
      status: 200,
      msg: 'success',
      response: {
        blocks: blocks.map((block) => {
          return this.render(block, graph, url.href);
        }),
        graph: graph,
      },
      count: count,
    };
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
