import React from 'react';
import { LogseqSearchResult } from '../../../types/logseq-block';
import { LogseqResponseType } from '../../logseq/client';
import { ListRender } from './List';
import { LogseqBlock } from './LogseqBlock';
import { LogseqPageContent } from './LogseqPageContent';

type LogseqCopliotProps = {
  connect: chrome.runtime.Port;
  hasAside: boolean;
};

export const LogseqCopliot = ({ connect, hasAside }: LogseqCopliotProps) => {
  const [msg, setMsg] = React.useState('Loading...');
  const [logseqSearchResult, setLogseqSearchResult] =
    React.useState<LogseqSearchResult>();

  connect.onMessage.addListener(
    (resp: LogseqResponseType<LogseqSearchResult>) => {
      setMsg(resp.msg);
      setLogseqSearchResult(resp.response);
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
          <button className="config-it" onClick={goOptionPage}>
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

  const pageContents = () => {
    return (
      <>
        {logseqSearchResult?.pageContents.map((pageContent) => {
          return (
            <LogseqPageContent
              key={pageContent.uuid}
              pageContent={pageContent}
              graph={logseqSearchResult.graph}
            />
          );
        })}
      </>
    );
  };

  const pages = () => {
    return (
      <>
        {logseqSearchResult!.pages.length > 0 ? (
          <div className="pages">
            <ul>
              {logseqSearchResult?.pages.map((page) => {
                return (
                  <li key={page.uuid}>
                    <a
                      className="logseq-page-link"
                      href={`logseq://graph/${logseqSearchResult.graph}?page=${page.name}`}
                    >
                      {page.name}
                    </a>
                  </li>
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
    if (
      logseqSearchResult!.blocks.length === 0 &&
      logseqSearchResult!.pages.length === 0 &&
      logseqSearchResult?.pageContents.length === 0
    ) {
      return (
        <>
          <span>Nothing here, Do some research with Logseq!</span>
        </>
      );
    }
    return <></>;
  };

  return (
    <div id={!hasAside ? 'rhs' : ''} className="copilot">
      <div className={msg !== 'success' ? 'content' : 'content divide'}>
        {msg !== 'success' ? (
          <>{statusShower()}</>
        ) : (
          <>
            {noContent()}
            {pages()}
            {blocks()}
            {pageContents()}
          </>
        )}
      </div>

      <div className="footer">
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
