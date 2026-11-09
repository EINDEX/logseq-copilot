import { ChangeBlockMarkerResult, LogseqBlockType } from '@/types/logseqBlock';
import LogseqClient from './client';
import { renderBlock, resolveBlockRefs } from '../tool';
import { LogseqServiceInterface } from '../interfaces';
import { throwIfClientError } from '../error';
import log from '@/utils/logger';
import type { RecallResult } from '@/types/recall';
import { recall, type RecallOptions } from '../recall/recall';
import { FileRecallSource } from '../recall/file-source';
import { moreBlocks } from './more-blocks';
import { mentionsScope, scopePrefixes } from '@/utils/recall-scope';

/**
 * Blocks a search answers at most: a full `App.search` answer (10 blocks)
 * is completed by a full-text query up to this many (see more-blocks.ts).
 */
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
    const extra = await moreBlocks(
      this.client,
      query,
      result.blocks.map((block: LogseqBlockType) => block.uuid),
      MAX_SEARCH_BLOCKS,
    );
    result.blocks.push(
      ...(await Promise.all(
        extra.map((block) => this.prepareBlock(block, graphName, query)),
      )),
    );
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
      const results: LogseqBlockType[] = await this.client.find(url);
      results.filter(keep).forEach(blockAdd);
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

    // Parent paths, narrowest first. Search matches substrings, so keep only
    // blocks that mention the whole path (not github.com/foo/barbaz).
    for (const prefix of scopePrefixes(url, opt.scopeDepth).slice(1)) {
      await find(prefix, (block) => mentionsScope(block.content, prefix));
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

  public async recall(
    query: string,
    options?: RecallOptions,
  ): Promise<RecallResult> {
    return recall(
      new FileRecallSource(this.client, () => this.getGraph()),
      query,
      options,
    );
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
