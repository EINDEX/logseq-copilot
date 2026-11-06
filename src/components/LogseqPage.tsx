import React from 'react';
import { LogseqPageIdenity } from '@/types/logseqBlock';
import { IconFile } from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { pageUrl } from '@/utils/logseq-url';
import './logseq-results.css';

type LogseqPageLinkProps = {
  page: LogseqPageIdenity;
  graph: string;
  isPopUp?: boolean;
  className?: string;
};

/** A page title row that opens the page in Logseq (styles: logseq-results.css). */
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
      href={pageUrl(graph, page.name)}
      className={cn('lc-page-title', className)}
    >
      <IconFile aria-hidden />
      <span className="lc-page-name">
        {page?.originalName || page?.name}
      </span>
    </a>
  );
};

export default LogseqPageLink;
