import React from 'react';
import { LogseqBlockType } from '../../types/logseq-block';
import { LogseqBlock } from './LogseqBlock';
import { LogseqSearchResponse } from '../background/client/logseq';

type LogseqCopliotProps = {
  connect: chrome.runtime.Port;
  hasAside: boolean;
};

export const LogseqCopliot = ({ connect, hasAside }: LogseqCopliotProps) => {
  const [blocks, setBlocks] = React.useState<LogseqBlockType[]>([]);
  const [graphName, setGraphName] = React.useState('');

  connect.onMessage.addListener((resp: LogseqSearchResponse) => {
    console.log(resp);
    setBlocks(resp.blocks);
    setGraphName(resp.graph);
  });

  return (
    <div id={!hasAside ? 'rhs' : ''} className="copilot">
      <div className="blocks">
        {blocks.map((block) => {
          return (
            <>
              <LogseqBlock key={block['block/uuid']} block={block} graph={graphName} />
            </>
          );
        })}
      </div>
      <span className="power-by">power by Logseq Copliot</span>
    </div>
  );
};
