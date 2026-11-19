import type { ClipBlock } from '@/utils/clip-template';
import log from '@/utils/logger';

/** How a service writes one block of a clip. */
export interface BlockWriter {
  /** A block at the end of `page`; `block` is the block of the clip it is. */
  append(page: string, content: string, block: ClipBlock): Promise<BlockWritten>;
  /** A block as the last child of the block `parentUuid`. */
  insertChild(
    parentUuid: string,
    content: string,
    block: ClipBlock,
  ): Promise<BlockWritten>;
}

/**
 * A block a writer wrote: its uuid, and the text it stores when that is not
 * `content` as given (a DB graph keeps a task marker as a status, not text).
 */
export interface BlockWritten {
  uuid: string;
  text?: string;
}

/**
 * The HTTP API reports failures as a 200 response carrying `{ error }`, and
 * a block it wrote comes back with its `uuid`. Returns that uuid.
 */
export const blockUuid = (result: unknown): string => {
  if (result && typeof result === 'object') {
    if ('error' in result) throw new Error(String((result as any).error));
    const uuid = (result as any).uuid;
    if (typeof uuid === 'string' && uuid) return uuid;
  }
  throw new Error('Logseq did not return the block it wrote.');
};

/**
 * Every text a block stored later may show for what was written: `content`
 * (file graph), `title`, and `fullTitle`. A DB graph keeps references to pages
 * with deterministic ids (the journal page of a `[[date]]`) as `[[uuid]]` in
 * the first two, and as written in `fullTitle`.
 */
export const blockTexts = (block: unknown): string[] => {
  const { content, title, fullTitle } = (block ?? {}) as Record<string, unknown>;
  return [content, title, fullTitle].filter((text): text is string => typeof text === 'string');
};

/** A tag as text: `#[[name]]`. */
export const tagText = (name: string) => `#[[${name}]]`;

export const LEADING_TASK_MARKER =
  /^(?:TODO|LATER|NOW|DOING|DONE|WAITING|WAIT|IN-PROGRESS|CANCELED|CANCELLED) /;

/**
 * `content` with the tag as text in its first line: in front of it, behind a
 * task marker the block starts with (a marker is only read at the very start).
 * Content that has this exact tag text already comes back unchanged.
 */
export const withTagText = (content: string, name: string): string => {
  const tag = tagText(name);
  if (content.includes(tag)) return content;
  const at = LEADING_TASK_MARKER.exec(content)?.[0].length ?? 0;
  return `${content.slice(0, at)}${tag} ${content.slice(at)}`;
};

/** What a clip wrote: the one node it added, and what is below it. */
export interface WrittenClip {
  /**
   * The one top-level node the clip added: the new root, or the child
   * appended to an existing block. With `added` false the existing block it
   * would have joined.
   */
  rootUuid: string;
  /** The blocks right below the node, as written. */
  children: number;
  /** False when the clip had nothing to add to the existing block. */
  added: boolean;
  /** The existing block the node was appended to, when the clip was grouped. */
  groupedUnder?: string;
  /** The block that holds the clip's note, when it is a block of its own. */
  noteUuid?: string;
  /** The text the note block stores, with `noteUuid`. */
  noteText?: string;
}

/**
 * Writes a clip's block tree to `page`.
 *
 * Without `target`: the root as a new block at the end of the page, then the
 * children of each block below it, in order, depth first. `onRoot` runs once
 * the root is written, before its children; what it throws does not stop the
 * clip.
 *
 * With `target` (an existing top-level block of the same page, see
 * clip-group.ts): the root is not written again, and the clip adds exactly one
 * node to the target. The root's children become one child of the target: a
 * single child is appended with its subtree; with several, the first is the
 * node and the others follow as its children, after its own, in order. A root
 * without children adds nothing. `onRoot` does not run: a tag belongs to a
 * root that is written.
 *
 * Fails with a readable message at the first block Logseq refuses; what was
 * written before it stays. The result has the uuid of the block that holds the
 * clip's note (`note` on a block) when the tree has one.
 */
export const writeClipBlocks = async (
  page: string,
  root: ClipBlock,
  writer: BlockWriter,
  onRoot?: (rootUuid: string) => Promise<void>,
  target?: { uuid: string },
): Promise<WrittenClip> => {
  let written = 0;
  let noteUuid: string | undefined;
  let noteText: string | undefined;

  const writeChildren = async (parentUuid: string, children: ClipBlock[]) => {
    for (const child of children) {
      const { uuid, text } = await writer.insertChild(parentUuid, child.content, child);
      written++;
      if (child.note && noteUuid === undefined) {
        noteUuid = uuid;
        noteText = text ?? child.content;
      }
      await writeChildren(uuid, child.children);
    }
  };

  if (target && root.children.length === 0) {
    return {
      rootUuid: target.uuid,
      children: 0,
      added: false,
      groupedUnder: target.uuid,
    };
  }

  let rootUuid: string;
  let node: ClipBlock = root;
  try {
    if (target) {
      const [first, ...others] = root.children;
      node = { ...first, children: [...first.children, ...others] };
      const made = await writer.insertChild(target.uuid, node.content, node);
      rootUuid = made.uuid;
      written++;
      if (node.note) {
        noteUuid = rootUuid;
        noteText = made.text ?? node.content;
      }
    } else {
      const made = await writer.append(page, root.content, root);
      rootUuid = made.uuid;
      written++;
      if (root.note) {
        noteUuid = rootUuid;
        noteText = made.text ?? root.content;
      }
      if (onRoot) {
        try {
          await onRoot(rootUuid);
        } catch (error) {
          log.warn('The clip was saved, but its tag was not applied.', error);
        }
      }
    }
    await writeChildren(rootUuid, node.children);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      written === 0
        ? reason
        : `Logseq stopped after ${written} blocks of the clip: ${reason}`,
      { cause },
    );
  }
  return {
    rootUuid,
    children: node.children.length,
    added: true,
    ...(noteUuid !== undefined && { noteUuid, noteText }),
    ...(target && { groupedUnder: target.uuid }),
  };
};
