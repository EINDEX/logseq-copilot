import React from 'react';
import { LogseqSearchResult } from '../../types/logseq-block';
import { LogseqBlock } from './LogseqBlock';
import { LogseqPageContent } from './LogseqPageContent';

type LogseqCopliotProps = {
  connect: chrome.runtime.Port;
  hasAside: boolean;
};

export const LogseqCopliot = ({ connect, hasAside }: LogseqCopliotProps) => {
  const [loading, setLoading] = React.useState(true);
  const [logseqSearchResult, setLogseqSearchResult] =
    React.useState<LogseqSearchResult>();

  connect.onMessage.addListener((resp: LogseqSearchResult) => {
    setLogseqSearchResult(resp);
    setLoading(false);
  });

  return (
    <div id={!hasAside ? 'rhs' : ''} className="copilot">
      <div className='content'>
      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <>
          {logseqSearchResult && logseqSearchResult!.pages.length > 0 ? (
            <>
              {/* <h1>Pages</h1> */}
              <div className="pages">
                <ul>
                  {logseqSearchResult?.pages.map((page) => {
                    return (
                      <li key={page.uuid}>
                        <a className='logseq-page-link' href={`logseq://graph/${logseqSearchResult.graph}?page=${page.name}`}>{page.name}</a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          ) : (
            <></>
          )}
          {logseqSearchResult && logseqSearchResult!.blocks.length > 0 ? (
            <>
              {/* <h1>Blocks</h1> */}
              <div className="blocks">
                {logseqSearchResult?.blocks.map((block) => {
                  return (
                    <LogseqBlock
                      key={block.uuid}
                      block={block}
                      graph={logseqSearchResult.graph}
                    />
                  );
                })}
              </div>
            </>
          ) : (
            <></>
          )}
            {logseqSearchResult && logseqSearchResult!.pageContents.length > 0 ? (
            <>
              {/* <h1>Page Content</h1> */}
              <div className="blocks">
                {logseqSearchResult?.pageContents.map((pageContent) => {
                  return (
                    <LogseqPageContent
                      key={pageContent.uuid}
                      pageContent={pageContent}
                      graph={logseqSearchResult.graph}
                    />
                  );
                })}
              </div>
            </>
          ) : (
            <></>
          )}
        </>
      )}
      </div>
      <span className="power-by">power by Logseq Copliot</span>
    </div>
  );
};
