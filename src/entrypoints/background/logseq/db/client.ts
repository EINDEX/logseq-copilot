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

  public search = async (query: string): Promise<LogseqSearchResponse> => {
    const resp = await this.baseJson('logseq.App.search', [query]);
    if (resp.error) {
      throw new LogseqError(LogseqVersionIsLower);
    }
    return resp;
  };

  public getBlockViaUuid = async (
    uuid: string,
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

  public updateBlock = async (block: LogseqBlockType) => {
    return await this.baseJson('logseq.Editor.updateBlock', [
      block.uuid,
      block.content,
    ]);
  };
}
