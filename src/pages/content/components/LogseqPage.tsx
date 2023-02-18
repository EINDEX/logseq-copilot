import { LogseqPageIdenity } from '../../../types/logseq-block';

type LogseqPageLinkProps = {
  page: LogseqPageIdenity;
  graph: string;
};

const LogseqPageLink = ({ page, graph }: LogseqPageLinkProps) => {
  if (page === undefined || page?.name === undefined) {
    return <></>;
  }
  return (
    <>
      <a
        className="logseq-page-link"
        href={`logseq://graph/${graph}?page=${page?.name}`}
      >
        {page?.name}
      </a>
    </>
  );
};

export default LogseqPageLink;
