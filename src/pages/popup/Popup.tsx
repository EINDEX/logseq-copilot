import Browser from 'webextension-polyfill';
import { useEffect, useState } from 'react';
import React from 'react';
import { LogseqSearchResult } from '@/types/logseqBlock';
import { IconSettings } from '@tabler/icons-react';

import { LogseqBlock } from '@components/LogseqBlock';

import styles from './index.module.scss';
import { getLogseqService } from '@pages/logseq/tool';

export default function Popup() {
  const [isLoading, setIsLoading] = useState(false);
  const [logseqSearchResult, setLogseqSearchResult] =
    React.useState<LogseqSearchResult>();

  const mountOpenPageMethod = () => {
    const innerFunction = () => {
      if (isLoading) return;
      document.querySelectorAll('a').forEach((e) => {
        if (e.onclick === null) {
          e.onclick = () => {
            Browser.runtime
              .sendMessage({
                type: 'open-page',
                url: e.href,
              })
              .then(() => window.close());
          };
        }
        if (!isLoading) {
          clearInterval(interval);

        }
      });
    };
    const interval = setInterval(innerFunction, 50);
  };

  useEffect(() => {
    if (isLoading) return;

    new Promise(async () => {
      let queryOptions = { active: true, lastFocusedWindow: true };
      let [tab] = await Browser.tabs.query(queryOptions);
      setIsLoading(true);
      if (!tab || !tab.url) return;

      const tabURL = new URL(tab.url);
      const service = await getLogseqService();
      const result = await service.urlSearch(tabURL, { fuzzy: true });

      if (result.status !== 200) return;

      setLogseqSearchResult(result.response!);
      mountOpenPageMethod();
    });
  }, []);

  const openSettingsPage = () => {
    Browser.runtime.sendMessage({ type: 'open-options' });
  };

  return (
    <div className="copilot">
      <div className={styles.content}>
        <div className={styles.copilotCardHeader}>
          <span>Graph: {logseqSearchResult?.graph}</span>
          <IconSettings size={16} onClick={openSettingsPage} />
        </div>
        {logseqSearchResult?.blocks.slice(0, 20).map((block) => (
          <LogseqBlock
            key={block.uuid}
            graph={logseqSearchResult?.graph}
            blocks={[block]}
            isPopUp={true}
          />
        ))}
      </div>
    </div>
  );
}
