import type { ClipBlock } from '@/utils/clip-template';
import log from '@/utils/logger';

/** How a service writes one block of a clip. */
export interface BlockWriter {
  /** A block at the end of `page`. */
  append(page: string, content: string): Promise<{ uuid: string }>;
  /** A block as the last child of the block `parentUuid`. */
  insertChild(parentUuid: string, content: string): Promise<{ uuid: string }>;
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

/** A tag as text: `#[[name]]`. */
export const tagText = (name: string) => `#[[${name}]]`;

const LEADING_TASK_MARKER =
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

/**
 * Writes a clip's block tree to `page`: the root as a new block at the end of
 * the page, then the children of each block below it, in order, depth first.
 * `onRoot` runs once the root is written, before its children; what it throws
 * does not stop the clip. Fails with a readable message at the first block
 * Logseq refuses; what was written before it stays. Returns the root's uuid.
 */
export const writeClipBlocks = async (
  page: string,
  root: ClipBlock,
  writer: BlockWriter,
  onRoot?: (rootUuid: string) => Promise<void>,
): Promise<{ rootUuid: string }> => {
  let written = 0;

  const writeChildren = async (parentUuid: string, children: ClipBlock[]) => {
    for (const child of children) {
      const { uuid } = await writer.insertChild(parentUuid, child.content);
      written++;
      await writeChildren(uuid, child.children);
    }
  };

  let rootUuid: string;
  try {
    ({ uuid: rootUuid } = await writer.append(page, root.content));
    written++;
    if (onRoot) {
      try {
        await onRoot(rootUuid);
      } catch (error) {
        log.warn('The clip was saved, but its tag was not applied.', error);
      }
    }
    await writeChildren(rootUuid, root.children);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      written === 0
        ? reason
        : `Logseq stopped after ${written} blocks of the clip: ${reason}`,
      { cause },
    );
  }
  return { rootUuid };
};
