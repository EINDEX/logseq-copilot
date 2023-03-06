import React from 'react';
import { LogseqSearchResult } from '@/types/logseqBlock';
import { LogseqResponseType } from '../logseq/client';
import { LogseqBlock } from '@components/LogseqBlock';
import { LogseqPageContent } from '@components/LogseqPageContent';
import LogseqPageLink from '@components/LogseqPage';
import Browser from 'webextension-polyfill';
import styles from './index.module.scss';

type LogseqCopliotProps = {
  connect: Browser.Runtime.Port;
};

export const LogseqCopliot = ({ connect }: LogseqCopliotProps) => {
  const [msg, setMsg] = React.useState('Loading...');
  const [logseqSearchResult, setLogseqSearchResult] =
    React.useState<LogseqSearchResult>();
  const [count, setCount] = React.useState(0);

  connect.onMessage.addListener(
    (resp: LogseqResponseType<LogseqSearchResult>) => {
      setMsg(resp.msg);
      setLogseqSearchResult(resp.response);
      setCount(resp.count!);
    },
  );

  const goOptionPage = () => {
    connect.postMessage({ type: 'open-options' });
  };

  const statusShower = () => {
    return (
      <>
        <span>{msg}</span>
        {msg !== 'Loading...' ? (
          <button className={styles.configIt} onClick={goOptionPage}>
            Config it
          </button>
        ) : (
          <></>
        )}
      </>
    );
  };

  const blocks = () => {
    return (
      <>
        {logseqSearchResult?.blocks.map((block) => {
          return (
            <LogseqBlock
              key={block.uuid}
              block={block}
              graph={logseqSearchResult.graph}
            />
          );
        })}
      </>
    );
  };

  // const pageContents = () => {
  //   return (
  //     <>
  //       {logseqSearchResult?.pageContents.map((pageContent) => {
  //         return (
  //           <LogseqPageContent
  //             key={pageContent.uuid}
  //             pageContent={pageContent}
  //             graph={logseqSearchResult.graph}
  //           />
  //         );
  //       })}
  //     </>
  //   );
  // };

  const pages = () => {
    return (
      <>
        {logseqSearchResult!.pages.length > 0 ? (
          <div className="pages">
            <ul>
              {logseqSearchResult?.pages.map((page) => {
                if (!page) return <></>;
                return (
                  <p>
                    <LogseqPageLink
                      key={page.uuid}
                      graph={logseqSearchResult.graph}
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

  const noContent = () => {
    if (count === 0) {
      return (
        <>
          <span>
            Nothing here, Do some research with Logseq!{' '}
            <a href={`logseq://graph/${logseqSearchResult!.graph}`}>Go</a>
          </span>
        </>
      );
    }
    return <></>;
  };

  return (
    <div className={styles.copilot}>
      <div
        className={
          msg !== 'success'
            ? styles.content
            : `${styles.divide} ${styles.content}`
        }
      >
        {msg !== 'success' ? (
          <>{statusShower()}</>
        ) : (
          <>
            <span>Graph: {logseqSearchResult?.graph}</span>
            {noContent()}
            {pages()}
            {blocks()}
            {/* {pageContents()} */}
          </>
        )}
      </div>

      <div className={styles.copilotFooter}>
        <span>
          <a href="https://github.com/EINDEX/logseq-copilot/issues/new">
            Feedback
          </a>
        </span>
        <span>
          power by{' '}
          <a href="https://github.com/eindex/logseq-copilot">Logseq Copliot</a>
        </span>
      </div>
    </div>
  );
};
