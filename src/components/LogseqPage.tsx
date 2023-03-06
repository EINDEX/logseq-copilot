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
  isPopUp = false,
}: LogseqPageLinkProps) => {
  const click = (e: any) => {
    if (isPopUp) setTimeout(window.close, 10);
  };

  if (page === undefined || page?.name === undefined) {
    return <></>;
  }
  return (
    <>
      <a
        className={styles.logseqPageLink}
        href={`logseq://graph/${graph}?page=${page?.name}`}
        onClick={click}
      >
        <span className="tie tie-page"></span>
        {page?.name}
      </a>
    </>
  );
};

export default LogseqPageLink;
