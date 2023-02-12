import { LogseqBlockType } from '../../types/logseq-block';

type LogseqBlockProps = {
  graph: string;
  block: LogseqBlockType;
};

export const LogseqBlock = ({ graph, block }: LogseqBlockProps) => {
  return (
    <div className="block">
      <div dangerouslySetInnerHTML={{ __html: block.html }}></div>
      <a
        className="page-tag logseq-page-link"
        href={`logseq://graph/${graph}?page=${block.page.name}`}
      >
        {block.page.name}
      </a>
    </div>
  );
};
