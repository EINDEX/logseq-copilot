import React from 'react';
import { IconExternalLink } from '@tabler/icons-react';
import { LogseqBlock } from './LogseqBlock';
import LogseqPageLink from './LogseqPage';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { LogseqBlockType } from '@/types/logseqBlock';

interface LogseqCopilotProps {
  graph: string;
  pages: any[];
  blocks: LogseqBlockType[];
}

const LogseqCopilot = ({ graph, pages, blocks }: LogseqCopilotProps) => {
  const groupedBlocks = React.useMemo(() => {
    return blocks.reduce((groups: Record<string, LogseqBlockType[]>, item) => {
      const group = (groups[item.page.name] || []);
      group.push(item);
      groups[item.page.name] = group;
      return groups;
    }, {});
  }, [blocks]);

  const handleOpenLogseq = () => {
    window.open(`logseq://graph/${graph}`, '_blank');
  };

  const renderPages = () => {
    if (pages.length === 0) return <></>;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {pages.slice(0, 8).map((page) => {
            if (!page) return null;
            return (
              <div key={page.uuid} className="max-w-full rounded-md bg-muted px-2 py-1 hover:bg-accent transition-colors">
                <LogseqPageLink graph={graph} page={page} />
              </div>
            );
          })}
        </div>
        {pages.length > 8 && (
          <p className="text-xs text-muted-foreground text-center">
            +{pages.length - 8} more pages
          </p>
        )}
      </div>
    );
  };

  const renderBlocks = () => {
    if (blocks.length === 0) return <></>;

    return (
      <div className="divide-y [&>*]:py-2 [&>*:first-child]:pt-0">
        {Object.entries(groupedBlocks).map(([pageName, pageBlocks]) => (
          <LogseqBlock
            key={pageName}
            blocks={pageBlocks}
            graph={graph}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {renderPages()}
      {pages.length > 0 && blocks.length > 0 && <Separator />}
      {renderBlocks()}

      <div className="flex justify-center border-t pt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenLogseq}
          className="gap-2 text-xs"
        >
          <IconExternalLink className="h-3 w-3" />
          Open in Logseq
        </Button>
      </div>
    </div>
  );
};

export default LogseqCopilot;
