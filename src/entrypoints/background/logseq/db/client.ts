import { LogseqBlockType, LogseqPageIdenity } from '@/types/logseqBlock';

import { LogseqError, LogseqVersionIsLower, toLogseqError } from '../error';
import { LogseqClientInterface } from '../interfaces';
import LogseqClientBase, { escapeQueryString } from '../client';
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

export default class LogseqClient extends LogseqClientBase implements LogseqClientInterface {
  private getCurrentGraph = async (): Promise<Graph> => {
    return await this.baseJson('logseq.App.getCurrentGraph', []);
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
    // The HTTP API resolves `logseq.<Ns>.<method>` to the SDK function
    // `<ns>@<method>`. A bare `get_page` has no namespace, so Logseq 2.x answers
    // it with HTTP 500 (`MethodNotExist: get_page`).
    const resp = await this.baseJson('logseq.Editor.getPage', [
      pageIdenity.id || pageIdenity.uuid || pageIdenity.name,
    ]);
    // DB pages carry their display name in `title`; `name` is lower-cased.
    return resp && !resp.originalName && resp.title
      ? { ...resp, originalName: resp.title }
      : resp;
  };

  /** `opts.limit`: max hits (Logseq 2.x honours it). */
  public search = async (
    query: string,
    opts?: { limit?: number },
  ): Promise<LogseqSearchResponse> => {
    const resp = await this.baseJson(
      'logseq.App.search',
      opts ? [query, opts] : [query],
    );
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

  public isDBGraph = async () => {
    return await this.baseJson('logseq.checkCurrentIsDbGraph', []);
  };

  private showMsgInternal = async (
    message: string,
  ): Promise<LogseqResponseType<null>> => {
    await this.baseFetch('logseq.App.showMsg', [message]);
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
   * Sets the task status of a DB-graph block. `status` must be the title of one
   * of the built-in choices (Todo, Doing, Done, ...): Logseq silently clears the
   * property for any other value.
   */
  public setBlockStatus = async (uuid: string, status: string) => {
    return await this.baseJson('logseq.Editor.upsertBlockProperty', [
      uuid,
      'logseq.property/status',
      status,
    ]);
  };

  /** Every tag (class) of the graph, built-in ones included. */
  public getAllTags = async () => {
    return await this.baseJson('logseq.Editor.getAllTags', []);
  };

  /**
   * A page by name; with `{ class: true }` the tag of that name, which is
   * returned as it is when it exists. Never `createTag`: that one makes a
   * second class in the plugin namespace.
   */
  public createPage = async (
    name: string,
    properties: Record<string, unknown> = {},
    opts: { class?: boolean; redirect?: boolean } = {},
  ) => {
    return await this.baseJson('logseq.Editor.createPage', [
      name,
      properties,
      opts,
    ]);
  };

  /** Tags the block with the class `tagUuid`. Always by uuid, never by name. */
  public addBlockTag = async (blockUuid: string, tagUuid: string) => {
    return await this.baseJson('logseq.Editor.addBlockTag', [
      blockUuid,
      tagUuid,
    ]);
  };

  public updateBlock = async (block: LogseqBlockType) => {
    return await this.baseJson('logseq.Editor.updateBlock', [
      block.uuid,
      block.content,
    ]);
  };
}
