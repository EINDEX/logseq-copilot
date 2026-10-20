import React, { useEffect } from 'react';
import { LogseqBlockType } from '@/types/logseqBlock';
import LogseqPageLink from './LogseqPage';
import { sendMessage } from '@/types/messaging';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { IconExternalLink } from '@tabler/icons-react';
import { cn } from '@/lib/utils';

type LogseqBlockProps = {
  graph: string;
  blocks: LogseqBlockType[];
  isPopUp?: boolean;
};

const CHECKED_MARKERS = ['DONE', 'CANCELED'];

const getStatusVariant = (status: string) => {
  switch (status) {
    case 'TODO':
      return 'secondary';
    case 'DOING':
      return 'default';
    case 'NOW':
      return 'destructive';
    case 'LATER':
      return 'outline';
    case 'DONE':
      return 'secondary';
    case 'CANCELED':
      return 'outline';
    default:
      return 'secondary';
  }
};

// The click-to-cycle button only toggles between the "started" and "not
// started" state of a task; other markers have no such counterpart.
const NEXT_MARKER: Record<string, string> = {
  TODO: 'DOING',
  DOING: 'TODO',
  NOW: 'LATER',
  LATER: 'NOW',
};

/**
 * Checkbox + status badge of one task block. Each block owns its state, and
 * changes go to the background through request/response messaging, so this
 * works the same in the content script and in the popup.
 */
const BlockMarker = ({ uuid, marker }: { uuid: string; marker: string }) => {
  const [status, setStatus] = React.useState(marker);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState('');

  useEffect(() => {
    setStatus(marker);
    setError('');
  }, [marker, uuid]);

  const updateBlock = async (newMarker: string) => {
    if (!newMarker || pending) return;
    setPending(true);
    setError('');
    try {
      const result = await sendMessage('logseq:changeBlockMarker', {
        uuid,
        marker: newMarker,
      });
      if (result.status === 'success') {
        setStatus(result.marker);
      } else {
        setError(result.msg || 'Failed to change the task status.');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to change the task status.',
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Checkbox
          checked={CHECKED_MARKERS.includes(status)}
          disabled={pending}
          onCheckedChange={(checked) =>
            updateBlock(checked === true ? 'DONE' : 'TODO')
          }
          className="h-4 w-4"
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => updateBlock(NEXT_MARKER[status])}
          className="h-6 px-2 py-0"
        >
          <Badge variant={getStatusVariant(status)} className="text-xs">
            {status}
          </Badge>
        </Button>
      </div>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
};

export const LogseqBlock = ({ graph, blocks }: LogseqBlockProps) => {
  if (blocks.length === 0) {
    return null;
  }

  const block = blocks[0]; // TODO: randomly picking first item - need to change later

  const renderBlockLink = (block: LogseqBlockType) => {
    if (!block.uuid) return null;

    return (
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="h-6 px-2 py-0 text-xs"
      >
        <a
          href={`logseq://graph/${graph}?block-id=${block.uuid}`}
          className="flex items-center gap-1"
        >
          <IconExternalLink className="h-3 w-3" />
          Block
        </a>
      </Button>
    );
  };

  if (!block.html) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <LogseqPageLink graph={graph} page={block.page} />
          {blocks.length > 1 && (
            <Badge variant="outline" className="text-xs">
              {blocks.length} blocks
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-2">
          {blocks.map((blockItem) => (
            <li key={blockItem.uuid} className="group">
              <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-accent/50 transition-colors">
                {blockItem.marker && (
                  <BlockMarker uuid={blockItem.uuid} marker={blockItem.marker} />
                )}
                <div
                  className={cn(
                    "flex-1 text-sm prose prose-sm max-w-none",
                    "prose-p:my-0 prose-pre:my-1 prose-img:my-1",
                    "prose-a:no-underline hover:prose-a:underline",
                    "prose-img:max-w-full prose-img:max-h-96",
                    "prose-pre:overflow-x-auto prose-pre:whitespace-pre-wrap",
                    "[&_*]:break-words [&_*]:text-sm [&_*]:m-0"
                  )}
                  dangerouslySetInnerHTML={{ __html: blockItem.html }}
                />
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  {renderBlockLink(blockItem)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
