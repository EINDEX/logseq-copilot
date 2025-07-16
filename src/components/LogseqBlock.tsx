import React, { useEffect } from 'react';
import { LogseqBlockType } from '@/types/logseqBlock';
import LogseqPageLink from './LogseqPage';
import { browser } from 'wxt/browser';
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

export const LogseqBlock = ({ graph, blocks }: LogseqBlockProps) => {
  const [checked, setChecked] = React.useState(false);
  const [status, setStatus] = React.useState('');

  if (blocks.length === 0) {
    return null;
  }

  const block = blocks[0]; // TODO: randomly picking first item - need to change later

  const statusUpdate = (marker: string) => {
    switch (marker) {
      case 'TODO':
      case 'LATER':
      case 'DOING':
      case 'NOW':
        setChecked(false);
        setStatus(marker);
        break;
      case 'DONE':
        setChecked(true);
        setStatus(marker);
        break;
      case 'CANCELED':
        setChecked(true);
        setStatus(marker);
        break;
    }
  };

  const processEvent = (message: {
    type: string;
    uuid: string;
    status: string;
    marker: string;
    msg?: string;
  }) => {
    if (
      message.type === 'change-block-marker-result' &&
      message.uuid === block.uuid &&
      message.status === 'success'
    ) {
      statusUpdate(message.marker);
    }
  };

  useEffect(() => {
    browser.runtime.onMessage.addListener(processEvent);
    statusUpdate(block.marker);

    return () => {
      browser.runtime.onMessage.removeListener(processEvent);
    };
  }, [block.marker, block.uuid]);

  const updateBlock = (marker: string) => {
    browser.runtime.sendMessage({
      type: 'change-block-marker',
      marker: marker,
      uuid: block.uuid
    });
  };

  const handleStatusChange = () => {
    let marker = '';
    if (status === 'TODO') {
      marker = 'DOING';
    } else if (status === 'DOING') {
      marker = 'TODO';
    } else if (status === 'NOW') {
      marker = 'LATER';
    } else if (status === 'LATER') {
      marker = 'NOW';
    }
    updateBlock(marker);
  };

  const handleCheckChange = (checkedState: boolean) => {
    const marker = checkedState ? 'DONE' : 'TODO';
    updateBlock(marker);
  };

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

  const renderMarker = (marker: string) => {
    if (!marker) return null;

    return (
      <div className="flex items-center gap-2">
        <Checkbox
          checked={checked}
          onCheckedChange={handleCheckChange}
          className="h-4 w-4"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleStatusChange}
          className="h-6 px-2 py-0"
        >
          <Badge variant={getStatusVariant(status)} className="text-xs">
            {status}
          </Badge>
        </Button>
      </div>
    );
  };

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
                {blockItem.marker && renderMarker(blockItem.marker)}
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
