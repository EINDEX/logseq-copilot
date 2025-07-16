import React from 'react';
import { LogseqPageContentType } from '@/types/logseqBlock';
import LogseqPageLink from './LogseqPage';
import { Card, CardContent, CardHeader } from './ui/card';
import { cn } from '@/lib/utils';

type LogseqPageContentProps = {
  graph: string;
  pageContent: LogseqPageContentType;
  isPopUp?: boolean;
};

export const LogseqPageContent = ({
  graph,
  pageContent,
  isPopUp = false,
}: LogseqPageContentProps) => {
  if (!pageContent.content) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <LogseqPageLink
          graph={graph}
          page={pageContent.page}
        />
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "prose prose-sm max-w-none dark:prose-invert",
            "prose-p:my-0 prose-pre:my-1 prose-img:my-1",
            "prose-a:no-underline hover:prose-a:underline",
            "prose-img:max-w-full prose-img:max-h-96",
            "prose-pre:overflow-x-auto prose-pre:whitespace-pre-wrap",
            "[&_*]:break-words [&_*]:text-sm"
          )}
          dangerouslySetInnerHTML={{ __html: pageContent.content }}
        />
      </CardContent>
    </Card>
  );
};
