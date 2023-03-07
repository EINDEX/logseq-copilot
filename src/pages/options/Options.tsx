import React, { useEffect } from 'react';
import {
  getLogseqCopliotConfig,
  saveLogseqCopliotConfig,
  LogseqCopliotConfig,
} from '../../config';
import './Options.scss';
import {
  Input,
  Button,
  Flex,
  Container,
  Heading,
  Text,
  Link,
  InputGroup,
  InputRightElement,
  FormControl,
  FormLabel,
  Switch,
  Divider,
} from '@chakra-ui/react';
import LogseqClient from '../logseq/client';

const client = new LogseqClient();

const Options: React.FC = () => {
  const [init, setInit] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [logseqConfig, setLogseqConfig] = React.useState<LogseqCopliotConfig>({
    logseqAuthToken: '',
    logseqHost: '',
    enableQuickCapture: false,
  });
  const [connected, setConnected] = React.useState(false);
  const [buttonMessage, setButtonMessage] = React.useState('Connect');
  const [showToken, setShowToken] = React.useState(false);

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

  const triggerShowToken = () => setShowToken(!showToken);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogseqConfig({
      ...logseqConfig,
      [e.target.name]: e.target.value || e.target.checked,
    });
  };

  const checkConnection = async () => {
    setLoading(true);
    const resp = await client.showMsg('Logseq Copliot Connect!');
    console.log(resp);
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
  };

  const save = () => {
    const promise = new Promise(async () => {
      await saveLogseqCopliotConfig(logseqConfig!);
      await checkConnection();
    });
    promise.then(console.log).catch(console.error);
  };

  return (
    <div className="options">
      <Container maxW={'56rem'} mt={'1rem'}>
        <Flex direction={'row'}>
          <Flex direction={'column'} w={'16rem'}>
            <Heading>Logseq Copilot</Heading>
            <Text>
              <Link
                href={`https://github.com/EINDEX/logseq-copilot/releases/tag/v${process.env.VERSION}`}
              >
                v{process.env.VERSION}
              </Link>
            </Text>
          </Flex>
          <Flex direction={'column'} w={'40rem'} gap={2}>
            <Heading size={'lg'}>Basic Config</Heading>
            <Flex direction={'row'}>
              <Text fontSize="md" w={'40%'}>
                Logseq Host
              </Text>
              <Input
                name="logseqHost"
                placeholder="Logseq Host"
                onChange={onChange}
                value={logseqConfig?.logseqHost}
              />
            </Flex>
            <Flex direction={'row'}>
              <Text fontSize="md" w={'40%'}>
                Logseq Authorization Token
              </Text>
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
            </Flex>
            <Button
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
            <Divider />
            <Heading size={'lg'}>Features</Heading>
            <FormControl display="flex" alignItems={'center'}>
              <FormLabel htmlFor="quick-capture" mb="0">
                QuickCapture(Beta)
              </FormLabel>
              <Switch
                name="enableQuickCapture"
                isChecked={logseqConfig?.enableQuickCapture}
                onChange={onChange}
              />
            </FormControl>
            <Button onClick={save} variant="outline">
              Save
            </Button>
          </Flex>
        </Flex>
      </Container>
    </div>
  );
};

export default Options;
