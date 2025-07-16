import React from 'react';
import { IconExternalLink } from '@tabler/icons-react';
import { browser } from 'wxt/browser';
import { LogseqBlock } from './LogseqBlock';
import LogseqPageLink from './LogseqPage';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
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
    if (pages.length === 0) return null;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Pages</span>
          <Badge variant="outline" className="text-xs">
            {pages.length}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {pages.slice(0, 8).map((page) => {
            if (!page) return null;
            return (
              <Card key={page.name} className="p-2 hover:bg-accent/50 transition-colors">
                <LogseqPageLink graph={graph} page={page} />
              </Card>
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
    if (blocks.length === 0) return null;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Blocks</span>
          <Badge variant="outline" className="text-xs">
            {blocks.length}
          </Badge>
        </div>
        <div className="space-y-2">
          {Object.entries(groupedBlocks).map(([pageName, pageBlocks]) => (
            <LogseqBlock
              key={pageName}
              blocks={pageBlocks}
              graph={graph}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {renderPages()}
      {pages.length > 0 && blocks.length > 0 && <Separator />}
      {renderBlocks()}

      <div className="flex justify-center pt-2">
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
