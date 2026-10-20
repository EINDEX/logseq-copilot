import React from 'react';
import { LogseqPageIdenity } from '@/types/logseqBlock';
import { IconFile } from '@tabler/icons-react';
import { cn } from '@/lib/utils';

type LogseqPageLinkProps = {
  page: LogseqPageIdenity;
  graph: string;
  isPopUp?: boolean;
  className?: string;
};

const LogseqPageLink = ({
  page,
  graph,
  className,
}: LogseqPageLinkProps) => {
  if (page === undefined || page?.name === undefined) {
    return null;
  }

  return (
    <a
      href={`logseq://graph/${graph}?page=${page?.name}`}
      className={cn(
        "flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors no-underline hover:underline",
        className
      )}
    >
      <IconFile className="h-3 w-3 text-muted-foreground" />
      <span className="truncate">
        {page?.originalName || page?.name}
      </span>
    </a>
  );
};

export default LogseqPageLink;
