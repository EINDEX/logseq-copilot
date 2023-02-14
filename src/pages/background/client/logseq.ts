import {
  LogseqBlockType,
  LogseqSearchResult,
  LogseqPageIdenity,
  LogseqPageContentType,
} from '../../../types/logseq-block';
import { marked } from 'marked';
import { getLogseqCopliotConfig } from '../../../config';

marked.setOptions({
  gfm: true,
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

export type LogseqPageResponse = {
  name: string;
  uuid: string;
  'journal?': boolean;
};
export default class LogseqClient {
  private baseFetch = async (method: string, args: any[]) => {
    const config = await getLogseqCopliotConfig();
    const resp = await fetch(`${config.logseqHost}/api`, {
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
    .replaceAll(/!\[.*?\]\(\.\.\/assets.*?\)/gm, "")
    .replaceAll(/^[\w-]+::.*?$/gm, "")  // clean properties
    .replaceAll(/{{renderer .*?}}/gm, "") // clean renderer
    .replaceAll(/^:logbook:[\S\s]*?:end:$/gm, "") // clean logbook
    .replaceAll(/\$pfts_2lqh>\$(.*?)\$<pfts_2lqh\$/gm, "$1") // clean highlight
    .replaceAll(/^\s*?-\s*?$/gm, "")
    .trim()
  }

  private format = (content: string, graphName: string, graphPath: string) => {
    const html = marked.parse(this.tirmContent(content));
    return html.replaceAll(
      /\[\[(.*?)\]\]/g,
      `<a class="logseq-page-link" href="logseq://graph/${graphName}?page=$1">$1</a>`,
    );
  };

  public showMsg = async (message: string) => {
    const resp = await this.baseFetch('logseq.UI.showMsg', [message]);
    return resp;
  };

  private getCurrentGraph = async (): Promise<{name: string, path:string}> => {
    const resp: Graph = await this.baseJson('logseq.App.getCurrentGraph', []);
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
    console.log(resp)
    return resp;
  };

  public searchLogseq = async (query: string): Promise<LogseqSearchResult> => {
    const {name: graphName, path: graphPath} = await this.getCurrentGraph();
    const {
      blocks,
      'pages-content': pageContents,
      pages,
    }: LogseqSearchResponse = await this.search(query);

    console.log(blocks, pageContents, pages);

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
      pageContents: await Promise.all(
        pageContents.map(async (pageContent) => {
          return {
            content: this.tirmContent(pageContent['block/snippet']).replaceAll(/\n+/g," "),
            uuid: pageContent['block/uuid'],
            page: await this.getPage({
              uuid: pageContent['block/uuid'],
            } as LogseqPageIdenity),
          };
        }),
      ),
      graph: graphName,
    };
    return result;
  };
}
