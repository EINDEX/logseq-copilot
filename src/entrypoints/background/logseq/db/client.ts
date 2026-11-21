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
      { focus: false },
    ]);
    return resp;
  };

  /** A block as the last child of the block `parentUuid`. */
  public insertChildBlock = async (parentUuid: string, content: string) => {
    return await this.baseJson('logseq.Editor.insertBlock', [
      parentUuid,
      content,
      { sibling: false, focus: false },
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
   * Every property of the graph: `ident`, `title`, `:logseq.property/type`,
   * built-in ones included (probed on 2.0.2).
   */
  public getAllProperties = async () => {
    return await this.baseJson('logseq.Editor.getAllProperties', []);
  };

  /**
   * Makes a property of the user (`:user.property/...`) titled `title` with
   * the type `type`. Logseq answers a text (`Added: {:property 1}.`), not the
   * property: read it back with getAllProperties. It makes a second property
   * when one of that title exists, so look first.
   */
  public createProperty = async (title: string, type: string) => {
    return await this.baseText('logseq.Editor.upsertNodes', [
      [
        {
          operation: 'add',
          entityType: 'property',
          id: 'property',
          data: { title, 'property-type': type },
        },
      ],
    ]);
  };

  /**
   * Sets the property `ident` (always the full ident: a bare name makes a
   * property of the plugin) on a block. Logseq checks the value against the
   * type and answers a refusal with HTTP 500, which throws.
   */
  public setBlockProperty = async (uuid: string, ident: string, value: unknown) => {
    const result = await this.baseJson('logseq.Editor.upsertBlockProperty', [
      uuid,
      ident,
      value,
    ]);
    if (result && typeof result === 'object' && 'error' in result) {
      throw new Error(String((result as any).error));
    }
    return result;
  };

  /** The journal page of `date` (a title in the graph's date format), made when missing. */
  public createJournalPage = async (date: string) => {
    return await this.baseJson('logseq.Editor.createJournalPage', [date]);
  };

  /**
   * Writes a file with `bytes` to the graph's assets folder; resolves with its
   * path. Internal API, probed on 2.0.2: bytes go as a Node Buffer in JSON.
   */
  public writeAssetsdirFile = async (file: string, bytes: Uint8Array): Promise<string> => {
    return await this.baseText('logseq.App.write_assetsdir_file', [
      file,
      { type: 'Buffer', data: Array.from(bytes) },
      '',
    ]);
  };

  /**
   * A block `uuid` as the last child of `parentUuid` (a block or a page),
   * then its properties, given by full ident. Logseq refuses a uuid that
   * exists; a refused property can leave the block made (HTTP 500).
   */
  public insertBlockWithProperties = async (
    parentUuid: string,
    content: string,
    uuid: string,
    properties: Record<string, string | number>,
  ) => {
    return await this.baseJson('logseq.Editor.insertBlock', [
      parentUuid,
      content,
      { sibling: false, focus: false, customUUID: uuid, properties },
    ]);
  };

  /** Tags the block `uuid` with the tag `tagUuid`. Throws when refused. */
  public addBlockTag = async (uuid: string, tagUuid: string) => {
    return await this.baseText('logseq.Editor.addBlockTag', [uuid, tagUuid]);
  };

  /**
   * A datascript query that finds one uuid (`[:find ?u . ...]`). The API
   * answers a found string as plain text, nothing as `null`.
   */
  public queryUuid = async (query: string): Promise<string | undefined> => {
    const text = (await this.baseText('logseq.DB.datascriptQuery', [query]))
      .trim()
      .replace(/^"|"$/g, '');
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
      ? text
      : undefined;
  };

  public updateBlock = async (block: LogseqBlockType) => {
    return await this.baseJson('logseq.Editor.updateBlock', [
      block.uuid,
      block.content,
    ]);
  };
}
