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
        className="page-tag"
        href={`logseq://graph/${graph}?block-id=${block['block/uuid']}`}
      >
        To Block
      </a>
    </div>
  );
};
