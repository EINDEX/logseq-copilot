import { LogseqBlockType, LogseqPageIdenity } from '@/types/logseqBlock';

import { LogseqError, LogseqVersionIsLower, toLogseqError } from '../error';
import LogseqClientBase, { escapeQueryString } from '../client';
import { LogseqClientInterface } from '../interfaces';
import log from '@/utils/logger';

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

export type LogseqResponseType<T> = {
  status: number;
  msg: string;
  response: T;
  count?: number;
};

export default class LogseqClient
  extends LogseqClientBase
  implements LogseqClientInterface
{
  private getCurrentGraph = async (): Promise<Graph> => {
    return await this.baseJson('logseq.getCurrentGraph', []);
  };

  public appendBlock = async (page: string, content: string) => {
    const resp = await this.baseJson('logseq.Editor.appendBlockInPage', [
      page,
      content,
    ]);
    return resp;
  };

  /** A block as the last child of the block `parentUuid`. */
  public insertChildBlock = async (parentUuid: string, content: string) => {
    return await this.baseJson('logseq.Editor.insertBlock', [
      parentUuid,
      content,
      { sibling: false },
    ]);
  };

  /** Removes a block and what is below it. */
  public removeBlock = async (uuid: string) => {
    return await this.baseJson('logseq.Editor.removeBlock', [uuid]);
  };

  /**
   * The blocks of a page as a tree, the top-level blocks first level. A page
   * that does not exist comes back empty (`null` or an error object).
   */
  public getPageBlocksTree = async (page: string) => {
    return await this.baseJson('logseq.Editor.getPageBlocksTree', [page]);
  };

  public getCurrentPage = async () => {
    return await this.catchIssues(async () => {
      return await this.baseJson('logseq.Editor.getCurrentPage', []);
    });
  };

  private getAllPage = async () => {
    return await this.baseJson('logseq.Editor.getAllPages', []);
  };

  public getPage = async (
    pageIdenity: Partial<LogseqPageIdenity>,
  ): Promise<LogseqPageIdenity> => {
    const resp: LogseqPageIdenity = await this.baseJson(
      'logseq.Editor.getPage',
      [pageIdenity.id || pageIdenity.uuid || pageIdenity.name],
    );
    return resp;
  };

  public getPageDB = async (
    pageIdenity: LogseqPageIdenity,
  ): Promise<LogseqPageIdenity> => {
    const resp: LogseqPageIdenity = await this.baseJson('get_page', [
      pageIdenity.uuid || pageIdenity.name || pageIdenity.id,
    ]);
    return resp;
  };

  public search = async (query: string): Promise<LogseqSearchResponse> => {
    const resp = await this.baseJson('logseq.App.search', [query]);
    if (resp.error) {
      throw new LogseqError(LogseqVersionIsLower);
    }
    return resp;
  };

  /** `uuid` is a block uuid, or its entity id (a block's `parent.id`). */
  public getBlockViaUuid = async (
    uuid: string | number,
    opt?: { includeChildren: boolean },
  ) => {
    return await this.baseJson('logseq.Editor.getBlock', [uuid, opt]);
  };

  public getBlockViaUuidDB = async (
    uuid: string,
    opt?: { includeChildren: boolean },
  ) => {
    return await this.baseJson('get_block', [uuid, opt]);
  };

  public isDBGraph = async () => {
    return await this.baseJson('check_current_is_db_graph', []);
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
      log.warn(e);
      return toLogseqError(e).info;
    }
  }

  private getVersionInternal = async (): Promise<
    LogseqResponseType<string>
  > => {
    return await this.baseJson('logseq.App.getAppInfo', []);
  };

  public find = async (query: string) => {
    const data = await this.baseJson('logseq.DB.q', [
      `"${escapeQueryString(query)}"`,
    ]);
    return data;
  };

  /** A datascript query over the graph; the rows come back as arrays. */
  public datascriptQuery = async (query: string) => {
    return await this.baseJson('logseq.DB.datascriptQuery', [query]);
  };

  public getUserConfig = async () => {
    return await this.catchIssues(
      async () => await this.baseJson('logseq.App.getUserConfigs', []),
    );
  };

  public showMsg = async (
    message: string,
  ): Promise<LogseqResponseType<null>> => {
    return await this.catchIssues(
      async () => await this.showMsgInternal(message),
    );
  };

  public getAllPages = async (): Promise<string> => {
    return await this.catchIssues(async () => await this.getAllPage());
  };

  public getGraph = async (): Promise<Graph> => {
    return await this.catchIssues(async () => await this.getCurrentGraph());
  };

  public getVersion = async (): Promise<LogseqResponseType<string>> => {
    return await this.catchIssues(async () => await this.getVersionInternal());
  };

  /**
   * Writes a text file to the storage of plugin `pluginId` in Logseq's own
   * folder (`~/.logseq/storages/<pluginId>/<file>`), outside the graph.
   * Resolves with its path. Internal API, probed on 0.10.15.
   */
  public writePluginStorageFile = async (
    pluginId: string,
    file: string,
    content: string,
  ): Promise<string> => {
    return (
      await this.baseText('write_plugin_storage_file', [pluginId, file, content, false])
    ).trim();
  };

  /**
   * Runs git with the graph folder as its work tree; resolves with what it
   * printed. Throws when git fails. Internal API, probed on 0.10.15.
   */
  public execGitCommand = async (args: string[]): Promise<string> => {
    return await this.baseText('exec_git_command', [args]);
  };

  public updateBlock = async (block: LogseqBlockType) => {
    log.debug(block.content);
    return await this.baseJson('logseq.Editor.updateBlock', [
      block.uuid,
      block.content,
    ]);
  };
}
