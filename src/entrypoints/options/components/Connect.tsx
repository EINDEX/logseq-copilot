import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import React, { useEffect } from 'react';
import { log } from '@/utils';

import {
  getLogseqCopliotConfig,
  saveLogseqCopliotConfig,
  LogseqCopliotConfig,
} from '@/config';
import { getLogseqService } from '@/entrypoints/background/logseq/tool';

export const LogseqConnectOptions = () => {
  const [init, setInit] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [connected, setConnected] = React.useState(false);
  const [buttonMessage, setButtonMessage] = React.useState('Connect');
  const [showToken, setShowToken] = React.useState(false);
  const [logseqConfig, setLogseqConfig] = React.useState<LogseqCopliotConfig>();

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!logseqConfig) return;
    setLogseqConfig({
      ...logseqConfig,
      [e.target.name]: e.target.value,
    });
  };

  const changeLogseqPort = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!logseqConfig) return;
    let port = e.target.value;
    if (port === '' || parseInt(port) < 0) {
      port = '0'
    }
    setLogseqConfig({
      ...logseqConfig,
      logseqPort: parseInt(port),
    });
  }

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
        const service = await getLogseqService();
        const graph = await service.getGraph();
        log.info(`Logseq Graph -> ${graph}`);
        window.location.href = `logseq://graph/${graph}`;
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
    const service = await getLogseqService();
    const resp = await service.showMsg('Logseq Copliot Connect!');
    const connectStatus = resp.msg === 'success';
    setConnected(connectStatus);
    if (connectStatus) {
      const version = await service.getVersion();
      setButtonMessage(`Connected to Logseq v${version}!`);
    } else {
      setConnected(false);
      setButtonMessage(resp.msg);
    }
    setLoading(false);
    return connectStatus;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logseq Connect</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 items-center">
          <Label className="col-span-2 text-sm">Host</Label>
          <Label className="text-sm">Port (1 ~ 65535)</Label>

          <Input
            className="col-span-2"
            name="logseqHostName"
            placeholder="Logseq Host"
            onChange={onChange}
            value={logseqConfig?.logseqHostName || ''}
          />
          <Input
            type="number"
            min={1}
            max={65535}
            name="logseqPort"
            placeholder="Port"
            onChange={changeLogseqPort}
            value={logseqConfig?.logseqPort || ''}
          />

          <Label className="text-sm">Authorization Token</Label>
          <div className="col-span-3 relative">
            <Input
              name="logseqAuthToken"
              type={showToken ? 'text' : 'password'}
              onChange={onChange}
              value={logseqConfig?.logseqAuthToken || ''}
              placeholder="Logseq Authorization Token"
              className="pr-20"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 h-7"
              onClick={triggerShowToken}
            >
              {showToken ? 'Hide' : 'Show'}
            </Button>
          </div>

          <Button
            className="col-span-3"
            onClick={save}
            variant="outline"
            disabled={loading}
          >
            {loading ? 'Connecting...' : buttonMessage}
          </Button>

          <div className="col-span-3 text-right">
            <a
              className={`text-sm hover:underline ${!connected ? 'text-destructive' : 'text-primary'}`}
              href="https://logseq-copilot.eindex.me/doc/setup"
              target="_blank"
              rel="noopener noreferrer"
            >
              Guide to Connection
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
