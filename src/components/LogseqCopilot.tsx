import { IconSettings } from '@tabler/icons-react';
import styles from './logseq.module.scss';
import Browser from 'webextension-polyfill';
import { LogseqBlock } from './LogseqBlock';
import LogseqPageLink from './LogseqPage';

const LogseqCopilot = ({ graph, pages, blocks }) => {
  const goOptionPage = () => {
    Browser.runtime.sendMessage({ type: 'open-options' });
  };

  const groupedBlocks = blocks.reduce((groups, item) => {
    const group = (groups[item.page.name] || []);
    group.push(item);
    groups[item.page.name] = group;
    return groups;
  }, {});

  console.log({groupedBlocks, blocks})

  const count = () => {
    return pages.length + blocks.length;
  };

  const blocksRender = () => {
    if (blocks.length === 0) {
      return <></>;
    }
    return (
      <div className={styles.blocks}>
        {Object.entries(groupedBlocks).map(([key, blocks], i) => {
          // return blockGroup.map((block) => {
            return <LogseqBlock key={key} blocks={blocks} graph={graph} />;
          // });
        })}
      </div>
    );
  };

  const pagesRender = () => {
    if (pages.length === 0) {
      return <></>;
    }
    return <div className={styles.pages}>
      {pages.slice(0, 9).map((page) => {
        if (!page) return <></>;
        return (
          <div className={styles.page}>
            <LogseqPageLink
              key={page.name}
              graph={graph}
              page={page}
            ></LogseqPageLink>
          </div>
        );
      })}
    </div>

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
