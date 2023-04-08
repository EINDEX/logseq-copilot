import {
  Heading,
  Grid,
  Text,
  Input,
  InputGroup,
  InputRightElement,
  Button,
  Link,
} from '@chakra-ui/react';
import React, { useEffect } from 'react';

import {
  getLogseqCopliotConfig,
  saveLogseqCopliotConfig,
  LogseqCopliotConfig,
} from '@/config';
import LogseqClient from '@pages/logseq/client';

const client = new LogseqClient();

export const LogseqConnectOptions = () => {
  const [init, setInit] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [connected, setConnected] = React.useState(false);
  const [buttonMessage, setButtonMessage] = React.useState('Connect');
  const [showToken, setShowToken] = React.useState(false);
  const [logseqConfig, setLogseqConfig] = React.useState<LogseqCopliotConfig>();

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogseqConfig({
      ...logseqConfig,
      [e.target.name]: e.target.value || e.target.checked,
    });
  };

  const triggerShowToken = () => setShowToken(!showToken);

  const save = () => {
    const promise = new Promise(async () => {
      await saveLogseqCopliotConfig({
        logseqAuthToken: logseqConfig?.logseqAuthToken,
        logseqHost: logseqConfig?.logseqHost,
      });
      if (await checkConnection()) {
        const graph = await client.getGraph();
        window.location = `logseq://graph/${graph!.name}`;
      }
    });
    promise.then(console.log).catch(console.error);
  };

  useEffect(() => {
    if (!init) {
      getLogseqCopliotConfig().then((config) => {
        console.log('inti');
        setLogseqConfig(config);
        setInit(true);
        if (config.logseqAuthToken === '') {
          setLoading(false);
          return;
        }
        const promise = new Promise(async () => {
          await checkConnection();
        });
        promise.then(console.log).catch(console.error);
      });
    }
  });

  const checkConnection = async (): Promise<boolean> => {
    setLoading(true);
    const resp = await client.showMsg('Logseq Copliot Connect!');
    const connectStatus = resp.msg === 'success';
    setConnected(connectStatus);
    if (connectStatus) {
      const version = await (await client.getVersion()).response;
      setButtonMessage(`Connected to Logseq v${version}!`);
    } else {
      setConnected(false);
      setButtonMessage(resp.msg);
    }
    setLoading(false);
    return connectStatus;
  };

  return (
    <>
      <Heading size={'lg'}>Logseq Connect</Heading>
      <Grid
        gridTemplateColumns={'160px auto'}
        alignItems={'center'}
        rowGap={2}
        columnGap={2}
      >
        <Text fontSize="md">Logseq Host</Text>
        <Input
          name="logseqHost"
          placeholder="Logseq Host"
          onChange={onChange}
          value={logseqConfig?.logseqHost}
        />
        <Text fontSize="md">Authorization Token</Text>
        <InputGroup>
          <Input
            name="logseqAuthToken"
            type={showToken ? 'text' : 'password'}
            onChange={onChange}
            value={logseqConfig?.logseqAuthToken}
            placeholder="Logseq Authorization Token"
          />
          <InputRightElement width="4.5rem">
            <Button h="1.75rem" size="sm" onClick={triggerShowToken}>
              {showToken ? 'Hide' : 'Show'}
            </Button>
          </InputRightElement>
        </InputGroup>
      </Grid>
      <Button
        // todo bring up logseq when connection is success, to let user agree for bring up.
        onClick={save}
        variant="outline"
        colorScheme={!connected ? 'red' : 'green'}
        isLoading={loading}
      >
        {buttonMessage}
      </Button>
      <Text>
        <Link
          color={!connected ? 'red' : undefined}
          href="https://github.com/eindex/logseq-copilot#usage"
        >
          Guide to Connection
        </Link>
      </Text>
    </>
  );
};
