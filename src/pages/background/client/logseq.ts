import { LogseqBlockType } from '../../../types/logseq-block';
import { marked } from 'marked';
import { getLogseqCopliotConfig } from '../../../config';

type Graph = {
  name: string;
  path: string;
};

export type LogseqSearchResponse = {
  graph: string;
  blocks: LogseqBlockType[];
};

export default class LogseqClient {
  baseFetch = async (method: string, args: string[]) => {
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

  baseJson = async (method: string, args: string[]) => {
    const resp = await this.baseFetch(method, args);
    const data = await resp.json();
    return data;
  };

  format = (block: LogseqBlockType, graphName: string) => {
    block.html = marked.parse(block.content.trim());
    block.html = block.html.replace(
      /\[\[(.*?)\]\]/g,
      `<a class="logseq-page-link" href="logseq://graph/${graphName}?page=$1">$1</a>`,
    );
    return block;
  };

  showMsg = async (message: string) => {
    const resp = await this.baseFetch('logseq.UI.showMsg', [message]);
    return resp;
  };

  getCurrentGraph = async (): Promise<string> => {
    const resp: Graph = await this.baseJson('logseq.App.getCurrentGraph', []);
    return resp.name;
  };

  search = async (query: string): Promise<LogseqSearchResponse> => {
    const graphName = await this.getCurrentGraph();
    const resp = await this.baseJson('logseq.DB.q', [`"${query}"`]);
    console.log(resp);
    console.log(graphName);
    return {
      graph: graphName,
      blocks: resp.map((block: LogseqBlockType) =>
        this.format(block, graphName),
      ),
    };
  };
}
