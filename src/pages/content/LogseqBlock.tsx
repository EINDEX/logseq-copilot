import { LogseqBlockType } from '../../types/logseq-block';

type LogseqBlockProps = {
  graph: string;
  block: LogseqBlockType;
};

export const LogseqBlock = ({ graph, block }: LogseqBlockProps) => {
  if (block.html) {
    return (
      <div className="block">
        <div dangerouslySetInnerHTML={{ __html: block.html }}></div>
        <span className="block-footer">
          <a
            className="page-tag"
            href={`logseq://graph/${graph}?block-id=${block.uuid}`}
          >
            To block
          </a>
          <a
            className="page-tag logseq-page-link"
            href={`logseq://graph/${graph}?page=${block.page?.name}`}
          >
            {block.page?.name}
          </a>
        </span>
      </div>
    );
  }
  return <></>;
  
};
