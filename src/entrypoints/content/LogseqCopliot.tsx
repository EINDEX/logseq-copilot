import React from 'react';
import { LogseqSearchResult } from '@/types/logseqBlock';
import { LogseqResponseType } from '@/entrypoints/background/logseq/client';
import styles from './index.module.scss';
import LogseqCopilot from '@/components/LogseqCopilot';
import { browser, type Browser } from 'wxt/browser';

type LogseqCopliotProps = {
  connect: Browser.runtime.Port;
};

export const LogseqCopliot = ({ connect }: LogseqCopliotProps) => {
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
    browser.runtime.sendMessage({ type: 'open-options' });
  };

  const statusShower = () => {
    if (msg === 'success') {
      return (
        <LogseqCopilot
          graph={logseqSearchResult?.graph || ''}
          blocks={logseqSearchResult?.blocks || []}
          pages={logseqSearchResult?.pages || []}
        />
      );
    } else if (msg !== 'Loading') {
      return (
        <button className={styles.configIt} onClick={goOptionPage}>
          Config it
        </button>
      );
    }
    return <></>;
  };

  return (
    <div className={styles.copilot}>
      <div className={styles.copilotBody}>{statusShower()}</div>

      <div className={styles.copilotFooter}>
        <span>
          <a href="https://github.com/EINDEX/logseq-copilot/issues">Feedback</a>
        </span>
        <span>
          power by{' '}
          <a href="https://logseq-copilot.eindex.me/">Logseq Copliot</a>
        </span>
      </div>
    </div>
  );
};
