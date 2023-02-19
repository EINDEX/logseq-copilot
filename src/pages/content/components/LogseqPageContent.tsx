import { LogseqPageContentType } from '../../../types/logseq-block';
import LogseqPageLink from './LogseqPage';

type LogseqPageContentProps = {
  graph: string;
  pageContent: LogseqPageContentType;
};

export const LogseqPageContent = ({
  graph,
  pageContent,
}: LogseqPageContentProps) => {
  if (pageContent.content) {
    return (
      <div className="block">
        <div>{pageContent.content}</div>
        <LogseqPageLink graph={graph} page={pageContent.page}></LogseqPageLink>
      </div>
    );
  }
  return <></>;
};
