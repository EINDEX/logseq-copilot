import {
  LogseqSearchResult,
  LogseqPageIdenity,
  LogseqBlockType,
} from '../../types/logseqBlock';
import { marked } from 'marked';
import { getLogseqCopliotConfig } from '../../config';

import {
  CannotConnectWithLogseq,
  LogseqVersionIsLower,
  TokenNotCurrect,
  UnknownIssues,
  NoSearchingResult,
} from './error';

marked.setOptions({
  gfm: true,
  tables: true,
});

type Graph = {
  name: string;
  path: string;
};

type LogseqSearchResponse = {
  blocks: {
    'block/uuid': string;
    'block/content': string;
    'block/page': number;
  }[];
  'pages-content': {
    'block/uuid': string;
    'block/snippet': string;
  }[];
  pages: string[];
};

type LogseqQueryResponse = {
  id: number;
  uuid: string;
  content: string;
  page: {
    name: string;
    id: number;
    originalName: string;
  };
}[];

export type LogseqPageResponse = {
  name: string;
  uuid: string;
  'journal?': boolean;
};

export type LogseqResponseType<T> = {
  status: number;
  msg: string;
  response: T;
  count?: number;
};

export default class LogseqClient {
  private baseFetch = async (method: string, args: any[]) => {
    const config = await getLogseqCopliotConfig();
    const apiUrl = new URL(`${config.logseqHost}/api`);
    const resp = await fetch(apiUrl, {
      mode: 'cors',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.logseqAuthToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        method: method,
        args: args,
      }),
    });

    if (resp.status !== 200) {
      throw resp;
    }

    return resp;
  };

  private baseJson = async (method: string, args: any[]) => {
    const resp = await this.baseFetch(method, args);
    const data = await resp.json();
    console.debug(data);
    return data;
  };

  private tirmContent = (content: string): string => {
    return content
      .replaceAll(/!\[.*?\]\(\.\.\/assets.*?\)/gm, '')
      .replaceAll(/^[\w-]+::.*?$/gm, '') // clean properties
      .replaceAll(/{{renderer .*?}}/gm, '') // clean renderer
      .replaceAll(/^:logbook:[\S\s]*?:end:$/gm, '') // clean logbook
      .replaceAll(/\$pfts_2lqh>\$(.*?)\$<pfts_2lqh\$/gm, '<em>$1</em>') // clean highlight
      .replaceAll(/^\s*?-\s*?$/gm, '')
      .trim();
  };

  private format = (content: string, graphName: string, graphPath: string) => {
    const html = marked.parse(this.tirmContent(content));
    return html.replaceAll(
      /\[\[(.*?)\]\]/g,
      `<a class="logseq-page-link" href="logseq://graph/${graphName}?page=$1"><span class="tie tie-page"></span>$1</a>`,
    );
  };

  private getCurrentGraph = async (): Promise<{
    name: string;
    path: string;
  }> => {
    const resp: Graph = await this.baseJson('logseq.getCurrentGraph', []);
    return resp;
  };

  private getPage = async (
    pageIdenity: LogseqPageIdenity,
  ): Promise<LogseqPageIdenity> => {
    const resp: LogseqPageIdenity = await this.baseJson(
      'logseq.Editor.getPage',
      [pageIdenity.id || pageIdenity.uuid || pageIdenity.name],
    );
    return resp;
  };

  private search = async (query: string): Promise<LogseqSearchResponse> => {
    const resp = await this.baseJson('logseq.App.search', [query]);
    if (resp.error) {
      throw LogseqVersionIsLower;
    }
    return resp;
  };

  private showMsgInternal = async (
    message: string,
  ): Promise<LogseqResponseType<null>> => {
    await this.baseFetch('logseq.showMsg', [message]);
    return {
      status: 200,
      msg: 'success',
      response: null,
    };
  };

  private async catchIssues(func: Function) {
    try {
      return await func();
    } catch (e: any) {
      console.info(e);
      if (e.status === 401) {
        return TokenNotCurrect;
      } else if (
        e.toString() === 'TypeError: Failed to fetch' ||
        e.toString().includes('Invalid URL')
      ) {
        return CannotConnectWithLogseq;
      } else if (e === LogseqVersionIsLower || e === NoSearchingResult) {
        return e;
      } else {
        return UnknownIssues;
      }
    }
  }

  private getVersionInternal = async (): Promise<
    LogseqResponseType<string>
  > => {
    const resp = await this.baseJson('logseq.App.getAppInfo', []);
    return {
      status: 200,
      msg: 'success',
      response: resp.version,
    };
  };

  private find = async (query: string) => {
    const data = await this.baseJson('logseq.DB.q', [
      `"${query.replaceAll('"', '"')}"`,
    ]);
    return data;
  };

  private findLogseqInternal = async (
    query: string,
  ): Promise<LogseqResponseType<LogseqSearchResult>> => {
    const { name: graphName, path: graphPath } = await this.getCurrentGraph();
    const res = await this.find(query);
    const blocks = await Promise.all(
      res.map(async (item) => {
        return {
          html: this.format(item.content, graphName, graphPath),
          uuid: item.uuid,
          page: await this.getPage({
            id: item.page.id,
          } as LogseqPageIdenity),
        } as LogseqBlockType;
      }),
    );
    return {
      status: 200,
      msg: 'success',
      response: {
        blocks: blocks,
        pages: [],
        graph: graphName,
      },
      count: blocks.length,
    };
  };

  private searchLogseqInternal = async (
    query: string,
  ): Promise<LogseqResponseType<LogseqSearchResult>> => {
    const { name: graphName, path: graphPath } = await this.getCurrentGraph();
    const { blocks, pages }: LogseqSearchResponse = await this.search(query);

    const result: LogseqSearchResult = {
      pages: await Promise.all(
        pages.map(
          async (page) =>
            await this.getPage({ name: page } as LogseqPageIdenity),
        ),
      ),
      blocks: await Promise.all(
        blocks.map(async (block) => {
          return {
            html: this.format(block['block/content'], graphName, graphPath),
            uuid: block['block/uuid'],
            page: await this.getPage({
              id: block['block/page'],
            } as LogseqPageIdenity),
          };
        }),
      ),
      graph: graphName,
    };

    console.debug(result);
    return {
      msg: 'success',
      status: 200,
      response: result,
      count: result.blocks.length + result.pages.length,
    };
  };

  public showMsg = async (
    message: string,
  ): Promise<LogseqResponseType<null>> => {
    return await this.catchIssues(
      async () => await this.showMsgInternal(message),
    );
  };

  public getVersion = async (): Promise<LogseqResponseType<string>> => {
    return await this.catchIssues(async () => await this.getVersionInternal());
  };

  public searchLogseq = async (
    query: string,
  ): Promise<LogseqResponseType<LogseqSearchResult | null>> => {
    return await this.catchIssues(async () => {
      return await this.searchLogseqInternal(query);
    });
  };

  public blockSearch = async (
    query: string,
  ): Promise<LogseqResponseType<LogseqSearchResult | null>> => {
    return await this.catchIssues(async () => {
      return this.findLogseqInternal(query);
    });
  };
}
