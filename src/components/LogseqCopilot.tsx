import { IconSettings } from '@tabler/icons-react';
import styles from './logseq.module.scss';
import Browser from 'webextension-polyfill';
import { LogseqBlock } from './LogseqBlock';
import LogseqPageLink from './LogseqPage';

const LogseqCopilot = ({ graph, pages, blocks }) => {
  const goOptionPage = () => {
    Browser.runtime.sendMessage({ type: 'open-options' });
  };

  const count = () => {
    return pages.length + blocks.length;
  };

  const blocksRender = () => {
    return (
      <>
        {blocks.map((block) => {
          return <LogseqBlock key={block.uuid} block={block} graph={graph} />;
        })}
      </>
    );
  };

  const pagesRender = () => {
    return (
      <>
        {pages.length > 0 ? (
          <div className="pages">
            <ul>
              {pages.map((page) => {
                if (!page) return <></>;
                return (
                  <p>
                    <LogseqPageLink
                      key={page.uuid}
                      graph={graph}
                      page={page}
                    ></LogseqPageLink>
                  </p>
                );
              })}
            </ul>
          </div>
        ) : (
          <></>
        )}
      </>
    );
  };

  if (count() === 0) {
    return (
      <span>
        Nothing here, Do some research with Logseq!{' '}
        <a href={`logseq://graph/${graph}`}>Go</a>
      </span>
    );
  }

  return (
    <>
      <div className={styles.copilotCardHeader}>
        <span>Graph: {graph}</span>
        <IconSettings onClick={goOptionPage} size={16} />
      </div>
      {pagesRender()}
      {blocksRender()}
    </>
  );
};

export default LogseqCopilot;
