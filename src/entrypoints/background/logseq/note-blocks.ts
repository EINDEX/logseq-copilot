import { blockTexts, blockUuid } from './clip-blocks';

/** A block as the comment sync reads it. */
export interface NoteBlock {
  /** Every text the block shows for its content, see `blockTexts`. */
  texts: string[];
  /** Blocks are below it: removing it would remove them too. */
  hasChildren: boolean;
}

/** What the comment sync needs from a Logseq service, the same on both graph types. */
export interface NoteBlockApi {
  /** The name of the graph that is open. */
  getGraph(): Promise<string>;
  /**
   * What is in the block, or null when there is no such block. Fails when
   * Logseq cannot be asked.
   */
  readBlock(uuid: string): Promise<NoteBlock | null>;
  /** A block as the last child of `parentUuid`: plain text, no task marker. */
  insertChildBlock(parentUuid: string, content: string): Promise<{ uuid: string }>;
  /** Replaces the text of the block. */
  updateBlockText(uuid: string, content: string): Promise<void>;
  /** Removes the block. */
  removeBlock(uuid: string): Promise<void>;
}

/** The client calls `createNoteBlockApi` needs. */
interface NoteBlockClient {
  getBlockViaUuid(uuid: string, opt?: { includeChildren: boolean }): Promise<unknown>;
  insertChildBlock(parentUuid: string, content: string): Promise<unknown>;
  updateBlock(block: { uuid: string; content: string }): Promise<unknown>;
  removeBlock(uuid: string): Promise<unknown>;
}

/** The HTTP API reports a failure as a 200 response carrying `{ error }`. */
const throwIfError = (result: unknown) => {
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(String((result as { error: unknown }).error));
  }
};

/** The note block calls on top of a Logseq client; `getGraph` is the service's. */
export const createNoteBlockApi = (
  client: NoteBlockClient,
  getGraph: () => Promise<string>,
  /**
   * A DB graph stores a page reference or tag as `[[uuid]]`: this reads a text
   * with the names, as the user wrote them. The block counts as having either.
   */
  readable?: (text: string) => Promise<string>,
): NoteBlockApi => ({
  getGraph,
  readBlock: async (uuid) => {
    const block = await client.getBlockViaUuid(uuid, { includeChildren: true });
    // Unknown uuid: `null` (or an `{ error }` on some builds).
    if (!block || typeof block !== 'object' || 'error' in block) return null;
    const { children } = block as { children?: unknown };
    const texts = blockTexts(block);
    if (readable) {
      for (const text of [...texts]) texts.push(await readable(text).catch(() => text));
    }
    return {
      texts,
      hasChildren: Array.isArray(children) && children.length > 0,
    };
  },
  insertChildBlock: async (parentUuid, content) => ({
    uuid: blockUuid(await client.insertChildBlock(parentUuid, content)),
  }),
  updateBlockText: async (uuid, content) => {
    throwIfError(await client.updateBlock({ uuid, content }));
  },
  removeBlock: async (uuid) => {
    throwIfError(await client.removeBlock(uuid));
  },
});
