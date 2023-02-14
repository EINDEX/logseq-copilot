import React from 'react';
import { LogseqBlockType, LogseqSearchResult } from '../../types/logseq-block';
import { LogseqBlock } from './LogseqBlock';

type LogseqCopliotProps = {
  connect: chrome.runtime.Port;
  hasAside: boolean;
};

export const LogseqCopliot = ({ connect, hasAside }: LogseqCopliotProps) => {
  const [loading, setLoading] = React.useState(true);
  const [logseqSearchResult, setLogseqSearchResult] =
    React.useState<LogseqSearchResult>();

  connect.onMessage.addListener((resp: LogseqSearchResult) => {
    console.log(resp);
    setLogseqSearchResult(resp);
    setLoading(false);
  });

  return (
    <div id={!hasAside ? 'rhs' : ''} className="copilot">
      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <>
          {logseqSearchResult && logseqSearchResult!.pages.length > 0 ? (
            <>
              <h1>Pages</h1>
              <div className="pages">
                <ul>
                  {logseqSearchResult?.pages.map((page) => {
                    return (
                      <li key={page.uuid}>
                        <a className='logseq-page-link' href={page.name}>{page.name}</a>
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
              <h1>Blocks</h1>
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
              <h1>Page Content</h1>
              <div className="blocks">
                {logseqSearchResult?.pageContents.map((pageContent) => {
                  return (
                    <LogseqBlock
                      key={pageContent.uuid}
                      block={pageContent}
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
      <span className="power-by">power by Logseq Copliot</span>
    </div>
  );
};
