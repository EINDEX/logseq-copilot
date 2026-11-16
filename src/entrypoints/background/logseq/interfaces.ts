import { ChangeBlockMarkerResult, LogseqBlockType } from '@/types/logseqBlock';
import type { RecallResult } from '@/types/recall';
import type { ClipBlock } from '@/utils/clip-template';
import type { TemplateTag } from '@/utils/storage';
import type { RecallOptions } from './recall/recall';

export interface LogseqClientInterface {
  getGraph(): any;
  appendBlock(page: string, content: string): any;
  insertChildBlock(parentUuid: string, content: string): any;
  getVersion(): any;
  getAllPages(): any;
  showMsg(message: string): any;
  getUserConfig(): any;
  isDBGraph(): any;
  getBlockViaUuid(uuid: string | number, opt?: { includeChildren: boolean }): any;
  updateBlock(block: LogseqBlockType): any;
  search(query: string): any;
}

export interface LogseqServiceInterface {
  client: any;
  getGraph(): any;
  search(query: string): any;
  getBlock(
    blockUuid: string,
    graph: string,
    query?: string,
    includeChildren?: boolean,
  ): any;
  /**
   * Blocks mentioning the page, then those mentioning its parent paths up to
   * `scopeDepth` segments (src/utils/recall-scope.ts). Every hit is shown as
   * its whole clip: the top-level block it is under with its subtree
   * (`children`, `matched`), see clip-recall.ts. `count` is the number of
   * entries for the page itself.
   */
  urlSearch(url: URL, opt?: { scopeDepth?: number }): any;
  showMsg(message: string): any;
  getVersion(): any;
  /**
   * Appends a clip to `page`: its one root block at the end of the page, the
   * children below it in order. A task marker at the start of any block makes
   * it a task on either kind of graph. `tag` goes on the root block only: a
   * DB graph tags the block with the class, a file graph puts `#[[name]]` in
   * its text. A tag that cannot be applied does not fail the clip. Returns the
   * root block's uuid.
   */
  clipBlocks(
    page: string,
    root: ClipBlock,
    opts?: { tag?: TemplateTag },
  ): Promise<{ rootUuid: string }>;
  /**
   * The tags to pick for a template, by name, the ones of a DB graph with
   * their uuid. Throws when Logseq cannot answer.
   */
  listTags(): Promise<TemplateTag[]>;
  changeBlockMarker(
    uuid: string,
    marker: string,
  ): Promise<ChangeBlockMarkerResult>;
  /** Pages mentioning a search engine query, see recall/recall.ts. */
  recall(query: string, options?: RecallOptions): Promise<RecallResult>;
}
