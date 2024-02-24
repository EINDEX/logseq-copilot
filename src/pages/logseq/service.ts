import { LogseqBlockType } from '../../types/logseqBlock';
import LogseqClient from './client';
import { renderBlock } from './tool';

export default class LogseqService {
  private logseqClient: LogseqClient = new LogseqClient();

  public async getGraph() {
    return await this.logseqClient.getGraph();
  }

  public async search(query: string) {
    const graph = await this.getGraph();
    const result = await this.logseqClient.search(query);
    result.blocks = await Promise.all(
      result.blocks.map(async (block) => {
        return await this.getBlock(block['block/uuid'], graph.name, query);
      }),
    );
    result.pages = await Promise.all(
      result.pages.map(async (page: string) => {
        return await this.logseqClient.getPage({
          name: page,
        });
      }),
    );

    result.graph = graph.name;
    result.count = result.blocks.length + result.pages.length;

    return {
      msg: 'success',
      status: 200,
      response: result,
    };
  }

  public async getBlock(
    blockUuid: string,
    graph: string,
    query?: string,
    includeChildren: boolean = false,
  ) {
    const block = await this.logseqClient.getBlockViaUuid(blockUuid, {
      includeChildren,
    });
    block.page = await this.logseqClient.getPage(block.page);
    return renderBlock(block, graph, query);
  }

  public async urlSearch(url: URL, opt: { fuzzy: boolean } = { fuzzy: false }) {
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
      const results = await this.logseqClient.find(url);
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
          return renderBlock(block, graph.name, url.href);
        }),
        graph: graph.name,
      },
      count: count,
    };
  }

  public async changeBlockMarker(uuid: string, marker: string) {
    const graph = await this.getGraph();
    const block = await this.getBlock(uuid, graph.name);

    if (block.content.includes('SCHEDULED:')) {
      return {
        type: 'change-block-marker-result',
        uuid: uuid,
        status: 'failed',
        msg: 'Not support scheduled task.',
      };
    }
    block.content = block.content.replace(block.marker, marker);

    const result = await this.logseqClient.updateBlock(block);
    console.debug(result);
    if (Object.hasOwnProperty(result, 'error')) {
      return {
        type: 'change-block-marker-result',
        uuid: uuid,
        status: 'failed',
        msg: 'error',
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
