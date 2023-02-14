import { LogseqPageContentType } from '../../types/logseq-block';

type LogseqPageContentProps = {
  graph: string;
  pageContent: LogseqPageContentType;
};

export const LogseqPageContent = ({ graph, pageContent }: LogseqPageContentProps) => {
  if (pageContent.content) {
    return (
      <div className="block">
        
        <div>{pageContent.content}</div>
        <a
            className="logseq-page-link"
            href={`logseq://graph/${graph}?page=${pageContent.page?.name}`}
          >
            {pageContent.page?.name}
          </a>
      </div>
    );
  }
  return <></>;
  
};
