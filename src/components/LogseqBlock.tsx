import { LogseqBlockType } from '@/types/logseqBlock';
import LogseqPageLink from './LogseqPage';
import Browser from 'webextension-polyfill';
import styles from './logseq.module.scss';
import React, { useEffect } from 'react';

type LogseqBlockProps = {
  graph: string;
  blocks: LogseqBlockType[];
  isPopUp?: boolean;
};

export const LogseqBlock = ({ graph, blocks }: LogseqBlockProps) => {

  if (blocks.length === 0) {
    return <></>;
  }

  const [checked, setChecked] = React.useState(false);
  const [status, setStatus] = React.useState('');

  const block = blocks[0]; // TODO: randomyl picking first item - need to change later

  const statusUpdate = (marker: string) => {
    switch (marker) {
      case 'TODO':
      case 'LATER':
      case 'DOING':
      case 'NOW':
        setChecked(false);
        setStatus(marker);
        break;
      case 'DONE':
        setChecked(true);
        setStatus(marker);
        break;
      case 'CANCELED':
        setChecked(true);
        setStatus(marker);
    }
  }

  const processEvent = (message: { type: string, uuid: string, status: string, marker: string, msg?: string }) => {
    if (message.type === 'change-block-marker-result' && message.uuid === block.uuid && message.status === "success") {
      statusUpdate(message.marker);
    }

  }

  useEffect(() => {
    Browser.runtime.onMessage.addListener(processEvent)
    statusUpdate(block.marker)
  }, []);

  const updateBlock = (marker: string) => {
    Browser.runtime.sendMessage({ type: 'change-block-marker', marker: marker, uuid: block.uuid })
  };

  const markerStatusChange = (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    let marker = '';
    if (status === 'TODO') {
      marker = 'DOING'
    } else if (status === 'DOING') {
      marker = 'TODO'
    } else if (status === 'NOW') {
      marker = 'LATER'
    } else if (status === 'LATER') {
      marker = 'NOW'
    }
    updateBlock(marker)
  };

  const markerCheck = (e: React.ChangeEvent<HTMLInputElement>) => {
    let marker = 'TODO';
    if (checked) {
      marker = 'TODO'
    } else {
      marker = 'DONE';
    }
    updateBlock(marker)
  };

  const markerRender = (marker: string) => {
    if (!marker) {
      return <></>;
    }
    return (
      <div className={styles.blockMarker}>
        <input className={styles.blockMarkerCheckbox} type="checkbox" checked={checked} onChange={markerCheck} />
        <button className={styles.blockMarkerStatus} onClick={markerStatusChange}>{status}</button>
      </div>
    );
  };

  const toBlock = (block) => {
    if (!block.uuid) {
      return <></>
    }
    return <a
      className={styles.toBlock}
      href={`logseq://graph/${graph}?block-id=${block.uuid}`}
    >
      <span className={'tie tie-block'}></span>
      To Block
    </a>
  }

  if (block.html) {
    return (
      <div className={styles.block}>
        <div className={styles.blockHeader}>
          <LogseqPageLink graph={graph} page={block.page}></LogseqPageLink>
        </div>
        <div className={styles.blockBody}>
          <ul className={styles.blockContentList}>
            {blocks.map((block) => {
              if (block.marker != null) {
                return (
                  <li key={block.uuid} className={styles.blockContentListItem}>
                    <div className={styles.blockContentRoot} >
                      {markerRender(block.marker)}
                      <div className={styles.blockContent} dangerouslySetInnerHTML={{ __html: block.html }} />
                      {toBlock(block)}
                    </div>
                  </li>
                )
              }
              return (
                <li className={styles.blockContentListItem}>
                  <div className={styles.blockContentRoot} >
                    <div className={styles.blockContent} dangerouslySetInnerHTML={{ __html: block.html }} />
                    {toBlock(block)}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    );
  }
  return <></>;
};
