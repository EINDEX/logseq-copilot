import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import React, { useEffect } from 'react';
import { log } from '@/utils';

import {
  getLogseqCopliotConfig,
  saveLogseqCopliotConfig,
} from '@/config';
import { getLogseqService } from '@/entrypoints/background/logseq/tool';
import { settings } from '@/utils/storage';

export const LogseqConnectOptions = () => {
  const [loading, setLoading] = React.useState(true);
  const [connected, setConnected] = React.useState(false);
  const [buttonMessage, setButtonMessage] = React.useState('Connect');
  const [showToken, setShowToken] = React.useState(false);
  const [logseqConfig, setLogseqConfig] = React.useState<LogseqCopliotSettingsV1>();

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

  const save = async () => {
    if (!logseqConfig) {
      setButtonMessage('Configuration is not loaded yet!');
      return;
    }

    try {
      if (logseqConfig.logseqHost) new URL(`http://${logseqConfig.logseqHost}`);
    } catch (error) {
      setConnected(false);
      setButtonMessage('Logseq Host is not a valid hostname!');
      return;
    }

    try {
      await settings.setValue(logseqConfig);
      log.info('Configuration saved!');

      if (await checkConnection(logseqConfig)) { // 使用当前已保存的配置进行连接检查
        const service = await getLogseqService(logseqConfig);
        const graph = await service.getGraph();
        log.info(`Logseq Graph -> ${graph}`);
        if (graph) {
          window.location.href = `logseq://graph/${graph}`;
        } else {
          setButtonMessage('Connected, but no graph found or specified.');
        }
      } else {
        setButtonMessage('Connection failed. Check console.');
      }
    } catch (error) {
      log.error("Save operation failed:", error);
      setButtonMessage('Save failed. Check console.');
      setLoading(false); // 确保在错误时停止加载
    }
  };


  useEffect(() => {
    let isMounted = true;
    const loadInitConfigAndConnect = async () => {
      try {
        const config = await settings.getValue();
        if (!isMounted) return;

        setLogseqConfig(config);

        log.debug('config', config);
        if (config.logseqAuthToken === '') {
          setLoading(false);
          return;
        }

        await checkConnection();
      } catch (error) {
        console.error(error);
        setLoading(false);
        setButtonMessage('Error loading config');
      }
    };

    loadInitConfigAndConnect();

    return () => {
      isMounted = false;
    };
  }, []);

  const checkConnection = async (currentConfig?: LogseqCopliotSettingsV1): Promise<boolean> => {
    const configToUse = currentConfig || await settings.getValue();
    if (!configToUse || !configToUse.logseqAuthToken) { // 确保有 token 才尝试连接
        setLoading(false);
        setConnected(false);
        setButtonMessage('Auth Token is missing');
        return false;
    }

    setLoading(true);
    try {
      // 注意：getLogseqService 可能也需要配置，或者它内部会从 storage 获取
      // 如果 getLogseqService 依赖于最新的 logseqConfig, 确保传递或使其能获取到
      const service = await getLogseqService(configToUse); // 假设 service 接受配置
      const resp = await service.showMsg('Logseq Copilot Connect!');
      const connectStatus = resp.msg === 'success';
      setConnected(connectStatus);
      if (connectStatus) {
        const version = await service.getVersion();
        setButtonMessage(`Connected to Logseq v${version}!`);
      } else {
        setButtonMessage(resp.msg || 'Connection failed');
      }
      return connectStatus;
    } catch (error) {
      log.error('Connection check failed:', error);
      setConnected(false);
      setButtonMessage('Connection error');
      return false;
    } finally {
      setLoading(false);
    }
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
            value={logseqConfig?.logseqHost || ''}
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
