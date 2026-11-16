import { linkKeys, samePageKey } from '@/utils/same-page';
import { blockTexts, LEADING_TASK_MARKER } from './clip-blocks';

/** What a clip asks for when it may join an earlier clip of the same page. */
export interface GroupRequest {
  /** The URL of the clipped page. */
  url: string;
}

/** The existing top-level block a clip is grouped under. */
export interface GroupTarget {
  uuid: string;
}

/** The new root starts with a task marker (TODO, LATER, NOW, DOING, DONE ...). */
export const startsWithTaskMarker = (content: string) =>
  LEADING_TASK_MARKER.test(content);

/**
 * The last of `topLevel` (the top-level blocks of the target page, in page
 * order) that links to the page `request.url` and is of the same kind as the
 * new root: a task for a task root, not a task otherwise. Nested blocks are
 * never looked at. `isTask` tells a block of the graph as a task.
 */
export const findGroupTarget = (
  topLevel: unknown,
  request: GroupRequest,
  rootContent: string,
  isTask: (block: any) => boolean,
): GroupTarget | undefined => {
  const key = samePageKey(request.url);
  if (!key || !Array.isArray(topLevel)) return undefined;
  const wantTask = startsWithTaskMarker(rootContent);

  for (let i = topLevel.length - 1; i >= 0; i--) {
    const block = topLevel[i];
    const uuid = block?.uuid;
    if (typeof uuid !== 'string') continue;
    if (isTask(block) !== wantTask) continue;
    const texts = blockTexts(block);
    if (!texts.some((text) => linkKeys(text).has(key))) continue;
    return { uuid };
  }
  return undefined;
};
