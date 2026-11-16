import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { renderClip, type ClipBlock } from '@/utils/clip-template';

/** What a selection looks like after turndown: two paragraphs and a nested list. */
export const SAMPLE_SELECTION = `The first paragraph of the selected text.

The second paragraph, with a [link](https://example.com).

*   First item
    *   Nested item
*   Second item`;

const SAMPLE = {
  title: 'Sample page',
  url: 'https://example.com/article',
  preferredDateFormat: 'MMM do, yyyy',
};

type Mode = 'selection' | 'page';

const Blocks: React.FC<{ blocks: ClipBlock[] }> = ({ blocks }) => (
  <ul className="space-y-1">
    {blocks.map((block, index) => (
      <li key={index} data-clip-block>
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-muted-foreground/70"
          />
          <span className="min-w-0 whitespace-pre-wrap break-words">{block.content}</span>
        </div>
        {block.children.length > 0 && (
          <div className="ml-[0.2rem] mt-1 border-l pl-3">
            <Blocks blocks={block.children} />
          </div>
        )}
      </li>
    ))}
  </ul>
);

/**
 * The blocks a clip with `template` writes to Logseq, from sample data. A
 * template Liquid cannot render shows its error instead.
 */
export const ClipPreview: React.FC<{ template: string }> = ({ template }) => {
  const [mode, setMode] = useState<Mode>('selection');
  const [time] = useState(() => new Date());

  const result = useMemo((): { blocks: ClipBlock[]; error?: string } => {
    try {
      return {
        blocks: renderClip(template, {
          ...SAMPLE,
          data: mode === 'selection' ? SAMPLE_SELECTION : '',
          time,
        }),
      };
    } catch (error) {
      return {
        blocks: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [template, mode, time]);

  return (
    <div className="space-y-2" data-testid="clip-preview">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Preview</h3>
        <div className="flex gap-1" role="group" aria-label="Sample clip">
          {(
            [
              ['selection', 'With selection'],
              ['page', 'Page only'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={mode === value ? 'secondary' : 'ghost'}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <div className="min-h-16 rounded-md border bg-muted/30 p-3 text-sm">
        {result.error !== undefined ? (
          <p role="alert" className="font-mono text-xs text-destructive">
            {result.error.split('\n')[0]}
          </p>
        ) : result.blocks.length === 0 ? (
          <p className="text-muted-foreground">No blocks</p>
        ) : (
          <Blocks blocks={result.blocks} />
        )}
      </div>
    </div>
  );
};
