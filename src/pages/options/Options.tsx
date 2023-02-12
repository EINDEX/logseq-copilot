import React, { useEffect } from 'react';
import { getLogseqCopliotConfig, saveLogseqCopliotConfig } from '../../config';
import './Options.scss';
import { Input, Button, Alert } from '@chakra-ui/react';
import LogseqClient from '../background/client/logseq'

const client = new LogseqClient()

const Options: React.FC = () => {
  const [init, setInit] = React.useState(false);
  const [logseqConfig, setLogseqConfig] = React.useState({});
  const [connected, setConnected] = React.useState(false);

  useEffect (
    ()=> {
      if(!init){
        getLogseqCopliotConfig().then((config) => {
          console.log('inti')
          setLogseqConfig(config)
          setInit(true);
          const promise = new Promise(async () => {
            const resp = await client.showMsg('Logseq Copliot Connect!')
            if (resp.status == 200) {
              setConnected(true)
            }
          })
          promise.then(console.log)
        });
      }
    }
  )


  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogseqConfig({
      ...logseqConfig,
      [e.target.name]: e.target.value
    })
  };

  const save = () =>{
    console.log(logseqConfig)
    const promise = new Promise(async () => {
      await saveLogseqCopliotConfig(logseqConfig)
      const resp = await client.showMsg('Logseq Copliot Connect!')
      setConnected(resp.status == 200)
    })
    promise.then(console.log)
  }

  return (
    <div className="options">
      <h1>Logseq Copilot</h1>
      <Input
        name="logseqHost"
        placeholder="Logseq Host"
        onChange={onChange}
        value={logseqConfig?.logseqHost}
      />
      <Input
        name="logseqAuthToken"
        onChange={onChange}
        value={logseqConfig?.logseqAuthToken}
        placeholder="Logseq Authorization Token"
      />
      <Button onClick={save}>Save</Button>
      <Alert display={!connected?'none':'flex'} status="success">Connected</Alert>
    </div>
  );
};

export default Options;
