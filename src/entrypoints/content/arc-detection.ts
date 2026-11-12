import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { hasArcPalette } from '@/utils/arc';
import log from '@/utils/logger';
import { arcDetectedItem } from '@/utils/storage';

// Arc may add its palette after the page has loaded: look once more.
const SECOND_LOOK_MS = 2_000;

const lookForArc = () =>
  hasArcPalette(getComputedStyle(document.documentElement));

/**
 * Store that the browser is Arc, once a page shows it (src/utils/arc.ts). The
 * background follows the stored value (src/entrypoints/background).
 */
export function detectArc(ctx: ContentScriptContext): void {
  const remember = () => {
    arcDetectedItem
      .getValue()
      .then((known) => (known ? undefined : arcDetectedItem.setValue(true)))
      .catch((error) => log.error('[content] Failed to store Arc', error));
  };
  if (lookForArc()) {
    remember();
    return;
  }
  ctx.setTimeout(() => {
    if (lookForArc()) remember();
  }, SECOND_LOOK_MS);
}
