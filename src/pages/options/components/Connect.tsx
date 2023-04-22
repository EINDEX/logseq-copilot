import {
  Heading,
  Grid,
  Text,
  Input,
  InputGroup,
  InputRightElement,
  Button,
  Link,
  NumberInput,
  NumberInputField,
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
      [e.target.name]: e.target.value,
    });
  };

  const triggerShowToken = () => setShowToken(!showToken);

  const save = () => {
    try {
      // new URL(logseqConfig!.logseqHost);
    } catch (error) {
      setConnected(false);
      setButtonMessage('Logseq Host is not a URL!');
      return;
    }

    const promise = new Promise(async () => {
      await saveLogseqCopliotConfig({
        logseqAuthToken: logseqConfig!.logseqAuthToken,
        logseqHostName: logseqConfig?.logseqHostName,
        logseqPort: logseqConfig?.logseqPort,
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
        gridTemplateColumns={'1fr 1fr 1fr'}
        alignItems={'center'}
        rowGap={2}
        columnGap={2}
      >
        <Text gridColumn={'1 / span 2'} fontSize="sm">
          Host
        </Text>
        <Text fontSize="sm">Port (0 ~ 65536)</Text>
        <Input
          gridColumn={'1 / span 2'}
          name="logseqHostName"
          placeholder="Logseq Host"
          onChange={onChange}
          value={logseqConfig?.logseqHostName}
        />
        <NumberInput
          max={65535}
          min={0}
          name="logseqPort"
          placeholder="Logseq Host"
          onChange={onChange}
          value={logseqConfig?.logseqPort}
        >
          <NumberInputField />
        </NumberInput>
        <Text fontSize="sm">Authorization Token</Text>
        <InputGroup gridColumn={'1 / span 3'}>
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
