import { LogseqPageContentType } from '@/types/logseqBlock';
import LogseqPageLink from './LogseqPage';

import styles from './logseq.module.scss';

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
  if (pageContent.content) {
    return (
      <div className={styles.pageContent}>
        <div className={styles.pageContentFooter}>
          <LogseqPageLink
            graph={graph}
            page={pageContent.page}
          ></LogseqPageLink>
        </div>
        <div dangerouslySetInnerHTML={{ __html: pageContent.content }}></div>
      </div>
    );
  }
  return <></>;
};
