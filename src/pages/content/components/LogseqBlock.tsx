import { LogseqBlockType } from '../../../types/logseq-block';
import LogseqPageLink from './LogseqPage';

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
          <LogseqPageLink graph={graph} page={block.page}></LogseqPageLink>
        </span>
      </div>
    );
  }
  return <></>;
};
