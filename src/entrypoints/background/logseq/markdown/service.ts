import { ChangeBlockMarkerResult, LogseqBlockType } from '@/types/logseqBlock';
import LogseqClient from './client';
import { renderBlock, resolveBlockRefs } from '../tool';
import { LogseqServiceInterface } from '../interfaces';
import { throwIfClientError } from '../error';
import log from '@/utils/logger';

/**
 * `logseq.App.search` of a file graph (0.10.x) returns at most 10 blocks
 * (`search repo q {:limit 10}`, the API takes no options). When it is full,
 * the rest comes from a full-text query, up to this many blocks in total.
 */
export const SEARCH_API_LIMIT = 10;
export const MAX_SEARCH_BLOCKS = 50;

export default class LogseqService implements LogseqServiceInterface {
  public client: LogseqClient = new LogseqClient();

  public async getGraph() {
    const graph = throwIfClientError(await this.client.getGraph());
    return graph.name;
  }

  public async showMsg(message: string) {
    return await this.client.showMsg(message);
  }

  public async getVersion() {
    return (throwIfClientError(await this.client.getVersion()) as any).version;
  }

  private async searchGraph(graphName: string, query: string) {
    const result: any = await this.client.search(query);
    result.blocks = await Promise.all(
      result.blocks.map(async (block: any) => {
        return await this.getBlock(block['block/uuid'], graphName, query);
      }),
    );
    if (result.blocks.length >= SEARCH_API_LIMIT) {
      result.blocks.push(...(await this.moreBlocks(graphName, query, result.blocks)));
    }
    result.pages = await Promise.all(
      result.pages.map(async (page: string) => {
        return await this.client.getPage({
          name: page,
        });
      }),
    );

    result.count = result.blocks.length + result.pages.length;
    result.graph = graphName;
    return result;
  }

  /**
   * Blocks containing `query` beyond the search API limit: a simple query
   * (`logseq.DB.q "text"`) answers with whole blocks, so only their page
   * names are missing. Failures keep the search API results.
   */
  private async moreBlocks(
    graphName: string,
    query: string,
    found: LogseqBlockType[],
  ): Promise<LogseqBlockType[]> {
    let hits: any[];
    try {
      hits = await this.client.find(query);
    } catch (e) {
      log.warn('[search] full-text query failed', e);
      return [];
    }
    if (!Array.isArray(hits)) return [];
    const seen = new Set(found.map((block) => block.uuid));
    const extra = hits
      .filter((block) => block?.uuid && !seen.has(block.uuid) && block.content)
      .slice(0, Math.max(0, MAX_SEARCH_BLOCKS - found.length));
    return Promise.all(
      extra.map((block) => this.prepareBlock(block, graphName, query)),
    );
  }

  /** Page name, block ref texts and HTML of a block read from the API. */
  private async prepareBlock(block: any, graph: string, query?: string) {
    if (!block.page?.name) {
      block.page = await this.client.getPage(block.page);
    }
    await resolveBlockRefs(block, (uuid) => this.client.getBlockViaUuid(uuid));
    return renderBlock(block, graph, query);
  }

  public async search(query: string) {
    const graph = await this.getGraph();
    log.debug(`Markdown Graph Name: ${graph}`);
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
    const block = await this.client.getBlockViaUuid(blockUuid, {
      includeChildren,
    });
    block.page = await this.client.getPage(block.page);
    await resolveBlockRefs(block, (uuid) => this.client.getBlockViaUuid(uuid));
    return renderBlock(block, graph, query);
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
      const results = await this.client.find(url);
      results.forEach(blockAdd);
    };

    if (url.hash) {
      await find(url.host + url.pathname + url.search + url.hash);
    }
    if (url.search) {
      await find(url.host + url.pathname + url.search);
    }

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
          return renderBlock(block, graph, url.href);
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
    const graph = await this.getGraph();
    const block = await this.getBlock(uuid, graph);

    if (block.content.includes('SCHEDULED:')) {
      return {
        type: 'change-block-marker-result',
        uuid: uuid,
        status: 'failed',
        marker: marker,
        msg: 'Not support scheduled task.',
      };
    }
    block.content = block.content.replace(block.marker, marker);

    const result = await this.client.updateBlock(block);
    log.debug(result);
    // The HTTP API reports failures as a 200 response carrying `{ error }`.
    if (result && typeof result === 'object' && 'error' in result) {
      return {
        type: 'change-block-marker-result',
        uuid: uuid,
        status: 'failed',
        marker: marker,
        msg: String(result.error),
      };
    }
    return {
      type: 'change-block-marker-result',
      uuid: uuid,
      status: 'success',
      marker: marker,
    };
  }
}
