import { LogseqPageIdenity } from '@/types/logseqBlock';

import styles from './logseq.module.scss';

type LogseqPageLinkProps = {
  page: LogseqPageIdenity;
  graph: string;
  isPopUp?: boolean;
};

const LogseqPageLink = ({
  page,
  graph,
}: LogseqPageLinkProps) => {

  if (page === undefined || page?.name === undefined) {
    return <></>;
  }

  return (
    <>
      <a
        className={styles.logseqPageLink}
        href={`logseq://graph/${graph}?page=${page?.name}`}
      >
        <span className="tie tie-page"></span>
        {page?.originalName?.replaceAll("/", "/ ")}
      </a>
    </>
  );
};

export default LogseqPageLink;
