import { removeUrlHash } from '@/utils';

import LogseqClient from '../logseq/client';
import Browser from 'webextension-polyfill';
import { useEffect, useState } from 'react';
import React from 'react';
import { LogseqSearchResult } from '@/types/logseqBlock';

import { LogseqBlock } from '@components/LogseqBlock';

import styles from './index.module.scss';

const client = new LogseqClient();

export default function Popup() {
  const [isLoading, setIsLoading] = useState(false);
  const [logseqSearchResult, setLogseqSearchResult] =
    React.useState<LogseqSearchResult>();

  useEffect(() => {
    if (isLoading) return;

    new Promise(async () => {
      console.log('loading');
      let queryOptions = { active: true, lastFocusedWindow: true };
      let [tab] = await Browser.tabs.query(queryOptions);
      setIsLoading(true);
      if (!tab.url) return;
      const url = removeUrlHash(tab.url);
      const result = await client.blockSearch(url);
      if (result.status !== 200) return;
      setLogseqSearchResult(result.response!);
    });
  });

  return (
    <div className="copilot">
      <div className={`${styles.content} + ${styles.divide}`}>
        <span>Graph: {logseqSearchResult?.graph}</span>
        {logseqSearchResult?.blocks.slice(0, 20).map((block) => (
          <LogseqBlock
            key={block.uuid}
            graph={logseqSearchResult?.graph}
            block={block}
            isPopUp={true}
          />
        ))}
      </div>
      <script>{`document.querySelectorAll(".logseq-page-link").forEach(a => a.addEventListener('click',()=> addTimeout(window.close(), )))`}</script>
    </div>
  );
}
