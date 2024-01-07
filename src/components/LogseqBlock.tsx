import { LogseqBlockType } from '@/types/logseqBlock';
import LogseqPageLink from './LogseqPage';

import styles from './logseq.module.scss';

type LogseqBlockProps = {
  graph: string;
  block: LogseqBlockType;
  isPopUp?: boolean;
};

export const LogseqBlock = ({
  graph,
  block,
}: LogseqBlockProps) => {
  if (block.html) {
    return (
      <div className={`${styles.block}`}>
        <div
          className={styles.blockContent}
          dangerouslySetInnerHTML={{ __html: block.html }}
        ></div>
        <span className={styles.blockFooter}>
          {block.uuid && <a
            className={styles.toBlock}
            href={`logseq://graph/${graph}?block-id=${block.uuid}`}
          >
            <span className={'tie tie-block'}></span>
            To block
          </a>}
          <LogseqPageLink
            graph={graph}
            page={block.page}
          ></LogseqPageLink>
        </span>
      </div>
    );
  }
  return <></>;
};
